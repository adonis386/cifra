"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany, periodFromDate } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: string };

function moveMeta(moveType: string) {
  if (moveType === "out_invoice") return { operation: "V" as const, doc: "01" };
  if (moveType === "out_refund") return { operation: "V" as const, doc: "03" };
  if (moveType === "in_invoice") return { operation: "C" as const, doc: "01" };
  if (moveType === "in_refund") return { operation: "C" as const, doc: "03" };
  return { operation: "C" as const, doc: "01" };
}

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
  const amountUntaxed = Number(formData.get("amount_untaxed") || 0);
  const taxRate = Number(formData.get("tax_rate") || 16);
  const amountExempt = Number(formData.get("amount_exempt") || 0);
  const withholdingPct = Number(formData.get("withholding_pct") || 0);

  if (!partnerId || !invoiceDate || !invoiceNumber) {
    return { error: "Completa tercero, fecha y número de factura." };
  }
  if (!controlNumber && moveType.startsWith("in_")) {
    return { error: "El número de control es obligatorio en compras (crédito fiscal)." };
  }

  const amountTax = Number(((amountUntaxed * taxRate) / 100).toFixed(2));
  const { operation, doc } = moveMeta(moveType);

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
  };

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

  const normalized = parsedLines.map((l) => {
    const quantity = Number(l.quantity ?? 1) || 0;
    const priceUnit = Number(
      l.price_unit ??
        (quantity ? Number(l.base || 0) / quantity : Number(l.base || 0)),
    );
    const rate = Number(l.rate || 0);
    const gross = Number((quantity * priceUnit).toFixed(2));
    const hasExplicit =
      l.untaxed != null || l.tax != null || l.exempt != null;
    const untaxed = hasExplicit
      ? Number(l.untaxed || 0)
      : rate > 0
        ? gross
        : 0;
    const tax = hasExplicit
      ? Number(l.tax || 0)
      : Number(((untaxed * rate) / 100).toFixed(2));
    const exempt = hasExplicit
      ? Number(l.exempt || 0)
      : rate > 0
        ? 0
        : gross;
    return {
      description: l.description || "Línea",
      quantity,
      price_unit: priceUnit,
      rate,
      untaxed,
      tax,
      exempt,
      total: Number((untaxed + tax + exempt).toFixed(2)),
    };
  });

  const linesUntaxed = normalized.reduce((s, l) => s + l.untaxed, 0);
  const linesTax = normalized.reduce((s, l) => s + l.tax, 0);
  const linesExempt = normalized.reduce((s, l) => s + l.exempt, 0);
  const finalUntaxed = Number((linesUntaxed || amountUntaxed).toFixed(2));
  const finalTax = Number((linesTax || amountTax).toFixed(2));
  const finalExempt = Number((linesExempt || amountExempt).toFixed(2));
  const finalTotal = Number((finalUntaxed + finalTax + finalExempt).toFixed(2));
  const finalRetained = Number(((finalTax * withholdingPct) / 100).toFixed(2));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const residual = Number((finalTotal - finalRetained).toFixed(2));

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

  if (error) return { error: error.message };

  const { error: lineErr } = await supabase.from("invoice_lines").insert(
    normalized.map((l) => ({
      invoice_id: invoice.id,
      company_id: company.id,
      description: l.description,
      quantity: l.quantity,
      price_unit: l.price_unit,
      tax_rate: l.rate,
      amount_untaxed: l.untaxed || l.exempt,
      amount_tax: l.tax,
      amount_total: l.total,
    })),
  );
  if (lineErr) return { error: lineErr.message };

  // Post accounting entry (Odoo account.move) — ignore soft failures if migration pending
  try {
    const { postInvoiceAccounting } = await import("@/lib/actions/accounting");
    await postInvoiceAccounting(invoice.id);
  } catch {
    /* schema may not be migrated yet */
  }

  revalidatePath("/app/invoices");
  revalidatePath("/app/receivables");
  revalidatePath("/app/payables");
  revalidatePath("/app/accounts");
  revalidatePath("/app");
  return { success: "Factura registrada." };
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
