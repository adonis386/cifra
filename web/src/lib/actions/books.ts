"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: string };

export async function generateFiscalBook(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const bookType = String(formData.get("book_type") || "purchase") as
    | "purchase"
    | "sale";
  const periodStart = String(formData.get("period_start") || "");
  const periodEnd = String(formData.get("period_end") || "");

  if (!periodStart || !periodEnd) {
    return { error: "Indica el rango del período." };
  }

  const moveTypes =
    bookType === "sale"
      ? ["out_invoice", "out_refund"]
      : ["in_invoice", "in_refund"];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id, invoice_date, invoice_number, control_number, doc_type, amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva, partners(name, rif)",
    )
    .eq("company_id", company.id)
    .in("move_type", moveTypes)
    .gte("invoice_date", periodStart)
    .lte("invoice_date", periodEnd)
    .neq("state", "cancelled")
    .order("invoice_date", { ascending: true });

  if (invErr) return { error: invErr.message };

  const label =
    bookType === "sale" ? "Libro de Ventas" : "Libro de Compras";
  const name = `${periodStart.slice(0, 7)} — ${label}`;

  const { data: book, error: bookErr } = await supabase
    .from("fiscal_books")
    .insert({
      company_id: company.id,
      name,
      book_type: bookType,
      period_start: periodStart,
      period_end: periodEnd,
      state: "done",
      created_by: user?.id,
    })
    .select("id")
    .single();

  if (bookErr) return { error: bookErr.message };

  const lines = (invoices || []).map((inv, idx) => {
    const partner = inv.partners as unknown as
      | { name: string; rif: string }
      | { name: string; rif: string }[]
      | null;
    const p = Array.isArray(partner) ? partner[0] : partner;
    return {
      book_id: book.id,
      company_id: company.id,
      invoice_id: inv.id,
      rank: idx + 1,
      emission_date: inv.invoice_date,
      partner_rif: p?.rif || "",
      partner_name: p?.name || "",
      invoice_number: inv.invoice_number,
      control_number: inv.control_number,
      doc_type: inv.doc_type,
      amount_untaxed: inv.amount_untaxed,
      amount_tax: inv.amount_tax,
      amount_exempt: inv.amount_exempt,
      amount_total: inv.amount_total,
      amount_retained: inv.amount_retained_iva,
    };
  });

  if (lines.length) {
    const { error: lineErr } = await supabase
      .from("fiscal_book_lines")
      .insert(lines);
    if (lineErr) return { error: lineErr.message };
  }

  revalidatePath("/app/books");
  return {
    success: `Libro generado con ${lines.length} documento(s).`,
  };
}
