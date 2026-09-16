"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany, getActiveTaxUnit } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { calcIslrFromTabla } from "@/lib/seniat/islr-catalog";
import { seniatIvaAmount } from "@/domain/seniat/iva";
import { invoiceDomain } from "@/domain/invoices/invoice.service";
import type { InvoiceLineInput } from "@/domain/invoices/invoice.types";
import { InvoicesRepository } from "@/repositories/invoices.repository";
import { PeriodsRepository } from "@/repositories/periods.repository";

export type ActionState = { error?: string; success?: string; id?: string };

export async function createInvoice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  let parsedLines: InvoiceLineInput[] = [];
  try {
    parsedLines = JSON.parse(String(formData.get("lines_json") || "[]"));
  } catch {
    parsedLines = [];
  }

  const invoiceDate = String(formData.get("invoice_date") || "");
  const input = {
    partnerId: String(formData.get("partner_id") || ""),
    moveType: String(formData.get("move_type") || "in_invoice"),
    invoiceDate,
    registrationDate:
      String(formData.get("registration_date") || "").trim() || invoiceDate,
    invoiceNumber: String(formData.get("invoice_number") || "").trim(),
    controlNumber: String(formData.get("control_number") || "").trim(),
    currencyCode: String(formData.get("currency_code") || "VES").toUpperCase(),
    exchangeRate: Number(formData.get("exchange_rate") || 0) || null,
    sinCred: String(formData.get("sin_cred") || "0") === "1",
    importPlanilla: String(formData.get("import_planilla") || "").trim(),
    importFileNumber: String(formData.get("import_file_number") || "").trim(),
    amountUntaxed: Number(formData.get("amount_untaxed") || 0),
    taxRate: Number(formData.get("tax_rate") || 16),
    amountExempt: Number(formData.get("amount_exempt") || 0),
    withholdingPct: Number(formData.get("withholding_pct") || 0),
    igtfRate: Number(formData.get("igtf_rate") || 0) || 0,
    lines: parsedLines,
  };

  const invalid = invoiceDomain.validateCreate(input);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const periods = new PeriodsRepository(supabase);
  const invoices = new InvoicesRepository(supabase);

  const periodCheck = await periods.assertOpen(company.id, input.invoiceDate);
  if (!periodCheck.ok) return { error: periodCheck.error };
  if (input.registrationDate !== input.invoiceDate) {
    const regCheck = await periods.assertOpen(company.id, input.registrationDate);
    if (!regCheck.ok) return { error: regCheck.error };
  }

  const normalizedNumber = input.invoiceNumber.trim();
  const dup = await invoices.findDuplicate({
    companyId: company.id,
    partnerId: input.partnerId,
    moveType: input.moveType,
    invoiceNumber: normalizedNumber,
  });
  if (dup) {
    return {
      error: `Ya existe la factura ${dup.invoice_number} para este proveedor/cliente (${dup.invoice_date}). No se puede registrar duplicada (146 y 000146 son el mismo número).`,
    };
  }

  const factor = invoiceDomain.vesFactor(input.currencyCode, input.exchangeRate);
  const lines = invoiceDomain.normalizeLines(
    invoiceDomain.fallbackLines(
      input.lines,
      input.amountUntaxed,
      input.amountExempt,
      input.taxRate,
    ),
    factor,
  );
  const amountTax = seniatIvaAmount(input.amountUntaxed, input.taxRate);

  let retainedIslr = 0;
  const conceptIds = [
    ...new Set(lines.map((l) => l.concept_id).filter(Boolean) as string[]),
  ];
  if (conceptIds.length) {
    const [{ data: partner }, { data: conceptRows }, utAmount] = await Promise.all([
      supabase.from("partners").select("person_type").eq("id", input.partnerId).maybeSingle(),
      supabase.from("islr_concepts").select("id, code").in("id", conceptIds),
      getActiveTaxUnit(company.id, invoiceDate),
    ]);
    const personType = partner?.person_type === "natural" ? "natural" : "juridica";
    const codeById = new Map((conceptRows || []).map((c) => [c.id, c.code]));
    for (const line of lines) {
      if (!line.concept_id) continue;
      const calc = calcIslrFromTabla({
        base: Number(line.untaxed || line.exempt || 0),
        conceptCode: codeById.get(line.concept_id) || null,
        personType,
        utAmount,
      });
      retainedIslr += calc.withheld;
    }
    retainedIslr = Number(retainedIslr.toFixed(2));
  }

  const totals = invoiceDomain.totals({
    lines,
    amountUntaxed: input.amountUntaxed,
    amountTax,
    amountExempt: input.amountExempt,
    withholdingPct: input.withholdingPct,
    retainedIslr,
    igtfRate: input.igtfRate,
    factor,
  });
  const rateForUsd =
    input.exchangeRate && input.exchangeRate > 0
      ? input.exchangeRate
      : input.currencyCode === "USD"
        ? factor
        : null;
  const usd = invoiceDomain.usdAmounts(totals, rateForUsd);
  const { operation, doc } = invoiceDomain.docType(
    input.moveType,
    input.importPlanilla,
    input.importFileNumber,
  );
  const importDate = String(formData.get("import_date") || "").trim() || null;
  const affectedDocument = String(formData.get("affected_document") || "").trim();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = {
    company_id: company.id,
    partner_id: input.partnerId,
    move_type: input.moveType,
    operation_type: operation,
    doc_type: doc,
    state: "confirmed",
    invoice_date: input.invoiceDate,
    registration_date: input.registrationDate,
    due_date: input.invoiceDate,
    invoice_number: normalizedNumber,
    control_number: input.controlNumber || null,
    affected_document: affectedDocument || null,
    import_file_number: input.importFileNumber || null,
    import_planilla: input.importPlanilla || null,
    import_date: importDate,
    sin_cred: input.sinCred,
    currency_code: input.currencyCode === "USD" ? "USD" : "VES",
    exchange_rate: rateForUsd,
    amount_untaxed: totals.untaxed,
    amount_tax: totals.tax,
    amount_exempt: totals.exempt,
    amount_total: totals.total,
    amount_retained_iva: totals.retainedIva,
    amount_retained_islr: totals.retainedIslr,
    igtf_rate: input.igtfRate,
    amount_igtf: totals.igtf,
    amount_untaxed_usd: usd.untaxed,
    amount_tax_usd: usd.tax,
    amount_exempt_usd: usd.exempt,
    amount_total_usd: usd.total,
    amount_residual: totals.residual,
    amount_residual_usd: usd.residual,
    amount_paid: 0,
    payment_state: totals.residual <= 0 ? "paid" : "not_paid",
    created_by: user?.id,
  };

  const { data: invoice, error } = await invoices.insert(row);

  if (error) {
    if (/duplicate|unique|23505/i.test(error.message)) {
      return {
        error: `Ya existe la factura ${normalizedNumber} para este tercero. No se puede registrar duplicada.`,
      };
    }
    if (/column|does not exist|schema cache/i.test(error.message)) {
      const { data: legacy, error: legacyErr } = await invoices.insert({
        company_id: company.id,
        partner_id: input.partnerId,
        move_type: input.moveType,
        operation_type: operation,
        doc_type: doc,
        state: "confirmed",
        invoice_date: input.invoiceDate,
        due_date: input.invoiceDate,
        invoice_number: normalizedNumber,
        control_number: input.controlNumber || null,
        affected_document: affectedDocument || null,
        import_file_number: input.importFileNumber || null,
        currency_code: input.currencyCode === "USD" ? "USD" : "VES",
        amount_untaxed: totals.untaxed,
        amount_tax: totals.tax,
        amount_exempt: totals.exempt,
        amount_total: totals.total,
        amount_retained_iva: totals.retainedIva,
        amount_residual: Number((totals.total - totals.retainedIva).toFixed(2)),
        amount_paid: 0,
        payment_state: totals.residual <= 0 ? "paid" : "not_paid",
        created_by: user?.id,
      });
      if (legacyErr) {
        if (/duplicate|unique|23505/i.test(legacyErr.message)) {
          return {
            error: `Ya existe la factura ${normalizedNumber} para este tercero. No se puede registrar duplicada.`,
          };
        }
        return { error: legacyErr.message };
      }
      await invoices.insertLines(legacy.id, company.id, lines, false);
      await tryPostAccounting(legacy.id);
      revalidateAll(legacy.id);
      return { success: `Factura registrada · ${legacy.id}`, id: legacy.id };
    }
    return { error: error.message };
  }

  const lineErr = await invoices.insertLines(invoice.id, company.id, lines, true);
  if (lineErr) return { error: lineErr };

  await tryPostAccounting(invoice.id);
  if (totals.retainedIva > 0) {
    try {
      const { ensureIvaWithholdingForInvoice } = await import("@/lib/actions/withholdings");
      await ensureIvaWithholdingForInvoice(
        invoice.id,
        totals.withholdingPct,
        input.invoiceDate,
      );
    } catch {
      /* comprobante IVA se puede generar en Retenciones */
    }
  }
  if (totals.retainedIslr > 0) {
    try {
      const { ensureIslrWithholdingForInvoice } = await import("@/lib/actions/islr");
      await ensureIslrWithholdingForInvoice(invoice.id);
    } catch {
      /* comprobante se puede generar después en Retenciones */
    }
  }
  try {
    const { writeAuditLog } = await import("@/lib/actions/audit");
    await writeAuditLog({
      companyId: company.id,
      userId: user?.id,
      action: "create",
      entity: "invoice",
      entityId: invoice.id,
      payload: {
        invoice_number: input.invoiceNumber,
        move_type: input.moveType,
        amount_total: totals.total,
      },
    });
  } catch {
    /* ignore */
  }
  revalidateAll(invoice.id);
  return { success: `Factura registrada · ${invoice.id}`, id: invoice.id };
}

