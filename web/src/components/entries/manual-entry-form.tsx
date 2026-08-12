"use client";

import { useActionState, useMemo, useState } from "react";
import { createManualEntry, type ActionState } from "@/lib/actions/entries";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

type Account = { id: string; code: string; name: string };
type Journal = { id: string; code: string; name: string; journal_type: string };
type Partner = { id: string; name: string; rif: string };

type Line = {
  id: string;
  accountId: string;
  name: string;
  debit: string;
  credit: string;
  partnerId: string;
};

const initial: ActionState = {};

function emptyLine(accounts: Account[], id = "1"): Line {
  return {
    id,
    accountId: accounts[0]?.id || "",
    name: "",
    debit: "0",
    credit: "0",
    partnerId: "",
  };
}

export function ManualEntryForm({
  accounts,
  journals,
  partners,
}: {
  accounts: Account[];
  journals: Journal[];
  partners: Partner[];
}) {
  const [state, action, pending] = useActionState(createManualEntry, initial);
  const today = new Date().toISOString().slice(0, 10);
  const misc = journals.find((j) => j.journal_type === "general") || journals[0];
  const [journalId, setJournalId] = useState(misc?.id || "");
  const [lines, setLines] = useState<Line[]>([
    emptyLine(accounts, "1"),
    emptyLine(accounts, "2"),
  ]);

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    return {
      debit: Number(debit.toFixed(2)),
      credit: Number(credit.toFixed(2)),
      balanced: Math.abs(debit - credit) < 0.009 && debit > 0,
    };
  }, [lines]);

  if (!accounts.length) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Primero genera el plan de cuentas en Libro → Plan.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input
        type="hidden"
        name="lines_json"
        value={JSON.stringify(
          lines.map((l) => ({
            account_id: l.accountId,
            name: l.name,
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            partner_id: l.partnerId || null,
          })),
        )}
      />

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label htmlFor="move_date">Fecha</Label>
          <Input id="move_date" name="move_date" type="date" required defaultValue={today} />
        </div>
        <div>
          <Label htmlFor="journal_id">Origen</Label>
          <Select
            id="journal_id"
            name="journal_id"
            value={journalId}
            onChange={(e) => setJournalId(e.target.value)}
          >
            {journals.map((j) => (
              <option key={j.id} value={j.id}>
                {j.code} — {j.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="ref">Referencia</Label>
          <Input id="ref" name="ref" placeholder="Ajuste / apertura / memo" />
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Nota</Label>
        <Input id="notes" name="notes" placeholder="Descripción del asiento" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Líneas (debe = haber)</h3>
          <Button
            type="button"
            variant="soft"
            onClick={() =>
              setLines((prev) => [...prev, emptyLine(accounts, String(Date.now()))])
            }
          >
            Agregar línea
          </Button>
        </div>

        <div className="hidden gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)] lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6rem_6rem_minmax(0,1fr)_2.25rem]">
          <span>Cuenta</span>
          <span>Detalle</span>
          <span className="text-right">Débito</span>
          <span className="text-right">Crédito</span>
          <span>Tercero</span>
          <span />
        </div>

        {lines.map((line) => (
          <div
            key={line.id}
            className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6rem_6rem_minmax(0,1fr)_2.25rem] lg:border-0 lg:p-0"
          >
            <Select
              value={line.accountId}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l) =>
                    l.id === line.id ? { ...l, accountId: e.target.value } : l,
                  ),
                )
              }
              aria-label="Cuenta"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </Select>
            <Input
              value={line.name}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l) =>
                    l.id === line.id ? { ...l, name: e.target.value } : l,
                  ),
                )
              }
              placeholder="Detalle"
            />
            <Input
              type="number"
              step="0.01"
              min="0"
              className="text-right font-mono"
              value={line.debit}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l) =>
                    l.id === line.id
                      ? { ...l, debit: e.target.value, credit: "0" }
                      : l,
                  ),
                )
              }
              aria-label="Débito"
            />
            <Input
              type="number"
              step="0.01"
              min="0"
              className="text-right font-mono"
              value={line.credit}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l) =>
                    l.id === line.id
                      ? { ...l, credit: e.target.value, debit: "0" }
                      : l,
                  ),
                )
              }
              aria-label="Crédito"
            />
            <Select
              value={line.partnerId}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l) =>
                    l.id === line.id ? { ...l, partnerId: e.target.value } : l,
                  ),
                )
              }
              aria-label="Tercero"
            >
              <option value="">—</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <div className="flex justify-end">
              {lines.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-[var(--color-destructive)]"
                  onClick={() =>
                    setLines((prev) => prev.filter((l) => l.id !== line.id))
                  }
                >
                  ×
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-muted)] px-4 py-3">
        <p className="font-mono text-sm">
          Débito {totals.debit.toFixed(2)} · Crédito {totals.credit.toFixed(2)}
        </p>
        <p
          className={`text-sm font-semibold ${
            totals.balanced ? "text-[var(--color-accent)]" : "text-[var(--color-destructive)]"
          }`}
        >
          {totals.balanced ? "Cuadrado" : "Descuadrado"}
        </p>
      </div>

      <FieldError message={state.error} />
      {state.success && (
        <p className="text-sm text-[var(--color-accent)]">{state.success}</p>
      )}
      <Button type="submit" disabled={pending || !totals.balanced}>
        {pending ? "Publicando…" : "Publicar asiento"}
      </Button>
    </form>
  );
}
