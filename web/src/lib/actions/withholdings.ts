"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany, periodFromDate } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { nextCompanySequence } from "@/lib/actions/sequences";
import { applyIvaRetentionPct } from "@/lib/actions/invoices";
import {
  buildIvaTxt99035,
  formatRif99035,
  formatVoucherNumber,
  seniatIvaWithheld,
  snapAlicuota,
} from "@/lib/seniat/txt-iva";

export type ActionState = { error?: string; success?: string; txt?: string };

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

  revalidatePath("/app/withholdings");
  revalidatePath("/app/config");
  return { success: `Comprobante ${voucherNumber} creado.` };
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

  const period = String(formData.get("period") || "").replace("-", "");
  if (!/^\d{6}$/.test(period)) {
    return { error: "Período inválido. Usa AAAAMM o YYYY-MM." };
  }

  const supabase = await createClient();
  const { data: headers, error } = await supabase
    .from("withholding_iva")
    .select(
      "voucher_number, period, voucher_date, partners(rif), withholding_iva_lines(*)",
    )
    .eq("company_id", company.id)
    .eq("period", period)
    .neq("state", "cancelled");

  if (error) return { error: error.message };
  if (!headers?.length) return { error: "No hay retenciones en ese período." };

  const agentRif = formatRif99035(company.rif);
  if (agentRif.length !== 10) {
    return {
      error: `El RIF de la empresa debe tener 10 caracteres para SENIAT (letra + 9 dígitos). Ahora: ${company.rif || "(vacío)"}.`,
    };
  }

  const lines = [];
  for (const wh of headers) {
    const partner = wh.partners as unknown as
      | { rif: string }
      | { rif: string }[]
      | null;
    const p = Array.isArray(partner) ? partner[0] : partner;
    const whLines = (wh.withholding_iva_lines || []) as Array<{
      operation_type: "C" | "V";
      doc_type: string;
      invoice_number: string;
      control_number: string;
      affected_document: string;
      invoice_date: string;
      amount_total: number;
      amount_untaxed: number;
      amount_withheld: number;
      amount_exempt: number;
      alicuota: number;
      expediente: string;
    }>;

    for (const line of whLines) {
      const base = Number(line.amount_untaxed || 0);
      const ali = Number(line.alicuota || 16);
      const stored = Number(line.amount_withheld || 0);
      const partnerRif = formatRif99035(p?.rif || "");
      if (partnerRif.length !== 10) {
        return {
          error: `RIF del proveedor/cliente inválido para SENIAT (debe ser letra + 9 dígitos, ej. J123456789). Factura ${line.invoice_number}: ${p?.rif || "(vacío)"}. Corrígelo en Terceros.`,
        };
      }
      lines.push({
        agentRif,
        period: wh.period,
        invoiceDate: line.invoice_date || wh.voucher_date,
        operationType: line.operation_type,
        docType: line.doc_type,
        partnerRif,
        invoiceNumber: line.invoice_number,
        controlNumber: line.control_number || "0",
        amountTotal: Number(line.amount_total),
        amountUntaxed: base,
        amountWithheld: stored,
        affectedDocument: line.affected_document || "0",
        voucherNumber: wh.voucher_number,
        amountExempt: Number(line.amount_exempt || 0),
        alicuota: ali,
        expediente: line.expediente || "0",
        retentionPct: 75,
      });
    }
  }

  const txt = buildIvaTxt99035(lines);
  return {
    success: `TXT generado (${lines.length} línea(s)).`,
    txt,
  };
}
