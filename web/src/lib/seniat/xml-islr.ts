/** XML RelacionRetencionesISLR — estructura usada en l10n_ve_full */

export type IslrXmlLine = {
  partnerRif: string;
  invoiceNumber: string;
  controlNumber: string;
  operationDate: string; // YYYY-MM-DD
  conceptCode: string;
  baseAmount: number;
  retentionPercent: number;
};

function digits(v: string) {
  return String(v || "").replace(/[-\s]/g, "").toUpperCase();
}

function esc(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function clipDoc(n: string) {
  const clean = digits(n) || "0";
  return clean.length < 11 ? clean : clean.slice(-10);
}

export function buildIslrXml(params: {
  agentRif: string;
  period: string; // AAAAMM
  lines: IslrXmlLine[];
}) {
  const details = params.lines
    .map((l) => {
      return [
        "  <DetalleRetencion>",
        `    <RifRetenido>${esc(digits(l.partnerRif))}</RifRetenido>`,
        `    <NumeroFactura>${esc(clipDoc(l.invoiceNumber))}</NumeroFactura>`,
        `    <NumeroControl>${esc(clipDoc(l.controlNumber || "0"))}</NumeroControl>`,
        `    <FechaOperacion>${esc(fmtDate(l.operationDate))}</FechaOperacion>`,
        `    <CodigoConcepto>${esc(l.conceptCode)}</CodigoConcepto>`,
        `    <MontoOperacion>${Number(l.baseAmount || 0).toFixed(2)}</MontoOperacion>`,
        `    <PorcentajeRetencion>${Number(l.retentionPercent || 0).toFixed(2)}</PorcentajeRetencion>`,
        "  </DetalleRetencion>",
      ].join("\n");
    })
    .join("\n");

  return [
    `<?xml version="1.0" encoding="ISO-8859-1"?>`,
    `<RelacionRetencionesISLR RifAgente="${esc(digits(params.agentRif))}" Periodo="${esc(params.period)}">`,
    details,
    `</RelacionRetencionesISLR>`,
  ].join("\n");
}
