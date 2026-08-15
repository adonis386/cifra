"use server";

import { redirect } from "next/navigation";
import {
  setActiveCompanyCookie,
  validateEmailOptional,
  validateRif,
} from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export type CompanyValues = {
  name: string;
  rif: string;
  address: string;
  email: string;
  phone: string;
};

export type CompanyState = {
  error?: string;
  values?: CompanyValues;
};

function readValues(formData: FormData): CompanyValues {
  return {
    name: String(formData.get("name") || ""),
    rif: String(formData.get("rif") || ""),
    address: String(formData.get("address") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
  };
}

export async function createCompany(
  _prev: CompanyState,
  formData: FormData,
): Promise<CompanyState> {
  const values = readValues(formData);
  const name = values.name.trim();
  // Empresa puede ser C.A. (J/G/C/P) o firma personal / PN (V/E)
  const checked = validateRif(values.rif);
  const emailCheck = validateEmailOptional(values.email);

  if (!name) return { error: "Nombre y RIF son obligatorios.", values };
  if (!checked.ok) return { error: checked.error, values };
  if (!emailCheck.ok) return { error: emailCheck.error, values };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sesión no válida.", values };
  }

  const { data, error } = await supabase
    .from("companies")
    .insert({
      name,
      rif: checked.rif,
      address: values.address.trim() || null,
      email: emailCheck.email,
      phone: values.phone.trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe una empresa con ese RIF.", values };
    }
    return { error: error.message, values };
  }

  await setActiveCompanyCookie(data.id);
  redirect("/app");
}
