"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: string };

export async function saveExchangeRate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const rateDate = String(formData.get("rate_date") || "");
  const rate = Number(formData.get("rate") || 0);
  if (!rateDate || !(rate > 0)) {
    return { error: "Indica fecha y tasa válida (Bs por 1 USD)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("exchange_rates").upsert(
    {
      company_id: company.id,
      rate_date: rateDate,
      currency_code: "USD",
      rate,
      source: "manual",
      created_by: user?.id,
    },
    { onConflict: "company_id,rate_date,currency_code" },
  );

  if (error) return { error: error.message };

  revalidatePath("/app");
  revalidatePath("/app/config");
  revalidatePath("/app/invoices");
  revalidatePath("/app/payments");
  revalidatePath("/app/receivables");
  revalidatePath("/app/payables");
  return { success: `Tasa ${rate} Bs/USD guardada para ${rateDate}.` };
}

export async function nextControlNumber(): Promise<ActionState & { value?: string }> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("next_sequence_value", {
    p_company_id: company.id,
    p_code: "nro_ctrl",
    p_prefix: "",
    p_padding: 8,
  });

  if (error) {
    // Fallback without RPC
    const { data: seq } = await supabase
      .from("sequences")
      .select("id, next_number, prefix, padding")
      .eq("company_id", company.id)
      .eq("code", "nro_ctrl")
      .maybeSingle();

    if (!seq) {
      await supabase.from("sequences").insert({
        company_id: company.id,
        code: "nro_ctrl",
        prefix: "",
        next_number: 2,
        padding: 8,
      });
      return { success: "OK", value: "00000001" };
    }

    const value =
      (seq.prefix || "") +
      String(seq.next_number).padStart(Math.max(seq.padding || 8, 1), "0");
    await supabase
      .from("sequences")
      .update({ next_number: Number(seq.next_number) + 1 })
      .eq("id", seq.id);
    return { success: "OK", value };
  }

  return { success: "OK", value: String(data) };
}
