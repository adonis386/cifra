"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveCompany, validateEmailOptional, validateRif } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import {
  composePartnerAddress,
  defaultSeniatType,
  normalizeIdNumber,
  personTypeFromSeniat,
  type PartnerValues,
} from "@/domain/partners/partner.service";
import { PartnersRepository } from "@/repositories/partners.repository";

export type { PartnerValues };

export type ActionState = {
  error?: string;
  success?: string;
  values?: PartnerValues;
};

function readValues(formData: FormData): PartnerValues {
  const seniat = String(formData.get("seniat_person_type") || "PJDO");
  const personType = personTypeFromSeniat(seniat);
  return {
    id: String(formData.get("id") || ""),
    name: String(formData.get("name") || ""),
    rif: String(formData.get("rif") || ""),
    kind: String(formData.get("kind") || "both"),
    person_type: personType,
    seniat_person_type: seniat || defaultSeniatType(personType),
    id_type: String(formData.get("id_type") || "venezolano"),
    id_number: String(formData.get("id_number") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    mobile: String(formData.get("mobile") || ""),
    address: String(formData.get("address") || ""),
    street: String(formData.get("street") || ""),
    street2: String(formData.get("street2") || ""),
    city: String(formData.get("city") || ""),
    state_name: String(formData.get("state_name") || ""),
    zip: String(formData.get("zip") || ""),
    municipality: String(formData.get("municipality") || ""),
    parish: String(formData.get("parish") || ""),
    country: String(formData.get("country") || "Venezuela"),
    job_title: String(formData.get("job_title") || ""),
    website: String(formData.get("website") || ""),
    honorific: String(formData.get("honorific") || ""),
    lang: String(formData.get("lang") || "es_VE"),
    timezone: String(formData.get("timezone") || "America/Caracas"),
    tags: String(formData.get("tags") || ""),
    notes: String(formData.get("notes") || ""),
    is_withholding_agent: String(formData.get("is_withholding_agent") || "") === "1",
  };
}

function persistRow(companyId: string, values: PartnerValues, rif: string, email: string | null) {
  const address =
    composePartnerAddress(values) || values.address.trim() || null;
  return {
    company_id: companyId,
    name: values.name.trim(),
    rif,
    kind: values.kind,
    person_type: values.person_type,
    seniat_person_type: values.seniat_person_type,
    id_type: values.id_type || null,
    id_number: normalizeIdNumber(values.id_number) || null,
    email,
    phone: values.phone.trim() || null,
    mobile: values.mobile.trim() || null,
    address,
    street: values.street.trim() || null,
    street2: values.street2.trim() || null,
    city: values.city.trim() || null,
    state_name: values.state_name.trim() || null,
    zip: values.zip.trim() || null,
    municipality: values.municipality.trim() || null,
    parish: values.parish.trim() || null,
    country: values.country.trim() || "Venezuela",
    job_title: values.job_title.trim() || null,
    website: values.website.trim() || null,
    honorific: values.honorific.trim() || null,
    lang: values.lang || "es_VE",
    timezone: values.timezone || "America/Caracas",
    tags: values.tags.trim() || null,
    notes: values.notes.trim() || null,
    is_withholding_agent: values.is_withholding_agent,
  };
}

function revalidatePartners(id?: string) {
  revalidatePath("/app/partners");
  revalidatePath("/app/partners/new");
  revalidatePath("/app/invoices");
  if (id) revalidatePath(`/app/partners/${id}`);
}

export async function savePartner(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = readValues(formData);
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero.", values };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autorizado.", values };

  const name = values.name.trim();
  const checked = validateRif(values.rif, values.person_type);
  const emailCheck = validateEmailOptional(values.email);
  if (!name) return { error: "El nombre es obligatorio.", values };
  if (!checked.ok) return { error: checked.error, values };
  if (!emailCheck.ok) return { error: emailCheck.error, values };

  const repo = new PartnersRepository(supabase);
  const dup = await repo.findDuplicateRif(company.id, checked.rif, values.id || undefined);
  if (dup) {
    return {
      error: `Ya está registrado el RIF/cédula ${checked.rif} (${dup.name}). No se puede duplicar.`,
      values,
    };
  }

  const row = persistRow(company.id, values, checked.rif, emailCheck.email);

  if (values.id) {
    const { error } = await repo.update(values.id, company.id, row);
    if (error) {
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        return {
          error: `Ya existe un tercero con el RIF/cédula ${checked.rif}.`,
          values,
        };
      }
      return { error: error.message, values };
    }
    revalidatePartners(values.id);
    redirect("/app/partners");
  }

  const { error } = await repo.insert(row);
  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return {
        error: `Ya existe un tercero con el RIF/cédula ${checked.rif}.`,
        values,
      };
    }
    return { error: error.message, values };
  }

  revalidatePartners();
  redirect("/app/partners");
}

/** @deprecated Usa savePartner. */
export async function createPartner(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return savePartner(prev, formData);
}

export async function deletePartner(formData: FormData): Promise<void> {
  const id = String(formData.get("id") || "");
  const company = await getActiveCompany();
  if (!company || !id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await new PartnersRepository(supabase).delete(id, company.id);
  revalidatePartners();
}
