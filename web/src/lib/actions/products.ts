"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export type ProductValues = {
  code: string;
  name: string;
  description: string;
  price_unit: string;
  tax_code: string;
};

export type ActionState = {
  error?: string;
  success?: string;
  values?: ProductValues;
};

function readValues(formData: FormData): ProductValues {
  return {
    code: String(formData.get("code") || "").trim(),
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    price_unit: String(formData.get("price_unit") || "0"),
    tax_code: String(formData.get("tax_code") || "IVA16"),
  };
}

export async function createProduct(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = readValues(formData);
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero.", values };

  if (!values.name) return { error: "El nombre es obligatorio.", values };
  const price = Number(values.price_unit || 0);
  if (!(price >= 0)) return { error: "Precio inválido.", values };

  const code = values.code || `P${Date.now().toString().slice(-6)}`;
  const supabase = await createClient();

  const { error } = await supabase.from("products").insert({
    company_id: company.id,
    code,
    name: values.name,
    description: values.description || null,
    price_unit: price,
    tax_code: values.tax_code,
    active: true,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un producto con ese código.", values };
    }
    return { error: error.message, values };
  }

  revalidatePath("/app/products");
  revalidatePath("/app/invoices");
  return { success: `Producto guardado · ${Date.now()}` };
}

export async function deleteProduct(formData: FormData): Promise<void> {
  const id = String(formData.get("id") || "");
  const company = await getActiveCompany();
  if (!company || !id) return;
  const supabase = await createClient();
  await supabase
    .from("products")
    .update({ active: false })
    .eq("id", id)
    .eq("company_id", company.id);
  revalidatePath("/app/products");
  revalidatePath("/app/invoices");
}
