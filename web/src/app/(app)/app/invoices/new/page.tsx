import Link from "next/link";
import { InvoiceForm, type InvoiceFormDraft } from "@/components/invoices/invoice-form";
import {
  getActiveCompany,
  getExchangeRate,
  getActiveTaxUnit,
} from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, SectionCard } from "@/components/layout";
import { InvoicesRepository } from "@/repositories/invoices.repository";

function taxCodeFromRate(rate: number, sinCred: boolean) {
  if (Number(rate) >= 15) return "IVA16";
  if (Number(rate) >= 7) return "IVA8";
  return sinCred ? "SDCF" : "EXENTO";
}

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
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
  const params = await searchParams;
  const invoicesRepo = new InvoicesRepository(supabase);
  const [
    { data: partners },
    { data: concepts },
    { data: islrRates },
    taxUnitAmount,
    productsRes,
    rate,
    draftDoc,
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
    params.draft
      ? invoicesRepo.getDraftWithLines(params.draft, company.id)
      : Promise.resolve(null),
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

  const header = draftDoc?.header;
  const taxAmt = Number(header?.amount_tax || 0);
  const retainedIva = Number(header?.amount_retained_iva || 0);
  const initialDraft: InvoiceFormDraft | null = header
    ? {
        id: header.id,
        partnerId: header.partner_id,
        moveType: header.move_type,
        invoiceDate: header.invoice_date,
        registrationDate: header.registration_date || header.invoice_date,
        invoiceNumber: header.invoice_number || "",
        controlNumber: header.control_number || "",
        affectedDocument: header.affected_document || "",
        currencyCode: header.currency_code || "VES",
        exchangeRate:
          header.exchange_rate != null && Number(header.exchange_rate) > 0
            ? String(header.exchange_rate)
            : "",
        sinCred: Boolean(header.sin_cred),
        importPlanilla: header.import_planilla || "",
        importExpediente: header.import_file_number || "",
        importDate: header.import_date || "",
        withholdingPct:
          taxAmt > 0
            ? String(Number(((retainedIva / taxAmt) * 100).toFixed(2)))
            : "0",
        igtfRate: String(Number(header.igtf_rate || 0) || 0),
        lines: (draftDoc?.lines || []).map((line, idx) => ({
          id: line.id || String(idx + 1),
          productId: line.product_id || "",
          description: line.description || "",
          quantity: String(Number(line.quantity || 1)),
          priceUnit: String(Number(line.price_unit || 0)),
          taxCode: taxCodeFromRate(Number(line.tax_rate || 0), Boolean(header.sin_cred)),
          conceptId: line.concept_id || "",
        })),
      }
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Documentos"
        title={initialDraft ? "Continuar borrador" : "Nueva factura"}
        description={
          initialDraft
            ? "Borrador: aún no está en libros. Registrar factura confirma el documento."
            : "Compra o venta con control, IVA, ISLR y tasa del día. Si sales, queda en borrador."
        }
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
          initialDraft={initialDraft}
        />
      </SectionCard>
    </div>
  );
}
