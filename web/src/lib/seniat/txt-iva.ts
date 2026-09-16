/** Genera TXT Forma 99035 (retenciones IVA) — layout SENIAT */

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
  retentionPct?: number;
};

import {
  snapAlicuota,
  seniatIvaAmount,
  seniatIvaWithheld,
} from "@/domain/seniat/iva";

export { snapAlicuota, seniatIvaAmount, seniatIvaWithheld };

/** RIF SENIAT: exactamente 10 caracteres, letra + 9 dígitos, sin guiones. */
export function formatRif99035(rif: string) {
  const clean = String(rif || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
  const m = clean.match(/^([VEJPGC])(\d{1,9})$/);
  if (!m) return clean.slice(0, 10);
  return `${m[1]}${m[2].padStart(9, "0")}`;
}

function num(n: number) {
  return Math.abs(Number(n || 0)).toFixed(2);
}

function invoiceDate99035(raw: string) {
  const s = String(raw || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : s;
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
    const key = `${formatRif99035(l.partnerRif)}|${invoiceNumberKey(l.invoiceNumber)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(l);
  }

  return unique
    .map((l) => {
      const ali = snapAlicuota(Number(l.alicuota || 16));
      const pct = Number(l.retentionPct || 75);
      const base = Number(l.amountUntaxed || 0);
      const exempt = Number(l.amountExempt || 0);
      const iva = seniatIvaAmount(base, ali);
      const storedWithheld = Number(l.amountWithheld);
      const withheld =
        storedWithheld > 0
          ? storedWithheld
          : seniatIvaWithheld(base, ali, pct);
      const storedTotal = Number(l.amountTotal);
      const total =
        storedTotal > 0
          ? storedTotal
          : Number((base + iva + exempt).toFixed(2));
      return [
        formatRif99035(l.agentRif),
        l.period,
        invoiceDate99035(l.invoiceDate),
        l.operationType === "V" ? "V" : "C",
        String(l.docType || "01").padStart(2, "0"),
        formatRif99035(l.partnerRif),
        String(l.invoiceNumber || "").replace(/-/g, "").slice(0, 20) || "0",
        String(l.controlNumber || "0").replace(/-/g, "").slice(0, 20) || "0",
        num(total),
        num(base),
        num(withheld),
        String(l.affectedDocument || "0").replace(/-/g, "").slice(0, 20) || "0",
        formatVoucherNumber(l.voucherNumber, 14, l.period),
        num(exempt),
        num(ali),
        String(l.expediente || "0").slice(0, 15),
      ].join("\t");
    })
    .join("\n");
}
