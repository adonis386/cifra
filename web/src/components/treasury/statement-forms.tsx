"use client";

import { useActionState, useEffect, useState } from "react";
import {
  addBankStatementLine,
  createBankStatement,
  reconcileStatementLine,
  type ActionState,
} from "@/lib/actions/entries";
import { createLiquidityJournal } from "@/lib/actions/accounting";
import { Button, Dialog, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

const initial: ActionState = {};

type Journal = { id: string; code: string; name: string; journal_type: string };

export function LiquidityJournalForm() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [kind, setKind] = useState<"bank" | "cash">("bank");
  const [state, action, pending] = useActionState(createLiquidityJournal, initial);

  useEffect(() => {
    if (!state.success) return;
    const t = window.setTimeout(() => {
      setOpen(false);
      setStep(1);
    }, 700);
    return () => window.clearTimeout(t);
  }, [state.success]);

  function openWizard() {
    setStep(1);
    setKind("bank");
    setOpen(true);
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={openWizard}>
        Agregar banco o caja
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Agregar banco o caja"
        description="Para cobros, pagos y conciliar el banco o la caja. No registra un movimiento."
      >
        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              ¿Qué vas a dar de alta?
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant={kind === "bank" ? "primary" : "secondary"}
                onClick={() => setKind("bank")}
              >
                Banco
              </Button>
              <Button
                type="button"
                variant={kind === "cash" ? "primary" : "secondary"}
                onClick={() => setKind("cash")}
              >
                Caja / efectivo
              </Button>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Banco: Banesco, Mercantil… · Caja: efectivo, caja chica.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={() => setStep(2)}>
                Continuar
              </Button>
            </div>
          </div>
        ) : (
          <form action={action} className="space-y-3">
            <input type="hidden" name="kind" value={kind} />
            <p className="text-sm font-medium">
              {kind === "cash" ? "Caja / efectivo" : "Banco"}
            </p>
            <div>
              <Label htmlFor="bank_name">Nombre</Label>
              <Input
                id="bank_name"
                name="name"
                required
                placeholder={kind === "cash" ? "Efectivo, caja chica…" : "Banesco, Mercantil…"}
              />
            </div>
            {kind === "bank" ? (
              <div>
                <Label htmlFor="account_number">Nº de cuenta (opcional)</Label>
                <Input
                  id="account_number"
                  name="account_number"
                  placeholder="0134-…"
                  className="font-mono"
                />
              </div>
            ) : (
              <input type="hidden" name="account_number" value="" />
            )}
            <FieldError message={state.error} />
            {state.success ? (
              <p className="text-sm text-[var(--color-accent)]">{state.success}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Crear"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

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
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createBankStatement, initial);
  const today = new Date().toISOString().slice(0, 10);
  const liquidity = journals.filter((j) =>
    ["bank", "cash"].includes(j.journal_type),
  );

  useEffect(() => {
    if (!state.success) return;
    const t = window.setTimeout(() => setOpen(false), 700);
    return () => window.clearTimeout(t);
  }, [state.success]);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Nuevo corte
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Conciliar banco o caja"
        description="Carga el corte del banco o el arqueo de caja para ir conciliando."
      >
        {!liquidity.length ? (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Primero agrega un banco o caja.
          </p>
        ) : (
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
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
            <Label htmlFor="statement_date">Fecha del corte</Label>
            <Input id="statement_date" name="statement_date" type="date" required defaultValue={today} />
          </div>
          <div>
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" placeholder="Corte agosto / quincena" />
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
          <div className="sm:col-span-2">
            <Label htmlFor="balance_end">Saldo final del banco (Bs)</Label>
            <Input id="balance_end" name="balance_end" type="number" step="0.01" defaultValue="0" />
          </div>
          <div className="sm:col-span-2">
            <FieldError message={state.error} />
            {state.success ? (
              <p className="mb-2 text-sm text-[var(--color-accent)]">{state.success}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Creando…" : "Crear corte"}
              </Button>
            </div>
          </div>
        </form>
        )}
      </Dialog>
    </>
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
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addBankStatementLine, initial);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!state.success) return;
    const t = window.setTimeout(() => setOpen(false), 700);
    return () => window.clearTimeout(t);
  }, [state.success]);

  return (
    <>
      <Button type="button" variant="soft" onClick={() => setOpen(true)}>
        Agregar movimiento
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Movimiento"
        description="Línea del banco o caja. Puedes conciliarla con un cobro o un pago."
      >
        <form action={action} className="grid gap-3 sm:grid-cols-2">
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
          <div className="sm:col-span-2">
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
          <div className="sm:col-span-2">
            <FieldError message={state.error} />
            {state.success ? (
              <p className="text-sm text-[var(--color-accent)]">{state.success}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "…" : "Agregar línea"}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </>
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
