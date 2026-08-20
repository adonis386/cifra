"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany, periodFromDate, getActiveTaxUnit } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { buildIslrXml } from "@/lib/seniat/xml-islr";
import { nextCompanySequence } from "@/lib/actions/sequences";
import { assertPeriodOpen } from "@/lib/actions/periods";
import {
  calcIslrFromTabla,
  seniatConceptLabel,
  seniatRateFor,
  seniatXmlCode,
} from "@/lib/seniat/islr-catalog";

export type ActionState = { error?: string; success?: string; xml?: string };

export type IslrComputedLine = {
  invoiceId: string;
  invoiceNumber: string;
  controlNumber: string;
  invoiceDate: string;
  invoiceTotal: number;
  conceptId: string | null;
  conceptCode: string;
  conceptName: string;
  xmlCode: string;
  rate: number;
  base: number;
  subtract: number;
  withheld: number;
};

function unwrap<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] || null : raw;
}

export async function computeIslrForInvoice(
  invoiceId: string,
  companyId: string,
): Promise<{
  error?: string;
  partnerId?: string;
  voucherDate?: string;
  lines: IslrComputedLine[];
  totalBase: number;
  totalSubtract: number;
  totalWithheld: number;
}> {
  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, partner_id, invoice_number, control_number, invoice_date, amount_total, amount_untaxed, amount_exempt, partners(person_type)",
    )
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .single();
  if (!invoice) return { error: "Factura no encontrada.", lines: [], totalBase: 0, totalSubtract: 0, totalWithheld: 0 };

  const partner = unwrap(
    invoice.partners as { person_type?: string } | { person_type?: string }[] | null,
  );
  const personType = partner?.person_type === "natural" ? "natural" : "juridica";
  const utAmount = await getActiveTaxUnit(companyId, invoice.invoice_date);

  const { data: invLines } = await supabase
    .from("invoice_lines")
    .select(
      "amount_untaxed, amount_total, concept_id, islr_concepts(id, code, name)",
    )
    .eq("invoice_id", invoice.id);

  const lines: IslrComputedLine[] = [];
  for (const row of invLines || []) {
    const concept = unwrap(
      row.islr_concepts as
        | { id: string; code: string; name: string }
        | { id: string; code: string; name: string }[]
        | null,
    );
    if (!concept?.code || concept.code === "000") continue;
    const base = Number(row.amount_untaxed || 0);
    if (base <= 0) continue;
    const tabla = seniatRateFor(concept.code, personType);
    const calc = calcIslrFromTabla({
      base,
      conceptCode: concept.code,
      personType,
      utAmount,
    });
    if (!tabla?.withholdable && calc.withheld <= 0) continue;
    const xmlCode = seniatXmlCode(concept.code, personType);
    lines.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      controlNumber: invoice.control_number || "0",
      invoiceDate: invoice.invoice_date,
      invoiceTotal: Number(invoice.amount_total || 0),
      conceptId: concept.id,
      conceptCode: concept.code,
      conceptName: seniatConceptLabel(concept.code, personType, concept.name),
      xmlCode,
      rate: Number(tabla?.rate || 0),
      base: calc.taxableBase,
      subtract: calc.subtract,
      withheld: calc.withheld,
    });
  }

  // Header fallback: factura con ISLR pero líneas sin concepto usable
  if (!lines.length) {
    const base = Number(invoice.amount_untaxed || invoice.amount_exempt || invoice.amount_total || 0);
    if (base > 0) {
      const calc = calcIslrFromTabla({
        base,
        conceptCode: personType === "natural" ? "002" : "004",
        personType,
        utAmount,
      });
      const xmlCode = seniatXmlCode(
        personType === "natural" ? "002" : "004",
        personType,
      );
      const tabla = seniatRateFor(xmlCode, personType);
      lines.push({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        controlNumber: invoice.control_number || "0",
        invoiceDate: invoice.invoice_date,
        invoiceTotal: Number(invoice.amount_total || 0),
        conceptId: null,
        conceptCode: xmlCode,
        conceptName: seniatConceptLabel(xmlCode, personType),
        xmlCode,
        rate: Number(tabla?.rate || 0),
        base: calc.taxableBase,
        subtract: calc.subtract,
        withheld: calc.withheld,
      });
    }
  }

  const totalBase = Number(lines.reduce((s, l) => s + l.base, 0).toFixed(2));
  const totalSubtract = Number(lines.reduce((s, l) => s + l.subtract, 0).toFixed(2));
  const totalWithheld = Number(lines.reduce((s, l) => s + l.withheld, 0).toFixed(2));
  return {
    partnerId: invoice.partner_id,
    voucherDate: invoice.invoice_date,
    lines,
    totalBase,
    totalSubtract,
    totalWithheld,
  };
}

