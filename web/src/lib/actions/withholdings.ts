"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany, periodFromDate } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { nextCompanySequence } from "@/lib/actions/sequences";
import { applyIvaRetentionPct } from "@/lib/actions/invoices";
import { assertPeriodOpen } from "@/lib/actions/periods";
import {
  buildIvaTxt99035,
  formatVoucherNumber,
  seniatIvaWithheld,
  snapAlicuota,
} from "@/lib/seniat/txt-iva";
import {
  buildIvaTxtLinesForRange,
} from "@/lib/seniat/iva-export";

export type ActionState = {
  error?: string;
  success?: string;
  txt?: string;
  date_from?: string;
  date_to?: string;
};

export async function createIvaWithholding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const invoiceId = String(formData.get("invoice_id") || "");
  const voucherDate = String(formData.get("voucher_date") || "");
  if (!invoiceId || !voucherDate) {
    return { error: "Selecciona factura y fecha del comprobante." };
  }

  const periodOk = await assertPeriodOpen(company.id, voucherDate);
  if (!periodOk.ok) return { error: periodOk.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("company_id", company.id)
    .single();

  if (invErr || !invoice) return { error: "Factura no encontrada." };

  const { data: invLines } = await supabase
    .from("invoice_lines")
    .select("tax_rate, amount_untaxed, amount_tax")
    .eq("invoice_id", invoiceId);

  const taxed = (invLines || []).find((l) => Number(l.amount_tax || 0) > 0);
  const ali = snapAlicuota(
    Number(taxed?.tax_rate || 0) ||
      (Number(invoice.amount_untaxed) > 0
        ? (Number(invoice.amount_tax) / Number(invoice.amount_untaxed)) * 100
        : 16),
  );
  const pct = Number(formData.get("withholding_pct") || 75) || 75;
  const base = Number(invoice.amount_untaxed || 0);
  if (base <= 0) {
    return {
      error: "La factura no tiene base imponible. No se puede retener IVA.",
    };
  }
  const retainedIva = seniatIvaWithheld(base, ali, pct);

  if (Number(invoice.amount_retained_iva || 0) !== retainedIva) {
    const applied = await applyIvaRetentionPct(invoiceId, pct);
    if (!applied.ok) return { error: applied.error };
  }

  const { data: existingWh } = await supabase
    .from("withholding_iva_lines")
    .select("id, invoice_number, withholding_iva(id, state)")
    .eq("company_id", company.id)
    .eq("invoice_id", invoiceId);

  const already = (existingWh || []).find((row) => {
    const parent = row.withholding_iva as unknown as
      | { state?: string }
      | { state?: string }[]
      | null;
    const st = Array.isArray(parent) ? parent[0]?.state : parent?.state;
    return st !== "cancelled";
  });
  if (already) {
    return {
      error: `Ya existe un comprobante IVA para la factura ${invoice.invoice_number}. SENIAT no admite el mismo número dos veces en el TXT.`,
    };
  }

  const period = periodFromDate(voucherDate);
  const seq = await nextCompanySequence("wh_iva", { period, padding: 8 });
  if (!seq.ok) return { error: seq.error };
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
      amount_withheld: retainedIva,
      created_by: user?.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

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
    amount_withheld: retainedIva,
    amount_exempt: invoice.amount_exempt,
    alicuota: ali,
    expediente: invoice.import_file_number || "0",
  });

  if (lineErr) return { error: lineErr.message };

  try {
    const { postWithholdingAccounting } = await import("@/lib/actions/accounting");
    await postWithholdingAccounting({
      invoiceId: invoice.id,
      kind: "iva",
      amount: retainedIva,
      date: voucherDate,
      voucherNumber,
    });
  } catch {
    /* asiento se puede registrar después */
  }

  revalidatePath("/app/withholdings");
  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${invoice.id}`);
  revalidatePath("/app/ledger");
  revalidatePath("/app/config");
  return { success: `Comprobante ${voucherNumber} creado.` };
}

export async function ensureIvaWithholdingForInvoice(
  invoiceId: string,
  pct: number,
  voucherDate: string,
) {
  const fd = new FormData();
  fd.set("invoice_id", invoiceId);
  fd.set("voucher_date", voucherDate);
  fd.set("withholding_pct", String(pct || 75));
  await createIvaWithholding({}, fd);
}

export async function cancelIvaWithholding(
  formData: FormData,
): Promise<void> {
  const company = await getActiveCompany();
  const id = String(formData.get("id") || "");
  if (!company || !id) return;

  const supabase = await createClient();
  await supabase
    .from("withholding_iva")
    .update({ state: "cancelled" })
    .eq("id", id)
    .eq("company_id", company.id);

  revalidatePath("/app/withholdings");
}

export async function exportIvaTxt(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const dateFrom = String(formData.get("date_from") || "").trim();
  const dateTo = String(formData.get("date_to") || "").trim();
  const periodRaw = String(formData.get("period") || "").replace("-", "");

  let from = dateFrom;
  let to = dateTo;
  if ((!from || !to) && /^\d{6}$/.test(periodRaw)) {
    const y = periodRaw.slice(0, 4);
    const m = periodRaw.slice(4, 6);
    from = `${y}-${m}-01`;
    to = new Date(Number(y), Number(m), 0).toISOString().slice(0, 10);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return {
      error: "Indica el lapso con fechas Desde y Hasta (AAAA-MM-DD).",
    };
  }
  if (from > to) {
    return { error: "La fecha Desde no puede ser posterior a Hasta." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const built = await buildIvaTxtLinesForRange(
    supabase,
    company,
    from,
    to,
    user?.id,
  );
  if (!built.ok) return { error: built.error };

  const txt = buildIvaTxt99035(built.lines);
  const extra =
    built.created > 0
      ? ` Se crearon ${built.created} comprobante(s) faltante(s).`
      : "";
  const dedup =
    built.skippedDedup > 0
      ? ` (${built.skippedDedup} duplicada(s) omitida(s) por SENIAT.)`
      : "";

  revalidatePath("/app/withholdings");
  revalidatePath("/app/invoices");

  return {
    success: `TXT ${from} → ${to}: ${built.lines.length} línea(s).${extra}${dedup}`,
    txt,
    date_from: from,
    date_to: to,
  };
}
