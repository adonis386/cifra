import { createClient } from "@/lib/supabase/server";
import { fetchBcvUsdRate } from "@/lib/bcv/fetch-usd-rate";

/** Evita martillar el BCV en cada request del mismo proceso. */
let memoryCache: { rate: number; rateDate: string; fetchedAt: number } | null =
  null;
const MEMORY_TTL_MS = 30 * 60 * 1000; // 30 min

export function setBcvMemoryCache(rate: number, rateDate: string) {
  memoryCache = { rate, rateDate, fetchedAt: Date.now() };
}

export async function upsertCompanyBcvRate(
  companyId: string,
  userId?: string | null,
): Promise<{ rate: number; rateDate: string; source: "bcv" | "cache" }> {
  const now = Date.now();
  if (
    memoryCache &&
    now - memoryCache.fetchedAt < MEMORY_TTL_MS
  ) {
    await persistRate(companyId, memoryCache.rate, memoryCache.rateDate, userId);
    return {
      rate: memoryCache.rate,
      rateDate: memoryCache.rateDate,
      source: "cache",
    };
  }

  const scraped = await fetchBcvUsdRate();
  memoryCache = {
    rate: scraped.rate,
    rateDate: scraped.rateDate,
    fetchedAt: now,
  };
  await persistRate(companyId, scraped.rate, scraped.rateDate, userId);
  return { rate: scraped.rate, rateDate: scraped.rateDate, source: "bcv" };
}

async function persistRate(
  companyId: string,
  rate: number,
  rateDate: string,
  userId?: string | null,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("exchange_rates").upsert(
    {
      company_id: companyId,
      rate_date: rateDate,
      currency_code: "USD",
      rate,
      source: "bcv",
      created_by: userId || null,
    },
    { onConflict: "company_id,rate_date,currency_code" },
  );
  if (error && !/exchange_rates|column|schema cache/i.test(error.message)) {
    throw new Error(error.message);
  }
}

/**
 * Si no hay tasa para la fecha (o la vigente es anterior a la del BCV),
 * consulta bcv.org.ve y la guarda. Si falla el scrape, usa la última en DB.
 */
export async function ensureBcvRateForCompany(
  companyId: string,
  date: string,
): Promise<number | null> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("exchange_rates")
    .select("rate, rate_date, source")
    .eq("company_id", companyId)
    .eq("currency_code", "USD")
    .eq("rate_date", date)
    .maybeSingle();

  if (existing?.rate) return Number(existing.rate);

  // Hay tasa anterior en DB — igual intentamos refrescar BCV si la fecha pedida
  // es hoy o futura respecto a la última guardada.
  try {
    const synced = await upsertCompanyBcvRate(companyId);
    // Si el BCV publica fecha valor distinta, aún así sirve como tasa vigente
    if (synced.rateDate <= date || synced.rateDate === date) {
      return synced.rate;
    }
    return synced.rate;
  } catch {
    const { data: fallback } = await supabase
      .from("exchange_rates")
      .select("rate")
      .eq("currency_code", "USD")
      .lte("rate_date", date)
      .or(`company_id.eq.${companyId},company_id.is.null`)
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return fallback?.rate != null ? Number(fallback.rate) : null;
  }
}
