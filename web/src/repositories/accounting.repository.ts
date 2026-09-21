import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalLineDraft } from "@/domain/accounting/invoice-entry.service";
import type {
  PartialDraft,
  ReconcilableLine,
  ResidualPatch,
} from "@/domain/accounting/reconcile.service";
import { invoiceEntryDomain } from "@/domain/accounting/invoice-entry.service";
import { POSTED_INVOICE_STATES } from "@/domain/invoices/invoice-state";
import { paymentMethodLabel } from "@/domain/accounting/payment.service";
import { round2 } from "@/domain/money";

function oneRel<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] || null : v;
}

export type CompanyAccounts = {
  id: string;
  property_account_receivable_id: string | null;
  property_account_payable_id: string | null;
  property_account_income_id: string | null;
  property_account_expense_id: string | null;
  property_account_tax_sale_id: string | null;
  property_account_tax_purchase_id: string | null;
};

export class AccountingRepository {
  constructor(private supabase: SupabaseClient) {}

  async getCompanyAccounts(companyId: string) {
    const { data } = await this.supabase
      .from("companies")
      .select(
        "id, property_account_receivable_id, property_account_payable_id, property_account_income_id, property_account_expense_id, property_account_tax_sale_id, property_account_tax_purchase_id",
      )
      .eq("id", companyId)
      .single();
    return data as CompanyAccounts | null;
  }

  async seedPlan(companyId: string) {
    return this.supabase.rpc("seed_company_accounting", { p_company_id: companyId });
  }

  async ensurePlan(companyId: string) {
    const props = await this.getCompanyAccounts(companyId);
    if (!props?.property_account_receivable_id) {
      await this.seedPlan(companyId);
    }
    return this.getCompanyAccounts(companyId);
  }

  async journalIdByCode(companyId: string, code: string) {
    const { data } = await this.supabase
      .from("account_journals")
      .select("id")
      .eq("company_id", companyId)
      .eq("code", code)
      .maybeSingle();
    return data?.id as string | undefined;
  }

  async listJournalCodes(companyId: string) {
    const { data } = await this.supabase
      .from("account_journals")
      .select("code")
      .eq("company_id", companyId);
    return (data || []).map((j) => j.code as string);
  }

  async listAccountCodes(companyId: string) {
    const { data } = await this.supabase
      .from("account_accounts")
      .select("code")
      .eq("company_id", companyId);
    return (data || []).map((a) => a.code as string);
  }

  async insertAccount(row: Record<string, unknown>) {
    return this.supabase.from("account_accounts").insert(row).select("id").single();
  }

  async insertJournal(row: Record<string, unknown>) {
    return this.supabase.from("account_journals").insert(row);
  }

  async deleteAccount(id: string) {
    return this.supabase.from("account_accounts").delete().eq("id", id);
  }

  async getInvoice(invoiceId: string, companyId: string) {
    const { data } = await this.supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .single();
    return data;
  }

  async insertMove(row: Record<string, unknown>) {
    return this.supabase.from("account_moves").insert(row).select("id").single();
  }

  async insertMoveLines(
    moveId: string,
    companyId: string,
    invoiceId: string | null,
    drafts: JournalLineDraft[],
  ) {
    const selectCols =
      "id, account_id, partner_id, debit, credit, amount_residual, invoice_id, reconciled";
    const base = drafts.map((l) => ({
      move_id: moveId,
      company_id: companyId,
      ...(invoiceId ? { invoice_id: invoiceId } : {}),
      ...l,
      reconciled: Number(l.amount_residual || 0) <= 0.009,
    }));
    const first = await this.supabase.from("account_move_lines").insert(base).select(selectCols);
    if (!first.error) return first;
    if (!/reconciled|column|schema cache/i.test(first.error.message)) return first;
    const legacy = base.map(({ reconciled: _r, ...row }) => row);
    return this.supabase.from("account_move_lines").insert(legacy).select(
      "id, account_id, partner_id, debit, credit, amount_residual, invoice_id",
    );
  }

  async listOpenInvoicePartnerLines(input: {
    companyId: string;
    partnerId: string;
    accountId: string;
    invoiceId?: string | null;
  }): Promise<ReconcilableLine[]> {
    let query = this.supabase
      .from("account_move_lines")
      .select(
        "id, account_id, partner_id, debit, credit, amount_residual, invoice_id, created_at, name",
      )
      .eq("company_id", input.companyId)
      .eq("partner_id", input.partnerId)
      .eq("account_id", input.accountId)
      .gt("amount_residual", 0.009)
      .not("invoice_id", "is", null)
      .order("created_at", { ascending: true });

    if (input.invoiceId) query = query.eq("invoice_id", input.invoiceId);

    const { data } = await query;
    return (data || []).map((row) => this.toReconcilable(row));
  }

