import tabla from "@/lib/seniat/islr-tabla.json";
import { calcIslrWithholding } from "@/lib/seniat/islr-calc";

export type IslrTablaRow = {
  code: string;
  name: string;
  person_type: "natural" | "juridica";
  rate: number;
  minimum_ut: number;
  withholdable: boolean;
};

export const ISLR_TABLA = tabla as IslrTablaRow[];

/** Catálogo corto previo → código XML SENIAT (tabla contadora). */
const LEGACY_XML: Record<string, string> = {
  "001:natural": "002",
  "001:juridica": "004",
  "010:natural": "002",
  "010:juridica": "004",
  "002:natural": "015",
  "002:juridica": "017",
  "003:juridica": "032",
  "003:natural": "030",
  "004:natural": "050",
  "004:juridica": "050",
  "005:natural": "022",
  "005:juridica": "024",
  "006:natural": "018",
  "006:juridica": "020",
  "009:natural": "011",
  "009:juridica": "013",
};

export function lookupIslrTabla(code: string) {
  return ISLR_TABLA.find((r) => r.code === code) || null;
}

/** Código XML SENIAT de 3 dígitos para el comprobante / XML. */
export function seniatXmlCode(
  conceptCode: string | null | undefined,
  personType: string | null | undefined,
) {
  const code = String(conceptCode || "000").replace(/\D/g, "").padStart(3, "0");
  const person = personType === "natural" ? "natural" : "juridica";
  if (ISLR_TABLA.some((r) => r.code === code)) return code;
  return LEGACY_XML[`${code}:${person}`] || code;
}

export function seniatConceptLabel(
  conceptCode: string | null | undefined,
  personType: string | null | undefined,
  fallbackName?: string | null,
) {
  const xml = seniatXmlCode(conceptCode, personType);
  const row = lookupIslrTabla(xml);
  if (row) return `${row.code} — ${row.name}`;
  if (fallbackName) return `${xml} — ${fallbackName}`;
  return xml;
}

export function seniatRateFor(
  conceptCode: string | null | undefined,
  personType: string | null | undefined,
) {
  const xml = seniatXmlCode(conceptCode, personType);
  return lookupIslrTabla(xml);
}

/** Recalcula ISLR con la tabla SENIAT (sustraendo = UT × % × 83.3334). */
export function calcIslrFromTabla(input: {
  base: number;
  conceptCode?: string | null;
  personType?: string | null;
  rate?: number | null;
  minimumUt?: number | null;
  utAmount: number;
}) {
  const row = seniatRateFor(input.conceptCode, input.personType);
  const rate = Number(row?.rate ?? input.rate ?? 0);
  const minimumUt = Number(
    row?.minimum_ut ?? input.minimumUt ?? 0,
  );
  return calcIslrWithholding({
    base: input.base,
    rate,
    basePercent: 100,
    minimumUt,
    utAmount: input.utAmount,
  });
}
