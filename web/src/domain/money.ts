/** Dinero VE: 2 decimales, Bs ↔ USD. Sin Next ni Supabase. */

export function round2(n: number) {
  return Number((Number(n || 0)).toFixed(2));
}

export function round4(n: number) {
  return Number((Number(n || 0)).toFixed(4));
}

/** Bs → USD usando tasa (Bs por 1 USD). */
export function toUsd(amountBs: number, rate: number | null | undefined) {
  const r = Number(rate || 0);
  if (!r) return null;
  return round2(Number(amountBs || 0) / r);
}

/** USD → Bs. */
export function toBs(amountUsd: number, rate: number | null | undefined) {
  const r = Number(rate || 0);
  if (!r) return null;
  return round2(Number(amountUsd || 0) * r);
}