  async listOpenCounterparts(input: {
    companyId: string;
    partnerId: string;
    accountId: string;
    excludeId: string;
  }): Promise<ReconcilableLine[]> {
    const { data } = await this.supabase
      .from("account_move_lines")
      .select("id, account_id, partner_id, debit, credit, amount_residual, invoice_id, name")
      .eq("company_id", input.companyId)
      .eq("partner_id", input.partnerId)
      .eq("account_id", input.accountId)
      .neq("id", input.excludeId)
      .gt("amount_residual", 0.009)
      .order("created_at", { ascending: true });
    return (data || []).map((row) => this.toReconcilable(row));
  }

  async getMoveLine(id: string, companyId: string) {
    const { data } = await this.supabase
      .from("account_move_lines")
      .select(
        "id, account_id, partner_id, debit, credit, amount_residual, invoice_id, reconciled, move_id, name, account_moves(move_date)",
      )
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    return data;
  }

  async partnerResidualForInvoice(
    invoiceId: string,
    companyId: string,
    accountId: string,
  ) {
    const { data } = await this.supabase
      .from("account_move_lines")
      .select("amount_residual")
      .eq("company_id", companyId)
      .eq("invoice_id", invoiceId)
      .eq("account_id", accountId);
    return round2(
      (data || []).reduce((s, row) => s + Number(row.amount_residual || 0), 0),
    );
  }

  async listAccountReconcileFlags(companyId: string, accountIds: string[]) {
    if (!accountIds.length) return new Map<string, boolean>();
    const { data } = await this.supabase
      .from("account_accounts")
      .select("id, reconcile")
      .eq("company_id", companyId)
      .in("id", accountIds);
    return new Map((data || []).map((a) => [a.id as string, Boolean(a.reconcile)]));
  }

  async listUnmatchedLiquidityLines(input: {
    companyId: string;
    from?: string;
    to?: string;
  }) {
    const matched = await this.matchedLiquidityIds(input.companyId);
    const { data, error } = await this.supabase
      .from("account_move_lines")
      .select(
        "id, debit, credit, name, account_id, move_id, account_accounts(code, name, account_type), account_moves(move_date, name, journal_id, payment_id)",
      )
      .eq("company_id", input.companyId)
      .order("created_at", { ascending: false })
      .limit(400);
    if (error) return [];
    const rows = (data || [])
      .map((row) => {
        const account = oneRel(
          row.account_accounts as
            | { account_type?: string; code?: string; name?: string }
            | { account_type?: string; code?: string; name?: string }[],
        );
        const move = oneRel(
          row.account_moves as
            | { move_date?: string; name?: string; journal_id?: string; payment_id?: string }
            | { move_date?: string; name?: string; journal_id?: string; payment_id?: string }[],
        );
        return {
          id: row.id as string,
          debit: Number(row.debit || 0),
          credit: Number(row.credit || 0),
          name: (row.name as string) || null,
          account_id: row.account_id as string,
          account_code: account?.code || "",
          account_name: account?.name || "",
          account_type: account?.account_type || "",
          move_id: row.move_id as string,
          move_date: move?.move_date || "",
          move_name: move?.name || "",
          journal_id: move?.journal_id || null,
          payment_id: move?.payment_id || null,
        };
      })
      .filter((row) => row.account_type === "asset_cash" && !matched.has(row.id));
    return rows.filter((row) => {
      if (input.from && row.move_date && row.move_date < input.from) return false;
      if (input.to && row.move_date && row.move_date > input.to) return false;
      return true;
    });
  }

