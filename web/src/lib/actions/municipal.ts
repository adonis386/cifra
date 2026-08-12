"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany, periodFromDate } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: string; txt?: string };

export async function createMunicipalWithholding(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const partnerId = String(formData.get("partner_id") || "");
  const voucherDate = String(formData.get("voucher_date") || "");
  const activityCode = String(formData.get("activity_code") || "").trim();
  const rate = Number(formData.get("rate") || 0);
  const amountBase = Number(formData.get("amount_base") || 0);

  if (!partnerId || !voucherDate || amountBase <= 0 || rate <= 0) {
    return { error: "Completa tercero, fecha, base y alícuota." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const period = periodFromDate(voucherDate);
  const amountWithheld = Number(((amountBase * rate) / 100).toFixed(2));
  const voucherNumber = `MUN${period}${String(Date.now()).slice(-5)}`;

  const { error } = await supabase.from("withholding_municipal").insert({
    company_id: company.id,
    partner_id: partnerId,
    voucher_number: voucherNumber,
    period,
    voucher_date: voucherDate,
    activity_code: activityCode || null,
    rate,
    amount_base: amountBase,
    amount_withheld: amountWithheld,
    state: "confirmed",
    created_by: user?.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/app/municipal");
  return { success: `Comprobante municipal ${voucherNumber}` };
}

export async function exportMunicipalTxt(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };
  const period = String(formData.get("period") || "").replace("-", "");
  if (!/^\d{6}$/.test(period)) return { error: "Período inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("withholding_municipal")
    .select("voucher_number, voucher_date, activity_code, rate, amount_base, amount_withheld, partners(rif, name)")
    .eq("company_id", company.id)
    .eq("period", period);

  if (error) return { error: error.message };
  if (!data?.length) return { error: "Sin retenciones municipales en el período." };

  const txt = data
    .map((row) => {
      const partner = row.partners as unknown as { rif: string; name: string } | { rif: string; name: string }[] | null;
      const p = Array.isArray(partner) ? partner[0] : partner;
      return [
        company.rif.replace(/-/g, ""),
        period,
        row.voucher_date,
        (p?.rif || "").replace(/-/g, ""),
        row.voucher_number,
        row.activity_code || "0",
        Number(row.amount_base).toFixed(2),
        Number(row.rate).toFixed(2),
        Number(row.amount_withheld).toFixed(2),
      ].join("\t");
    })
    .join("\n");

  return { success: `TXT municipal (${data.length}).`, txt };
}

export async function saveTaxUnit(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };
  const amount = Number(formData.get("amount") || 0);
  const dateFrom = String(formData.get("date_from") || "");
  if (amount <= 0 || !dateFrom) return { error: "Indica monto UT y fecha." };

  const supabase = await createClient();
  const { error } = await supabase.from("tax_units").insert({
    company_id: company.id,
    name: "UT",
    amount,
    date_from: dateFrom,
  });
  if (error) return { error: error.message };
  revalidatePath("/app/config");
  return { success: "Unidad tributaria guardada." };
}

export async function cloneGlobalCatalogs(): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };
  const supabase = await createClient();

  const { data: globals } = await supabase
    .from("islr_concepts")
    .select("id, code, name")
    .is("company_id", null);

  for (const g of globals || []) {
    const { data: existing } = await supabase
      .from("islr_concepts")
      .select("id")
      .eq("company_id", company.id)
      .eq("code", g.code)
      .maybeSingle();
    if (existing) continue;

    const { data: created } = await supabase
      .from("islr_concepts")
      .insert({
        company_id: company.id,
        code: g.code,
        name: g.name,
      })
      .select("id")
      .single();

    if (!created) continue;
    const { data: rates } = await supabase
      .from("islr_rates")
      .select("person_type, rate, subtract_ut")
      .eq("concept_id", g.id);
    if (rates?.length) {
      await supabase.from("islr_rates").insert(
        rates.map((r) => ({
          concept_id: created.id,
          person_type: r.person_type,
          rate: r.rate,
          subtract_ut: r.subtract_ut ?? 0,
          active: true,
        })),
      );
    }
  }

  revalidatePath("/app/config");
  revalidatePath("/app/withholdings");
  return { success: "Catálogo ISLR copiado a tu empresa." };
}
