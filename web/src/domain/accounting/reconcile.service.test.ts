import assert from "node:assert/strict";
import test from "node:test";
import {
  fifoReconcile,
  matchError,
  pairReconcile,
  statementMatchesLiquidity,
  suggestLiquidityMatches,
} from "./reconcile.service";

function line(
  partial: Partial<{
    id: string;
    account_id: string;
    partner_id: string | null;
    debit: number;
    credit: number;
    amount_residual: number;
    invoice_id: string | null;
  }>,
) {
  return {
    id: "l1",
    account_id: "cxc",
    partner_id: "p1",
    debit: 0,
    credit: 0,
    amount_residual: 0,
    invoice_id: null,
    ...partial,
  };
}

test("venta + cobro parcial baja residual de factura y deja el cobro en cero", () => {
  const invoice = line({
    id: "inv",
    debit: 1000,
    amount_residual: 1000,
    invoice_id: "i1",
  });
  const payment = line({
    id: "pay",
    credit: 400,
    amount_residual: 400,
  });
  const result = fifoReconcile(payment, [invoice]);
  assert.equal(result.partials.length, 1);
  assert.equal(result.partials[0].amount, 400);
  assert.equal(result.partials[0].debit_move_line_id, "inv");
  assert.equal(result.partials[0].credit_move_line_id, "pay");
  const invPatch = result.patches.find((p) => p.id === "inv");
  const payPatch = result.patches.find((p) => p.id === "pay");
  assert.equal(invPatch?.amount_residual, 600);
  assert.equal(invPatch?.reconciled, false);
  assert.equal(payPatch?.amount_residual, 0);
  assert.equal(payPatch?.reconciled, true);
  assert.equal(result.appliedByInvoice[0]?.invoice_id, "i1");
  assert.equal(result.appliedByInvoice[0]?.amount, 400);
});

test("un cobro cubre dos facturas FIFO", () => {
  const first = line({
    id: "inv1",
    debit: 300,
    amount_residual: 300,
    invoice_id: "a",
  });
  const second = line({
    id: "inv2",
    debit: 500,
    amount_residual: 500,
    invoice_id: "b",
  });
  const payment = line({
    id: "pay",
    credit: 800,
    amount_residual: 800,
  });
  const result = fifoReconcile(payment, [first, second]);
  assert.equal(result.partials.length, 2);
  assert.equal(result.leftover, 0);
  assert.equal(result.patches.find((p) => p.id === "inv1")?.reconciled, true);
  assert.equal(result.patches.find((p) => p.id === "inv2")?.reconciled, true);
  assert.deepEqual(
    result.appliedByInvoice.map((r) => r.invoice_id).sort(),
    ["a", "b"],
  );
});

test("no mezcla CxC con CxP ni terceros distintos", () => {
  const cxc = line({ id: "cxc", debit: 100, amount_residual: 100, invoice_id: "i1" });
  const cxp = line({
    id: "cxp",
    account_id: "cxp",
    credit: 100,
    amount_residual: 100,
  });
  assert.equal(matchError(cxc, cxp), "Las líneas deben ser de la misma cuenta.");
  const other = line({
    id: "other",
    partner_id: "p2",
    credit: 100,
    amount_residual: 100,
  });
  assert.equal(matchError(cxc, other), "Las líneas deben ser del mismo tercero.");
  const sameSide = line({ id: "d2", debit: 50, amount_residual: 50 });
  assert.equal(matchError(cxc, sameSide), "Conciliar un débito contra un crédito.");
  assert.equal(pairReconcile(cxc, cxp).error, "Las líneas deben ser de la misma cuenta.");
});

test("extracto de banco casa con línea de liquidez", () => {
  assert.equal(statementMatchesLiquidity(150, 150, 0), true);
  assert.equal(statementMatchesLiquidity(-80, 0, 80), true);
  assert.equal(statementMatchesLiquidity(150, 0, 150), false);
});

test("cobro de más deja residual en la línea del pago", () => {
  const invoice = line({
    id: "inv",
    debit: 400,
    amount_residual: 400,
    invoice_id: "i1",
  });
  const payment = line({
    id: "pay",
    credit: 1000,
    amount_residual: 1000,
  });
  const result = fifoReconcile(payment, [invoice]);
  assert.equal(result.leftover, 600);
  assert.equal(result.patches.find((p) => p.id === "pay")?.amount_residual, 600);
  assert.equal(result.patches.find((p) => p.id === "inv")?.reconciled, true);
});

test("extracto sugiere línea de caja del mismo diario y fecha", () => {
  const matches = suggestLiquidityMatches(
    { amount: 150, line_date: "2026-09-10", journal_id: "ban" },
    [
      { id: "ok", debit: 150, credit: 0, move_date: "2026-09-11", journal_id: "ban" },
      { id: "other-j", debit: 150, credit: 0, move_date: "2026-09-11", journal_id: "caj" },
      { id: "old", debit: 150, credit: 0, move_date: "2026-01-01", journal_id: "ban" },
    ],
  );
  assert.deepEqual(matches.map((m) => m.id), ["ok"]);
});
