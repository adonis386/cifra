import Link from "next/link";
import { WithholdingHub } from "@/components/withholdings/withholding-forms";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  Td,
  Th,
} from "@/components/layout";
import { cancelIvaWithholding } from "@/lib/actions/withholdings";

export default async function WithholdingsPage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Retenciones" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const [
    { data: invoices },
    { data: withholdings },
    { data: islrDocs },
    { data: ivaLinked },
    { data: islrLinked },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, amount_retained_iva, amount_retained_islr, amount_untaxed, amount_tax, partners(name, rif)")
      .eq("company_id", company.id)
      .neq("state", "cancelled")
      .order("invoice_date", { ascending: false }),
    supabase
      .from("withholding_iva")
      .select("id, voucher_number, period, voucher_date, amount_withheld, state, partners(name, rif)")
      .eq("company_id", company.id)
      .neq("state", "cancelled")
      .order("voucher_date", { ascending: false }),
    supabase
      .from("withholding_islr")
      .select("id, voucher_number, period, voucher_date, amount_withheld, state, partners(name, rif)")
      .eq("company_id", company.id)
      .neq("state", "cancelled")
      .order("voucher_date", { ascending: false }),
    supabase
      .from("withholding_iva_lines")
      .select("invoice_id, withholding_iva(state)")
      .eq("company_id", company.id),
    supabase
      .from("withholding_islr_lines")
      .select("invoice_id, withholding_islr(state)")
      .eq("company_id", company.id),
  ]);

  const ivaDone = new Set(
    (ivaLinked || [])
      .filter((row) => {
        const parent = row.withholding_iva as unknown as
          | { state?: string }
          | { state?: string }[]
          | null;
        const st = Array.isArray(parent) ? parent[0]?.state : parent?.state;
        return st !== "cancelled";
      })
      .map((row) => row.invoice_id),
  );
  const islrDone = new Set(
    (islrLinked || [])
      .filter((row) => {
        const parent = row.withholding_islr as unknown as
          | { state?: string }
          | { state?: string }[]
          | null;
        const st = Array.isArray(parent) ? parent[0]?.state : parent?.state;
        return st !== "cancelled";
      })
      .map((row) => row.invoice_id),
  );

  function optionLabel(inv: {
    invoice_date: string;
    invoice_number: string;
    amount_untaxed: number;
    amount_retained_iva?: number;
    amount_retained_islr?: number;
    partners: unknown;
  }) {
    const partner = inv.partners as
      | { name: string; rif: string }
      | { name: string; rif: string }[]
      | null;
    const p = Array.isArray(partner) ? partner[0] : partner;
    const retIva = Number(inv.amount_retained_iva || 0);
    const retIslr = Number(inv.amount_retained_islr || 0);
    return `${inv.invoice_date} · ${inv.invoice_number} · ${p?.name || ""} · Base ${formatMoney(inv.amount_untaxed)}${retIva > 0 ? ` · IVA ${formatMoney(retIva)}` : ""}${retIslr > 0 ? ` · ISLR ${formatMoney(retIslr)}` : ""}`;
  }

  const ivaInvoices = (invoices || [])
    .filter((inv) => Number(inv.amount_retained_iva || 0) > 0 && !ivaDone.has(inv.id))
    .map((inv) => ({ id: inv.id, label: optionLabel(inv) }));
  const islrInvoices = (invoices || [])
    .filter((inv) => Number(inv.amount_retained_islr || 0) > 0 && !islrDone.has(inv.id))
    .map((inv) => ({ id: inv.id, label: optionLabel(inv) }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="SENIAT"
        title="Retenciones"
        description="Comprobantes IVA (TXT 99035) e ISLR (XML). El cálculo sale de la factura, no se elige tarifa a mano."
      />

      <SectionCard
        title="Pendientes y exportación"
        description={
          ivaInvoices.length || islrInvoices.length
            ? `${ivaInvoices.length} IVA y ${islrInvoices.length} ISLR sin comprobante.`
            : "No hay facturas con retención pendiente de comprobante."
        }
      >
        <WithholdingHub ivaInvoices={ivaInvoices} islrInvoices={islrInvoices} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Comprobantes IVA">
          {(withholdings || []).length ? (
            <DataTable>
              <thead>
                <tr>
                  <Th>Comprobante</Th>
                  <Th>Período</Th>
                  <Th>Sujeto</Th>
                  <Th className="text-right">Monto</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {(withholdings || []).map((w) => {
                  const partner = w.partners as unknown as
                    | { name: string; rif: string }
                    | { name: string; rif: string }[]
                    | null;
                  const p = Array.isArray(partner) ? partner[0] : partner;
                  return (
                    <tr key={w.id}>
                      <Td className="font-mono text-xs">{w.voucher_number}</Td>
                      <Td className="font-mono text-xs">{w.period}</Td>
                      <Td>
                        <div className="font-medium">{p?.name}</div>
                        <div className="font-mono text-xs text-[var(--color-muted-foreground)]">{p?.rif}</div>
                      </Td>
                      <Td className="text-right font-mono text-xs font-semibold">
                        {formatMoney(w.amount_withheld)}
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/print/iva/${w.id}`}
                            className="text-xs font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
                            target="_blank"
                          >
                            PDF
                          </Link>
                          <form action={cancelIvaWithholding}>
                            <input type="hidden" name="id" value={w.id} />
                            <button
                              type="submit"
                              className="text-xs font-semibold text-[var(--color-destructive)] underline-offset-4 hover:underline"
                            >
                              Anular
                            </button>
                          </form>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          ) : (
            <EmptyState title="Sin comprobantes IVA" />
          )}
        </SectionCard>

        <SectionCard title="Comprobantes ISLR">
          {(islrDocs || []).length ? (
            <DataTable>
              <thead>
                <tr>
                  <Th>Comprobante</Th>
                  <Th>Período</Th>
                  <Th>Sujeto</Th>
                  <Th className="text-right">Monto</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {(islrDocs || []).map((w) => {
                  const partner = w.partners as unknown as
                    | { name: string; rif: string }
                    | { name: string; rif: string }[]
                    | null;
                  const p = Array.isArray(partner) ? partner[0] : partner;
                  return (
                    <tr key={w.id}>
                      <Td className="font-mono text-xs">{w.voucher_number}</Td>
                      <Td>
                        <Badge tone="primary">{w.period}</Badge>
                      </Td>
                      <Td>
                        <div className="font-medium">{p?.name}</div>
                        <div className="font-mono text-xs text-[var(--color-muted-foreground)]">{p?.rif}</div>
                      </Td>
                      <Td className="text-right font-mono text-xs font-semibold">
                        {formatMoney(w.amount_withheld)}
                      </Td>
                      <Td>
                        <Link
                          href={`/print/islr/${w.id}`}
                          className="text-xs font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
                          target="_blank"
                        >
                          PDF
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          ) : (
            <EmptyState title="Sin comprobantes ISLR" />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
