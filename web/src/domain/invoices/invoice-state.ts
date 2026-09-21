/** Facturas que ya entran a libros, CxC/CxP y asientos. */
export const POSTED_INVOICE_STATES = ["confirmed", "done"] as const;

export function isPostedInvoice(state: string | null | undefined) {
  return state === "confirmed" || state === "done";
}

export function isSaleMoveType(moveType: string) {
  return String(moveType).startsWith("out_");
}
