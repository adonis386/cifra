"use client";

import { useActionState } from "react";
import {
  cloneGlobalCatalogs,
  saveTaxUnit,
  type ActionState,
} from "@/lib/actions/municipal";
import { saveExchangeRate } from "@/lib/actions/rates";
import { Button, FieldError, Input, Label } from "@/components/ui";

export function ConfigForms({
  latestRate,
}: {
  latestRate?: { rate: number; rate_date: string } | null;
}) {
  const [utState, utAction, utPending] = useActionState(saveTaxUnit, {});
  const [rateState, rateAction, ratePending] = useActionState(saveExchangeRate, {});
  const [cloneState, cloneAction, clonePending] = useActionState(
    async (_prev: ActionState, _formData: FormData) => cloneGlobalCatalogs(),
    {},
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form action={rateAction} className="space-y-3">
        <h3 className="font-semibold">Tasa del día (USD)</h3>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Bs por 1 USD. Se usa en facturas, saldos y el tablero dual ($ / Bs).
        </p>
        {latestRate && (
          <p className="rounded-[14px] bg-[var(--color-muted)] px-3 py-2 font-mono text-sm">
            Vigente {latestRate.rate_date}: {latestRate.rate} Bs/USD
          </p>
        )}
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
            placeholder="Ej: 36.50"
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
        <Button type="submit" disabled={ratePending}>
          {ratePending ? "Guardando…" : "Guardar tasa"}
        </Button>
      </form>

      <form action={utAction} className="space-y-3">
        <h3 className="font-semibold">Nueva Unidad Tributaria</h3>
        <div>
          <Label htmlFor="amount">Monto UT</Label>
          <Input id="amount" name="amount" type="number" step="0.0001" required defaultValue="0.40" />
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
