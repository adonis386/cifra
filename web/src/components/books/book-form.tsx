"use client";

import { useActionState } from "react";
import { generateFiscalBook, type ActionState } from "@/lib/actions/books";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

const initial: ActionState = {};

export function BookForm() {
  const [state, action, pending] = useActionState(generateFiscalBook, initial);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  return (
    <form action={action} className="grid gap-3 md:grid-cols-3">
      <div>
        <Label htmlFor="book_type">Libro</Label>
        <Select id="book_type" name="book_type" defaultValue="purchase">
          <option value="purchase">Libro de Compras</option>
          <option value="sale">Libro de Ventas</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="period_start">Desde</Label>
        <Input id="period_start" name="period_start" type="date" required defaultValue={start} />
      </div>
      <div>
        <Label htmlFor="period_end">Hasta</Label>
        <Input id="period_end" name="period_end" type="date" required defaultValue={end} />
      </div>
      <div className="md:col-span-3">
        <FieldError message={state.error} />
        {state.success && (
          <p className="mb-2 text-sm text-[var(--color-accent)]">{state.success}</p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Generando…" : "Generar libro desde facturas"}
        </Button>
      </div>
    </form>
  );
}
