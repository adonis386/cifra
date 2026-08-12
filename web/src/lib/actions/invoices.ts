"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany, periodFromDate, toUsd } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: string };

function moveMeta(moveType: string) {
  if (moveType === "out_invoice") return { operation: "V" as const, doc: "01" };
  if (moveType === "out_refund") return { operation: "V" as const, doc: "03" };
  if (moveType === "in_invoice") return { operation: "C" as const, doc: "01" };
  if (moveType === "in_refund") return { operation: "C" as const, doc: "03" };
  return { operation: "C" as const, doc: "01" };
}

type ParsedLine = {
  description: string;
  quantity?: number;
  price_unit?: number;
  rate: number;
  base?: number;
  untaxed?: number;
  tax?: number;
  exempt?: number;
  total?: number;
  tax_code?: string;
  concept_id?: string | null;
};

export async function createInvoice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const partnerId = String(formData.get("partner_id") || "");
  const moveType = String(formData.get("move_type") || "in_invoice");
  const invoiceDate = String(formData.get("invoice_date") || "");
  const invoiceNumber = String(formData.get("invoice_number") || "").trim();
  const controlNumber = String(formData.get("control_number") || "").trim();
  const affectedDocument = String(formData.get("affected_document") || "").trim();
  const currencyCode = String(formData.get("currency_code") || "VES").toUpperCase();
  const exchangeRate = Number(formData.get("exchange_rate") || 0) || null;
  const sinCred = String(formData.get("sin_cred") || "0") === "1";
  const importPlanilla = String(formData.get("import_planilla") || "").trim();
  const importFileNumber = String(formData.get("import_file_number") || "").trim();
  const importDate = String(formData.get("import_date") || "").trim() || null;
  const amountUntaxed = Number(formData.get("amount_untaxed") || 0);
  const taxRate = Number(formData.get("tax_rate") || 16);
  const amountExempt = Number(formData.get("amount_exempt") || 0);
  const withholdingPct = Number(formData.get("withholding_pct") || 0);

  if (!partnerId || !invoiceDate || !invoiceNumber) {
    return { error: "Completa tercero, fecha y número de factura." };
  }
  if (!controlNumber && moveType.startsWith("in_") && !sinCred) {
    return { error: "El número de control es obligatorio en compras (crédito fiscal)." };
  }
  if (currencyCode === "USD" && !(exchangeRate && exchangeRate > 0)) {
    return { error: "Con moneda USD indica la tasa del día (Bs por 1 USD)." };
  }

  const amountTax = Number(((amountUntaxed * taxRate) / 100).toFixed(2));
  const meta = moveMeta(moveType);
  let doc = meta.doc;
  const operation = meta.operation;
  if (importPlanilla || importFileNumber) {
    doc = "04"; // importación / otros
  }

  let parsedLines: ParsedLine[] = [];
  try {
    parsedLines = JSON.parse(String(formData.get("lines_json") || "[]"));
  } catch {
    parsedLines = [];
  }
  if (!parsedLines.length) {
    parsedLines = [
      {
        description: "Línea principal",
        quantity: 1,
        price_unit: amountUntaxed || amountExempt,
        rate: taxRate,
        untaxed: amountUntaxed,
        tax: amountTax,
        exempt: amountExempt,
        base: amountUntaxed || amountExempt,
      },
    ];
  }

  const factor =
    currencyCode === "USD" && exchangeRate && exchangeRate > 0 ? exchangeRate : 1;

  const normalized = parsedLines.map((l) => {
    const quantity = Number(l.quantity ?? 1) || 0;
    let priceUnit = Number(
      l.price_unit ??
        (quantity ? Number(l.base || 0) / quantity : Number(l.base || 0)),
    );
    // Convert USD unit prices to Bs for storage (company books in VES)
    if (factor !== 1) {
      priceUnit = Number((priceUnit * factor).toFixed(4));
    }
    const rate = Number(l.rate || 0);
    const gross = Number((quantity * priceUnit).toFixed(2));
    const hasExplicit = l.untaxed != null || l.tax != null || l.exempt != null;
    let untaxed = hasExplicit ? Number(l.untaxed || 0) : rate > 0 ? gross : 0;
    let tax = hasExplicit
      ? Number(l.tax || 0)
      : Number(((untaxed * rate) / 100).toFixed(2));
    let exempt = hasExplicit ? Number(l.exempt || 0) : rate > 0 ? 0 : gross;
    if (factor !== 1 && hasExplicit) {
      untaxed = Number((untaxed * factor).toFixed(2));
      tax = Number((tax * factor).toFixed(2));
      exempt = Number((exempt * factor).toFixed(2));
    }
    return {
      description: l.description || "Línea",
      quantity,
      price_unit: priceUnit,
      rate,
      untaxed,
      tax,
      exempt,
      total: Number((untaxed + tax + exempt).toFixed(2)),
      concept_id: l.concept_id || null,
    };
  });

  const linesUntaxed = normalized.reduce((s, l) => s + l.untaxed, 0);
  const linesTax = normalized.reduce((s, l) => s + l.tax, 0);
  const linesExempt = normalized.reduce((s, l) => s + l.exempt, 0);
  const finalUntaxed = Number((linesUntaxed || amountUntaxed * factor).toFixed(2));
  const finalTax = Number((linesTax || amountTax * factor).toFixed(2));
  const finalExempt = Number((linesExempt || amountExempt * factor).toFixed(2));
  const finalTotal = Number((finalUntaxed + finalTax + finalExempt).toFixed(2));
  const finalRetained = Number(((finalTax * withholdingPct) / 100).toFixed(2));

  const rateForUsd =
    exchangeRate && exchangeRate > 0
      ? exchangeRate
      : currencyCode === "USD"
        ? factor
        : null;
  const usdUntaxed = toUsd(finalUntaxed, rateForUsd);
  const usdTax = toUsd(finalTax, rateForUsd);
  const usdExempt = toUsd(finalExempt, rateForUsd);
  const usdTotal = toUsd(finalTotal, rateForUsd);
  const residual = Number((finalTotal - finalRetained).toFixed(2));
  const usdResidual = toUsd(residual, rateForUsd);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      company_id: company.id,
      partner_id: partnerId,
      move_type: moveType,
      operation_type: operation,
      doc_type: doc,
      state: "confirmed",
      invoice_date: invoiceDate,
      due_date: invoiceDate,
      invoice_number: invoiceNumber,
      control_number: controlNumber || null,
      affected_document: affectedDocument || null,
      import_file_number: importFileNumber || null,
      import_planilla: importPlanilla || null,
      import_date: importDate,
      sin_cred: sinCred,
      currency_code: currencyCode === "USD" ? "USD" : "VES",
      exchange_rate: rateForUsd,
      amount_untaxed: finalUntaxed,
      amount_tax: finalTax,
      amount_exempt: finalExempt,
      amount_total: finalTotal,
      amount_retained_iva: finalRetained,
      amount_untaxed_usd: usdUntaxed,
      amount_tax_usd: usdTax,
      amount_exempt_usd: usdExempt,
      amount_total_usd: usdTotal,
      amount_residual: residual,
      amount_residual_usd: usdResidual,
      amount_paid: 0,
      payment_state: residual <= 0 ? "paid" : "not_paid",
      created_by: user?.id,
    })
    .select("id")
    .single();

  if (error) {
    // Soft fallback if migration 00008 not applied yet
    if (/column|does not exist|schema cache/i.test(error.message)) {
      const { data: legacy, error: legacyErr } = await supabase
        .from("invoices")
        .insert({
          company_id: company.id,
          partner_id: partnerId,
          move_type: moveType,
          operation_type: operation,
          doc_type: doc,
          state: "confirmed",
          invoice_date: invoiceDate,
          due_date: invoiceDate,
          invoice_number: invoiceNumber,
          control_number: controlNumber || null,
          affected_document: affectedDocument || null,
          import_file_number: importFileNumber || null,
          currency_code: currencyCode === "USD" ? "USD" : "VES",
          amount_untaxed: finalUntaxed,
          amount_tax: finalTax,
          amount_exempt: finalExempt,
          amount_total: finalTotal,
          amount_retained_iva: finalRetained,
          amount_residual: residual,
          amount_paid: 0,
          payment_state: residual <= 0 ? "paid" : "not_paid",
          created_by: user?.id,
        })
        .select("id")
        .single();
      if (legacyErr) return { error: legacyErr.message };
      await insertLines(supabase, legacy.id, company.id, normalized, false);
      await tryPostAccounting(legacy.id);
      revalidateAll();
      return {
        success:
          "Factura registrada (aplica migración dual_currency_fiscal en Supabase para campos nuevos).",
      };
    }
    return { error: error.message };
  }

  const lineErr = await insertLines(supabase, invoice.id, company.id, normalized, true);
  if (lineErr) return { error: lineErr };

  await tryPostAccounting(invoice.id);
  try {
    const { writeAuditLog } = await import("@/lib/actions/audit");
    await writeAuditLog({
      companyId: company.id,
      userId: user?.id,
      action: "create",
      entity: "invoice",
      entityId: invoice.id,
      payload: {
        invoice_number: invoiceNumber,
        move_type: moveType,
        amount_total: finalTotal,
      },
    });
  } catch {
    /* ignore */
  }
  revalidateAll();
  return { success: "Factura registrada." };
}

