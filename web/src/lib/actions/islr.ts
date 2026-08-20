"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany, periodFromDate } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { buildIslrXml } from "@/lib/seniat/xml-islr";
import { nextCompanySequence } from "@/lib/actions/sequences";
import { calcIslrWithholding } from "@/lib/seniat/islr-calc";

export type ActionState = { error?: string; success?: string; xml?: string };

export async function createIslrWithholding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const invoiceId = String(formData.get("invoice_id") || "");
  const conceptId = String(formData.get("concept_id") || "");
  const rateId = String(formData.get("rate_id") || "");
  const voucherDate = String(formData.get("voucher_date") || "");
  const baseAmount = Number(formData.get("base_amount") || 0);

  if (!invoiceId || !conceptId || !rateId || !voucherDate || baseAmount <= 0) {
    return { error: "Completa factura, concepto, tarifa, fecha y base." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: invoice }, { data: rate }, { data: ut }] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).eq("company_id", company.id).single(),
    supabase.from("islr_rates").select("*, islr_concepts(code, name)").eq("id", rateId).single(),
    supabase
      .from("tax_units")
      .select("amount")
      .or(`company_id.eq.${company.id},company_id.is.null`)
      .order("date_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!invoice) return { error: "Factura no encontrada." };
  if (!rate) return { error: "Tarifa ISLR no encontrada." };

  const utAmount = Number(ut?.amount || 0);
  const calc = calcIslrWithholding({
    base: baseAmount,
    rate: Number(rate.rate || 0),
    basePercent: Number(rate.base_percent || 100),
    minimumUt: Number(rate.minimum_ut || 0),
    utAmount,
  });
  const withheld = calc.withheld;
  const period = periodFromDate(voucherDate);
  const seq = await nextCompanySequence("wh_islr", { period, padding: 8 });
  if (!seq.ok) return { error: seq.error };
  const voucherNumber = seq.value.replace(/\D/g, "").slice(0, 14);

  const { data: wh, error } = await supabase
    .from("withholding_islr")
    .insert({
      company_id: company.id,
      partner_id: invoice.partner_id,
      voucher_number: voucherNumber,
      period,
      voucher_date: voucherDate,
      state: "confirmed",
      amount_untaxed: calc.taxableBase,
      amount_withheld: withheld,
      created_by: user?.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const linePayload: Record<string, unknown> = {
    withholding_id: wh.id,
    company_id: company.id,
    invoice_id: invoice.id,
    concept_id: conceptId,
    rate: rate.rate,
    amount_untaxed: calc.taxableBase,
    amount_withheld: withheld,
    amount_subtract: calc.subtract,
  };
  const { error: lineErr } = await supabase
    .from("withholding_islr_lines")
    .insert(linePayload);
  if (lineErr && /amount_subtract|column/i.test(lineErr.message)) {
    delete linePayload.amount_subtract;
    const retry = await supabase.from("withholding_islr_lines").insert(linePayload);
    if (retry.error) return { error: retry.error.message };
  } else if (lineErr) {
    return { error: lineErr.message };
  }

  const prevIslr = Number(invoice.amount_retained_islr || 0);
  await supabase
    .from("invoices")
    .update({ amount_retained_islr: Number((prevIslr + withheld).toFixed(2)) })
    .eq("id", invoice.id);

  revalidatePath("/app/withholdings");
  revalidatePath("/app/invoices");
  revalidatePath("/app/config");
  return { success: `Comprobante ISLR ${voucherNumber} · retenido ${withheld.toFixed(2)} · ${Date.now()}` };
}

export async function exportIslrXml(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const period = String(formData.get("period") || "").replace("-", "");
  if (!/^\d{6}$/.test(period)) return { error: "Período inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("withholding_islr")
    .select(
      "voucher_date, period, partners(rif), withholding_islr_lines(amount_untaxed, rate, concept_id, islr_concepts(code), invoices(invoice_number, control_number, invoice_date))",
    )
    .eq("company_id", company.id)
    .eq("period", period)
    .neq("state", "cancelled");

  if (error) return { error: error.message };
  if (!data?.length) return { error: "No hay retenciones ISLR en ese período." };

  const lines = [];
  for (const wh of data) {
    const partner = wh.partners as unknown as { rif: string } | { rif: string }[] | null;
    const p = Array.isArray(partner) ? partner[0] : partner;
    const whLines = (wh.withholding_islr_lines || []) as Array<{
      amount_untaxed: number;
      rate: number;
      islr_concepts: { code: string } | { code: string }[] | null;
      invoices:
        | { invoice_number: string; control_number: string; invoice_date: string }
        | { invoice_number: string; control_number: string; invoice_date: string }[]
        | null;
    }>;

    for (const line of whLines) {
      const concept = Array.isArray(line.islr_concepts)
        ? line.islr_concepts[0]
        : line.islr_concepts;
      const inv = Array.isArray(line.invoices) ? line.invoices[0] : line.invoices;
      lines.push({
        partnerRif: p?.rif || "",
        invoiceNumber: inv?.invoice_number || "0",
        controlNumber: inv?.control_number || "0",
        operationDate: inv?.invoice_date || wh.voucher_date,
        conceptCode: concept?.code || "000",
        baseAmount: Number(line.amount_untaxed),
        retentionPercent: Number(line.rate),
      });
    }
  }

  const xml = buildIslrXml({ agentRif: company.rif, period, lines });
  return { success: `XML generado (${lines.length} detalle(s)).`, xml };
}
