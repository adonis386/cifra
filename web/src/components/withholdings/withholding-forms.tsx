"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createIvaWithholding, exportIvaTxt } from "@/lib/actions/withholdings";
import { createIslrWithholding, exportIslrXml } from "@/lib/actions/islr";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

type InvoiceOption = { id: string; label: string; partnerId?: string };
type Concept = { id: string; code: string; name: string };
type Rate = {
  id: string;
  concept_id: string;
  person_type: string;
  rate: number;
  code: string | null;
};

export function WithholdingHub({
  invoices,
  concepts,
  rates,
}: {
  invoices: InvoiceOption[];
  concepts: Concept[];
  rates: Rate[];
}) {
  const [tab, setTab] = useState<"iva" | "islr">("iva");
  const [ivaState, ivaAction, ivaPending] = useActionState(createIvaWithholding, {});
  const [txtState, txtAction, txtPending] = useActionState(exportIvaTxt, {});
  const [islrState, islrAction, islrPending] = useActionState(createIslrWithholding, {});
  const [xmlState, xmlAction, xmlPending] = useActionState(exportIslrXml, {});
  const [txt, setTxt] = useState("");
  const [xml, setXml] = useState("");
  const [conceptId, setConceptId] = useState(concepts[0]?.id || "");
  const today = new Date().toISOString().slice(0, 10);
  const periodDefault = today.slice(0, 7);

  useEffect(() => {
    if (txtState.txt) setTxt(txtState.txt);
  }, [txtState.txt]);
  useEffect(() => {
    if (xmlState.xml) setXml(xmlState.xml);
  }, [xmlState.xml]);

  const filteredRates = useMemo(
    () => rates.filter((r) => r.concept_id === conceptId),
    [rates, conceptId],
  );

  return (
    <div className="space-y-6">
      <div className="flex w-fit gap-1 border border-[var(--color-border)] bg-[var(--color-muted)] p-1">
        {[
          { id: "iva" as const, label: "IVA · TXT 99035" },
          { id: "islr" as const, label: "ISLR · XML" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-[var(--radius-md)] px-4 py-2 text-sm font-semibold transition-colors duration-200 ${
              tab === t.id
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "iva" ? (
        <div className="grid gap-8 lg:grid-cols-2">
          <form action={ivaAction} className="space-y-3">
            <h3 className="font-semibold">Comprobante IVA</h3>
            <div>
              <Label htmlFor="invoice_id">Factura con retención</Label>
              <Select id="invoice_id" name="invoice_id" required disabled={!invoices.length}>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="voucher_date">Fecha</Label>
              <Input id="voucher_date" name="voucher_date" type="date" required defaultValue={today} />
            </div>
            <FieldError message={ivaState.error} />
            {ivaState.success && <p className="text-sm text-[var(--color-accent)]">{ivaState.success}</p>}
            <Button type="submit" disabled={ivaPending || !invoices.length}>
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
            <div>
              <Label htmlFor="islr_invoice">Factura</Label>
              <Select id="islr_invoice" name="invoice_id" required>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="concept_id">Concepto</Label>
              <Select
                id="concept_id"
                name="concept_id"
                required
                value={conceptId}
                onChange={(e) => setConceptId(e.target.value)}
              >
                {concepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="rate_id">Tarifa</Label>
              <Select id="rate_id" name="rate_id" required disabled={!filteredRates.length}>
                {filteredRates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.person_type} · {r.rate}% {r.code ? `· ${r.code}` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="base_amount">Base imponible ISLR</Label>
              <Input id="base_amount" name="base_amount" type="number" step="0.01" min="0" required defaultValue="0" />
            </div>
            <div>
              <Label htmlFor="islr_date">Fecha</Label>
              <Input id="islr_date" name="voucher_date" type="date" required defaultValue={today} />
            </div>
            <FieldError message={islrState.error} />
            {islrState.success && <p className="text-sm text-[var(--color-accent)]">{islrState.success}</p>}
            <Button type="submit" disabled={islrPending || !concepts.length}>
              {islrPending ? "Guardando…" : "Crear comprobante ISLR"}
            </Button>
            {!concepts.length && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Ve a Configuración y clona el catálogo ISLR.
              </p>
            )}
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
