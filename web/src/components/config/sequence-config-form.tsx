"use client";

import { useActionState } from "react";
import {
  updateSequenceNext,
  type SequenceRow,
} from "@/lib/actions/sequences";
import { Button, FieldError, Input, Label } from "@/components/ui";

export function SequenceConfigForm({ sequences }: { sequences: SequenceRow[] }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Correlativos de comprobantes. IVA/ISLR usan período{" "}
        <span className="font-mono">AAAAMM</span> + 8 dígitos (máx. 14 para TXT
        99035). El número de control de factura es independiente.
      </p>
      {sequences.map((seq) => (
        <SequenceRowForm key={seq.code} seq={seq} />
      ))}
    </div>
  );
}

function SequenceRowForm({ seq }: { seq: SequenceRow }) {
  const [state, action, pending] = useActionState(updateSequenceNext, {});

  return (
    <form
      action={action}
      className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 md:grid-cols-[1fr_8rem_auto] md:items-end"
    >
      <input type="hidden" name="code" value={seq.code} />
      <div>
        <p className="font-semibold">{seq.label}</p>
        <p className="font-mono text-xs text-[var(--color-muted-foreground)]">
          código: {seq.code}
        </p>
      </div>
      <div>
        <Label htmlFor={`next_${seq.code}`}>Próximo N°</Label>
        <Input
          id={`next_${seq.code}`}
          name="next_number"
          type="number"
          min={1}
          required
          defaultValue={seq.next_number}
          className="font-mono"
        />
      </div>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "…" : "Guardar"}
        </Button>
      </div>
      <div className="md:col-span-3">
        <FieldError message={state.error} />
        {state.success && (
          <p className="text-sm text-[var(--color-accent)]">{state.success}</p>
        )}
      </div>
    </form>
  );
}
