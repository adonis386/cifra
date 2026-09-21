"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import {
  formatInvoiceSerial,
  nextSaleInvoiceSerial,
  parseInvoiceSerial,
} from "@/domain/invoices/invoice-number";

/** Next sequence value: optional period prefix (AAAAMM) + padded counter. */
export async function nextCompanySequence(
  code: string,
  opts?: { period?: string; padding?: number },
): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const company = await getActiveCompany();
  if (!company) return { ok: false, error: "Sin empresa activa." };

  const padding = opts?.padding ?? 8;
  const period = (opts?.period || "").replace(/\D/g, "").slice(0, 6);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("next_sequence_value", {
    p_company_id: company.id,
    p_code: code,
    p_prefix: "",
    p_padding: padding,
  });

  if (!error && data != null) {
    const seq = String(data).replace(/\D/g, "") || "1";
    const padded = seq.padStart(padding, "0").slice(-padding);
    const value = period ? `${period}${padded}` : padded;
    return { ok: true, value };
  }

  // Fallback without RPC
  const { data: seqRow } = await supabase
    .from("sequences")
    .select("id, next_number, padding")
    .eq("company_id", company.id)
    .eq("code", code)
    .maybeSingle();

  let next = 1;
  let pad = padding;
  if (!seqRow) {
    await supabase.from("sequences").insert({
      company_id: company.id,
      code,
      prefix: "",
      next_number: 2,
      padding: pad,
    });
  } else {
    next = Number(seqRow.next_number) || 1;
    pad = Number(seqRow.padding) || padding;
    await supabase
      .from("sequences")
      .update({ next_number: next + 1 })
      .eq("id", seqRow.id);
  }

  const padded = String(next).padStart(pad, "0").slice(-pad);
  return { ok: true, value: period ? `${period}${padded}` : padded };
}

export type SequenceRow = {
  code: string;
  next_number: number;
  padding: number;
  label: string;
};

export async function listCompanySequences(): Promise<SequenceRow[]> {
  const company = await getActiveCompany();
  if (!company) return [];
  const supabase = await createClient();

  const codes = [
    { code: "nro_ctrl", label: "N° control factura" },
    { code: "nro_fact", label: "N° factura venta" },
    { code: "wh_iva", label: "Comprobante retención IVA" },
    { code: "wh_islr", label: "Comprobante retención ISLR" },
  ];

  for (const c of codes) {
    await supabase.from("sequences").upsert(
      {
        company_id: company.id,
        code: c.code,
        prefix: "",
        next_number: 1,
        padding: c.code === "nro_fact" ? 4 : 8,
      },
      { onConflict: "company_id,code", ignoreDuplicates: true },
    );
  }

  const { data } = await supabase
    .from("sequences")
    .select("code, next_number, padding")
    .eq("company_id", company.id)
    .in(
      "code",
      codes.map((c) => c.code),
    );

  return codes.map((c) => {
    const row = (data || []).find((r) => r.code === c.code);
    return {
      code: c.code,
      label: c.label,
      next_number: Number(row?.next_number || 1),
      padding: Number(row?.padding || 8),
    };
  });
}

export type ActionState = { error?: string; success?: string };

export async function updateSequenceNext(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Sin empresa activa." };

  const code = String(formData.get("code") || "");
  const nextNumber = Number(formData.get("next_number") || 0);
  if (!code || !(nextNumber >= 1)) {
    return { error: "Indica el correlativo siguiente (≥ 1)." };
  }

  const supabase = await createClient();
  const padding = code === "nro_fact" ? 4 : 8;
  const { error } = await supabase.from("sequences").upsert(
    {
      company_id: company.id,
      code,
      next_number: nextNumber,
      padding,
    },
    { onConflict: "company_id,code" },
  );

  if (error) return { error: error.message };
  revalidatePath("/app/config");
  return { success: `Correlativo ${code} actualizado a ${nextNumber}.` };
}

/** Siguiente Nº de factura de venta. `allocate` reserva el correlativo (botón Auto). */
export async function nextSaleInvoiceNumber(opts?: {
  allocate?: boolean;
}): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const company = await getActiveCompany();
  if (!company) return { ok: false, error: "Sin empresa activa." };

  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("company_id", company.id)
    .in("move_type", ["out_invoice", "out_refund"])
    .neq("state", "cancelled");

  const suggested = nextSaleInvoiceSerial(
    (invoices || []).map((i) => String(i.invoice_number || "")),
  );
  const parsed = parseInvoiceSerial(suggested) || {
    prefix: "F-",
    n: 1,
    width: 4,
  };

  const { data: seq } = await supabase
    .from("sequences")
    .select("id, prefix, next_number, padding")
    .eq("company_id", company.id)
    .eq("code", "nro_fact")
    .maybeSingle();

  const prefix = (seq?.prefix && String(seq.prefix)) || parsed.prefix;
  const seqPadding = Number(seq?.padding || 0);
  const width = seqPadding > 0 ? seqPadding : parsed.width;
  const n = Math.max(Number(seq?.next_number) || 1, parsed.n);
  const value = formatInvoiceSerial(prefix, n, width);

  if (opts?.allocate) {
    if (seq?.id) {
      await supabase
        .from("sequences")
        .update({
          next_number: n + 1,
          prefix,
          padding: width,
        })
        .eq("id", seq.id);
    } else {
      await supabase.from("sequences").insert({
        company_id: company.id,
        code: "nro_fact",
        prefix,
        next_number: n + 1,
        padding: width,
      });
    }
  }

  return { ok: true, value };
}

/** Si el número usado es ≥ al correlativo, avanza el siguiente. */
export async function syncSaleInvoiceSequence(usedNumber: string): Promise<void> {
  const parsed = parseInvoiceSerial(usedNumber);
  if (!parsed || /^BORRADOR/i.test(usedNumber)) return;
  const company = await getActiveCompany();
  if (!company) return;
  const supabase = await createClient();
  const { data: seq } = await supabase
    .from("sequences")
    .select("id, next_number, prefix, padding")
    .eq("company_id", company.id)
    .eq("code", "nro_fact")
    .maybeSingle();
  const next = parsed.n + 1;
  if (seq?.id) {
    if (Number(seq.next_number) <= parsed.n) {
      await supabase
        .from("sequences")
        .update({
          next_number: next,
          prefix: seq.prefix || parsed.prefix,
        })
        .eq("id", seq.id);
    }
    return;
  }
  await supabase.from("sequences").insert({
    company_id: company.id,
    code: "nro_fact",
    prefix: parsed.prefix,
    next_number: next,
    padding: parsed.width,
  });
}
