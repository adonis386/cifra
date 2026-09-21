import { round2, toBs, toUsd } from "@/domain/money";

export type PaymentCurrency = "VES" | "USD";
export type PaymentMethodId =
  | "divisas"
  | "zelle"
  | "transferencia"
  | "pago_movil"
  | "debito"
  | "credito";

export type PaymentMethod = {
  id: PaymentMethodId;
  label: string;
  currency: PaymentCurrency;
  journalType: "cash" | "bank";
  referencePlaceholder: string;
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "divisas",
    label: "Divisas",
    currency: "USD",
    journalType: "cash",
    referencePlaceholder: "Recibo / nota",
  },
  {
    id: "zelle",
    label: "Zelle",
    currency: "USD",
    journalType: "bank",
    referencePlaceholder: "Confirmación Zelle",
  },
  {
    id: "transferencia",
    label: "Transferencia",
    currency: "VES",
    journalType: "bank",
    referencePlaceholder: "Nº transferencia",
  },
  {
    id: "pago_movil",
    label: "Pago móvil",
    currency: "VES",
    journalType: "bank",
    referencePlaceholder: "Ref. pago móvil",
  },
  {
    id: "debito",
    label: "Punto débito",
    currency: "VES",
    journalType: "bank",
    referencePlaceholder: "Lote / voucher",
  },
  {
    id: "credito",
    label: "Punto crédito",
    currency: "VES",
    journalType: "bank",
    referencePlaceholder: "Lote / voucher",
  },
];

export function normalizePaymentMethod(value: string | null | undefined): PaymentMethodId {
  const id = String(value || "").trim().toLowerCase();
  return PAYMENT_METHODS.some((method) => method.id === id)
    ? (id as PaymentMethodId)
    : "transferencia";
}

export function paymentMethodOf(value: string | null | undefined): PaymentMethod {
  const id = normalizePaymentMethod(value);
  return PAYMENT_METHODS.find((method) => method.id === id) || PAYMENT_METHODS[2];
}

export function paymentMethodLabel(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return paymentMethodOf(raw).label;
}

export function defaultPaymentMethod(currency: PaymentCurrency): PaymentMethodId {
  return currency === "USD" ? "divisas" : "transferencia";
}

export function pickLiquidityJournalId(
  journals: Array<{ id: string; journal_type: string }>,
  method: PaymentMethodId,
  currentId?: string,
) {
  const preferred = paymentMethodOf(method).journalType;
  const current = journals.find((journal) => journal.id === currentId);
  if (current?.journal_type === preferred) return current.id;
  return journals.find((journal) => journal.journal_type === preferred)?.id || journals[0]?.id || "";
}

export function normalizePaymentCurrency(value: string | null | undefined): PaymentCurrency {
  return String(value || "VES").toUpperCase() === "USD" ? "USD" : "VES";
}

/** Saldo de factura (en Bs) expresado en la moneda en la que el usuario va a cobrar. */
export function amountEnteredForCurrency(
  residualBs: number,
  currency: PaymentCurrency,
  rate: number | null | undefined,
): string {
  if (currency === "USD") {
    const usd = toUsd(residualBs, rate);
    return usd != null ? usd.toFixed(2) : "";
  }
  return round2(residualBs).toFixed(2);
}

/**
 * El libro y el residual de factura viven en Bs.
 * Si cobran en USD, el monto se convierte con la tasa Bs/USD.
 */
export function resolvePaymentPostedAmount(input: {
  amount: number;
  currency: string | null | undefined;
  exchangeRate: number | null | undefined;
}):
  | {
      ok: true;
      amountBs: number;
      amountUsd: number | null;
      currencyCode: PaymentCurrency;
      exchangeRate: number | null;
    }
  | { ok: false; error: string } {
  const amount = Number(input.amount || 0);
  const currency = normalizePaymentCurrency(input.currency);
  const rate = Number(input.exchangeRate || 0);
  const exchangeRate = rate > 0 ? rate : null;

  if (!(amount > 0)) {
    return { ok: false, error: "Completa tercero, fecha y monto." };
  }

  if (currency === "USD") {
    if (!exchangeRate) {
      return { ok: false, error: "Indica la tasa Bs/USD para cobrar o pagar en divisas." };
    }
    const amountUsd = round2(amount);
    const amountBs = toBs(amountUsd, exchangeRate);
    if (amountBs == null || !(amountBs > 0)) {
      return { ok: false, error: "No se pudo convertir el monto en dólares a Bs." };
    }
    return {
      ok: true,
      amountBs,
      amountUsd,
      currencyCode: "USD",
      exchangeRate,
    };
  }

  const amountBs = round2(amount);
  return {
    ok: true,
    amountBs,
    amountUsd: exchangeRate ? toUsd(amountBs, exchangeRate) : null,
    currencyCode: "VES",
    exchangeRate,
  };
}