  async listOpenStatementLines(companyId: string) {
    const { data, error } = await this.supabase
      .from("bank_statement_lines")
      .select(
        "id, line_date, amount, payment_ref, partner_name, statement_id, bank_statements(journal_id, name, statement_date)",
      )
      .eq("company_id", companyId)
      .eq("is_reconciled", false)
      .order("line_date", { ascending: false })
      .limit(80);
    if (error) return [];
    return (data || []).map((row) => {
      const st = oneRel(
        row.bank_statements as
          | { journal_id?: string; name?: string; statement_date?: string }
          | { journal_id?: string; name?: string; statement_date?: string }[],
      );
      return {
        id: row.id as string,
        line_date: row.line_date as string,
        amount: Number(row.amount || 0),
        payment_ref: (row.payment_ref as string) || null,
        partner_name: (row.partner_name as string) || null,
        statement_id: row.statement_id as string,
        journal_id: st?.journal_id || null,
        statement_name: st?.name || "",
      };
    });
  }

  async cashBankBalance(companyId: string) {
    const { data, error } = await this.supabase
      .from("account_move_lines")
      .select("debit, credit, account_accounts(code, account_type)")
      .eq("company_id", companyId);
    if (error) return { cash: 0, bank: 0, total: 0 };
    let cash = 0;
    let bank = 0;
    for (const row of data || []) {
      const acc = oneRel(
        row.account_accounts as
          | { code?: string; account_type?: string }
          | { code?: string; account_type?: string }[],
      );
      if (acc?.account_type !== "asset_cash") continue;
      const signed = Number(row.debit || 0) - Number(row.credit || 0);
      if (String(acc.code || "").startsWith("1.1.01")) cash += signed;
      else bank += signed;
    }
    return { cash: round2(cash), bank: round2(bank), total: round2(cash + bank) };
  }

  async matchedLiquidityIds(companyId: string) {
    const { data, error } = await this.supabase
      .from("bank_statement_lines")
      .select("move_line_id")
      .eq("company_id", companyId)
      .not("move_line_id", "is", null);
    if (error) return new Set<string>();
    return new Set(
      (data || [])
        .map((r) => r.move_line_id as string | null)
        .filter((id): id is string => Boolean(id)),
    );
  }

  async liquidityLineForPayment(paymentId: string, companyId: string) {
    const { data: pay } = await this.supabase
      .from("payments")
      .select(
        "id, move_id, journal_id, amount, payment_type, reference, memo, partner_id, partners(name)",
      )
      .eq("id", paymentId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!pay?.move_id) return { payment: pay, line: null };
    const { data: lines } = await this.supabase
      .from("account_move_lines")
      .select("id, debit, credit, account_id, account_accounts(account_type)")
      .eq("move_id", pay.move_id)
      .eq("company_id", companyId);
    const line =
      (lines || []).find((row) => {
        const acc = oneRel(
          row.account_accounts as { account_type?: string } | { account_type?: string }[],
        );
        return acc?.account_type === "asset_cash";
      }) || null;
    return { payment: pay, line };
  }

  private toReconcilable(row: {
    id: string;
    account_id: string;
    partner_id: string | null;
    debit: number | string;
    credit: number | string;
    amount_residual: number | string;
    invoice_id?: string | null;
    name?: string | null;
  }): ReconcilableLine {
    return {
      id: row.id,
      account_id: row.account_id,
      partner_id: row.partner_id,
      debit: Number(row.debit),
      credit: Number(row.credit),
      amount_residual: Number(row.amount_residual),
      invoice_id: row.invoice_id || null,
      name: row.name || null,
    };
  }

  async applyReconcile(
    companyId: string,
    partials: PartialDraft[],
    patches: ResidualPatch[],
  ) {
    if (partials.length) {
      const { error } = await this.supabase.from("account_partial_reconciles").insert(
        partials.map((p) => ({
          company_id: companyId,
          debit_move_line_id: p.debit_move_line_id,
          credit_move_line_id: p.credit_move_line_id,
          amount: p.amount,
        })),
      );
      if (error && !/account_partial_reconciles|schema cache|relation/i.test(error.message)) {
        return error;
      }
    }
    for (const patch of patches) {
      const fullId = patch.reconciled ? crypto.randomUUID() : null;
      const { error } = await this.supabase
        .from("account_move_lines")
        .update({
          amount_residual: patch.amount_residual,
          reconciled: patch.reconciled,
          full_reconcile_id: fullId,
        })
        .eq("id", patch.id)
        .eq("company_id", companyId);
      if (error && /reconciled|full_reconcile_id|column/i.test(error.message)) {
        await this.supabase
          .from("account_move_lines")
          .update({ amount_residual: patch.amount_residual })
          .eq("id", patch.id)
          .eq("company_id", companyId);
      } else if (error) {
        return error;
      }
    }
    return null;
  }

