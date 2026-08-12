"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createMunicipalWithholding,
  exportMunicipalTxt,
} from "@/lib/actions/municipal";
import { Button, FieldError, Input, Label } from "@/components/ui";
import { Select } from "@/components/layout";

type Partner = { id: string; name: string; rif: string };

export function MunicipalForms({ partners }: { partners: Partner[] }) {
  const [createState, createAction, creating] = useActionState(
    createMunicipalWithholding,
    {},
  );
  const [exportState, exportAction, exporting] = useActionState(
    exportMunicipalTxt,
    {},
  );
  const [txt, setTxt] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const periodDefault = today.slice(0, 7);

  useEffect(() => {
    if (exportState.txt) setTxt(exportState.txt);
  }, [exportState.txt]);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form action={createAction} className="space-y-3">
        <h3 className="font-semibold">Nuevo comprobante</h3>
        <div>
          <Label htmlFor="partner_id">Tercero</Label>
          <Select id="partner_id" name="partner_id" required disabled={!partners.length}>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.rif})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="voucher_date">Fecha</Label>
          <Input id="voucher_date" name="voucher_date" type="date" required defaultValue={today} />
        </div>
        <div>
          <Label htmlFor="activity_code">Código actividad</Label>
          <Input id="activity_code" name="activity_code" placeholder="Ej. 1234" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="amount_base">Base</Label>
            <Input id="amount_base" name="amount_base" type="number" step="0.01" required defaultValue="0" />
          </div>
          <div>
            <Label htmlFor="rate">Alícuota %</Label>
            <Input id="rate" name="rate" type="number" step="0.01" required defaultValue="1" />
          </div>
        </div>
        <FieldError message={createState.error} />
        {createState.success && <p className="text-sm text-[var(--color-accent)]">{createState.success}</p>}
        <Button type="submit" disabled={creating || !partners.length}>
          {creating ? "Guardando…" : "Crear"}
        </Button>
      </form>

      <form action={exportAction} className="space-y-3">
        <h3 className="font-semibold">Exportar TXT</h3>
        <div>
          <Label htmlFor="period">Período</Label>
          <Input id="period" name="period" type="month" required defaultValue={periodDefault} />
        </div>
        <FieldError message={exportState.error} />
        {exportState.success && <p className="text-sm text-[var(--color-accent)]">{exportState.success}</p>}
        <Button type="submit" disabled={exporting}>
          {exporting ? "Generando…" : "Generar TXT"}
        </Button>
        {txt && (
          <div className="space-y-2">
            <textarea
              className="h-40 w-full rounded-[14px] border border-[var(--color-border)] bg-[var(--color-muted)] p-3 font-mono text-xs"
              readOnly
              value={txt}
            />
            <a
              className="text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(txt)}`}
              download={`municipal_${periodDefault.replace("-", "")}.txt`}
            >
              Descargar TXT
            </a>
          </div>
        )}
      </form>
    </div>
  );
}
