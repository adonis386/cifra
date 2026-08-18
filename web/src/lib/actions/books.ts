"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: string };

type BookInvoice = {
  id: string;
  invoice_date: string;
  registration_date?: string | null;
  invoice_number: string;
  control_number: string | null;
  doc_type: string;
  move_type: string;
  affected_document?: string | null;
  import_planilla?: string | null;
  import_file_number?: string | null;
  amount_untaxed: number;
  amount_tax: number;
  amount_exempt: number;
  amount_total: number;
  amount_retained_iva: number;
  sin_cred?: boolean;
  partners:
    | { name: string; rif: string }
    | { name: string; rif: string }[]
    | null;
};

type LineTax = {
  invoice_id: string;
  tax_rate: number;
  amount_untaxed: number;
  amount_tax: number;
  amount_total: number;
};

type AliquotSplit = {
  base_general: number;
  tax_general: number;
  rate_general: number;
  base_reduced: number;
  tax_reduced: number;
  rate_reduced: number;
  base_additional: number;
  tax_additional: number;
  rate_additional: number;
  amount_exempt: number;
};

function splitAliquots(
  inv: BookInvoice,
  lines: LineTax[],
): AliquotSplit {
  const split: AliquotSplit = {
    base_general: 0,
    tax_general: 0,
    rate_general: 16,
    base_reduced: 0,
    tax_reduced: 0,
    rate_reduced: 8,
    base_additional: 0,
    tax_additional: 0,
    rate_additional: 31,
    amount_exempt: Number(inv.amount_exempt || 0),
  };

  const invLines = lines.filter((l) => l.invoice_id === inv.id);
  if (invLines.length) {
    for (const l of invLines) {
      const rate = Number(l.tax_rate || 0);
      const base = Number(l.amount_untaxed || 0);
      const tax = Number(l.amount_tax || 0);
      if (rate <= 0 || (base <= 0 && tax <= 0)) {
        if (base > 0) split.amount_exempt += base;
        continue;
      }
      if (Math.abs(rate - 8) < 0.01) {
        split.base_reduced += base;
        split.tax_reduced += tax;
        split.rate_reduced = rate;
      } else if (Math.abs(rate - 31) < 0.01 || rate >= 30) {
        split.base_additional += base;
        split.tax_additional += tax;
        split.rate_additional = rate;
      } else {
        split.base_general += base;
        split.tax_general += tax;
        split.rate_general = rate || 16;
      }
    }
  } else {
    // Fallback cabecera: todo a general si hay IVA
    split.base_general = Number(inv.amount_untaxed || 0);
    split.tax_general = Number(inv.amount_tax || 0);
    split.rate_general = split.tax_general > 0 && split.base_general > 0
      ? Number(((split.tax_general / split.base_general) * 100).toFixed(2))
      : 16;
  }

  return split;
}