  async syncInvoiceResidual(invoiceId: string, residual: number, amountTotal: number) {
    const open = Math.max(round2(residual), 0);
    return this.updateInvoice(invoiceId, {
      amount_residual: open,
      amount_paid: round2(Math.max(Number(amountTotal || 0) - open, 0)),
      payment_state: invoiceEntryDomain.paymentState(open, Number(amountTotal || 0)),
    });
  }

  async invoiceTotals(invoiceId: string, companyId: string) {
    const { data } = await this.supabase
      .from("invoices")
      .select("id, amount_total, amount_residual")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .maybeSingle();
    return data;
  }

  async updateInvoice(invoiceId: string, patch: Record<string, unknown>) {
    return this.supabase.from("invoices").update(patch).eq("id", invoiceId);
  }

  async accountIdByCode(companyId: string, code: string) {
    const { data } = await this.supabase
      .from("account_accounts")
      .select("id")
      .eq("company_id", companyId)
      .eq("code", code)
      .maybeSingle();
    return data?.id || null;
  }

  async journalDefaultAccount(journalId: string, companyId: string) {
    const { data } = await this.supabase
      .from("account_journals")
      .select("default_account_id")
      .eq("id", journalId)
      .eq("company_id", companyId)
      .maybeSingle();
    return data?.default_account_id || null;
  }

  async findMoveByRef(companyId: string, ref: string) {
    const { data } = await this.supabase
      .from("account_moves")
      .select("id")
      .eq("company_id", companyId)
      .eq("ref", ref)
      .maybeSingle();
    return data;
  }

  async listOpenInvoices(input: {
    companyId: string;
    partnerId: string;
    moveTypes: string[];
    invoiceId?: string | null;
  }) {
    let query = this.supabase
      .from("invoices")
      .select("id, amount_residual, amount_total, invoice_number")
      .eq("company_id", input.companyId)
      .eq("partner_id", input.partnerId)
      .in("move_type", input.moveTypes)
      .gt("amount_residual", 0)
      .in("state", [...POSTED_INVOICE_STATES])
      .order("invoice_date", { ascending: true });

    if (input.invoiceId) query = query.eq("id", input.invoiceId);

    const { data } = await query;
    return data || [];
  }

  async insertPayment(row: Record<string, unknown>) {
    const insert = (payload: Record<string, unknown>) =>
      this.supabase.from("payments").insert(payload).select("id").single();
    let payload = { ...row };
    let result = await insert(payload);
    if (!result.error) return result;
    const message = result.error.message || "";
    if (/payment_method/i.test(message) && "payment_method" in payload) {
      const methodLabel = paymentMethodLabel(String(payload.payment_method || ""));
      delete payload.payment_method;
      if (methodLabel) {
        const memoText = String(payload.memo || "").trim();
        payload.memo = memoText.includes(methodLabel)
          ? memoText || null
          : [methodLabel, memoText].filter(Boolean).join(" · ") || null;
      }
      result = await insert(payload);
      if (!result.error) return result;
    }
    if (/exchange_rate|amount_usd/i.test(result.error?.message || "")) {
      delete payload.exchange_rate;
      delete payload.amount_usd;
      result = await insert(payload);
      if (!result.error) return result;
    }
    if (/invoice_id/i.test(result.error?.message || "") && "invoice_id" in payload) {
      delete payload.invoice_id;
      return insert(payload);
    }
    return result;
  }

  async insertAllocations(
    allocations: Array<{
      payment_id: string;
      company_id: string;
      invoice_id: string;
      amount: number;
    }>,
  ) {
    return this.supabase.from("payment_allocations").insert(allocations);
  }

  async updatePaymentMove(paymentId: string, moveId: string) {
    return this.supabase.from("payments").update({ move_id: moveId }).eq("id", paymentId);
  }

  async getInvoiceLite(invoiceId: string, companyId: string) {
    const { data } = await this.supabase
      .from("invoices")
      .select("id, move_type, partner_id, invoice_number")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .single();
    return data;
  }

  async getPayment(paymentId: string, companyId: string) {
    const cols =
      "id, partner_id, journal_id, payment_type, payment_date, amount, currency_code, payment_method, exchange_rate, amount_usd, memo, reference, state, move_id, invoice_id, created_by";
    const first = await this.supabase
      .from("payments")
      .select(cols)
      .eq("id", paymentId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!first.error) return first.data;
    const { data } = await this.supabase
      .from("payments")
      .select(
        "id, partner_id, journal_id, payment_type, payment_date, amount, currency_code, exchange_rate, amount_usd, memo, reference, state, move_id, created_by",
      )
      .eq("id", paymentId)
      .eq("company_id", companyId)
      .maybeSingle();
    return data;
  }

