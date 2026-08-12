import { createClient } from "@/lib/supabase/server";

export type Company = {
  id: string;
  name: string;
  rif: string;
  is_withholding_agent?: boolean;
};

export function normalizeRif(rif: string) {
  // Quita guiones, puntos, espacios y cualquier separador. Guarda V123456789.
  return rif.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Valida RIF/cédula VE. Natural: V/E. Jurídica: J/G/C/P. */
export function validateRif(
  rifRaw: string,
  personType?: "natural" | "juridica" | string,
): { ok: true; rif: string } | { ok: false; error: string } {
  const rif = normalizeRif(rifRaw);
  if (!rif) {
    return {
      ok: false,
      error:
        personType === "natural"
          ? "Indica la cédula/RIF. Ej: V-12345678-9"
          : "Indica el RIF. Ej: J-12345678-9",
    };
  }
  if (!/^[VEJPGC]\d{6,9}$/.test(rif)) {
    return {
      ok: false,
      error:
        personType === "natural"
          ? "Formato inválido. Persona natural: V o E + números. Ej: V-12345678-9 (guiones opcionales)"
          : "Formato inválido. Ej: J-12345678-9 (guiones y puntos se aceptan)",
    };
  }
  if (personType === "natural" && !/^[VE]/.test(rif)) {
    return {
      ok: false,
      error: "Persona natural debe empezar con V o E (cédula). Ej: V-12345678-9",
    };
  }
  if (personType === "juridica" && !/^[JGCP]/.test(rif)) {
    return {
      ok: false,
      error: "Persona jurídica debe empezar con J, G, C o P. Ej: J-12345678-9",
    };
  }
  return { ok: true, rif };
}

export function formatMoney(n: number | string | null | undefined) {
  const value = Number(n || 0);
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function periodFromDate(date: string) {
  return date.slice(0, 7).replace("-", "");
}

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");
  return { supabase, user };
}

export async function getActiveCompany(): Promise<Company | null> {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("company_members")
    .select("companies(id, name, rif, is_withholding_agent)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const c = data?.companies as unknown as Company | Company[] | null;
  if (!c) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
}
