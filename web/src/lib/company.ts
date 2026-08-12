import { createClient } from "@/lib/supabase/server";

export type Company = {
  id: string;
  name: string;
  rif: string;
  is_withholding_agent?: boolean;
  currency_code?: string;
  dual_currency?: boolean;
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

export async function getActiveCompany(): Promise<Company | null> {
  const { supabase, user } = await requireUser();
  const primary = await supabase
    .from("company_members")
    .select("companies(id, name, rif, is_withholding_agent, currency_code, dual_currency)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  let rawCompanies: unknown = primary.data?.companies;
  if (primary.error && /currency_code|dual_currency|column/i.test(primary.error.message)) {
    const fallback = await supabase
      .from("company_members")
      .select("companies(id, name, rif, is_withholding_agent)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    rawCompanies = fallback.data?.companies;
  }

  const c = rawCompanies as Company | Company[] | null;
  if (!c) return null;
  return Array.isArray(c) ? c[0] ?? null : c;
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
