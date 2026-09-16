/** Alícuotas e IVA retenido SENIAT. Sin I/O. */

export const IVA_ALIQUOTS = [8, 16, 31] as const;

export function snapAlicuota(rate: number) {
  const n = Number(rate || 0);
  if (n <= 0) return 16;
  return IVA_ALIQUOTS.reduce((best, x) =>
    Math.abs(x - n) < Math.abs(best - n) ? x : best,
  );
}

/** IVA = base × alícuota / 100, 2 decimales. */
export function seniatIvaAmount(base: number, alicuota: number) {
  return Number(
    ((Math.abs(Number(base) || 0) * Math.abs(Number(alicuota) || 0)) / 100).toFixed(2),
  );
}

/**
 * SENIAT: IVA retenido = base × alícuota × % retención / 10000.
 * En compras el % típico es 75.
 */
export function seniatIvaWithheld(
  base: number,
  alicuota: number,
  retentionPct = 75,
) {
  return Number(
    (
      (Math.abs(Number(base) || 0) *
        Math.abs(Number(alicuota) || 0) *
        Math.abs(Number(retentionPct) || 0)) /
      10000
    ).toFixed(2),
  );
}

export function ivaFromTaxAndBase(tax: number, base: number) {
  if (!(base > 0) || !(tax > 0)) return 0;
  return snapAlicuota((tax / base) * 100);
}
