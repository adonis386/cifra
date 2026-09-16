/** Ficha de tercero al estilo Odoo VE / SENIAT. Sin I/O. */

export const SENIAT_PERSON_TYPES = [
  {
    code: "PNRE",
    label: "PNRE Persona Natural Residente",
    personType: "natural" as const,
  },
  {
    code: "PNNR",
    label: "PNNR Persona Natural No Residente",
    personType: "natural" as const,
  },
  {
    code: "PJDO",
    label: "PJDO Persona Jurídica Domiciliada",
    personType: "juridica" as const,
  },
  {
    code: "PJND",
    label: "PJND Persona Jurídica No Domiciliada",
    personType: "juridica" as const,
  },
] as const;

export const ID_DOCUMENT_TYPES = [
  { code: "venezolano", label: "Venezolano" },
  { code: "extranjero", label: "Extranjero" },
  { code: "pasaporte", label: "Pasaporte" },
] as const;

export const VE_STATES = [
  "Amazonas",
  "Anzoátegui",
  "Apure",
  "Aragua",
  "Barinas",
  "Bolívar",
  "Carabobo",
  "Cojedes",
  "Delta Amacuro",
  "Distrito Capital",
  "Falcón",
  "Guárico",
  "La Guaira",
  "Lara",
  "Mérida",
  "Miranda",
  "Monagas",
  "Nueva Esparta",
  "Portuguesa",
  "Sucre",
  "Táchira",
  "Trujillo",
  "Yaracuy",
  "Zulia",
] as const;

export const HONORIFICS = [
  "Señor",
  "Señora",
  "Licenciado",
  "Licenciada",
  "Ingeniero",
  "Ingeniera",
  "Doctor",
  "Doctora",
] as const;

export type PartnerValues = {
  id: string;
  name: string;
  rif: string;
  kind: string;
  person_type: string;
  seniat_person_type: string;
  id_type: string;
  id_number: string;
  email: string;
  phone: string;
  mobile: string;
  address: string;
  street: string;
  street2: string;
  city: string;
  state_name: string;
  zip: string;
  municipality: string;
  parish: string;
  country: string;
  job_title: string;
  website: string;
  honorific: string;
  lang: string;
  timezone: string;
  tags: string;
  notes: string;
  is_withholding_agent: boolean;
};

export function emptyPartnerValues(): PartnerValues {
  return {
    id: "",
    name: "",
    rif: "",
    kind: "both",
    person_type: "juridica",
    seniat_person_type: "PJDO",
    id_type: "venezolano",
    id_number: "",
    email: "",
    phone: "",
    mobile: "",
    address: "",
    street: "",
    street2: "",
    city: "",
    state_name: "",
    zip: "",
    municipality: "",
    parish: "",
    country: "Venezuela",
    job_title: "",
    website: "",
    honorific: "",
    lang: "es_VE",
    timezone: "America/Caracas",
    tags: "",
    notes: "",
    is_withholding_agent: false,
  };
}

export type SeniatPersonCode = (typeof SENIAT_PERSON_TYPES)[number]["code"];

export function personTypeFromSeniat(code: string): "natural" | "juridica" {
  const row = SENIAT_PERSON_TYPES.find((t) => t.code === code);
  return row?.personType ?? "juridica";
}

export function defaultSeniatType(personType: string): SeniatPersonCode {
  return personType === "natural" ? "PNRE" : "PJDO";
}

export function normalizeIdNumber(raw: string) {
  return String(raw || "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function composePartnerAddress(parts: {
  street?: string | null;
  street2?: string | null;
  city?: string | null;
  state_name?: string | null;
  municipality?: string | null;
  parish?: string | null;
  zip?: string | null;
  country?: string | null;
}) {
  const chunks = [
    [parts.street, parts.street2].filter(Boolean).join(", "),
    [parts.city, parts.state_name].filter(Boolean).join(", "),
    [parts.municipality, parts.parish].filter(Boolean).join(" · "),
    [parts.zip, parts.country || "Venezuela"].filter(Boolean).join(" "),
  ].filter((s) => s.trim());
  return chunks.join(", ");
}

export function mapPartnerRecord(raw: Record<string, unknown>): PartnerValues {
  const base = emptyPartnerValues();
  const personType = String(raw.person_type || base.person_type);
  const address = String(raw.address || "");
  const street = String(raw.street || "");
  return {
    ...base,
    id: String(raw.id || ""),
    name: String(raw.name || ""),
    rif: String(raw.rif || ""),
    kind: String(raw.kind || "both"),
    person_type: personType,
    seniat_person_type: String(
      raw.seniat_person_type || defaultSeniatType(personType),
    ),
    id_type: String(raw.id_type || "venezolano"),
    id_number: String(raw.id_number || ""),
    email: String(raw.email || ""),
    phone: String(raw.phone || ""),
    mobile: String(raw.mobile || ""),
    address,
    street: street || (!raw.city && !raw.state_name ? address : street),
    street2: String(raw.street2 || ""),
    city: String(raw.city || ""),
    state_name: String(raw.state_name || ""),
    zip: String(raw.zip || ""),
    municipality: String(raw.municipality || ""),
    parish: String(raw.parish || ""),
    country: String(raw.country || "Venezuela"),
    job_title: String(raw.job_title || ""),
    website: String(raw.website || ""),
    honorific: String(raw.honorific || ""),
    lang: String(raw.lang || "es_VE"),
    timezone: String(raw.timezone || "America/Caracas"),
    tags: String(raw.tags || ""),
    notes: String(raw.notes || ""),
    is_withholding_agent: Boolean(raw.is_withholding_agent),
  };
}
