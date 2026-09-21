import assert from "node:assert/strict";
import test from "node:test";
import {
  amountEnteredForCurrency,
  defaultPaymentMethod,
  paymentMethodLabel,
  pickLiquidityJournalId,
  resolvePaymentPostedAmount,
} from "./payment.service";

test("cobro en Bs queda en Bs y deriva USD si hay tasa", () => {
  const posted = resolvePaymentPostedAmount({
    amount: 100,
    currency: "VES",
    exchangeRate: 50,
  });
  assert.equal(posted.ok, true);
  if (!posted.ok) return;
  assert.equal(posted.amountBs, 100);
  assert.equal(posted.amountUsd, 2);
  assert.equal(posted.currencyCode, "VES");
});

test("cobro en dólares convierte a Bs con la tasa", () => {
  const posted = resolvePaymentPostedAmount({
    amount: 348,
    currency: "USD",
    exchangeRate: 847.4442,
  });
  assert.equal(posted.ok, true);
  if (!posted.ok) return;
  assert.equal(posted.amountUsd, 348);
  assert.equal(posted.amountBs, 294910.58);
  assert.equal(posted.currencyCode, "USD");
});

test("cobro en dólares sin tasa no se registra", () => {
  const posted = resolvePaymentPostedAmount({
    amount: 348,
    currency: "USD",
    exchangeRate: 0,
  });
  assert.equal(posted.ok, false);
});

test("saldo en dólares usa residual Bs / tasa", () => {
  assert.equal(amountEnteredForCurrency(294910.58, "USD", 847.4442), "348.00");
  assert.equal(amountEnteredForCurrency(294910.58, "VES", 847.4442), "294910.58");
});

test("el medio sugiere moneda y caja o banco", () => {
  assert.equal(defaultPaymentMethod("USD"), "divisas");
  assert.equal(paymentMethodLabel("pago_movil"), "Pago móvil");
  assert.equal(
    pickLiquidityJournalId(
      [
        { id: "ban", journal_type: "bank" },
        { id: "caj", journal_type: "cash" },
      ],
      "divisas",
    ),
    "caj",
  );
  assert.equal(
    pickLiquidityJournalId(
      [
        { id: "ban", journal_type: "bank" },
        { id: "caj", journal_type: "cash" },
      ],
      "zelle",
    ),
    "ban",
  );
});
