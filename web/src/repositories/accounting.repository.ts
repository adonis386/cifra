import type { SupabaseClient } from "@supabase/supabase-js";
import type { JournalLineDraft } from "@/domain/accounting/invoice-entry.service";

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
    const lines = drafts.map((l) => ({
      move_id: moveId,
      company_id: companyId,
      ...(invoiceId ? { invoice_id: invoiceId } : {}),
      ...l,
    }));
    return this.supabase.from("account_move_lines").insert(lines);
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
      .neq("state", "cancelled")
      .order("invoice_date", { ascending: true });

    if (input.invoiceId) query = query.eq("id", input.invoiceId);

    const { data } = await query;
    return data || [];
  }

  async insertPayment(row: Record<string, unknown>) {
    const first = await this.supabase.from("payments").insert(row).select("id").single();
    if (!first.error) return first;
    if (!/exchange_rate|amount_usd|column/i.test(first.error.message)) return first;
    const {
      exchange_rate: _rate,
      amount_usd: _usd,
      ...legacy
    } = row;
    return this.supabase.from("payments").insert(legacy).select("id").single();
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
}
