"use client";

import { useActionState, useMemo, useState } from "react";
import { generateFiscalBook, type ActionState } from "@/lib/actions/books";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

const initial: ActionState = {};

function localIso(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function monthBounds(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return {
    start: localIso(start),
    end: localIso(end),
    y: start.getFullYear(),
    m: start.getMonth(),
  };
}

function fortnight(which: "first" | "second", offset = 0) {
  const { y, m } = monthBounds(offset);
  if (which === "first") {
    return {
      start: `${y}-${String(m + 1).padStart(2, "0")}-01`,
      end: `${y}-${String(m + 1).padStart(2, "0")}-15`,
    };
  }
  const last = new Date(y, m + 1, 0).getDate();
  return {
    start: `${y}-${String(m + 1).padStart(2, "0")}-16`,
    end: `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
  };
}

export function BookForm() {
  const [state, action, pending] = useActionState(generateFiscalBook, initial);
  const month = useMemo(() => monthBounds(0), []);
  const [start, setStart] = useState(month.start);
  const [end, setEnd] = useState(month.end);

  return (
    <form action={action} className="grid gap-3 md:grid-cols-3">
      <div>
        <Label htmlFor="book_type">Libro</Label>
        <Select id="book_type" name="book_type" defaultValue="purchase">
          <option value="purchase">Libro de compras</option>
          <option value="sale">Libro de ventas</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="period_start">Desde</Label>
        <Input
          id="period_start"
          name="period_start"
          type="date"
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="period_end">Hasta</Label>
        <Input
          id="period_end"
          name="period_end"
          type="date"
          required
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2 md:col-span-3">
        <Button
          type="button"
          variant="soft"
          onClick={() => {
            const b = monthBounds(0);
            setStart(b.start);
            setEnd(b.end);
          }}
        >
          Mes actual
        </Button>
        <Button
          type="button"
          variant="soft"
          onClick={() => {
            const b = fortnight("first");
            setStart(b.start);
            setEnd(b.end);
          }}
        >
          1.ª quincena
        </Button>
        <Button
          type="button"
          variant="soft"
          onClick={() => {
            const b = fortnight("second");
            setStart(b.start);
            setEnd(b.end);
          }}
        >
          2.ª quincena
        </Button>
      </div>
      <div className="md:col-span-3">
        <FieldError message={state.error} />
        {state.success && (
          <p className="mb-2 text-sm text-[var(--color-accent)]">{state.success}</p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Generando…" : "Generar libro desde facturas"}
        </Button>
        <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
          Compras Art. 75 · Ventas Art. 76. El rango usa la fecha de registro
          (útil para quincenas de contribuyentes especiales).
        </p>
      </div>
    </form>
  );
}