  async updatePayment(paymentId: string, companyId: string, patch: Record<string, unknown>) {
    const first = await this.supabase
      .from("payments")
      .update(patch)
      .eq("id", paymentId)
      .eq("company_id", companyId);
    if (!first.error) return first;
    const next = { ...patch };
    if (/invoice_id/i.test(first.error.message)) delete next.invoice_id;
    if (/payment_method/i.test(first.error.message)) delete next.payment_method;
    if (Object.keys(next).length === Object.keys(patch).length) return first;
    return this.supabase
      .from("payments")
      .update(next)
      .eq("id", paymentId)
      .eq("company_id", companyId);
  }

  async listPaymentAllocations(paymentId: string, companyId: string) {
    const { data } = await this.supabase
      .from("payment_allocations")
      .select("id, invoice_id, amount")
      .eq("payment_id", paymentId)
      .eq("company_id", companyId);
    return data || [];
  }

  async deletePaymentAllocations(paymentId: string, companyId: string) {
    return this.supabase
      .from("payment_allocations")
      .delete()
      .eq("payment_id", paymentId)
      .eq("company_id", companyId);
  }

  async getMoveByPayment(paymentId: string, companyId: string) {
    const { data } = await this.supabase
      .from("account_moves")
      .select("id")
      .eq("payment_id", paymentId)
      .eq("company_id", companyId)
      .maybeSingle();
    return data;
  }

  async unpostPayment(paymentId: string, companyId: string) {
    const allocations = await this.listPaymentAllocations(paymentId, companyId);
    const invoiceIds = [
      ...new Set(allocations.map((row) => row.invoice_id as string).filter(Boolean)),
    ];
    const move = await this.getMoveByPayment(paymentId, companyId);
    let restoredViaLines = false;
    if (move?.id) {
      const { data: lines } = await this.supabase
        .from("account_move_lines")
        .select("id")
        .eq("move_id", move.id)
        .eq("company_id", companyId);
      const lineIds = (lines || []).map((row) => row.id as string);
      if (lineIds.length) {
        const { data: partials } = await this.supabase
          .from("account_partial_reconciles")
          .select("id, debit_move_line_id, credit_move_line_id, amount")
          .eq("company_id", companyId)
          .or(
            `debit_move_line_id.in.(${lineIds.join(",")}),credit_move_line_id.in.(${lineIds.join(",")})`,
          );
        for (const partial of partials || []) {
          const otherId = lineIds.includes(partial.debit_move_line_id)
            ? partial.credit_move_line_id
            : partial.debit_move_line_id;
          if (lineIds.includes(otherId)) continue;
          const { data: other } = await this.supabase
            .from("account_move_lines")
            .select("id, amount_residual")
            .eq("id", otherId)
            .eq("company_id", companyId)
            .maybeSingle();
          if (!other) continue;
          restoredViaLines = true;
          await this.supabase
            .from("account_move_lines")
            .update({
              amount_residual: round2(Number(other.amount_residual || 0) + Number(partial.amount || 0)),
              reconciled: false,
              full_reconcile_id: null,
            })
            .eq("id", other.id)
            .eq("company_id", companyId);
        }
        if ((partials || []).length) {
          await this.supabase
            .from("account_partial_reconciles")
            .delete()
            .in("id", (partials || []).map((row) => row.id));
        }
      }
      await this.supabase.from("account_move_lines").delete().eq("move_id", move.id);
      await this.supabase
        .from("payments")
        .update({ move_id: null })
        .eq("id", paymentId)
        .eq("company_id", companyId);
      await this.supabase.from("account_moves").delete().eq("id", move.id).eq("company_id", companyId);
    }

    if (!restoredViaLines) {
      for (const alloc of allocations) {
        const inv = await this.invoiceTotals(alloc.invoice_id, companyId);
        if (!inv) continue;
        await this.syncInvoiceResidual(
          alloc.invoice_id,
          round2(Number(inv.amount_residual || 0) + Number(alloc.amount || 0)),
          Number(inv.amount_total),
        );
      }
    }
    await this.deletePaymentAllocations(paymentId, companyId);
    return { invoiceIds, restoredViaLines };
  }
}