async function insertLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
  companyId: string,
  normalized: Array<{
    description: string;
    quantity: number;
    price_unit: number;
    rate: number;
    untaxed: number;
    tax: number;
    exempt: number;
    total: number;
    concept_id: string | null;
  }>,
  withConcept: boolean,
) {
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
  const { error } = await supabase.from("invoice_lines").insert(payload);
  if (error && withConcept && /concept_id|column/i.test(error.message)) {
    return insertLines(supabase, invoiceId, companyId, normalized, false);
  }
  return error?.message || null;
}

async function tryPostAccounting(invoiceId: string) {
  try {
    const { postInvoiceAccounting } = await import("@/lib/actions/accounting");
    await postInvoiceAccounting(invoiceId);
  } catch {
    /* schema may not be migrated yet */
  }
}

function revalidateAll() {
  revalidatePath("/app/invoices");
  revalidatePath("/app/receivables");
  revalidatePath("/app/payables");
  revalidatePath("/app/accounts");
  revalidatePath("/app");
}

export async function deleteInvoice(formData: FormData): Promise<void> {
  const id = String(formData.get("id") || "");
  const company = await getActiveCompany();
  if (!company || !id) return;
  const supabase = await createClient();
  await supabase.from("invoices").delete().eq("id", id).eq("company_id", company.id);
  revalidatePath("/app/invoices");
  revalidatePath("/app");
}

export { periodFromDate };
