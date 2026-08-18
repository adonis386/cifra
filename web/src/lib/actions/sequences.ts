"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

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
        padding: c.code === "nro_ctrl" ? 8 : 8,
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
  const { error } = await supabase.from("sequences").upsert(
    {
      company_id: company.id,
      code,
      prefix: "",
      next_number: nextNumber,
      padding: 8,
    },
    { onConflict: "company_id,code" },
  );

  if (error) return { error: error.message };
  revalidatePath("/app/config");
  return { success: `Correlativo ${code} actualizado a ${nextNumber}.` };
}