async function tryPostAccounting(invoiceId: string) {
  try {
    const { postInvoiceAccounting } = await import("@/lib/actions/accounting");
    await postInvoiceAccounting(invoiceId);
  } catch {
    /* schema may not be migrated yet */
  }
}

function revalidateAll(invoiceId?: string) {
  revalidatePath("/app/invoices");
  revalidatePath("/app/invoices/new");
  if (invoiceId) revalidatePath(`/app/invoices/${invoiceId}`);
  revalidatePath("/app/receivables");
  revalidatePath("/app/payables");
  revalidatePath("/app/withholdings");
  revalidatePath("/app/accounts");
  revalidatePath("/app");
}

export async function applyIvaRetentionPct(
  invoiceId: string,
  pct: number,
): Promise<{ ok: true; retained: number } | { ok: false; error: string }> {
  const company = await getActiveCompany();
  if (!company) return { ok: false, error: "Sin empresa activa." };

  const supabase = await createClient();
  const invoices = new InvoicesRepository(supabase);
  const invoice = await invoices.getForIvaRetention(invoiceId, company.id);
  if (!invoice) return { ok: false, error: "Factura no encontrada." };
  if (invoice.state === "cancelled") {
    return { ok: false, error: "La factura está anulada." };
  }

  const result = invoiceDomain.ivaRetentionOnSaved(
    Number(invoice.amount_tax || 0),
    Number(invoice.amount_untaxed || 0),
    pct,
  );
  if (!result.ok) return result;

  const residual = Number(
    (
      Number(invoice.amount_total || 0) -
      result.retained -
      Number(invoice.amount_retained_islr || 0) -
      Number(invoice.amount_paid || 0)
    ).toFixed(2),
  );

  const { error } = await invoices.updateAmounts(invoiceId, company.id, {
    amount_retained_iva: result.retained,
    amount_residual: residual,
    payment_state: residual <= 0 ? "paid" : "not_paid",
  });
  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, retained: result.retained };
}

