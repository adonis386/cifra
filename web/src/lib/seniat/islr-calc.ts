/** Cálculo ISLR Venezuela (tabla SENIAT / Decreto 1808). */

export type IslrCalcInput = {
  base: number;
  rate: number;
  basePercent?: number;
  /** Factor de sustraendo, p.ej. 83.3334 para PN residente. */
  minimumUt?: number;
  utAmount: number;
};

export type IslrCalcResult = {
  taxableBase: number;
  gross: number;
  subtract: number;
  withheld: number;
};

/**
 * Retención = (base × %) − sustraendo.
 * Sustraendo (honorarios PN) = UT × (% / 100) × 83.3334
 * según la contadora y la tabla SENIAT.
 */
export function calcIslrWithholding(input: IslrCalcInput): IslrCalcResult {
  const rate = Number(input.rate || 0);
  const basePct = Number(input.basePercent ?? 100) / 100;
  const taxableBase = Number((Math.abs(Number(input.base || 0)) * basePct).toFixed(2));
  const gross = Number(((taxableBase * rate) / 100).toFixed(2));
  const factor = Number(input.minimumUt || 0);
  const ut = Number(input.utAmount || 0);
  const subtract =
    factor > 0 && ut > 0 && rate > 0
      ? Number(((ut * rate * factor) / 100).toFixed(2))
      : 0;
  const withheld = Number(Math.max(gross - subtract, 0).toFixed(2));
  return { taxableBase, gross, subtract, withheld };
}

export function islrRateLabel(rate: {
  rate: number;
  minimum_ut?: number;
  subtract_ut?: number;
}) {
  const pct = Number(rate.rate || 0);
  const factor = Number(rate.minimum_ut || 0);
  if (factor > 0) {
    return `${pct}% − sustr. UT×${pct}%×${factor}`;
  }
  if (Number(rate.subtract_ut || 0) > 0) {
    return `${pct}% − sustr. ${Number(rate.subtract_ut)} UT`;
  }
  return `${pct}%`;
}
