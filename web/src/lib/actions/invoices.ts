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
  const registrationDate =
    String(formData.get("registration_date") || "").trim() || invoiceDate;
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

  const supabase = await createClient();

  // Evita duplicados: misma empresa + tercero + tipo + número (activas)
  const normalizedNumber = invoiceNumber.trim();
  const { data: dupes } = await supabase
    .from("invoices")
    .select("id, invoice_date, invoice_number")
    .eq("company_id", company.id)
    .eq("partner_id", partnerId)
    .eq("move_type", moveType)
    .neq("state", "cancelled")
    .limit(50);

  const dup = (dupes || []).find(
    (d) =>
      String(d.invoice_number || "").trim().toLowerCase() ===
      normalizedNumber.toLowerCase(),
  );
  if (dup) {
    return {
      error: `Ya existe la factura ${dup.invoice_number} para este proveedor/cliente (${dup.invoice_date}). No se puede registrar duplicada.`,
    };
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
  const effectiveWithholdingPct = finalTax > 0 ? withholdingPct : 0;
  const finalRetained = Number(((finalTax * effectiveWithholdingPct) / 100).toFixed(2));

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Retención ISLR estimada según conceptos en líneas
  let finalRetainedIslr = 0;
  const conceptIds = [
    ...new Set(normalized.map((l) => l.concept_id).filter(Boolean) as string[]),
  ];
  if (conceptIds.length) {
    const [{ data: partner }, { data: rates }, { data: ut }] = await Promise.all([
      supabase
        .from("partners")
        .select("person_type")
        .eq("id", partnerId)
        .maybeSingle(),
      supabase
        .from("islr_rates")
        .select("concept_id, person_type, rate, base_percent, subtract_ut")
        .in("concept_id", conceptIds)
        .eq("active", true),
      supabase
        .from("tax_units")
        .select("amount")
        .or(`company_id.eq.${company.id},company_id.is.null`)
        .order("date_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const personType = partner?.person_type === "natural" ? "natural" : "juridica";
    const utAmount = Number(ut?.amount || 0);
    for (const line of normalized) {
      if (!line.concept_id) continue;
      const rate =
        (rates || []).find(
          (r) => r.concept_id === line.concept_id && r.person_type === personType,
        ) ||
        (rates || []).find((r) => r.concept_id === line.concept_id);
      if (!rate) continue;
      const base = Number(line.untaxed || line.exempt || 0);
      const basePct = Number(rate.base_percent || 100) / 100;
      const subtract = Number(rate.subtract_ut || 0) * utAmount;
      const taxable = Math.max(base * basePct - subtract, 0);
      finalRetainedIslr += Number(
        ((taxable * Number(rate.rate || 0)) / 100).toFixed(2),
      );
    }
    finalRetainedIslr = Number(finalRetainedIslr.toFixed(2));
  }

  const residualWithIslr = Number(
    (finalTotal - finalRetained - finalRetainedIslr).toFixed(2),
  );

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
      registration_date: registrationDate,
      due_date: invoiceDate,
      invoice_number: normalizedNumber,
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
      amount_retained_islr: finalRetainedIslr,
      amount_untaxed_usd: usdUntaxed,
      amount_tax_usd: usdTax,
      amount_exempt_usd: usdExempt,
      amount_total_usd: usdTotal,
      amount_residual: residualWithIslr,
      amount_residual_usd: toUsd(residualWithIslr, rateForUsd),
      amount_paid: 0,
      payment_state: residualWithIslr <= 0 ? "paid" : "not_paid",
      created_by: user?.id,
    })
    .select("id")
    .single();

  if (error) {
    if (/duplicate|unique|23505/i.test(error.message)) {
      return {
        error: `Ya existe la factura ${normalizedNumber} para este tercero. No se puede registrar duplicada.`,
      };
    }
    // Soft fallback if migration not applied yet
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
          invoice_number: normalizedNumber,
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
      if (legacyErr) {
        if (/duplicate|unique|23505/i.test(legacyErr.message)) {
          return {
            error: `Ya existe la factura ${normalizedNumber} para este tercero. No se puede registrar duplicada.`,
          };
        }
        return { error: legacyErr.message };
      }
      await insertLines(supabase, legacy.id, company.id, normalized, false);
      await tryPostAccounting(legacy.id);
      revalidateAll();
      return {
        success: `Factura registrada · ${legacy.id}`,
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
  return { success: `Factura registrada · ${invoice.id}` };
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
  revalidatePath("/app/withholdings");
  revalidatePath("/app/accounts");
  revalidatePath("/app");
}

/** Aplica % de retención IVA sobre el impuesto de una factura ya guardada. */
export async function applyIvaRetentionPct(
  invoiceId: string,
  pct: number,
): Promise<{ ok: true; retained: number } | { ok: false; error: string }> {
  const company = await getActiveCompany();
  if (!company) return { ok: false, error: "Sin empresa activa." };
  if (!(pct > 0) || pct > 100) {
    return { ok: false, error: "Indica un % de retención IVA entre 0.01 y 100 (típico 75)." };
  }

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, state, amount_tax, amount_total, amount_retained_islr, amount_paid",
    )
    .eq("id", invoiceId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (!invoice) return { ok: false, error: "Factura no encontrada." };
  if (invoice.state === "cancelled") {
    return { ok: false, error: "La factura está anulada." };
  }

  const tax = Number(invoice.amount_tax || 0);
  if (tax <= 0) {
    return {
      ok: false,
      error: "Esta factura no tiene IVA (exenta o SDCF). No aplica retención IVA.",
    };
  }

  const retained = Number(((tax * pct) / 100).toFixed(2));
  const residual = Number(
    (
      Number(invoice.amount_total || 0) -
      retained -
      Number(invoice.amount_retained_islr || 0) -
      Number(invoice.amount_paid || 0)
    ).toFixed(2),
  );

  const { error } = await supabase
    .from("invoices")
    .update({
      amount_retained_iva: retained,
      amount_residual: residual,
      payment_state: residual <= 0 ? "paid" : "not_paid",
    })
    .eq("id", invoiceId)
    .eq("company_id", company.id);

  if (error) return { ok: false, error: error.message };
  revalidateAll();
  return { ok: true, retained };
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

async function cancelInvoiceRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  companyId: string,
) {
  const full = await supabase
    .from("invoices")
    .update({
      state: "cancelled",
      amount_residual: 0,
      payment_state: "reversed",
    })
    .eq("id", id)
    .eq("company_id", companyId);

  // Si aún no existe el enum payment_state / columna residual
  if (full.error) {
    await supabase
      .from("invoices")
      .update({ state: "cancelled" })
      .eq("id", id)
      .eq("company_id", companyId);
  }
}

/** Anula la factura (estado cancelled). Seguro ante FKs. */
export async function cancelInvoiceById(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "Factura no indicada." };
  const company = await getActiveCompany();
  if (!company) return { ok: false, error: "Sin empresa activa." };

  const supabase = await createClient();

  try {
    await cancelInvoiceRow(supabase, id, company.id);

    const [{ count: ivaLinks }, { count: islrLinks }, { count: payLinks }, { count: bookLinks }] =
      await Promise.all([
        supabase
          .from("withholding_iva_lines")
          .select("*", { count: "exact", head: true })
          .eq("invoice_id", id),
        supabase
          .from("withholding_islr_lines")
          .select("*", { count: "exact", head: true })
          .eq("invoice_id", id),
        supabase
          .from("payment_allocations")
          .select("*", { count: "exact", head: true })
          .eq("invoice_id", id),
        supabase
          .from("fiscal_book_lines")
          .select("*", { count: "exact", head: true })
          .eq("invoice_id", id),
      ]);

    const linked =
      (ivaLinks || 0) + (islrLinks || 0) + (payLinks || 0) + (bookLinks || 0) > 0;

    if (!linked) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("account_move_id")
        .eq("id", id)
        .eq("company_id", company.id)
        .maybeSingle();

      if (inv?.account_move_id) {
        await supabase
          .from("account_move_lines")
          .delete()
          .eq("move_id", inv.account_move_id);
        await supabase
          .from("invoices")
          .update({ account_move_id: null })
          .eq("id", id);
        await supabase.from("account_moves").delete().eq("id", inv.account_move_id);
      }

      await supabase
        .from("invoices")
        .delete()
        .eq("id", id)
        .eq("company_id", company.id);
    }
  } catch {
    try {
      await cancelInvoiceRow(supabase, id, company.id);
    } catch {
      return { ok: false, error: "No se pudo anular la factura." };
    }
  }

  revalidatePath("/app/invoices");
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

export { periodFromDate };
