"use client";

import { useActionState } from "react";
import {
  cloneGlobalCatalogs,
  saveTaxUnit,
  type ActionState,
} from "@/lib/actions/municipal";
import { Button, FieldError, Input, Label } from "@/components/ui";

export function ConfigForms() {
  const [utState, utAction, utPending] = useActionState(saveTaxUnit, {});
  const [cloneState, cloneAction, clonePending] = useActionState(
    async (_prev: ActionState, _formData: FormData) => cloneGlobalCatalogs(),
    {},
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
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

      <form action={cloneAction} className="space-y-3">
        <h3 className="font-semibold">Catálogo ISLR</h3>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Copia conceptos y tarifas globales (plantilla VE) a tu empresa para usarlos en retenciones.
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
