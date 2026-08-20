import Link from "next/link";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import {
  getActiveCompany,
  getExchangeRate,
  getActiveTaxUnit,
} from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, SectionCard } from "@/components/layout";

export default async function NewInvoicePage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Nueva factura" />
        <Link
          href="/app/empresa/nueva"
          className="text-sm font-semibold text-[var(--color-primary)] underline"
        >
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: partners },
    { data: concepts },
    { data: islrRates },
    taxUnitAmount,
    productsRes,
    rate,
  ] = await Promise.all([
    supabase
      .from("partners")
      .select("id, name, rif, person_type")
      .eq("company_id", company.id)
      .order("name"),
    supabase
      .from("islr_concepts")
      .select("id, code, name, withholdable, company_id")
      .or(`company_id.eq.${company.id},company_id.is.null`)
      .eq("active", true)
      .order("code"),
    supabase
      .from("islr_rates")
      .select("concept_id, person_type, rate, subtract_ut, base_percent, minimum_ut")
      .eq("active", true),
    getActiveTaxUnit(company.id, today),
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Documentos"
        title="Nueva factura"
        description="Compra o venta con control, IVA, ISLR y tasa del día. Al guardar se abre la ficha."
        actions={
          <Link
            href="/app/invoices"
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-semibold hover:border-[var(--color-primary)]"
          >
            Volver al listado
          </Link>
        }
      />
      <SectionCard title="Documento">
        <InvoiceForm
          partners={partners || []}
          islrConcepts={islrConcepts}
          islrRates={(islrRates || []).map((r) => ({
            concept_id: r.concept_id,
            person_type: r.person_type,
            rate: Number(r.rate || 0),
            subtract_ut: Number(r.subtract_ut || 0),
            base_percent: Number(r.base_percent || 100),
            minimum_ut: Number((r as { minimum_ut?: number }).minimum_ut || 0),
          }))}
          products={(products || []).map((p) => ({
            id: p.id,
            code: p.code || "",
            name: p.name,
            price_unit: Number(p.price_unit || 0),
            tax_code: p.tax_code || "IVA16",
          }))}
          initialRate={rate || 0}
          taxUnitAmount={taxUnitAmount}
        />
      </SectionCard>
    </div>
  );
}