export async function updateInvoiceIvaRetention(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const invoiceId = String(formData.get("invoice_id") || "");
  const pct = Number(formData.get("withholding_pct") || 0);
  const result = await applyIvaRetentionPct(invoiceId, pct);
  if (!result.ok) return { error: result.error };
  return {
    success: `Retención IVA actualizada: ${result.retained.toFixed(2)} Bs (${pct}%).`,
  };
}

export async function cancelInvoiceById(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "Factura no indicada." };
  const company = await getActiveCompany();
  if (!company) return { ok: false, error: "Sin empresa activa." };

  const supabase = await createClient();
  const invoices = new InvoicesRepository(supabase);

  try {
    await invoices.cancel(id, company.id);
    const linked = await invoices.countLinks(id);
    if (!linked) {
      const moveId = await invoices.getMoveId(id, company.id);
      await invoices.deleteUnlinked(id, company.id, moveId);
    }
  } catch {
    try {
      await invoices.cancel(id, company.id);
    } catch {
      return { ok: false, error: "No se pudo anular la factura." };
    }
  }

  revalidatePath("/app/invoices");
  revalidatePath(`/app/invoices/${id}`);
  revalidatePath("/app/receivables");
  revalidatePath("/app/payables");
  revalidatePath("/app/books");
  revalidatePath("/app");
  return { ok: true };
}

/** @deprecated Prefer cancel via /api/invoices/cancel to avoid stale Server Action IDs. */
export async function deleteInvoice(formData: FormData): Promise<void> {
  await cancelInvoiceById(String(formData.get("id") || ""));
}