function docBuckets(inv: BookInvoice) {
  const num = inv.invoice_number || "";
  const dt = String(inv.doc_type || "01");
  const isNc =
    dt === "03" ||
    inv.move_type === "in_refund" ||
    inv.move_type === "out_refund";
  const isNd = dt === "02";
  return {
    documento: isNc || isNd ? "" : num,
    debit_note: isNd ? num : "",
    credit_note: isNc ? num : "",
    affected_document: inv.affected_document || "",
    doc_type: dt,
  };
}

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

  let invoices: BookInvoice[] | null = null;
  let invErr: { message: string } | null = null;

  {
    const res = await supabase
      .from("invoices")
      .select(
        "id, invoice_date, registration_date, invoice_number, control_number, doc_type, move_type, affected_document, import_planilla, import_file_number, amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva, sin_cred, partners(name, rif)",
      )
      .eq("company_id", company.id)
      .in("move_type", moveTypes)
      .gte("registration_date", periodStart)
      .lte("registration_date", periodEnd)
      .neq("state", "cancelled")
      .eq("sin_cred", false)
      .order("registration_date", { ascending: true })
      .order("invoice_date", { ascending: true });
    invoices = res.data as BookInvoice[] | null;
    invErr = res.error;
  }

  if (invErr && /registration_date|column|schema/i.test(invErr.message)) {
    const res = await supabase
      .from("invoices")
      .select(
        "id, invoice_date, invoice_number, control_number, doc_type, move_type, affected_document, amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva, sin_cred, partners(name, rif)",
      )
      .eq("company_id", company.id)
      .in("move_type", moveTypes)
      .gte("invoice_date", periodStart)
      .lte("invoice_date", periodEnd)
      .neq("state", "cancelled")
      .order("invoice_date", { ascending: true });
    invoices = res.data as BookInvoice[] | null;
    invErr = res.error;
  }

  if (invErr && /sin_cred|column/i.test(invErr.message)) {
    const res = await supabase
      .from("invoices")
      .select(
        "id, invoice_date, invoice_number, control_number, doc_type, move_type, amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva, partners(name, rif)",
      )
      .eq("company_id", company.id)
      .in("move_type", moveTypes)
      .gte("invoice_date", periodStart)
      .lte("invoice_date", periodEnd)
      .neq("state", "cancelled")
      .order("invoice_date", { ascending: true });
    invoices = res.data as BookInvoice[] | null;
    invErr = res.error;
  }

  if (invErr) return { error: invErr.message };
  invoices = (invoices || []).filter((inv) => !inv.sin_cred);

  const ids = invoices.map((i) => i.id);
  let taxLines: LineTax[] = [];
  if (ids.length) {
    const { data: rawLines } = await supabase
      .from("invoice_lines")
      .select("invoice_id, tax_rate, amount_untaxed, amount_tax, amount_total")
      .in("invoice_id", ids);
    taxLines = (rawLines || []) as LineTax[];
  }

  // Comprobantes IVA vinculados
  const voucherByInvoice = new Map<
    string,
    { voucher_number: string; voucher_date: string }
  >();
  if (ids.length) {
    const { data: whLines } = await supabase
      .from("withholding_iva_lines")
      .select("invoice_id, withholding_id, withholding_iva(voucher_number, voucher_date)")
      .in("invoice_id", ids);
    for (const row of whLines || []) {
      const wh = row.withholding_iva as unknown as
        | { voucher_number: string; voucher_date: string }
        | { voucher_number: string; voucher_date: string }[]
        | null;
      const w = Array.isArray(wh) ? wh[0] : wh;
      if (row.invoice_id && w?.voucher_number) {
        voucherByInvoice.set(row.invoice_id, {
          voucher_number: w.voucher_number,
          voucher_date: w.voucher_date,
        });
      }
    }
  }

  const label =
    bookType === "sale" ? "Libro de Ventas" : "Libro de Compras";
  const name = `${periodStart} → ${periodEnd} — ${label}`;

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

  const lines = invoices.map((inv, idx) => {
    const partner = inv.partners;
    const p = Array.isArray(partner) ? partner[0] : partner;
    const regDate = inv.registration_date || inv.invoice_date;
    const buckets = docBuckets(inv);
    const split = splitAliquots(inv, taxLines);
    const isImport = Boolean(inv.import_planilla || inv.import_file_number);
    const voucher = voucherByInvoice.get(inv.id);

    let base_import = 0;
    let tax_import = 0;
    let rate_import = 16;
    let base_general = split.base_general;
    let tax_general = split.tax_general;
    let base_reduced = split.base_reduced;
    let tax_reduced = split.tax_reduced;
    let base_additional = split.base_additional;
    let tax_additional = split.tax_additional;

    if (isImport) {
      // Importaciones → columnas ET; internas en 0
      base_import =
        split.base_general + split.base_reduced + split.base_additional;
      tax_import =
        split.tax_general + split.tax_reduced + split.tax_additional;
      rate_import = split.rate_general || 16;
      base_general = 0;
      tax_general = 0;
      base_reduced = 0;
      tax_reduced = 0;
      base_additional = 0;
      tax_additional = 0;
    }

    return {
      book_id: book.id,
      company_id: company.id,
      invoice_id: inv.id,
      rank: idx + 1,
      emission_date: inv.invoice_date,
      registration_date: regDate,
      partner_rif: p?.rif || "",
      partner_name: p?.name || "",
      invoice_number: buckets.documento || inv.invoice_number,
      control_number: inv.control_number,
      doc_type: buckets.doc_type,
      move_type: inv.move_type,
      debit_note: buckets.debit_note,
      credit_note: buckets.credit_note,
      affected_document: buckets.affected_document,
      is_import: isImport,
      import_planilla: inv.import_planilla || null,
      import_file_number: inv.import_file_number || null,
      amount_untaxed: Number(inv.amount_untaxed || 0),
      amount_tax: Number(inv.amount_tax || 0),
      amount_exempt: split.amount_exempt,
      amount_total: Number(inv.amount_total || 0),
      amount_retained: Number(inv.amount_retained_iva || 0),
      base_general,
      tax_general,
      rate_general: split.rate_general,
      base_reduced,
      tax_reduced,
      rate_reduced: split.rate_reduced,
      base_additional,
      tax_additional,
      rate_additional: split.rate_additional,
      base_import,
      tax_import,
      rate_import,
      igtf_amount: 0,
      igtf_rate: 0,
      voucher_number: voucher?.voucher_number || null,
      voucher_date: voucher?.voucher_date || null,
    };
  });

  if (lines.length) {
    const { error: lineErr } = await supabase
      .from("fiscal_book_lines")
      .insert(lines);
    if (lineErr) {
      // Fallback columnas básicas si no aplicó migración Art.75
      if (/column|schema|does not exist/i.test(lineErr.message)) {
        const legacy = lines.map((l) => ({
          book_id: l.book_id,
          company_id: l.company_id,
          invoice_id: l.invoice_id,
          rank: l.rank,
          emission_date: l.emission_date,
          partner_rif: l.partner_rif,
          partner_name: l.partner_name,
          invoice_number: l.invoice_number,
          control_number: l.control_number,
          doc_type: l.doc_type,
          amount_untaxed: l.amount_untaxed,
          amount_tax: l.amount_tax,
          amount_exempt: l.amount_exempt,
          amount_total: l.amount_total,
          amount_retained: l.amount_retained,
        }));
        const { error: retryErr } = await supabase
          .from("fiscal_book_lines")
          .insert(legacy);
        if (retryErr) return { error: retryErr.message };
      } else {
        return { error: lineErr.message };
      }
    }
  }

  revalidatePath("/app/books");
  return {
    success: `Libro SENIAT Art. 75 generado · ${lines.length} operación(es) · ${Date.now()}`,
  };
}

/** Elimina un libro del histórico (líneas en cascade). */
export async function deleteFiscalBookById(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "Libro no indicado." };
  const company = await getActiveCompany();
  if (!company) return { ok: false, error: "Sin empresa activa." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("fiscal_books")
    .delete()
    .eq("id", id)
    .eq("company_id", company.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/app/books");
  revalidatePath("/app/reports");
  return { ok: true };
}
