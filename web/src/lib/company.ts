import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type Company = {
  id: string;
  name: string;
  rif: string;
  is_withholding_agent?: boolean;
  currency_code?: string;
  dual_currency?: boolean;
};

export const ACTIVE_COMPANY_COOKIE = "cifra_active_company";

export function normalizeRif(rif: string) {
  // Quita guiones, puntos, espacios y cualquier separador. Guarda V123456789.
  return rif.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Valida RIF/cédula VE. Natural: V/E. Jurídica: J/G/C/P.
 *  Sin personType acepta cualquiera (empresa puede ser firma personal con V/E). */
export function validateRif(
  rifRaw: string,
  personType?: "natural" | "juridica" | "any" | string,
): { ok: true; rif: string } | { ok: false; error: string } {
  const rif = normalizeRif(rifRaw);
  if (!rif) {
    return {
      ok: false,
      error:
        personType === "natural"
          ? "Indica la cédula/RIF. Ej: V-12345678-9"
          : "Indica el RIF. Ej: V-12345678-9 o J-12345678-9",
    };
  }
  if (!/^[VEJPGC]\d{6,9}$/.test(rif)) {
    return {
      ok: false,
      error:
        "Formato inválido. Usa V/E (natural) o J/G/C/P (jurídica). Ej: V-12345678-9",
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

/** Quita espacios y normaliza correo (evita gmail .com del teclado). */
export function normalizeEmail(email: string) {
  return email.replace(/\s+/g, "").trim().toLowerCase();
}

export function validateEmailOptional(
  emailRaw: string,
): { ok: true; email: string | null } | { ok: false; error: string } {
  const email = normalizeEmail(emailRaw);
  if (!email) return { ok: true, email: null };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Correo inválido. Ej: nombre@gmail.com (sin espacios)" };
  }
  return { ok: true, email };
}

export function formatMoney(n: number | string | null | undefined) {
  const value = Number(n || 0);
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Bs → USD usando tasa (Bs por 1 USD). */
export function toUsd(amountBs: number, rate: number | null | undefined) {
  const r = Number(rate || 0);
  if (!r) return null;
  return Number((Number(amountBs || 0) / r).toFixed(2));
}

/** USD → Bs. */
export function toBs(amountUsd: number, rate: number | null | undefined) {
  const r = Number(rate || 0);
  if (!r) return null;
  return Number((Number(amountUsd || 0) * r).toFixed(2));
}

/** Formato dual estilo Odoo VE: `$ 1.234,56 / 45.678,90 Bs` */
export function formatDual(
  amountBs: number | string | null | undefined,
  rate: number | null | undefined,
  opts?: { invert?: boolean },
) {
  const bs = Number(amountBs || 0);
  const usd = toUsd(bs, rate);
  const bsLabel = `${formatMoney(bs)} Bs`;
  if (usd == null) return bsLabel;
  const usdLabel = `$ ${formatMoney(usd)}`;
  return opts?.invert ? `${bsLabel} / ${usdLabel}` : `${usdLabel} / ${bsLabel}`;
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

export async function setActiveCompanyCookie(companyId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
}

function unwrapCompany(raw: unknown): Company | null {
  if (!raw) return null;
  const c = Array.isArray(raw) ? raw[0] : raw;
  if (!c || typeof c !== "object" || !("id" in c)) return null;
  return c as Company;
}

/** Todas las empresas del usuario (membresías). */
export async function getUserCompanies(): Promise<Company[]> {
  const { supabase, user } = await requireUser();

  const full = await supabase
    .from("company_members")
    .select(
      "created_at, companies(id, name, rif, is_withholding_agent, currency_code, dual_currency)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  let rows: { companies?: unknown }[] | null = full.data;
  if (
    full.error &&
    /currency_code|dual_currency|column|created_at/i.test(full.error.message)
  ) {
    const fallback = await supabase
      .from("company_members")
      .select("companies(id, name, rif, is_withholding_agent)")
      .eq("user_id", user.id);
    rows = fallback.data;
  }

  const companies: Company[] = [];
  const seen = new Set<string>();
  for (const row of rows || []) {
    const c = unwrapCompany(row.companies);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      companies.push(c);
    }
  }
  return companies;
}

export async function getActiveCompany(): Promise<Company | null> {
  const companies = await getUserCompanies();
  if (!companies.length) return null;

  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;
  if (preferred) {
    const match = companies.find((c) => c.id === preferred);
    if (match) return match;
  }

  return companies[0];
}

/** Última tasa USD (Bs por 1 USD) vigente en o antes de la fecha.
 * Si no hay tasa para esa fecha, intenta scrapear BCV automáticamente.
 */
export async function getExchangeRate(
  companyId: string,
  date: string,
): Promise<number | null> {
  const supabase = await createClient();

  async function readDb(): Promise<number | null> {
    const { data, error } = await supabase.rpc("get_exchange_rate", {
      p_company_id: companyId,
      p_date: date,
      p_currency: "USD",
    });
    if (!error && data != null) return Number(data);

    const { data: rows } = await supabase
      .from("exchange_rates")
      .select("rate, company_id, rate_date")
      .eq("currency_code", "USD")
      .lte("rate_date", date)
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order("rate_date", { ascending: false })
      .limit(10);

    if (!rows?.length) return null;
    const companyRow = rows.find((r) => r.company_id === companyId);
    return Number((companyRow || rows[0]).rate);
  }

  const existing = await readDb();

  // ¿Hay tasa exactamente para la fecha pedida?
  const { data: exact } = await supabase
    .from("exchange_rates")
    .select("rate")
    .eq("company_id", companyId)
    .eq("currency_code", "USD")
    .eq("rate_date", date)
    .maybeSingle();

  if (exact?.rate != null) return Number(exact.rate);

  // Auto-sync BCV cuando falta la tasa del día / fecha valor
  try {
    const { ensureBcvRateForCompany } = await import("@/lib/bcv/ensure-rate");
    const synced = await ensureBcvRateForCompany(companyId, date);
    if (synced != null) return synced;
  } catch {
    /* red / schema / BCV caído → fallback DB */
  }

  return existing;
}

/** UT vigente: primero la de la empresa, si no hay usa la global. */
export async function getActiveTaxUnit(companyId: string, onDate?: string) {
  const supabase = await createClient();
  const day = (onDate || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const { data: owned } = await supabase
    .from("tax_units")
    .select("amount, date_from")
    .eq("company_id", companyId)
    .lte("date_from", day)
    .order("date_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (owned?.amount != null) return Number(owned.amount);

  const { data: global } = await supabase
    .from("tax_units")
    .select("amount")
    .is("company_id", null)
    .lte("date_from", day)
    .order("date_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(global?.amount || 0);
}
