"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { createInvoice, type ActionState } from "@/lib/actions/invoices";
import { nextControlNumber } from "@/lib/actions/rates";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

const initial: ActionState = {};

type Partner = { id: string; name: string; rif: string; person_type?: string };
type IslrConcept = { id: string; code: string; name: string; withholdable?: boolean };
type IslrRate = {
  concept_id: string;
  person_type: string;
  rate: number;
  subtract_ut: number;
  base_percent?: number;
};
type Product = {
  id: string;
  code: string;
  name: string;
  price_unit: number;
  tax_code: string;
};

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
  productId: string;
  description: string;
  quantity: string;
  priceUnit: string;
  taxCode: string;
  conceptId: string;
};

function emptyLine(id = "1"): Line {
  return {
    id,
    productId: "",
    description: "",
    quantity: "1",
    priceUnit: "0",
    taxCode: "IVA16",
    conceptId: "",
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

function dual(bs: number, rate: number) {
  if (!(rate > 0)) return `${money(bs)} Bs`;
  const usd = bs / rate;
  return `$ ${money(usd)} / ${money(bs)} Bs`;
}

export function InvoiceForm({
  partners,
  islrConcepts = [],
  islrRates = [],
  products = [],
  initialRate = 0,
  taxUnitAmount = 0,
}: {
  partners: Partner[];
  islrConcepts?: IslrConcept[];
  islrRates?: IslrRate[];
  products?: Product[];
  initialRate?: number;
  taxUnitAmount?: number;
}) {
  const [state, action, pending] = useActionState(createInvoice, initial);
  const [ctrlPending, startCtrl] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const [moveType, setMoveType] = useState("in_invoice");
  const [partnerId, setPartnerId] = useState(partners[0]?.id || "");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [registrationDate, setRegistrationDate] = useState(today);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [controlNumber, setControlNumber] = useState("");
  const [affectedDocument, setAffectedDocument] = useState("");
  const [currencyCode, setCurrencyCode] = useState("VES");
  const [exchangeRate, setExchangeRate] = useState(
    initialRate > 0 ? String(initialRate) : "",
  );
  const [sinCred, setSinCred] = useState(false);
  const [importPlanilla, setImportPlanilla] = useState("");
  const [importExpediente, setImportExpediente] = useState("");
  const [importDate, setImportDate] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [withholdingPct, setWithholdingPct] = useState("0");
  const [resetToken, setResetToken] = useState(state.success);
  const [retencionTouched, setRetencionTouched] = useState(false);

  const resolvedPartner =
    partners.find((p) => p.id === partnerId) || partners[0];
  const resolvedPartnerId = resolvedPartner?.id || "";
  const partnerPersonType =
    resolvedPartner?.person_type === "natural" ? "natural" : "juridica";
  const rateNum = Number(exchangeRate || 0);

  function rateForConcept(conceptId: string) {
    if (!conceptId) return null;
    return (
      islrRates.find(
        (r) => r.concept_id === conceptId && r.person_type === partnerPersonType,
      ) || islrRates.find((r) => r.concept_id === conceptId) || null
    );
  }
  const showImport = moveType.startsWith("in_");

  if (state.success && state.success !== resetToken) {
    setResetToken(state.success);
    setInvoiceNumber("");
    setControlNumber("");
    setAffectedDocument("");
    setImportPlanilla("");
    setImportExpediente("");
    setImportDate("");
    setSinCred(false);
    setLines([emptyLine()]);
    setRetencionTouched(false);
    setWithholdingPct(moveType.startsWith("in_") ? "75" : "0");
    setRegistrationDate(invoiceDate || today);
  }

  const computedLines = useMemo(
    () => lines.map((l) => ({ line: l, ...lineAmounts(l) })),
    [lines],
  );

  const totals = useMemo(() => {
    let untaxed = 0;
    let tax = 0;
    let exempt = 0;
    let retainedIslr = 0;
    const islrParts: string[] = [];
    for (const l of computedLines) {
      untaxed += l.untaxed;
      tax += l.tax;
      exempt += l.exempt;
      if (!l.line.conceptId) continue;
      const rate =
        islrRates.find(
          (r) =>
            r.concept_id === l.line.conceptId &&
            r.person_type === partnerPersonType,
        ) || islrRates.find((r) => r.concept_id === l.line.conceptId);
      if (!rate) continue;
      const base = Number(l.untaxed || l.exempt || 0);
      const basePct = Number(rate.base_percent || 100) / 100;
      const subtractBs = Number(rate.subtract_ut || 0) * taxUnitAmount;
      const taxable = Math.max(base * basePct - subtractBs, 0);
      const amount = Number(((taxable * Number(rate.rate || 0)) / 100).toFixed(2));
      retainedIslr += amount;
      const label = `${Number(rate.rate)}%${
        rate.subtract_ut > 0
          ? ` + sustr. ${Number(rate.subtract_ut)} UT`
          : ""
      }`;
      if (!islrParts.includes(label)) islrParts.push(label);
    }
    const effectivePct = tax <= 0 ? 0 : Number(withholdingPct || 0);
    const retained = (tax * effectivePct) / 100;
    return {
      untaxed: Number(untaxed.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      exempt: Number(exempt.toFixed(2)),
      total: Number((untaxed + tax + exempt).toFixed(2)),
      retained: Number(retained.toFixed(2)),
      retainedIslr: Number(retainedIslr.toFixed(2)),
      islrLabel: islrParts.join(" · ") || "Sin concepto ISLR",
      hasIva: tax > 0,
    };
  }, [
    computedLines,
    withholdingPct,
    islrRates,
    partnerPersonType,
    taxUnitAmount,
  ]);

  useEffect(() => {
    if (!totals.hasIva) {
      if (withholdingPct !== "0") setWithholdingPct("0");
      return;
    }
    if (!retencionTouched) {
      const next = moveType.startsWith("in_") ? "75" : "0";
      if (withholdingPct !== next) setWithholdingPct(next);
    }
  }, [totals.hasIva, moveType, retencionTouched, withholdingPct]);

  useEffect(() => {
    setRetencionTouched(false);
  }, [moveType]);

  const primaryRate =
    computedLines.find((l) => !l.isExempt)?.rate ??
    computedLines[0]?.rate ??
    16;

  function updateLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function allocateControl() {
    startCtrl(async () => {
      const res = await nextControlNumber();
      if (res.value) setControlNumber(res.value);
    });
  }

  if (!partners.length) {
    return (
      <div className="space-y-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-4">
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
      <input
        type="hidden"
        name="withholding_pct"
        value={totals.hasIva ? withholdingPct : "0"}
      />
      <input type="hidden" name="sin_cred" value={sinCred ? "1" : "0"} />
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
            concept_id: line.conceptId || null,
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
          <Label htmlFor="invoice_date">Fecha factura</Label>
          <Input
            id="invoice_date"
            name="invoice_date"
            type="date"
            required
            value={invoiceDate}
            onChange={(e) => {
              setInvoiceDate(e.target.value);
              if (!registrationDate || registrationDate === invoiceDate) {
                setRegistrationDate(e.target.value);
              }
            }}
          />
        </div>
        <div>
          <Label htmlFor="registration_date">Fecha registro (libro)</Label>
          <Input
            id="registration_date"
            name="registration_date"
            type="date"
            required
            value={registrationDate}
            onChange={(e) => setRegistrationDate(e.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Para libros quincenales (puede diferir de la fecha del documento).
          </p>
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
          <div className="flex gap-2">
            <Input
              id="control_number"
              name="control_number"
              className="font-mono"
              value={controlNumber}
              onChange={(e) => setControlNumber(e.target.value)}
            />
            <Button
              type="button"
              variant="soft"
              className="shrink-0"
              disabled={ctrlPending}
              onClick={allocateControl}
            >
              {ctrlPending ? "…" : "Auto"}
            </Button>
          </div>
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
        <div>
          <Label htmlFor="currency_code">Moneda del documento</Label>
          <Select
            id="currency_code"
            name="currency_code"
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
          >
            <option value="VES">Bolívares (Bs)</option>
            <option value="USD">Dólares (USD)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="exchange_rate">Tasa del día (Bs / 1 USD)</Label>
          <Input
            id="exchange_rate"
            name="exchange_rate"
            type="number"
            step="0.0001"
            min="0"
            className="font-mono"
            placeholder="Ej: 36.50"
            value={exchangeRate}
            onChange={(e) => setExchangeRate(e.target.value)}
          />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={sinCred}
          onChange={(e) => setSinCred(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium">Excluir del libro fiscal</span>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            Equivalente a <code>sin_cred</code> en Odoo: no entra en libro de compras/ventas.
          </span>
        </span>
      </label>

      {showImport && (
        <div className="grid gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <p className="text-sm font-semibold">Importación (opcional)</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Planilla / expediente SENIAT para compras del exterior.
            </p>
          </div>
          <div>
            <Label htmlFor="import_planilla">Nº planilla</Label>
            <Input
              id="import_planilla"
              name="import_planilla"
              value={importPlanilla}
              onChange={(e) => setImportPlanilla(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="import_file_number">Nº expediente</Label>
            <Input
              id="import_file_number"
              name="import_file_number"
              value={importExpediente}
              onChange={(e) => setImportExpediente(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="import_date">Fecha planilla</Label>
            <Input
              id="import_date"
              name="import_date"
              type="date"
              value={importDate}
              onChange={(e) => setImportDate(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Líneas del documento</h3>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Cantidad × precio = base. Alícuota IVA y concepto ISLR por línea.
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

        <div className="hidden gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)] lg:grid lg:grid-cols-[minmax(0,1.6fr)_4.5rem_6rem_8rem_minmax(0,1.2fr)_5.5rem_5.5rem_2.25rem]">
          <span>Descripción / producto</span>
          <span className="text-right">Cant.</span>
          <span className="text-right">Precio</span>
          <span>Alícuota</span>
          <span>Concepto ISLR</span>
          <span className="text-right">Base</span>
          <span className="text-right">IVA</span>
          <span />
        </div>

        <div className="space-y-3">
          {computedLines.map(({ line, base, tax, isExempt }, idx) => (
            <div
              key={line.id}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 lg:border-0 lg:p-0"
            >
              <p className="mb-2 text-xs font-medium text-[var(--color-muted-foreground)] lg:hidden">
                Línea {idx + 1}
              </p>
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_4.5rem_6rem_8rem_minmax(0,1.2fr)_5.5rem_5.5rem_2.25rem] lg:items-start">
                {products.length > 0 ? (
                  <div>
                    <label
                      htmlFor={`prod-${line.id}`}
                      className="mb-1.5 block text-sm font-medium lg:hidden"
                    >
                      Producto
                    </label>
                    <Select
                      id={`prod-${line.id}`}
                      value={line.productId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        const prod = products.find((p) => p.id === pid);
                        if (prod) {
                          updateLine(line.id, {
                            productId: pid,
                            description: prod.name,
                            priceUnit: String(prod.price_unit),
                            taxCode: prod.tax_code || "IVA16",
                          });
                        } else {
                          updateLine(line.id, { productId: "" });
                        }
                      }}
                      aria-label="Producto"
                    >
                      <option value="">Libre…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code ? `${p.code} — ` : ""}
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                <div className={products.length ? "" : "lg:col-span-2"}>
                  <label
                    htmlFor={`desc-${line.id}`}
                    className="mb-1.5 block text-sm font-medium lg:hidden"
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
                    className="mb-1.5 block text-sm font-medium lg:hidden"
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
                    className="mb-1.5 block text-sm font-medium lg:hidden"
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
                    className="mb-1.5 block text-sm font-medium lg:hidden"
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
                <div>
                  <label
                    htmlFor={`islr-${line.id}`}
                    className="mb-1.5 block text-sm font-medium lg:hidden"
                  >
                    Concepto ISLR
                  </label>
                  <Select
                    id={`islr-${line.id}`}
                    value={line.conceptId}
                    onChange={(e) => updateLine(line.id, { conceptId: e.target.value })}
                    aria-label="Concepto ISLR"
                  >
                    <option value="">Sin retención ISLR</option>
                    {islrConcepts.map((c) => {
                      const r = rateForConcept(c.id);
                      const extra = r
                        ? ` (${r.rate}%${r.subtract_ut > 0 ? ` + sustr. ${r.subtract_ut} UT` : ""})`
                        : "";
                      return (
                        <option key={c.id} value={c.id}>
                          {c.code} — {c.name}
                          {extra}
                        </option>
                      );
                    })}
                  </Select>
                </div>
                <div className="flex flex-col justify-center rounded-[var(--radius-md)] bg-[var(--color-muted)] px-3 py-2.5 lg:min-h-[46px]">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)] lg:hidden">
                    Base {isExempt ? "(exento)" : ""}
                  </span>
                  <span className="font-mono text-sm tabular-nums">{money(base)}</span>
                </div>
                <div className="flex flex-col justify-center rounded-[var(--radius-md)] bg-[var(--color-muted)] px-3 py-2.5 lg:min-h-[46px]">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--color-muted-foreground)] lg:hidden">
                    IVA
                  </span>
                  <span className="font-mono text-sm tabular-nums">{money(tax)}</span>
                </div>
                <div className="flex items-center justify-end lg:justify-center lg:pt-2">
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
                    <span className="hidden lg:inline" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 rounded-[var(--radius-md)] bg-[var(--color-muted)] p-4 md:grid-cols-6">
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">Base gravable</p>
          <p className="font-mono text-sm font-semibold">{dual(totals.untaxed, rateNum)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">IVA</p>
          <p className="font-mono text-sm font-semibold">{dual(totals.tax, rateNum)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">Exento</p>
          <p className="font-mono text-sm font-semibold">{dual(totals.exempt, rateNum)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">Total</p>
          <p className="font-mono text-sm font-semibold">{dual(totals.total, rateNum)}</p>
        </div>
        <div>
          <Label htmlFor="withholding_pct_ui">% ret. IVA</Label>
          <Input
            id="withholding_pct_ui"
            type="number"
            step="0.01"
            min="0"
            max="100"
            disabled={!totals.hasIva}
            value={totals.hasIva ? withholdingPct : "0"}
            onChange={(e) => {
              setRetencionTouched(true);
              setWithholdingPct(e.target.value);
            }}
          />
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {totals.hasIva
              ? `Retiene ${dual(totals.retained, rateNum)}`
              : "Sin IVA (exento): retención 0%"}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-muted-foreground)]">% ret. ISLR</p>
          <p className="font-mono text-sm font-semibold">{totals.islrLabel}</p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Retiene {dual(totals.retainedIslr, rateNum)}
            {taxUnitAmount > 0 ? ` · UT ${money(taxUnitAmount)}` : ""}
          </p>
        </div>
      </div>

      <FieldError message={state.error} />
      {state.success && (
        <p className="text-sm text-[var(--color-accent)]">Factura registrada.</p>
      )}
      <Button type="submit" disabled={pending || totals.total <= 0}>
        {pending ? "Guardando…" : "Registrar factura"}
      </Button>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        No se permiten números de factura repetidos para el mismo tercero. En
        ISLR elige el concepto: honorarios profesionales/médicos usan 3% más
        sustraendo (cuando aplique). La tabla completa se carga cuando la
        envíen.
      </p>
    </form>
  );
}
