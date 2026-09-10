import tabla from "@/lib/seniat/islr-tabla.json";
import { calcIslrWithholding } from "@/lib/seniat/islr-calc";

export type IslrTablaRow = {
  code: string;
  name: string;
  person_type: "natural" | "juridica";
  rate: number;
  /** % de la base imponible (p.ej. 90, 100). */
  base_percent?: number;
  minimum_ut: number;
  withholdable: boolean;
  /** Tarifa progresiva N° 2 (PJ no domiciliada); no es alícuota fija. */
  tarifa2?: boolean;
  sustraendo?: string;
  pct_raw?: string;
  numeral?: string;
  source?: string;
};

export const ISLR_TABLA = tabla as IslrTablaRow[];

/**
 * Catálogo corto del formulario → código SENIAT del PDF UT 43 (G.O. 43.140).
 * Fuente: tabla-de-retenciones-del-islr-ut-43-2025.pdf
 */
const LEGACY_XML: Record<string, string> = {
  // 001 Honorarios profesionales → 9.1.b
  "001:natural": "002",
  "001:juridica": "004",
  // 010 Honorarios médicos → 9.1.d centros de salud (PN); PJ usa honorarios 004
  "010:natural": "012",
  "010:juridica": "004",
  // 002 Contratistas / servicios → 9.11
  "002:natural": "053",
  "002:juridica": "055",
  // 003 Fletes nacionales → 9.15
  "003:natural": "071",
  "003:juridica": "072",
  // 004 Publicidad → 9.19
  "004:natural": "083",
  "004:juridica": "084",
  // 005 Arrendamiento inmuebles → 9.12
  "005:natural": "057",
  "005:juridica": "059",
  // 006 Comisiones mercantiles → 9.2.b
  "006:natural": "018",
  "006:juridica": "020",
  // 007 Asistencia técnica (PDF 9.7 solo no residente/no domiciliada)
  "007:natural": "036",
  "007:juridica": "037",
  // 008 Regalías (PDF 9.7 solo no residente/no domiciliada)
  "008:natural": "034",
  "008:juridica": "035",
  // 009 Intereses → 9.3.c
  "009:natural": "025",
  "009:juridica": "027",
};

export function lookupIslrTabla(
  code: string,
  personType?: string | null,
) {
  const normalized = String(code || "").replace(/\D/g, "").padStart(3, "0");
  if (personType === "natural" || personType === "juridica") {
    const typed = ISLR_TABLA.find(
      (r) => r.code === normalized && r.person_type === personType,
    );
    if (typed) return typed;
  }
  return ISLR_TABLA.find((r) => r.code === normalized) || null;
}

/** Código XML SENIAT de 3 dígitos para el comprobante / XML. */
export function seniatXmlCode(
  conceptCode: string | null | undefined,
  personType: string | null | undefined,
) {
  const code = String(conceptCode || "000").replace(/\D/g, "").padStart(3, "0");
  const person = personType === "natural" ? "natural" : "juridica";
  // Catálogo corto de la app (001 honorarios, 002 contratistas, …) choca con
  // códigos SENIAT distintos. Siempre mapear primero.
  const mapped = LEGACY_XML[`${code}:${person}`];
  if (mapped) return mapped;
  return code;
}

export function seniatConceptLabel(
  conceptCode: string | null | undefined,
  personType: string | null | undefined,
  fallbackName?: string | null,
) {
  const xml = seniatXmlCode(conceptCode, personType);
  const row = lookupIslrTabla(xml, personType);
  if (row) return `${row.code} — ${row.name}`;
  if (fallbackName) return `${xml} — ${fallbackName}`;
  return xml;
}

export function seniatRateFor(
  conceptCode: string | null | undefined,
  personType: string | null | undefined,
) {
  const xml = seniatXmlCode(conceptCode, personType);
  return lookupIslrTabla(xml, personType);
}

/**
 * Recalcula ISLR con la tabla del PDF UT 43.
 * Sustraendo (cuando aplica) = UT × (% / 100) × 83.3334
 * (= 107,50 Bs al 3% con UT 43; 35,83 Bs al 1%).
 */
export function calcIslrFromTabla(input: {
  base: number;
  conceptCode?: string | null;
  personType?: string | null;
  rate?: number | null;
  minimumUt?: number | null;
  utAmount: number;
}) {
  const row = seniatRateFor(input.conceptCode, input.personType);
  // Tarifa N° 2 no tiene alícuota fija en esta versión.
  if (row?.tarifa2) {
    return calcIslrWithholding({
      base: input.base,
      rate: 0,
      basePercent: Number(row.base_percent ?? 100),
      minimumUt: 0,
      utAmount: input.utAmount,
    });
  }
  const rate = Number(row?.rate ?? input.rate ?? 0);
  const minimumUt = Number(row?.minimum_ut ?? input.minimumUt ?? 0);
  return calcIslrWithholding({
    base: input.base,
    rate,
    basePercent: Number(row?.base_percent ?? 100),
    minimumUt,
    utAmount: input.utAmount,
  });
}
