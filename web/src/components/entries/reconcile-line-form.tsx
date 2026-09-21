"use client";

import { useActionState } from "react";
import { reconcileMoveLines, type ActionState } from "@/lib/actions/accounting";
import { Button } from "@/components/ui";
import { Select } from "@/components/layout";

const initial: ActionState = {};

export type CounterpartOption = {
  id: string;
  label: string;
};

export function ReconcileMoveLineForm({
  lineId,
  counterparts,
}: {
  lineId: string;
  counterparts: CounterpartOption[];
}) {
  const [state, action, pending] = useActionState(reconcileMoveLines, initial);
  if (!counterparts.length) return null;
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="line_id" value={lineId} />
      <Select
        name="counterpart_id"
        defaultValue=""
        required
        aria-label="Contrapunta a conciliar"
        className="min-w-[12rem] py-1.5 text-xs"
      >
        <option value="">Contrapunta…</option>
        {counterparts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "…" : "Conciliar"}
      </Button>
      {state.error ? (
        <span className="text-xs text-[var(--color-destructive)]">{state.error}</span>
      ) : null}
      {state.success ? (
        <span className="text-xs text-[var(--color-accent)]">{state.success}</span>
      ) : null}
    </form>
  );
}