export async function createIslrWithholding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const invoiceId = String(formData.get("invoice_id") || "");
  const voucherDate = String(formData.get("voucher_date") || "");

  if (!invoiceId || !voucherDate) {
    return { error: "Completa factura y fecha del comprobante." };
  }

  const periodOk = await assertPeriodOpen(company.id, voucherDate);
  if (!periodOk.ok) return { error: periodOk.error };

  const computed = await computeIslrForInvoice(invoiceId, company.id);
  if (computed.error) return { error: computed.error };
  if (!computed.lines.length || computed.totalWithheld <= 0) {
    return { error: "La factura no tiene retención ISLR calculable (concepto + base)." };
  }

  return persistIslrWithholding({
    companyId: company.id,
    invoiceId,
    partnerId: computed.partnerId!,
    voucherDate,
    computed,
  });
}

export async function ensureIslrWithholdingForInvoice(invoiceId: string) {
  const company = await getActiveCompany();
  if (!company) return;
  const computed = await computeIslrForInvoice(invoiceId, company.id);
  if (!computed.lines.length || computed.totalWithheld <= 0 || !computed.partnerId) {
    return;
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("withholding_islr_lines")
    .select("withholding_id")
    .eq("invoice_id", invoiceId)
    .limit(1)
    .maybeSingle();
  if (existing?.withholding_id) return;
  await persistIslrWithholding({
    companyId: company.id,
    invoiceId,
    partnerId: computed.partnerId,
    voucherDate: computed.voucherDate || new Date().toISOString().slice(0, 10),
    computed,
  });
}

async function persistIslrWithholding(input: {
  companyId: string;
  invoiceId: string;
  partnerId: string;
  voucherDate: string;
  computed: Awaited<ReturnType<typeof computeIslrForInvoice>>;
}): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const period = periodFromDate(input.voucherDate);

  const { data: existingLine } = await supabase
    .from("withholding_islr_lines")
    .select("withholding_id")
    .eq("invoice_id", input.invoiceId)
    .limit(1)
    .maybeSingle();

  let withholdingId = existingLine?.withholding_id as string | undefined;

  if (withholdingId) {
    await supabase
      .from("withholding_islr")
      .update({
        voucher_date: input.voucherDate,
        period,
        amount_untaxed: input.computed.totalBase,
        amount_withheld: input.computed.totalWithheld,
        state: "confirmed",
      })
      .eq("id", withholdingId)
      .eq("company_id", input.companyId);
    await supabase
      .from("withholding_islr_lines")
      .delete()
      .eq("withholding_id", withholdingId);
  } else {
    const seq = await nextCompanySequence("wh_islr", { period, padding: 8 });
    if (!seq.ok) return { error: seq.error };
    const voucherNumber = seq.value.replace(/\D/g, "").slice(0, 14);
    const { data: wh, error } = await supabase
      .from("withholding_islr")
      .insert({
        company_id: input.companyId,
        partner_id: input.partnerId,
        voucher_number: voucherNumber,
        period,
        voucher_date: input.voucherDate,
        state: "confirmed",
        amount_untaxed: input.computed.totalBase,
        amount_withheld: input.computed.totalWithheld,
        created_by: user?.id,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    withholdingId = wh.id;
  }

  const linePayloads = input.computed.lines.map((l) => {
    const row: Record<string, unknown> = {
      withholding_id: withholdingId!,
      company_id: input.companyId,
      invoice_id: input.invoiceId,
      rate: l.rate,
      amount_untaxed: l.base,
      amount_withheld: l.withheld,
      amount_subtract: l.subtract,
    };
    if (l.conceptId) row.concept_id = l.conceptId;
    return row;
  });

  const { error: lineErr } = await supabase
    .from("withholding_islr_lines")
    .insert(linePayloads);
  if (lineErr && /amount_subtract|column/i.test(lineErr.message)) {
    const retry = await supabase.from("withholding_islr_lines").insert(
      linePayloads.map(({ amount_subtract: _s, ...rest }) => rest),
    );
    if (retry.error) return { error: retry.error.message };
  } else if (lineErr) {
    return { error: lineErr.message };
  }

  await supabase
    .from("invoices")
    .update({ amount_retained_islr: input.computed.totalWithheld })
    .eq("id", input.invoiceId);

  const { data: head } = await supabase
    .from("withholding_islr")
    .select("voucher_number")
    .eq("id", withholdingId)
    .maybeSingle();
  try {
    const { postWithholdingAccounting } = await import("@/lib/actions/accounting");
    await postWithholdingAccounting({
      invoiceId: input.invoiceId,
      kind: "islr",
      amount: input.computed.totalWithheld,
      date: input.voucherDate,
      voucherNumber: head?.voucher_number || withholdingId!,
    });
  } catch {
    /* asiento se puede registrar después */
  }

  revalidatePath("/app/withholdings");
  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${input.invoiceId}`);
  revalidatePath("/app/ledger");
  revalidatePath("/app/config");
  return {
    success: `Comprobante ISLR · retenido ${input.computed.totalWithheld.toFixed(2)}`,
  };
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
      "id, voucher_date, period, partners(rif, person_type), withholding_islr_lines(invoice_id, amount_untaxed, rate, concept_id, islr_concepts(code), invoices(invoice_number, control_number, invoice_date))",
    )
    .eq("company_id", company.id)
    .eq("period", period)
    .neq("state", "cancelled");

  if (error) return { error: error.message };
  if (!data?.length) return { error: "No hay retenciones ISLR en ese período." };

  const xmlLines = [];
  for (const wh of data) {
    const p = unwrap(
      wh.partners as
        | { rif: string; person_type?: string }
        | { rif: string; person_type?: string }[]
        | null,
    );
    const first = unwrap(
      (wh.withholding_islr_lines || []) as Array<{ invoice_id?: string }>,
    );
    if (first?.invoice_id) {
      const computed = await computeIslrForInvoice(first.invoice_id, company.id);
      for (const line of computed.lines) {
        xmlLines.push({
          partnerRif: p?.rif || "",
          invoiceNumber: line.invoiceNumber,
          controlNumber: line.controlNumber,
          operationDate: line.invoiceDate,
          conceptCode: line.xmlCode,
          baseAmount: line.base,
          retentionPercent: line.rate,
        });
      }
      continue;
    }

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
      const concept = unwrap(line.islr_concepts);
      const inv = unwrap(line.invoices);
      xmlLines.push({
        partnerRif: p?.rif || "",
        invoiceNumber: inv?.invoice_number || "0",
        controlNumber: inv?.control_number || "0",
        operationDate: inv?.invoice_date || wh.voucher_date,
        conceptCode: seniatXmlCode(concept?.code, p?.person_type),
        baseAmount: Number(line.amount_untaxed),
        retentionPercent: Number(line.rate),
      });
    }
  }

  const xml = buildIslrXml({ agentRif: company.rif, period, lines: xmlLines });
  return { success: `XML generado (${xmlLines.length} detalle(s)).`, xml };
}
