import type { SupabaseClient } from "@supabase/supabase-js";
import { sameInvoiceNumber } from "@/domain/invoices/invoice-number";
import type { NormalizedInvoiceLine } from "@/domain/invoices/invoice.types";

export class InvoicesRepository {
  constructor(private supabase: SupabaseClient) {}

  async findDuplicate(input: {
    companyId: string;
    partnerId: string;
    moveType: string;
    invoiceNumber: string;
  }) {
    const { data: dupes } = await this.supabase
      .from("invoices")
      .select("id, invoice_date, invoice_number")
      .eq("company_id", input.companyId)
      .eq("partner_id", input.partnerId)
      .eq("move_type", input.moveType)
      .neq("state", "cancelled")
      .limit(500);

    return (dupes || []).find((d) =>
      sameInvoiceNumber(String(d.invoice_number || ""), input.invoiceNumber),
    );
  }

  async insert(row: Record<string, unknown>) {
    return this.supabase.from("invoices").insert(row).select("id").single();
  }

  async insertLines(
    invoiceId: string,
    companyId: string,
    normalized: NormalizedInvoiceLine[],
    withConcept: boolean,
  ): Promise<string | null> {
    const payload = normalized.map((l) => {
      const row: Record<string, unknown> = {
        invoice_id: invoiceId,
        company_id: companyId,
        description: l.description,
        quantity: l.quantity,
        price_unit: l.price_unit,
        tax_rate: l.rate,
        amount_untaxed: l.untaxed || l.exempt,
        amount_tax: l.tax,
        amount_total: l.total,
      };
      if (withConcept && l.concept_id) row.concept_id = l.concept_id;
      return row;
    });
    const { error } = await this.supabase.from("invoice_lines").insert(payload);
    if (error && withConcept && /concept_id|column/i.test(error.message)) {
      return this.insertLines(invoiceId, companyId, normalized, false);
    }
    return error?.message || null;
  }

  async getForIvaRetention(invoiceId: string, companyId: string) {
    const { data } = await this.supabase
      .from("invoices")
      .select(
        "id, state, amount_tax, amount_untaxed, amount_total, amount_retained_islr, amount_paid",
      )
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .maybeSingle();
    return data;
  }

  async updateAmounts(
    invoiceId: string,
    companyId: string,
    patch: Record<string, unknown>,
  ) {
    return this.supabase
      .from("invoices")
      .update(patch)
      .eq("id", invoiceId)
      .eq("company_id", companyId);
  }

  async cancel(id: string, companyId: string) {
    const full = await this.supabase
      .from("invoices")
      .update({
        state: "cancelled",
        amount_residual: 0,
        payment_state: "reversed",
      })
      .eq("id", id)
      .eq("company_id", companyId);

    if (full.error) {
      await this.supabase
        .from("invoices")
        .update({ state: "cancelled" })
        .eq("id", id)
        .eq("company_id", companyId);
    }
  }

  async countLinks(invoiceId: string) {
    const [{ count: ivaLinks }, { count: islrLinks }, { count: payLinks }, { count: bookLinks }] =
      await Promise.all([
        this.supabase
          .from("withholding_iva_lines")
          .select("*", { count: "exact", head: true })
          .eq("invoice_id", invoiceId),
        this.supabase
          .from("withholding_islr_lines")
          .select("*", { count: "exact", head: true })
          .eq("invoice_id", invoiceId),
        this.supabase
          .from("payment_allocations")
          .select("*", { count: "exact", head: true })
          .eq("invoice_id", invoiceId),
        this.supabase
          .from("fiscal_book_lines")
          .select("*", { count: "exact", head: true })
          .eq("invoice_id", invoiceId),
      ]);
    return (ivaLinks || 0) + (islrLinks || 0) + (payLinks || 0) + (bookLinks || 0);
  }

  async getMoveId(id: string, companyId: string) {
    const { data: inv } = await this.supabase
      .from("invoices")
      .select("account_move_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    return inv?.account_move_id as string | null | undefined;
  }

  async deleteUnlinked(id: string, companyId: string, moveId: string | null | undefined) {
    if (moveId) {
      await this.supabase.from("account_move_lines").delete().eq("move_id", moveId);
      await this.supabase
        .from("invoices")
        .update({ account_move_id: null })
        .eq("id", id);
      await this.supabase.from("account_moves").delete().eq("id", moveId);
    }
    await this.supabase.from("invoices").delete().eq("id", id).eq("company_id", companyId);
  }
}
