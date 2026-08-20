"use client";

import { useActionState } from "react";
import {
  closeAccountingPeriod,
  reopenAccountingPeriod,
  type ActionState,
} from "@/lib/actions/periods";
import { Button, FieldError, Input, Label } from "@/components/ui";

type Period = {
  id: string;
  name: string;
  date_start: string;
  date_end: string;
  is_closed: boolean;
};

export function PeriodCloseForm({ periods }: { periods: Period[] }) {
  const [state, action, pending] = useActionState(
    closeAccountingPeriod,
    {} as ActionState,
  );
  const today = new Date().toISOString().slice(0, 7);
  const closed = periods.filter((p) => p.is_closed);

  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="year_month">Mes a cerrar</Label>
          <Input
            id="year_month"
            name="year_month"
            type="month"
            required
            defaultValue={today}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Cerrando…" : "Cerrar período"}
        </Button>
      </form>
      <FieldError message={state.error} />
      {state.success ? (
        <p className="text-sm text-[var(--color-accent)]">{state.success}</p>
      ) : null}
      <p className="text-xs text-[var(--color-muted-foreground)]">
        Con el mes cerrado no se pueden registrar facturas, pagos ni asientos
        con fecha en ese rango.
      </p>
      {closed.length ? (
        <ul className="space-y-2 text-sm">
          {closed.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2"
            >
              <span>
                <span className="font-semibold">{p.name}</span>{" "}
                <span className="text-[var(--color-muted-foreground)]">
                  {p.date_start} → {p.date_end}
                </span>
              </span>
              <form action={reopenAccountingPeriod}>
                <input type="hidden" name="id" value={p.id} />
                <Button type="submit" variant="ghost">
                  Reabrir
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Ningún mes cerrado todavía.
        </p>
      )}
    </div>
  );
}
