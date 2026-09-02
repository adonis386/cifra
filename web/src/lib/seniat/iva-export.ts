import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatRif99035,
  formatVoucherNumber,
  seniatIvaWithheld,
  snapAlicuota,
  type IvaTxtLine,
} from "@/lib/seniat/txt-iva";
import { periodFromDate } from "@/lib/company";
import { nextCompanySequence } from "@/lib/actions/sequences";

type CompanyRef = { id: string; rif: string };

type InvoiceRow = {
  id: string;
  partner_id: string;
  move_type: string;
  operation_type: "C" | "V";
  doc_type: string;
  invoice_date: string;
  registration_date: string | null;
  invoice_number: string;
  control_number: string | null;
  affected_document: string | null;
  import_file_number: string | null;
  amount_untaxed: number;
  amount_tax: number;
  amount_exempt: number;
  amount_total: number;
  amount_retained_iva: number;
  partners: { rif: string } | { rif: string }[] | null;
};

function unwrapPartner(raw: InvoiceRow["partners"]) {
  return Array.isArray(raw) ? raw[0] : raw;
}

function invoiceTaxRate(inv: InvoiceRow) {
  const base = Number(inv.amount_untaxed || 0);
  const tax = Number(inv.amount_tax || 0);
  if (base > 0 && tax > 0) return snapAlicuota((tax / base) * 100);
  return 16;
}

function retentionPctFromInvoice(inv: InvoiceRow, ali: number) {
  const base = Number(inv.amount_untaxed || 0);
  const retained = Number(inv.amount_retained_iva || 0);
  if (!(base > 0) || !(retained > 0)) return 75;
  const fullIva = (base * ali) / 100;
  if (fullIva <= 0) return 75;
  const pct = Math.round((retained / fullIva) * 10000) / 100;
  return pct > 0 && pct <= 100 ? pct : 75;
}

