import { round2 } from "@/domain/money";

export type ReconcilableLine = {
  id: string;
  account_id: string;
  partner_id: string | null;
  debit: number;
  credit: number;
  amount_residual: number;
  invoice_id?: string | null;
  name?: string | null;
};

export type LiquidityMoveLine = {
  id: string;
  debit: number;
  credit: number;
  move_date: string;
  journal_id?: string | null;
};

export type PartialDraft = {
  debit_move_line_id: string;
  credit_move_line_id: string;
  amount: number;
};

export type ResidualPatch = {
  id: string;
  amount_residual: number;
  reconciled: boolean;
};

export type ReconcileResult = {
  error?: string;
  partials: PartialDraft[];
  patches: ResidualPatch[];
  appliedByInvoice: { invoice_id: string; amount: number }[];
  leftover: number;
};

const EPS = 0.009;

export function isDebitLine(line: Pick<ReconcilableLine, "debit" | "credit">) {
  return Number(line.debit || 0) > Number(line.credit || 0);
}

export function matchError(a: ReconcilableLine, b: ReconcilableLine): string | null {
  if (!a?.id || !b?.id || a.id === b.id) return "Elige dos líneas distintas.";
  if (a.account_id !== b.account_id) return "Las líneas deben ser de la misma cuenta.";
  if (!a.partner_id || a.partner_id !== b.partner_id) {
    return "Las líneas deben ser del mismo tercero.";
  }
  if (isDebitLine(a) === isDebitLine(b)) {
    return "Conciliar un débito contra un crédito.";
  }
  if (Number(a.amount_residual) <= EPS || Number(b.amount_residual) <= EPS) {
    return "No hay saldo abierto para conciliar.";
  }
  return null;
}

export function pairReconcile(
  a: ReconcilableLine,
  b: ReconcilableLine,
): ReconcileResult {
  const error = matchError(a, b);
  if (error) {
    return { error, partials: [], patches: [], appliedByInvoice: [], leftover: 0 };
  }
  return fifoReconcile(a, [b]);
}

/** Aplica FIFO del `source` (cobro/pago) contra contrapartidas abiertas. */
export function fifoReconcile(
  source: ReconcilableLine,
  counterparts: ReconcilableLine[],
): ReconcileResult {
  const residuals = new Map<string, number>();
  residuals.set(source.id, round2(source.amount_residual));
  for (const line of counterparts) {
    residuals.set(line.id, round2(line.amount_residual));
  }

  const partials: PartialDraft[] = [];
  const applied = new Map<string, number>();

  for (const target of counterparts) {
    if ((residuals.get(source.id) || 0) <= EPS) break;
    if (matchError(source, target)) continue;
    const srcRes = residuals.get(source.id) || 0;
    const tgtRes = residuals.get(target.id) || 0;
    if (tgtRes <= EPS) continue;
    const amount = round2(Math.min(srcRes, tgtRes));
    if (amount <= EPS) continue;

    const debit = isDebitLine(source) ? source : target;
    const credit = isDebitLine(source) ? target : source;
    partials.push({
      debit_move_line_id: debit.id,
      credit_move_line_id: credit.id,
      amount,
    });
    residuals.set(source.id, round2(srcRes - amount));
    residuals.set(target.id, round2(tgtRes - amount));
    if (target.invoice_id) {
      applied.set(target.invoice_id, round2((applied.get(target.invoice_id) || 0) + amount));
    }
  }

  const patches: ResidualPatch[] = [];
  for (const [id, amount_residual] of residuals) {
    const residual = Math.max(round2(amount_residual), 0);
    patches.push({
      id,
      amount_residual: residual,
      reconciled: residual <= EPS,
    });
  }

  return {
    partials,
    patches,
    appliedByInvoice: [...applied.entries()].map(([invoice_id, amount]) => ({
      invoice_id,
      amount,
    })),
    leftover: Math.max(residuals.get(source.id) || 0, 0),
  };
}

export function amountsMatch(a: number, b: number, tolerance = 0.01) {
  return Math.abs(round2(a) - round2(b)) <= tolerance;
}

/** Extracto: +ingreso / −egreso. Línea de caja: débito − crédito. */
export function liquiditySignedAmount(debit: number, credit: number) {
  return round2(Number(debit || 0) - Number(credit || 0));
}

export function statementMatchesLiquidity(
  statementAmount: number,
  debit: number,
  credit: number,
) {
  return amountsMatch(statementAmount, liquiditySignedAmount(debit, credit));
}

export function dateNearby(a: string, b: string, days = 7) {
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return false;
  return Math.abs(da - db) <= days * 24 * 60 * 60 * 1000;
}

/** Candidatos de extracto: mismo diario, mismo monto/signo y fecha cercana. */
export function suggestLiquidityMatches(
  statement: { amount: number; line_date: string; journal_id?: string | null },
  lines: LiquidityMoveLine[],
) {
  return lines.filter((line) => {
    if (
      statement.journal_id &&
      line.journal_id &&
      statement.journal_id !== line.journal_id
    ) {
      return false;
    }
    if (!statementMatchesLiquidity(statement.amount, line.debit, line.credit)) {
      return false;
    }
    return dateNearby(statement.line_date, line.move_date);
  });
}
