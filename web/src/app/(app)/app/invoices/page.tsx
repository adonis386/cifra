import Link from "next/link";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { CancelInvoiceButton } from "@/components/invoices/cancel-invoice-button";
import { ReportExportActions } from "@/components/report-export-actions";
import {
  formatDual,
  formatMoney,
  getActiveCompany,
  getExchangeRate,
} from "@/lib/company";
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

const moveLabel: Record<string, string> = {
  in_invoice: "Compra",
  in_refund: "N/C compra",
  out_invoice: "Venta",
  out_refund: "N/C venta",
};

export default async function InvoicesPage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Facturas" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: partners },
    { data: invoices },
    { data: concepts },
    { data: islrRates },
    { data: taxUnit },
    productsRes,
    rate,
  ] = await Promise.all([
      supabase
        .from("partners")
        .select("id, name, rif, person_type")
        .eq("company_id", company.id)
        .order("name"),
      supabase
        .from("invoices")
        .select(
          "id, move_type, state, invoice_date, invoice_number, control_number, amount_untaxed, amount_tax, amount_total, amount_retained_iva, amount_retained_islr, exchange_rate, amount_total_usd, sin_cred, currency_code, partners(name, rif)",
        )
        .eq("company_id", company.id)
        .neq("state", "cancelled")
        .order("invoice_date", { ascending: false }),
      supabase
        .from("islr_concepts")
        .select("id, code, name, withholdable, company_id")
        .or(`company_id.eq.${company.id},company_id.is.null`)
        .eq("active", true)
        .order("code"),
      supabase
        .from("islr_rates")
        .select("concept_id, person_type, rate, subtract_ut, base_percent")
        .eq("active", true),
      supabase
        .from("tax_units")
        .select("amount")
        .or(`company_id.eq.${company.id},company_id.is.null`)
        .order("date_from", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("products")
        .select("id, code, name, price_unit, tax_code")
        .eq("company_id", company.id)
        .eq("active", true)
        .order("name"),
      getExchangeRate(company.id, today),
    ]);

  const products = productsRes.error ? [] : productsRes.data;

  const companyScoped = (concepts || []).filter((c) => c.company_id === company.id);
  const pool = companyScoped.length ? companyScoped : concepts || [];
  const seen = new Set<string>();
  const islrConcepts = pool.filter((c) => {
    if (seen.has(c.code)) return false;
    seen.add(c.code);
    return true;
  });

  const productList = (products || []).map((p) => ({
    id: p.id,
    code: p.code || "",
    name: p.name,
    price_unit: Number(p.price_unit || 0),
    tax_code: p.tax_code || "IVA16",
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Documentos"
        title="Facturas"
        description="Compras y ventas con control fiscal, multi-alícuota, dual $ / Bs y retenciones."
        actions={
          <ReportExportActions xlsxHref="/api/export/invoices" />
        }
      />

      <SectionCard
        title="Registrar documento"
        description="Líneas con cantidad × precio, alícuota IVA, concepto ISLR y tasa del día."
      >
        <InvoiceForm
          partners={partners || []}
          islrConcepts={islrConcepts}
          islrRates={(islrRates || []).map((r) => ({
            concept_id: r.concept_id,
            person_type: r.person_type,
            rate: Number(r.rate || 0),
            subtract_ut: Number(r.subtract_ut || 0),
            base_percent: Number(r.base_percent || 100),
          }))}
          products={productList}
          initialRate={rate || 0}
          taxUnitAmount={Number(taxUnit?.amount || 0)}
        />
      </SectionCard>

      <SectionCard title="Documentos">
        {(invoices || []).length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th>Tercero</Th>
                <Th>Factura / Control</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Ret. IVA</Th>
                <Th className="text-right">Ret. ISLR</Th>
                <Th className="text-right"></Th>
              </tr>
            </thead>
            <tbody>
              {(invoices || []).map((inv) => {
                const partner = inv.partners as unknown as
                  | { name: string; rif: string }
                  | { name: string; rif: string }[]
                  | null;
                const p = Array.isArray(partner) ? partner[0] : partner;
                const rate = Number(inv.exchange_rate || 0) || null;
                return (
                  <tr key={inv.id}>
                    <Td className="whitespace-nowrap">{inv.invoice_date}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge>{moveLabel[inv.move_type] || inv.move_type}</Badge>
                        {inv.sin_cred ? <Badge>sin libro</Badge> : null}
                      </div>
                    </Td>
                    <Td>
                      <div className="font-medium">{p?.name}</div>
                      <div className="font-mono text-xs text-[var(--color-muted-foreground)]">
                        {p?.rif}
                      </div>
                    </Td>
                    <Td>
                      <div className="font-mono text-sm">{inv.invoice_number}</div>
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        Ctrl: {inv.control_number || "—"}
                      </div>
                    </Td>
                    <Td className="text-right font-mono text-xs">
                      {rate
                        ? formatDual(inv.amount_total, rate)
                        : formatMoney(inv.amount_total)}
                    </Td>
                    <Td className="text-right font-mono">{formatMoney(inv.amount_retained_iva)}</Td>
                    <Td className="text-right font-mono">
                      {formatMoney(inv.amount_retained_islr)}
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/print/invoice/${inv.id}`}
                          className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
                        >
                          Imprimir
                        </Link>
                        <CancelInvoiceButton invoiceId={inv.id} />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState title="Sin facturas" description="Registra tu primer documento arriba." />
        )}
      </SectionCard>
    </div>
  );
}
