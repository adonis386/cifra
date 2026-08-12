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
  const amountTotal = Number((amountUntaxed + amountTax + amountExempt).toFixed(2));
  const amountRetained = Number(((amountTax * withholdingPct) / 100).toFixed(2));
  const { operation, doc } = moveMeta(moveType);

  let parsedLines: Array<{ description: string; base: number; rate: number; exempt: number }> = [];
  try {
    parsedLines = JSON.parse(String(formData.get("lines_json") || "[]"));
  } catch {
    parsedLines = [];
  }
  if (!parsedLines.length) {
    parsedLines = [
      {
        description: "Línea principal",
        base: amountUntaxed,
        rate: taxRate,
        exempt: amountExempt,
      },
    ];
  }

  // Prefer totals from lines when provided
  const linesUntaxed = parsedLines.reduce((s, l) => s + Number(l.base || 0), 0);
  const linesTax = parsedLines.reduce(
    (s, l) => s + (Number(l.base || 0) * Number(l.rate || 0)) / 100,
    0,
  );
  const linesExempt = parsedLines.reduce((s, l) => s + Number(l.exempt || 0), 0);
  const finalUntaxed = Number((linesUntaxed || amountUntaxed).toFixed(2));
  const finalTax = Number((linesTax || amountTax).toFixed(2));
  const finalExempt = Number((linesExempt || amountExempt).toFixed(2));
  const finalTotal = Number((finalUntaxed + finalTax + finalExempt).toFixed(2));
  const finalRetained = Number(((finalTax * withholdingPct) / 100).toFixed(2));

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
      invoice_number: invoiceNumber,
      control_number: controlNumber || null,
      affected_document: affectedDocument || null,
      amount_untaxed: finalUntaxed,
      amount_tax: finalTax,
      amount_exempt: finalExempt,
      amount_total: finalTotal,
      amount_retained_iva: finalRetained,
      created_by: user?.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const { error: lineErr } = await supabase.from("invoice_lines").insert(
    parsedLines.map((l) => {
      const base = Number(l.base || 0);
      const rate = Number(l.rate || 0);
      const tax = Number(((base * rate) / 100).toFixed(2));
      return {
        invoice_id: invoice.id,
        company_id: company.id,
        description: l.description || "Línea",
        quantity: 1,
        price_unit: base,
        tax_rate: rate,
        amount_untaxed: base,
        amount_tax: tax,
        amount_total: base + tax,
      };
    }),
  );
  if (lineErr) return { error: lineErr.message };

  revalidatePath("/app/invoices");
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
