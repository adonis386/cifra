/** Genera TXT Forma 99035 (retenciones IVA) — layout SENIAT / l10n_ve_full */

export type IvaTxtLine = {
  agentRif: string;
  period: string; // AAAAMM
  invoiceDate: string; // YYYY-MM-DD
  operationType: "C" | "V";
  docType: string; // 01|02|03|...
  partnerRif: string;
  invoiceNumber: string;
  controlNumber: string;
  amountTotal: number;
  amountUntaxed: number;
  amountWithheld: number;
  affectedDocument?: string;
  voucherNumber: string;
  amountExempt?: number;
  alicuota?: number;
  expediente?: string;
};

function digits(rif: string) {
  return rif.replace(/[-\s]/g, "").toUpperCase();
}

function num(n: number) {
  return Math.abs(Number(n || 0)).toFixed(2);
}

/** SENIAT compara facturas ignorando ceros a la izquierda (0397 = 397). */
export function invoiceNumberKey(raw: string) {
  const d = String(raw || "").replace(/\D/g, "");
  return d.replace(/^0+/, "") || "0";
}

/**
 * Número de comprobante SENIAT: exactamente 14 dígitos.
 * Formato: AAAAMM + correlativo de 8 dígitos.
 */
export function formatVoucherNumber(
  raw: string,
  maxSize = 14,
  period = "",
) {
  const only = String(raw || "").replace(/\D/g, "");
  const p = String(period || "").replace(/\D/g, "").slice(0, 6);
  const seqLen = Math.max(maxSize - (p ? 6 : 0), 1);

  if (!only) {
    return p ? `${p}${"0".repeat(seqLen)}` : "0".repeat(maxSize);
  }

  if (only.length === maxSize) return only;
  if (only.length > maxSize) return only.slice(0, maxSize);

  if (p && only.startsWith(p)) {
    return `${p}${only.slice(p.length).padStart(seqLen, "0")}`;
  }
  if (p) {
    return `${p}${only.padStart(seqLen, "0")}`;
  }
  return only.padStart(maxSize, "0");
}

export function buildIvaTxt99035(lines: IvaTxtLine[]) {
  const seen = new Set<string>();
  const unique: IvaTxtLine[] = [];
  for (const l of lines) {
    const key = `${digits(l.partnerRif)}|${invoiceNumberKey(l.invoiceNumber)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(l);
  }

  return unique
    .map((l) =>
      [
        digits(l.agentRif),
        l.period,
        l.invoiceDate,
        l.operationType,
        l.docType.padStart(2, "0"),
        digits(l.partnerRif),
        String(l.invoiceNumber || "").replace(/-/g, ""),
        String(l.controlNumber || "0").replace(/-/g, "").slice(0, 20) || "0",
        num(l.amountTotal),
        num(l.amountUntaxed),
        num(l.amountWithheld),
        String(l.affectedDocument || "0").replace(/-/g, "") || "0",
        formatVoucherNumber(l.voucherNumber, 14, l.period),
        num(l.amountExempt || 0),
        num(l.alicuota ?? 16),
        String(l.expediente || "0"),
      ].join("\t"),
    )
    .join("\n");
}
