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
