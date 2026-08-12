"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getUserCompanies,
  setActiveCompanyCookie,
} from "@/lib/company";

export async function setActiveCompany(formData: FormData) {
  const companyId = String(formData.get("company_id") || "").trim();
  if (!companyId) return;

  const companies = await getUserCompanies();
  const allowed = companies.some((c) => c.id === companyId);
  if (!allowed) {
    throw new Error("No tienes acceso a esa empresa.");
  }

  await setActiveCompanyCookie(companyId);
  revalidatePath("/app", "layout");
  revalidatePath("/print", "layout");
  redirect("/app");
}
