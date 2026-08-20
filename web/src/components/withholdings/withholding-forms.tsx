"use client";

import { useActionState, useEffect, useState } from "react";
import { createIvaWithholding, exportIvaTxt } from "@/lib/actions/withholdings";
import { createIslrWithholding, exportIslrXml } from "@/lib/actions/islr";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

type InvoiceOption = { id: string; label: string; partnerId?: string };

export function WithholdingHub({
  panel,
  ivaInvoices,
  islrInvoices,
}: {
  panel: "iva" | "islr";
  ivaInvoices: InvoiceOption[];
  islrInvoices: InvoiceOption[];
}) {
  const [ivaState, ivaAction, ivaPending] = useActionState(createIvaWithholding, {});
  const [txtState, txtAction, txtPending] = useActionState(exportIvaTxt, {});
  const [islrState, islrAction, islrPending] = useActionState(createIslrWithholding, {});
  const [xmlState, xmlAction, xmlPending] = useActionState(exportIslrXml, {});
  const [txt, setTxt] = useState("");
  const [xml, setXml] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const periodDefault = today.slice(0, 7);

  useEffect(() => {
    if (txtState.txt) setTxt(txtState.txt);
  }, [txtState.txt]);
  useEffect(() => {
    if (xmlState.xml) setXml(xmlState.xml);
  }, [xmlState.xml]);

  return (
    <div className="space-y-6">
      {panel === "iva" ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <form action={ivaAction} className="space-y-3">
            <h3 className="font-semibold">Comprobante IVA</h3>
            <div>
              <Label htmlFor="invoice_id">Factura con retención</Label>
              <Select id="invoice_id" name="invoice_id" required disabled={!ivaInvoices.length}>
                {ivaInvoices.length ? (
                  ivaInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.label}
                    </option>
                  ))
                ) : (
                  <option value="">Sin facturas pendientes de IVA</option>
                )}
              </Select>
            </div>
            <div>
              <Label htmlFor="voucher_date">Fecha</Label>
              <Input id="voucher_date" name="voucher_date" type="date" required defaultValue={today} />
            </div>
            <div>
              <Label htmlFor="withholding_pct">% ret. IVA</Label>
              <Input
                id="withholding_pct"
                name="withholding_pct"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                defaultValue="75"
              />
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                Si la factura se guardó sin retención, aquí se aplica el % (75% típico en compras) y se crea el comprobante.
              </p>
            </div>
            <FieldError message={ivaState.error} />
            {ivaState.success && <p className="text-sm text-[var(--color-accent)]">{ivaState.success}</p>}
            <Button type="submit" disabled={ivaPending || !ivaInvoices.length}>
              {ivaPending ? "Guardando…" : "Crear comprobante IVA"}
            </Button>
          </form>

          <form action={txtAction} className="space-y-3">
            <h3 className="font-semibold">Exportar TXT</h3>
            <div>
              <Label htmlFor="period">Período</Label>
              <Input id="period" name="period" type="month" required defaultValue={periodDefault} />
            </div>
            <FieldError message={txtState.error} />
            {txtState.success && <p className="text-sm text-[var(--color-accent)]">{txtState.success}</p>}
            <Button type="submit" disabled={txtPending}>
              {txtPending ? "Generando…" : "Generar TXT 99035"}
            </Button>
            {txt && (
              <div className="space-y-2">
                <textarea className="h-40 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)] p-3 font-mono text-xs" readOnly value={txt} />
                <a
                  className="text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
                  href={`data:text/plain;charset=utf-8,${encodeURIComponent(txt)}`}
                  download={`iva_${periodDefault.replace("-", "")}.txt`}
                >
                  Descargar TXT
                </a>
              </div>
            )}
          </form>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <form action={islrAction} className="space-y-3">
            <h3 className="font-semibold">Comprobante ISLR</h3>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              El cálculo sale de la factura (concepto, alícuota y sustraendo UT × % × 83.3334).
              No se vuelve a elegir tarifa a mano.
            </p>
            <div>
              <Label htmlFor="islr_invoice">Factura</Label>
              <Select id="islr_invoice" name="invoice_id" required disabled={!islrInvoices.length}>
                {islrInvoices.length ? (
                  islrInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.label}
                    </option>
                  ))
                ) : (
                  <option value="">Sin facturas pendientes de ISLR</option>
                )}
              </Select>
            </div>
            <div>
              <Label htmlFor="islr_date">Fecha</Label>
              <Input id="islr_date" name="voucher_date" type="date" required defaultValue={today} />
            </div>
            <FieldError message={islrState.error} />
            {islrState.success && <p className="text-sm text-[var(--color-accent)]">{islrState.success}</p>}
            <Button type="submit" disabled={islrPending || !islrInvoices.length}>
              {islrPending ? "Guardando…" : "Crear / actualizar comprobante ISLR"}
            </Button>
          </form>

          <form action={xmlAction} className="space-y-3">
            <h3 className="font-semibold">Exportar XML ISLR</h3>
            <div>
              <Label htmlFor="islr_period">Período</Label>
              <Input id="islr_period" name="period" type="month" required defaultValue={periodDefault} />
            </div>
            <FieldError message={xmlState.error} />
            {xmlState.success && <p className="text-sm text-[var(--color-accent)]">{xmlState.success}</p>}
            <Button type="submit" disabled={xmlPending}>
              {xmlPending ? "Generando…" : "Generar XML"}
            </Button>
            {xml && (
              <div className="space-y-2">
                <textarea className="h-40 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)] p-3 font-mono text-xs" readOnly value={xml} />
                <a
                  className="text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
                  href={`data:application/xml;charset=ISO-8859-1,${encodeURIComponent(xml)}`}
                  download={`islr_${periodDefault.replace("-", "")}.xml`}
                >
                  Descargar XML
                </a>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
