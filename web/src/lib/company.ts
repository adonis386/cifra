import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { toUsd as toUsdDomain, toBs as toBsDomain } from "@/domain/money";
import { publicLogoUrl } from "@/lib/company-print";

export {
  normalizeRif,
  validateRif,
  normalizeEmail,
  validateEmailOptional,
} from "@/domain/identity";

export type Company = {
  id: string;
  name: string;
  rif: string;
  is_withholding_agent?: boolean;
  currency_code?: string;
  dual_currency?: boolean;
  logo_path?: string | null;
  logo_url?: string | null;
};

export const ACTIVE_COMPANY_COOKIE = "sifra_active_company";

export function formatMoney(n: number | string | null | undefined) {
  const value = Number(n || 0);
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export const toUsd = toUsdDomain;
export const toBs = toBsDomain;

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

type CompanyRow = Company & { updated_at?: string | null };

function unwrapCompany(raw: unknown): CompanyRow | null {
  if (!raw) return null;
  const c = Array.isArray(raw) ? raw[0] : raw;
  if (!c || typeof c !== "object" || !("id" in c)) return null;
  return c as CompanyRow;
}

function withLogoUrl(company: CompanyRow): Company {
  const { updated_at: cacheKey, ...rest } = company;
  return {
    ...rest,
    logo_url: publicLogoUrl(company.logo_path, cacheKey),
  };
}

/** Todas las empresas del usuario (membresías). */
export async function getUserCompanies(): Promise<Company[]> {
  const { supabase, user } = await requireUser();

  const full = await supabase
    .from("company_members")
    .select(
      "created_at, companies(id, name, rif, is_withholding_agent, currency_code, dual_currency, logo_path, updated_at)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  let rows: { companies?: unknown }[] | null = full.data;
  if (full.error) {
    const mid = await supabase
      .from("company_members")
      .select(
        "created_at, companies(id, name, rif, is_withholding_agent, currency_code, dual_currency)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (!mid.error) {
      rows = mid.data;
    } else {
      const fallback = await supabase
        .from("company_members")
        .select("companies(id, name, rif, is_withholding_agent)")
        .eq("user_id", user.id);
      rows = fallback.data;
    }
  }

  const companies: Company[] = [];
  const seen = new Set<string>();
  for (const row of rows || []) {
    const c = unwrapCompany(row.companies);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      companies.push(withLogoUrl(c));
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
