"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createInvoice, type ActionState } from "@/lib/actions/invoices";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

const initial: ActionState = {};

type Partner = { id: string; name: string; rif: string };

type TaxOption = {
  code: string;
  label: string;
  rate: number;
  isExempt: boolean;
};

const TAX_OPTIONS: TaxOption[] = [
  { code: "IVA16", label: "IVA 16%", rate: 16, isExempt: false },
  { code: "IVA8", label: "IVA 8%", rate: 8, isExempt: false },
  { code: "EXENTO", label: "Exento", rate: 0, isExempt: true },
  { code: "SDCF", label: "Sin crédito fiscal", rate: 0, isExempt: true },
];

type Line = {
  id: string;
  description: string;
  quantity: string;
  priceUnit: string;
  taxCode: string;
};

function emptyLine(id = "1"): Line {
  return {
    id,
    description: "",
    quantity: "1",
    priceUnit: "0",
    taxCode: "IVA16",
  };
}

function lineAmounts(line: Line) {
  const quantity = Number(line.quantity || 0);
  const priceUnit = Number(line.priceUnit || 0);
  const base = Number((quantity * priceUnit).toFixed(2));
  const tax = TAX_OPTIONS.find((t) => t.code === line.taxCode) || TAX_OPTIONS[0];
  if (tax.isExempt || tax.rate === 0) {
    return {
      quantity,
      priceUnit,
      base,
      rate: 0,
      untaxed: 0,
      tax: 0,
      exempt: base,
      subtotal: base,
      isExempt: true,
    };
  }
  const iva = Number(((base * tax.rate) / 100).toFixed(2));
  return {
    quantity,
    priceUnit,
    base,
    rate: tax.rate,
    untaxed: base,
    tax: iva,
    exempt: 0,
    subtotal: Number((base + iva).toFixed(2)),
    isExempt: false,
  };
}

