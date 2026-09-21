/** Clave comparable: 146 y 000146 son el mismo número. */

export function invoiceNumberKey(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  const stripped = digits.replace(/^0+/, "");
  return stripped || (digits ? "0" : "");
}

export function sameInvoiceNumber(a: string, b: string) {
  const ka = invoiceNumberKey(a);
  const kb = invoiceNumberKey(b);
  if (ka && kb) return ka === kb;
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

export type InvoiceSerial = {
  prefix: string;
  n: number;
  width: number;
};

/** Parte el número en prefijo + correlativo: F-1002 → { prefix: "F-", n: 1002, width: 4 }. */
export function parseInvoiceSerial(raw: string): InvoiceSerial | null {
  const s = String(raw || "").trim();
  const m = s.match(/^(.*?)(\d+)$/);
  if (!m) return null;
  const width = m[2].length;
  return { prefix: m[1], n: Number(m[2]), width };
}

export function formatInvoiceSerial(prefix: string, n: number, width: number) {
  const pad = Math.max(width, 1);
  return `${prefix}${String(Math.max(n, 0)).padStart(pad, "0")}`;
}

/** Siguiente correlativo de venta a partir de números ya usados (F-1002 → F-1003). */
export function nextSaleInvoiceSerial(
  existing: string[],
  fallback: InvoiceSerial = { prefix: "F-", n: 0, width: 4 },
) {
  let best = fallback;
  for (const raw of existing) {
    if (/^BORRADOR/i.test(String(raw || "").trim())) continue;
    const parsed = parseInvoiceSerial(raw);
    if (!parsed) continue;
    if (parsed.n > best.n) best = parsed;
  }
  return formatInvoiceSerial(best.prefix, best.n + 1, best.width);
}
