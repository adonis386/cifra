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

export function buildIvaTxt99035(lines: IvaTxtLine[]) {
  return lines
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
        String(l.voucherNumber || "").replace(/-/g, "").slice(0, 14),
        num(l.amountExempt || 0),
        num(l.alicuota ?? 16),
        String(l.expediente || "0"),
      ].join("\t"),
    )
    .join("\n");
}
