"use client";

import { useActionState } from "react";
import {
  cloneGlobalCatalogs,
  saveTaxUnit,
  type ActionState,
} from "@/lib/actions/municipal";
import { saveExchangeRate, syncBcvExchangeRate } from "@/lib/actions/rates";
import { Button, FieldError, Input, Label } from "@/components/ui";

export function ConfigForms({
  latestRate,
  currentUt,
}: {
  latestRate?: { rate: number; rate_date: string; source?: string } | null;
  currentUt?: { amount: number; date_from: string } | null;
}) {
  const [utState, utAction, utPending] = useActionState(saveTaxUnit, {});
  const [rateState, rateAction, ratePending] = useActionState(saveExchangeRate, {});
  const [bcvState, bcvAction, bcvPending] = useActionState(syncBcvExchangeRate, {});
  const [cloneState, cloneAction, clonePending] = useActionState(
    async (_prev: ActionState, _formData: FormData) => cloneGlobalCatalogs(),
    {},
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-5">
        <form action={bcvAction} className="space-y-3">
          <h3 className="font-semibold">Tasa BCV (oficial)</h3>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Lee el dólar de{" "}
            <a
              href="https://www.bcv.org.ve/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[var(--color-primary)] underline-offset-4 hover:underline"
            >
              bcv.org.ve
            </a>{" "}
            (#dolar) y la guarda como tasa del día. También se actualiza sola al
            abrir el tablero o facturas si falta.
          </p>
          {latestRate && (
            <p className="rounded-[var(--radius-md)] bg-[var(--color-muted)] px-3 py-2 font-mono text-sm">
              Vigente {latestRate.rate_date}: {latestRate.rate} Bs/USD
              {latestRate.source ? ` · ${latestRate.source}` : ""}
            </p>
          )}
          <FieldError message={bcvState.error} />
          {bcvState.success && (
            <p className="text-sm text-[var(--color-accent)]">{bcvState.success}</p>
          )}
          <Button type="submit" disabled={bcvPending}>
            {bcvPending ? "Consultando BCV…" : "Actualizar desde BCV"}
          </Button>
        </form>

        <form action={rateAction} className="space-y-3 border-t border-[var(--color-border)] pt-5">
          <h3 className="font-semibold">Carga manual (opcional)</h3>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Sobrescribe la tasa si necesitas un valor distinto al BCV.
          </p>
          <div>
            <Label htmlFor="rate">Tasa Bs / USD</Label>
            <Input
              id="rate"
              name="rate"
              type="number"
              step="0.0001"
              min="0.0001"
              required
              defaultValue={latestRate?.rate ?? ""}
              placeholder="Ej: 764.3486"
            />
          </div>
          <div>
            <Label htmlFor="rate_date">Fecha</Label>
            <Input id="rate_date" name="rate_date" type="date" required defaultValue={today} />
          </div>
          <FieldError message={rateState.error} />
          {rateState.success && (
            <p className="text-sm text-[var(--color-accent)]">{rateState.success}</p>
          )}
          <Button type="submit" variant="secondary" disabled={ratePending}>
            {ratePending ? "Guardando…" : "Guardar tasa manual"}
          </Button>
        </form>
      </div>

      <form action={utAction} className="space-y-3">
        <h3 className="font-semibold">Unidad Tributaria</h3>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          SENIAT SNAT/2025/000048: <strong>43,00 Bs</strong>. Acepta 43 o 43,00.
        </p>
        {currentUt ? (
          <p className="rounded-[var(--radius-md)] bg-[var(--color-muted)] px-3 py-2 font-mono text-sm">
            Vigente {currentUt.date_from}: {currentUt.amount.toFixed(2)} Bs
          </p>
        ) : null}
        <div>
          <Label htmlFor="amount">Monto UT (Bs)</Label>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            required
            defaultValue={currentUt?.amount ? String(currentUt.amount) : "43"}
            placeholder="43,00"
          />
        </div>
        <div>
          <Label htmlFor="date_from">Vigente desde</Label>
          <Input id="date_from" name="date_from" type="date" required defaultValue={today} />
        </div>
        <FieldError message={utState.error} />
        {utState.success && <p className="text-sm text-[var(--color-accent)]">{utState.success}</p>}
        <Button type="submit" disabled={utPending}>
          {utPending ? "Guardando…" : "Guardar UT"}
        </Button>
      </form>

      <form action={cloneAction} className="space-y-3 lg:col-span-2">
        <h3 className="font-semibold">Catálogo ISLR</h3>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Copia conceptos y tarifas globales (plantilla VE) a tu empresa para usarlos en facturas y retenciones.
        </p>
        <FieldError message={cloneState.error} />
        {cloneState.success && (
          <p className="text-sm text-[var(--color-accent)]">{cloneState.success}</p>
        )}
        <Button type="submit" variant="secondary" disabled={clonePending}>
          {clonePending ? "Clonando…" : "Clonar catálogo a mi empresa"}
        </Button>
      </form>
    </div>
  );
}
