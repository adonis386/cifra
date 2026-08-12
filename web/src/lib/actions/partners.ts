"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany, validateRif } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export type PartnerValues = {
  name: string;
  rif: string;
  kind: string;
  person_type: string;
  email: string;
  phone: string;
  address: string;
};

export type ActionState = {
  error?: string;
  success?: string;
  values?: PartnerValues;
};

function readValues(formData: FormData): PartnerValues {
  return {
    name: String(formData.get("name") || ""),
    rif: String(formData.get("rif") || ""),
    kind: String(formData.get("kind") || "both"),
    person_type: String(formData.get("person_type") || "juridica"),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    address: String(formData.get("address") || ""),
  };
}

export async function createPartner(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = readValues(formData);
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero.", values };

  const name = values.name.trim();
  const checked = validateRif(values.rif, values.person_type);
  if (!name) return { error: "El nombre es obligatorio.", values };
  if (!checked.ok) return { error: checked.error, values };

  const supabase = await createClient();
  const { error } = await supabase.from("partners").insert({
    company_id: company.id,
    name,
    rif: checked.rif,
    kind: values.kind,
    person_type: values.person_type,
    email: values.email.trim() || null,
    phone: values.phone.trim() || null,
    address: values.address.trim() || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un tercero con ese RIF.", values };
    }
    return { error: error.message, values };
  }

  revalidatePath("/app/partners");
  revalidatePath("/app/invoices");
  return { success: "Tercero guardado." };
}

export async function deletePartner(formData: FormData): Promise<void> {
  const id = String(formData.get("id") || "");
  const company = await getActiveCompany();
  if (!company || !id) return;

  const supabase = await createClient();
  await supabase
    .from("partners")
    .delete()
    .eq("id", id)
    .eq("company_id", company.id);

  revalidatePath("/app/partners");
}
