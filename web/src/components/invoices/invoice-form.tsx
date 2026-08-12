"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createInvoice, type ActionState } from "@/lib/actions/invoices";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

const initial: ActionState = {};

type Partner = { id: string; name: string; rif: string };
type Line = { id: string; description: string; base: string; rate: string; exempt: string };

export function InvoiceForm({ partners }: { partners: Partner[] }) {
  const [state, action, pending] = useActionState(createInvoice, initial);
  const today = new Date().toISOString().slice(0, 10);
  const [moveType, setMoveType] = useState("in_invoice");
  const [partnerId, setPartnerId] = useState(partners[0]?.id || "");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [controlNumber, setControlNumber] = useState("");
  const [affectedDocument, setAffectedDocument] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { id: "1", description: "Servicio / producto", base: "0", rate: "16", exempt: "0" },
  ]);
  const [withholdingPct, setWithholdingPct] = useState("75");

  useEffect(() => {
    if (partners.length && !partners.some((p) => p.id === partnerId)) {
      setPartnerId(partners[0].id);
    }
  }, [partners, partnerId]);

  useEffect(() => {
    if (state.success) {
      setInvoiceNumber("");
      setControlNumber("");
      setAffectedDocument("");
      setLines([
        { id: "1", description: "Servicio / producto", base: "0", rate: "16", exempt: "0" },
      ]);
    }
  }, [state.success]);

  const totals = useMemo(() => {
    let untaxed = 0;
    let tax = 0;
    let exempt = 0;
    for (const l of lines) {
      const b = Number(l.base || 0);
      const r = Number(l.rate || 0);
      const e = Number(l.exempt || 0);
      untaxed += b;
      tax += (b * r) / 100;
      exempt += e;
    }
    const retained = (tax * Number(withholdingPct || 0)) / 100;
    return {
      untaxed: Number(untaxed.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      exempt: Number(exempt.toFixed(2)),
      total: Number((untaxed + tax + exempt).toFixed(2)),
      retained: Number(retained.toFixed(2)),
    };
  }, [lines, withholdingPct]);

  if (!partners.length) {
    return (
      <div className="space-y-2 rounded-[14px] border border-dashed border-[var(--color-border)] p-4">
        <p className="text-sm text-[var(--color-foreground)]">
          La factura necesita un cliente o proveedor (RIF) para libros y retenciones SENIAT.
        </p>
        <Link
          href="/app/partners"
          className="text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
        >
          Crear tercero ahora
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="amount_untaxed" value={totals.untaxed} />
      <input type="hidden" name="tax_rate" value={lines[0]?.rate || 16} />
      <input type="hidden" name="amount_exempt" value={totals.exempt} />
      <input type="hidden" name="withholding_pct" value={withholdingPct} />
      <input
        type="hidden"
        name="lines_json"
        value={JSON.stringify(
          lines.map((l) => ({
            description: l.description,
            base: Number(l.base || 0),
            rate: Number(l.rate || 0),
            exempt: Number(l.exempt || 0),
          })),
        )}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label htmlFor="move_type">Tipo</Label>
          <Select
            id="move_type"
            name="move_type"
            value={moveType}
            onChange={(e) => setMoveType(e.target.value)}
          >
            <option value="in_invoice">Compra (factura)</option>
            <option value="in_refund">Compra (nota crédito)</option>
            <option value="out_invoice">Venta (factura)</option>
            <option value="out_refund">Venta (nota crédito)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="partner_id">Tercero</Label>
          <Select
            id="partner_id"
            name="partner_id"
            required
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
          >
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.rif})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="invoice_date">Fecha</Label>
          <Input
            id="invoice_date"
            name="invoice_date"
            type="date"
            required
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="invoice_number">Nº factura</Label>
          <Input
            id="invoice_number"
            name="invoice_number"
            required
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="control_number">Nº control</Label>
          <Input
            id="control_number"
            name="control_number"
            className="font-mono"
            value={controlNumber}
            onChange={(e) => setControlNumber(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="affected_document">Doc. afectado</Label>
          <Input
            id="affected_document"
            name="affected_document"
            placeholder="Para N/C"
            value={affectedDocument}
            onChange={(e) => setAffectedDocument(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Líneas / alícuotas</h3>
          <Button
            type="button"
            variant="soft"
            onClick={() =>
              setLines((prev) => [
                ...prev,
                {
                  id: String(Date.now()),
                  description: "Línea",
                  base: "0",
                  rate: "16",
                  exempt: "0",
                },
              ])
            }
          >
            Agregar línea
          </Button>
        </div>
        {lines.map((line, idx) => (
          <div key={line.id} className="grid gap-2 rounded-[14px] border border-[var(--color-border)] p-3 md:grid-cols-4">
            <Input
              value={line.description}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l) => (l.id === line.id ? { ...l, description: e.target.value } : l)),
                )
              }
              placeholder="Descripción"
            />
            <Input
              type="number"
              step="0.01"
              value={line.base}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l) => (l.id === line.id ? { ...l, base: e.target.value } : l)),
                )
              }
              placeholder="Base"
            />
            <Input
              type="number"
              step="0.01"
              value={line.rate}
              onChange={(e) =>
                setLines((prev) =>
                  prev.map((l) => (l.id === line.id ? { ...l, rate: e.target.value } : l)),
                )
              }
              placeholder="IVA %"
            />
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                value={line.exempt}
                onChange={(e) =>
                  setLines((prev) =>
                    prev.map((l) => (l.id === line.id ? { ...l, exempt: e.target.value } : l)),
                  )
                }
                placeholder="Exento"
              />
              {lines.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-[var(--color-destructive)]"
                  onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                >
                  ×
                </Button>
              )}
            </div>
            <p className="md:col-span-4 text-xs text-[var(--color-muted-foreground)]">
              Línea {idx + 1}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 rounded-[14px] bg-[var(--color-muted)] p-4 md:grid-cols-5">
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">Base</p>
          <p className="font-mono font-semibold">{totals.untaxed.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">IVA</p>
          <p className="font-mono font-semibold">{totals.tax.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">Exento</p>
          <p className="font-mono font-semibold">{totals.exempt.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">Total</p>
          <p className="font-mono font-semibold">{totals.total.toFixed(2)}</p>
        </div>
        <div>
          <Label htmlFor="withholding_pct_ui">% ret. IVA</Label>
          <Input
            id="withholding_pct_ui"
            type="number"
            step="0.01"
            value={withholdingPct}
            onChange={(e) => setWithholdingPct(e.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Retiene {totals.retained.toFixed(2)}
          </p>
        </div>
      </div>

      <FieldError message={state.error} />
      {state.success && <p className="text-sm text-[var(--color-accent)]">{state.success}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Registrar factura"}
      </Button>
    </form>
  );
}
