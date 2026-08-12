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
    { data: concepts },
    { data: rates },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, amount_retained_iva, amount_untaxed, partners(name, rif)")
      .eq("company_id", company.id)
      .order("invoice_date", { ascending: false }),
    supabase
      .from("withholding_iva")
      .select("id, voucher_number, period, voucher_date, amount_withheld, state, partners(name, rif)")
      .eq("company_id", company.id)
      .order("voucher_date", { ascending: false }),
    supabase
      .from("withholding_islr")
      .select("id, voucher_number, period, voucher_date, amount_withheld, state, partners(name, rif)")
      .eq("company_id", company.id)
      .order("voucher_date", { ascending: false }),
    supabase
      .from("islr_concepts")
      .select("id, code, name, company_id")
      .or(`company_id.eq.${company.id},company_id.is.null`)
      .order("code"),
    supabase
      .from("islr_rates")
      .select("id, concept_id, person_type, rate")
      .eq("active", true),
  ]);

  const owned = (concepts || []).filter((c) => c.company_id === company.id);
  const pool = owned.length ? owned : concepts || [];
  const companyConcepts = pool
    .filter((c) => c.code !== "000")
    .map(({ id, code, name }) => ({ id, code, name }));
  const conceptIds = new Set(companyConcepts.map((c) => c.id));
  const filteredRates = (rates || []).map((r) => ({ ...r, code: null as string | null })).filter((r) => conceptIds.has(r.concept_id));

  const invoiceOptions = (invoices || []).map((inv) => {
    const partner = inv.partners as unknown as
      | { name: string; rif: string }
      | { name: string; rif: string }[]
      | null;
    const p = Array.isArray(partner) ? partner[0] : partner;
    return {
      id: inv.id,
      label: `${inv.invoice_date} · ${inv.invoice_number} · ${p?.name || ""} · Base ${formatMoney(inv.amount_untaxed)} · RetIVA ${formatMoney(inv.amount_retained_iva)}`,
    };
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="SENIAT"
        title="Retenciones"
        description="IVA (TXT 99035) e ISLR (XML RelacionRetencionesISLR), con lógica de l10n_ve_full."
      />

      <SectionCard title="Operaciones" description="Crea comprobantes y exporta archivos oficiales.">
        <WithholdingHub
          invoices={invoiceOptions}
          concepts={companyConcepts}
          rates={filteredRates}
        />
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
                        <Link
                          href={`/print/iva/${w.id}`}
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
            <EmptyState title="Sin comprobantes ISLR" description="Clona el catálogo en Configuración si falta." />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