/** Crea comprobante IVA si la factura tiene retención pero aún no tiene uno activo. */
export async function ensureIvaComprobanteForInvoice(
  supabase: SupabaseClient,
  company: CompanyRef,
  invoice: InvoiceRow,
  userId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existingWh } = await supabase
    .from("withholding_iva_lines")
    .select("id, withholding_iva(id, state)")
    .eq("company_id", company.id)
    .eq("invoice_id", invoice.id);

  const already = (existingWh || []).find((row) => {
    const parent = row.withholding_iva as unknown as
      | { state?: string }
      | { state?: string }[]
      | null;
    const st = Array.isArray(parent) ? parent[0]?.state : parent?.state;
    return st !== "cancelled";
  });
  if (already) return { ok: true };

  const base = Number(invoice.amount_untaxed || 0);
  const retained = Number(invoice.amount_retained_iva || 0);
  if (!(retained > 0)) {
    return { ok: false, error: `Factura ${invoice.invoice_number} sin retención IVA.` };
  }

  const ali = invoiceTaxRate(invoice);
  const voucherDate =
    invoice.registration_date || invoice.invoice_date || new Date().toISOString().slice(0, 10);
  const period = periodFromDate(voucherDate);
  const seq = await nextCompanySequence("wh_iva", { period, padding: 8 });
  if (!seq.ok) return { ok: false, error: seq.error };
  const voucherNumber = formatVoucherNumber(seq.value, 14, period);

  const { data: wh, error } = await supabase
    .from("withholding_iva")
    .insert({
      company_id: company.id,
      partner_id: invoice.partner_id,
      voucher_number: voucherNumber,
      period,
      voucher_date: voucherDate,
      state: "confirmed",
      amount_untaxed: invoice.amount_untaxed,
      amount_tax: invoice.amount_tax,
      amount_withheld: retained,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  const { error: lineErr } = await supabase.from("withholding_iva_lines").insert({
    withholding_id: wh.id,
    company_id: company.id,
    invoice_id: invoice.id,
    operation_type: invoice.operation_type,
    doc_type: invoice.doc_type,
    invoice_number: invoice.invoice_number,
    control_number: invoice.control_number || "0",
    affected_document: invoice.affected_document || "0",
    invoice_date: invoice.invoice_date,
    amount_total: invoice.amount_total,
    amount_untaxed: invoice.amount_untaxed,
    amount_withheld: retained,
    amount_exempt: invoice.amount_exempt,
    alicuota: ali,
    expediente: invoice.import_file_number || "0",
  });

  if (lineErr) return { ok: false, error: lineErr.message };
  return { ok: true };
}

/** Facturas con retención IVA en el rango (fecha registro libro). */
export async function loadInvoicesWithIvaRetention(
  supabase: SupabaseClient,
  companyId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ data: InvoiceRow[]; error?: string }> {
  let q = supabase
    .from("invoices")
    .select(
      "id, partner_id, move_type, operation_type, doc_type, invoice_date, registration_date, invoice_number, control_number, affected_document, import_file_number, amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva, partners(rif)",
    )
    .eq("company_id", companyId)
    .neq("state", "cancelled")
    .gt("amount_retained_iva", 0)
    .gte("registration_date", dateFrom)
    .lte("registration_date", dateTo)
    .order("registration_date", { ascending: true });

  const primary = await q;

  if (primary.error && /registration_date|column|schema/i.test(primary.error.message)) {
    const fallback = await supabase
      .from("invoices")
      .select(
        "id, partner_id, move_type, operation_type, doc_type, invoice_date, invoice_number, control_number, affected_document, import_file_number, amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva, partners(rif)",
      )
      .eq("company_id", companyId)
      .neq("state", "cancelled")
      .gt("amount_retained_iva", 0)
      .gte("invoice_date", dateFrom)
      .lte("invoice_date", dateTo)
      .order("invoice_date", { ascending: true });
    if (fallback.error) return { data: [], error: fallback.error.message };
    const rows = (fallback.data || []).map((row) => ({
      ...(row as Omit<InvoiceRow, "registration_date">),
      registration_date: (row as { invoice_date: string }).invoice_date,
    })) as InvoiceRow[];
    return { data: rows };
  }

  if (primary.error) return { data: [], error: primary.error.message };
  return { data: (primary.data || []) as InvoiceRow[] };
}

export function monthBounds(period: string) {
  const p = period.replace(/\D/g, "").slice(0, 6);
  const y = p.slice(0, 4);
  const m = p.slice(4, 6);
  const lastDay = new Date(Number(y), Number(m), 0).getDate();
  return {
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function quincenaBounds(period: string, half: "1" | "2" | "full") {
  const { from, to } = monthBounds(period);
  const y = period.slice(0, 4);
  const m = period.slice(4, 6);
  if (half === "1") return { from, to: `${y}-${m}-15` };
  if (half === "2") {
    const lastDay = to.slice(8, 10);
    return { from: `${y}-${m}-16`, to: `${y}-${m}-${lastDay}` };
  }
  return { from, to };
}

export async function buildIvaTxtLinesForRange(
  supabase: SupabaseClient,
  company: CompanyRef,
  dateFrom: string,
  dateTo: string,
  userId?: string,
): Promise<
  | { ok: true; lines: IvaTxtLine[]; created: number; skippedDedup: number }
  | { ok: false; error: string }
> {
  const { data: invoices, error: loadErr } = await loadInvoicesWithIvaRetention(
    supabase,
    company.id,
    dateFrom,
    dateTo,
  );
  if (loadErr) return { ok: false, error: loadErr };
  if (!invoices.length) {
    return {
      ok: false,
      error: `No hay facturas con retención IVA entre ${dateFrom} y ${dateTo}. Revisa la fecha registro (libro).`,
    };
  }

  let created = 0;
  for (const inv of invoices) {
    const had = await hasActiveWhForInvoice(supabase, company.id, inv.id);
    const ensured = await ensureIvaComprobanteForInvoice(supabase, company, inv, userId);
    if (!ensured.ok) return ensured;
    if (!had) created += 1;
  }

  // Reload comprobantes ligados a esas facturas
  const invoiceIds = invoices.map((i) => i.id);
  const { data: whLines, error: whErr } = await supabase
    .from("withholding_iva_lines")
    .select(
      "invoice_id, invoice_number, control_number, affected_document, invoice_date, operation_type, doc_type, amount_total, amount_untaxed, amount_withheld, amount_exempt, alicuota, expediente, withholding_iva!inner(voucher_number, period, voucher_date, state, partners(rif))",
    )
    .eq("company_id", company.id)
    .in("invoice_id", invoiceIds)
    .neq("withholding_iva.state", "cancelled");

  if (whErr) return { ok: false, error: whErr.message };

  const agentRif = formatRif99035(company.rif);
  if (agentRif.length !== 10) {
    return {
      ok: false,
      error: `RIF empresa inválido para SENIAT: ${company.rif || "(vacío)"}.`,
    };
  }

  const lines: IvaTxtLine[] = [];
  for (const line of whLines || []) {
    const wh = line.withholding_iva as unknown as
      | {
          voucher_number: string;
          period: string;
          voucher_date: string;
          partners: { rif: string } | { rif: string }[] | null;
        }
      | Array<{
          voucher_number: string;
          period: string;
          voucher_date: string;
          partners: { rif: string } | { rif: string }[] | null;
        }>;
    const header = Array.isArray(wh) ? wh[0] : wh;
    if (!header) continue;

    const inv = invoices.find((i) => i.id === line.invoice_id);
    const p = unwrapPartner(header.partners) || (inv ? unwrapPartner(inv.partners) : null);
    const partnerRif = formatRif99035(p?.rif || "");
    if (partnerRif.length !== 10) {
      return {
        ok: false,
        error: `RIF inválido en factura ${line.invoice_number}. Corrígelo en Terceros.`,
      };
    }

    const ali = Number(line.alicuota || invoiceTaxRate(inv || ({} as InvoiceRow)));
    const pct = inv ? retentionPctFromInvoice(inv, ali) : 75;

    lines.push({
      agentRif,
      period: header.period,
      invoiceDate: line.invoice_date || header.voucher_date,
      operationType: line.operation_type as "C" | "V",
      docType: line.doc_type,
      partnerRif,
      invoiceNumber: line.invoice_number,
      controlNumber: line.control_number || "0",
      amountTotal: Number(line.amount_total),
      amountUntaxed: Number(line.amount_untaxed),
      amountWithheld: Number(line.amount_withheld),
      affectedDocument: line.affected_document || "0",
      voucherNumber: header.voucher_number,
      amountExempt: Number(line.amount_exempt || 0),
      alicuota: ali,
      expediente: line.expediente || "0",
      retentionPct: pct,
    });
  }

  const { unique, skipped } = dedupeIvaTxtLines(lines);
  return { ok: true, lines: unique, created, skippedDedup: skipped };
}

async function hasActiveWhForInvoice(
  supabase: SupabaseClient,
  companyId: string,
  invoiceId: string,
) {
  const { data } = await supabase
    .from("withholding_iva_lines")
    .select("id, withholding_iva(id, state)")
    .eq("company_id", companyId)
    .eq("invoice_id", invoiceId);
  return (data || []).some((row) => {
    const parent = row.withholding_iva as unknown as
      | { state?: string }
      | { state?: string }[]
      | null;
    const st = Array.isArray(parent) ? parent[0]?.state : parent?.state;
    return st !== "cancelled";
  });
}

export function dedupeIvaTxtLines(lines: IvaTxtLine[]) {
  const seen = new Set<string>();
  const unique: IvaTxtLine[] = [];
  let skipped = 0;
  for (const l of lines) {
    const key = `${formatRif99035(l.partnerRif)}|${String(l.invoiceNumber || "").replace(/\D/g, "").replace(/^0+/, "") || "0"}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    unique.push(l);
  }
  return { unique, skipped };
}
