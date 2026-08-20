"use client";

import { useActionState } from "react";
import {
  addBankStatementLine,
  createBankStatement,
  reconcileStatementLine,
  type ActionState,
} from "@/lib/actions/entries";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

const initial: ActionState = {};

type Journal = { id: string; code: string; name: string; journal_type: string };

export type PaymentOption = {
  id: string;
  payment_date: string;
  amount: number;
  payment_type: string;
  reference: string | null;
  partner_name: string;
};

export function StatementCreateForm({
  journals,
  initialRate = 0,
}: {
  journals: Journal[];
  initialRate?: number;
}) {
  const [state, action, pending] = useActionState(createBankStatement, initial);
  const today = new Date().toISOString().slice(0, 10);
  const liquidity = journals.filter((j) =>
    ["bank", "cash"].includes(j.journal_type),
  );

  if (!liquidity.length) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        No hay diarios de caja/banco. Regenera el plan VE.
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      <div>
        <Label htmlFor="journal_id">Caja / banco</Label>
        <Select id="journal_id" name="journal_id" defaultValue={liquidity[0].id} required>
          {liquidity.map((j) => (
            <option key={j.id} value={j.id}>
              {j.code} — {j.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="statement_date">Fecha extracto</Label>
        <Input id="statement_date" name="statement_date" type="date" required defaultValue={today} />
      </div>
      <div>
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" placeholder="Extracto agosto / corte quincena" />
      </div>
      <div>
        <Label htmlFor="exchange_rate">Tasa Bs/USD</Label>
        <Input
          id="exchange_rate"
          name="exchange_rate"
          type="number"
          step="0.0001"
          className="font-mono"
          defaultValue={initialRate > 0 ? String(initialRate) : ""}
        />
      </div>
      <div>
        <Label htmlFor="balance_start">Saldo inicial (Bs)</Label>
        <Input id="balance_start" name="balance_start" type="number" step="0.01" defaultValue="0" />
      </div>
      <div>
        <Label htmlFor="balance_end">Saldo final extracto (Bs)</Label>
        <Input id="balance_end" name="balance_end" type="number" step="0.01" defaultValue="0" />
      </div>
      <div className="md:col-span-2">
        <FieldError message={state.error} />
        {state.success && (
          <p className="mb-2 text-sm text-[var(--color-accent)]">{state.success}</p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear extracto"}
        </Button>
      </div>
    </form>
  );
}

function paymentLabel(p: PaymentOption) {
  const kind = p.payment_type === "outbound" ? "Pago" : "Cobro";
  const ref = p.reference ? ` · ${p.reference}` : "";
  return `${p.payment_date} · ${kind} ${p.amount} · ${p.partner_name}${ref}`;
}

export function StatementLineForm({
  statementId,
  payments,
}: {
  statementId: string;
  payments: PaymentOption[];
}) {
  const [state, action, pending] = useActionState(addBankStatementLine, initial);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="grid gap-3 md:grid-cols-6">
      <input type="hidden" name="statement_id" value={statementId} />
      <div>
        <Label htmlFor={`line_date_${statementId}`}>Fecha</Label>
        <Input
          id={`line_date_${statementId}`}
          name="line_date"
          type="date"
          required
          defaultValue={today}
        />
      </div>
      <div>
        <Label htmlFor={`amount_${statementId}`}>Monto (+ingreso / −egreso)</Label>
        <Input
          id={`amount_${statementId}`}
          name="amount"
          type="number"
          step="0.01"
          defaultValue="0"
        />
      </div>
      <div>
        <Label htmlFor={`ref_${statementId}`}>Referencia</Label>
        <Input id={`ref_${statementId}`} name="payment_ref" placeholder="Transferencia / depósito" />
      </div>
      <div>
        <Label htmlFor={`partner_${statementId}`}>Tercero (texto)</Label>
        <Input id={`partner_${statementId}`} name="partner_name" />
      </div>
      <div className="md:col-span-2">
        <Label htmlFor={`pay_${statementId}`}>Conciliar con pago</Label>
        <Select id={`pay_${statementId}`} name="payment_id" defaultValue="">
          <option value="">Sin conciliar</option>
          {payments.map((p) => (
            <option key={p.id} value={p.id}>
              {paymentLabel(p)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-end md:col-span-6">
        <Button type="submit" variant="soft" disabled={pending}>
          {pending ? "…" : "Agregar línea"}
        </Button>
      </div>
      <div className="md:col-span-6">
        <FieldError message={state.error} />
        {state.success && (
          <p className="text-sm text-[var(--color-accent)]">{state.success}</p>
        )}
      </div>
    </form>
  );
}

export function ReconcileLineForm({
  lineId,
  payments,
}: {
  lineId: string;
  payments: PaymentOption[];
}) {
  const [state, action, pending] = useActionState(reconcileStatementLine, initial);
  if (!payments.length) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="line_id" value={lineId} />
      <Select name="payment_id" defaultValue="" aria-label="Pago a conciliar" required>
        <option value="">Pago…</option>
        {payments.map((p) => (
          <option key={p.id} value={p.id}>
            {paymentLabel(p)}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "…" : "Conciliar"}
      </Button>
      {state.error ? (
        <span className="text-xs text-[var(--color-destructive)]">{state.error}</span>
      ) : null}
    </form>
  );
}
