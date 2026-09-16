"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { monthBounds } from "@/domain/accounting/period";
import { PeriodsRepository } from "@/repositories/periods.repository";

export type ActionState = { error?: string; success?: string };

export async function assertPeriodOpen(
  companyId: string,
  date: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  return new PeriodsRepository(supabase).assertOpen(companyId, date);
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
  const periods = new PeriodsRepository(supabase);

  const existing = await periods.findByRange(company.id, bounds.start, bounds.end);
  if (existing?.id) {
    const { error } = await periods.closeExisting(existing.id, user?.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await periods.insertClosed({
      companyId: company.id,
      name: bounds.name,
      dateStart: bounds.start,
      dateEnd: bounds.end,
      userId: user?.id,
    });
    if (error) {
      if (/accounting_periods|schema cache|relation/i.test(error.message)) {
        return {
          error:
            "El cierre de período no está disponible. Revisa la conexión a la base.",
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
  return new PeriodsRepository(supabase).list(company.id);
}

export async function reopenAccountingPeriod(formData: FormData): Promise<void> {
  const company = await getActiveCompany();
  const id = String(formData.get("id") || "");
  if (!company || !id) return;
  const supabase = await createClient();
  await new PeriodsRepository(supabase).reopen(id, company.id);
  revalidatePath("/app/config");
}