function money(n: number) {
  return n.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function InvoiceForm({ partners }: { partners: Partner[] }) {
  const [state, action, pending] = useActionState(createInvoice, initial);
  const today = new Date().toISOString().slice(0, 10);
  const [moveType, setMoveType] = useState("in_invoice");
  const [partnerId, setPartnerId] = useState(partners[0]?.id || "");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [controlNumber, setControlNumber] = useState("");
  const [affectedDocument, setAffectedDocument] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [withholdingPct, setWithholdingPct] = useState("75");
  const [resetToken, setResetToken] = useState(state.success);

  const resolvedPartnerId =
    partners.find((p) => p.id === partnerId)?.id || partners[0]?.id || "";

  if (state.success && state.success !== resetToken) {
    setResetToken(state.success);
    setInvoiceNumber("");
    setControlNumber("");
    setAffectedDocument("");
    setLines([emptyLine()]);
  }

  const computedLines = useMemo(() => lines.map((l) => ({ line: l, ...lineAmounts(l) })), [lines]);

  const totals = useMemo(() => {
    let untaxed = 0;
    let tax = 0;
    let exempt = 0;
    for (const l of computedLines) {
      untaxed += l.untaxed;
      tax += l.tax;
      exempt += l.exempt;
    }
    const retained = (tax * Number(withholdingPct || 0)) / 100;
    return {
      untaxed: Number(untaxed.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      exempt: Number(exempt.toFixed(2)),
      total: Number((untaxed + tax + exempt).toFixed(2)),
      retained: Number(retained.toFixed(2)),
    };
  }, [computedLines, withholdingPct]);

  const primaryRate =
    computedLines.find((l) => !l.isExempt)?.rate ??
    computedLines[0]?.rate ??
    16;

  function updateLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

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
      <input type="hidden" name="tax_rate" value={primaryRate} />
      <input type="hidden" name="amount_exempt" value={totals.exempt} />
      <input type="hidden" name="withholding_pct" value={withholdingPct} />
      <input
        type="hidden"
        name="lines_json"
        value={JSON.stringify(
          computedLines.map(({ line, quantity, priceUnit, rate, untaxed, tax, exempt, subtotal }) => ({
            description: line.description || "Línea",
            quantity,
            price_unit: priceUnit,
            rate,
            base: untaxed || exempt,
            untaxed,
            tax,
            exempt,
            total: subtotal,
            tax_code: line.taxCode,
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
            value={resolvedPartnerId}
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Líneas del documento</h3>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Cantidad × precio = base. La alícuota define IVA o exento.
            </p>
          </div>
          <Button
            type="button"
            variant="soft"
            onClick={() => setLines((prev) => [...prev, emptyLine(String(Date.now()))])}
          >
            Agregar línea
          </Button>
        </div>

        {/* Column headers — desktop */}
        <div className="hidden gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)] md:grid md:grid-cols-[minmax(0,2.2fr)_5.5rem_7rem_9.5rem_6.5rem_6.5rem_2.5rem]">
          <span>Descripción / producto</span>
          <span className="text-right">Cantidad</span>
          <span className="text-right">Precio unit.</span>
          <span>Alícuota</span>
          <span className="text-right">Base</span>
          <span className="text-right">IVA</span>
          <span />
        </div>

        <div className="space-y-3">
          {computedLines.map(({ line, base, tax, isExempt }, idx) => (
            <div
              key={line.id}
              className="rounded-[14px] border border-[var(--color-border)] p-3 md:border-0 md:p-0"
            >
              <p className="mb-2 text-xs font-medium text-[var(--color-muted-foreground)] md:hidden">
                Línea {idx + 1}
              </p>
              <div className="grid gap-2 md:grid-cols-[minmax(0,2.2fr)_5.5rem_7rem_9.5rem_6.5rem_6.5rem_2.5rem] md:items-start">
                <div>
                  <label
                    htmlFor={`desc-${line.id}`}
                    className="mb-1.5 block text-sm font-medium md:hidden"
                  >
                    Descripción / producto
                  </label>
                  <Input
                    id={`desc-${line.id}`}
                    value={line.description}
                    onChange={(e) => updateLine(line.id, { description: e.target.value })}
                    placeholder="Servicio o producto"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`qty-${line.id}`}
                    className="mb-1.5 block text-sm font-medium md:hidden"
                  >
                    Cantidad
                  </label>
                  <Input
                    id={`qty-${line.id}`}
                    type="number"
                    min="0"
                    step="0.0001"
                    inputMode="decimal"
                    className="text-right font-mono"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                    aria-label="Cantidad"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`price-${line.id}`}
                    className="mb-1.5 block text-sm font-medium md:hidden"
                  >
                    Precio unitario
                  </label>
                  <Input
                    id={`price-${line.id}`}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    className="text-right font-mono"
                    value={line.priceUnit}
                    onChange={(e) => updateLine(line.id, { priceUnit: e.target.value })}
                    aria-label="Precio unitario"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`tax-${line.id}`}
                    className="mb-1.5 block text-sm font-medium md:hidden"
                  >
                    Alícuota
                  </label>
                  <Select
                    id={`tax-${line.id}`}
                    value={line.taxCode}
                    onChange={(e) => updateLine(line.id, { taxCode: e.target.value })}
                    aria-label="Alícuota IVA"
                  >
                    {TAX_OPTIONS.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col justify-center rounded-[14px] bg-[var(--color-muted)] px-3 py-2.5 md:min-h-[46px]">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)] md:hidden">
                    Base {isExempt ? "(exento)" : ""}
                  </span>
                  <span className="font-mono text-sm tabular-nums">{money(base)}</span>
                </div>
                <div className="flex flex-col justify-center rounded-[14px] bg-[var(--color-muted)] px-3 py-2.5 md:min-h-[46px]">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)] md:hidden">
                    IVA
                  </span>
                  <span className="font-mono text-sm tabular-nums">{money(tax)}</span>
                </div>
                <div className="flex items-center justify-end md:justify-center md:pt-2">
                  {lines.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 w-10 px-0 text-[var(--color-destructive)]"
                      onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                      aria-label={`Eliminar línea ${idx + 1}`}
                    >
                      ×
                    </Button>
                  ) : (
                    <span className="hidden md:inline" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 rounded-[14px] bg-[var(--color-muted)] p-4 md:grid-cols-5">
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">Base gravable</p>
          <p className="font-mono font-semibold">{money(totals.untaxed)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">IVA</p>
          <p className="font-mono font-semibold">{money(totals.tax)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">Exento</p>
          <p className="font-mono font-semibold">{money(totals.exempt)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">Total</p>
          <p className="font-mono font-semibold">{money(totals.total)}</p>
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
            Retiene {money(totals.retained)}
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
