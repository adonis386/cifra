"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: string };

function monthBounds(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m) return null;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end, name: `${y}-${String(m).padStart(2, "0")}` };
}

export async function assertPeriodOpen(
  companyId: string,
  date: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!date) return { ok: true };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounting_periods")
    .select("name, date_start, date_end")
    .eq("company_id", companyId)
    .eq("is_closed", true)
    .lte("date_start", date)
    .gte("date_end", date)
    .limit(1);

  if (error) {
    if (/accounting_periods|schema cache|relation/i.test(error.message)) {
      return { ok: true };
    }
    return { ok: true };
  }
  const closed = data?.[0];
  if (closed) {
    return {
      ok: false,
      error: `El período ${closed.name} está cerrado (${closed.date_start} a ${closed.date_end}). No se pueden registrar documentos en esas fechas.`,
    };
  }
  return { ok: true };
}

export async function closeAccountingPeriod(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };
  const yearMonth = String(formData.get("year_month") || "").trim();
  const bounds = monthBounds(yearMonth);
  if (!bounds) return { error: "Indica el mes a cerrar (YYYY-MM)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existing } = await supabase
    .from("accounting_periods")
    .select("id")
    .eq("company_id", company.id)
    .eq("date_start", bounds.start)
    .eq("date_end", bounds.end)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("accounting_periods")
      .update({
        is_closed: true,
        closed_at: new Date().toISOString(),
        closed_by: user?.id,
      })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("accounting_periods").insert({
      company_id: company.id,
      name: bounds.name,
      date_start: bounds.start,
      date_end: bounds.end,
      is_closed: true,
      closed_at: new Date().toISOString(),
      closed_by: user?.id,
    });
    if (error) {
      if (/accounting_periods|schema cache|relation/i.test(error.message)) {
        return {
          error:
            "Aplica la migración cifra_libro (períodos) en Supabase para usar el cierre.",
        };
      }
      return { error: error.message };
    }
  }

  revalidatePath("/app/config");
  revalidatePath("/app/invoices");
  revalidatePath("/app/entries");
  return { success: `Período ${bounds.name} cerrado.` };
}

export async function listAccountingPeriods() {
  const company = await getActiveCompany();
  if (!company) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounting_periods")
    .select("id, name, date_start, date_end, is_closed, closed_at")
    .eq("company_id", company.id)
    .order("date_start", { ascending: false })
    .limit(36);
  if (error) return [];
  return data || [];
}

export async function reopenAccountingPeriod(formData: FormData): Promise<void> {
  const company = await getActiveCompany();
  const id = String(formData.get("id") || "");
  if (!company || !id) return;
  const supabase = await createClient();
  await supabase
    .from("accounting_periods")
    .update({ is_closed: false, closed_at: null, closed_by: null })
    .eq("id", id)
    .eq("company_id", company.id);
  revalidatePath("/app/config");
}
