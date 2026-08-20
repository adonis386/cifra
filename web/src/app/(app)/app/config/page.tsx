import Link from "next/link";
import { BrandingForm } from "@/components/config/branding-form";
import { ConfigForms } from "@/components/config/config-forms";
import { SequenceConfigForm } from "@/components/config/sequence-config-form";
import { PeriodCloseForm } from "@/components/config/period-close-form";
import { getCompanyPrintProfile } from "@/lib/company-print";
import {
  formatMoney,
  getActiveCompany,
  getExchangeRate,
  getActiveTaxUnit,
} from "@/lib/company";
import { listCompanySequences } from "@/lib/actions/sequences";
import { listAccountingPeriods } from "@/lib/actions/periods";
import { createClient } from "@/lib/supabase/server";
import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  Td,
  Th,
} from "@/components/layout";

export default async function ConfigPage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Configuración" />
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
  const [branding, { data: units }, { data: concepts }, { data: rates }, rateToday, sequences, utAmount, periods] =
    await Promise.all([
      getCompanyPrintProfile(company.id),
      supabase
        .from("tax_units")
        .select("id, name, amount, date_from, company_id")
        .or(`company_id.eq.${company.id},company_id.is.null`)
        .order("date_from", { ascending: false }),
      supabase
        .from("islr_concepts")
        .select("id, code, name, company_id")
        .or(`company_id.eq.${company.id},company_id.is.null`)
        .order("code")
        .limit(30),
      supabase
        .from("exchange_rates")
        .select("id, rate_date, rate, source, company_id")
        .or(`company_id.eq.${company.id},company_id.is.null`)
        .order("rate_date", { ascending: false })
        .limit(12),
      getExchangeRate(company.id, today),
      listCompanySequences(),
      getActiveTaxUnit(company.id, today),
      listAccountingPeriods(),
    ]);

  const latest =
    rates?.[0] && rates[0].company_id === company.id
      ? {
          rate: Number(rates[0].rate),
          rate_date: rates[0].rate_date,
          source: String(rates[0].source || ""),
        }
      : rateToday
        ? { rate: rateToday, rate_date: today, source: "vigente" }
        : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Sistema"
        title="Configuración"
        description="Membrete PDF, correlativos, tasa BCV, UT, cierre de mes y catálogo de líneas."
      />

      <SectionCard
        title="Libro"
        description="Pantallas que no están en el menú diario."
      >
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
          <Link href="/app/accounts" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            Cuentas
          </Link>
          <Link href="/app/ledger" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            Mayor
          </Link>
          <Link href="/app/statements" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            Estado de cuenta
          </Link>
          <Link href="/app/audit" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            Auditoría
          </Link>
          <Link href="/app/reports" className="text-[var(--color-primary)] underline-offset-4 hover:underline">
            Reportes
          </Link>
        </div>
      </SectionCard>

      <SectionCard
        title="Empresa y membrete"
        description="Nombre, correo, logo y pie en facturas y reportes PDF."
      >
        {branding ? (
          <BrandingForm company={branding} />
        ) : (
          <EmptyState title="Sin datos de empresa" />
        )}
      </SectionCard>

      <SectionCard
        title="Catálogo de líneas"
        description="Nombres y precios para cargar facturas más rápido. No es inventario ni stock."
      >
        <Link
          href="/app/products"
          className="text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
        >
          Abrir catálogo
        </Link>
      </SectionCard>

      <SectionCard
        title="Correlativos de comprobantes"
        description="Aquí se configura la numeración de retenciones IVA/ISLR y el N° de control."
      >
        <SequenceConfigForm sequences={sequences} />
      </SectionCard>

      <SectionCard
        title="Cierre de período"
        description="Bloquea facturas, pagos y asientos en un mes ya declarado."
      >
        <PeriodCloseForm periods={periods} />
      </SectionCard>

      <SectionCard
        title="Parámetros fiscales"
        description="Tasa BCV automática, UT y catálogo ISLR."
      >
        <ConfigForms
          latestRate={latest}
          currentUt={
            utAmount > 0
              ? { amount: utAmount, date_from: today }
              : null
          }
        />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Historial de tasas">
          {(rates || []).length ? (
            <DataTable>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th className="text-right">Bs/USD</Th>
                  <Th>Ámbito</Th>
                </tr>
              </thead>
              <tbody>
                {(rates || []).map((r) => (
                  <tr key={r.id}>
                    <Td>{r.rate_date}</Td>
                    <Td className="text-right font-mono text-xs">
                      {formatMoney(r.rate)}
                    </Td>
                    <Td>{r.company_id ? "Empresa" : "Global"}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <EmptyState
              title="Sin tasas"
              description="Registra la tasa del día (BCV) arriba."
            />
          )}
        </SectionCard>

        <SectionCard title="Unidades tributarias">
          {(units || []).length ? (
            <DataTable>
              <thead>
                <tr>
                  <Th>Nombre</Th>
                  <Th>Desde</Th>
                  <Th className="text-right">Monto</Th>
                  <Th>Ámbito</Th>
                </tr>
              </thead>
              <tbody>
                {(units || []).map((u) => (
                  <tr key={u.id}>
                    <Td>{u.name}</Td>
                    <Td>{u.date_from}</Td>
                    <Td className="text-right font-mono text-xs">
                      {Number(u.amount).toFixed(2)}
                    </Td>
                    <Td>{u.company_id ? "Empresa" : "Global"}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <EmptyState
              title="Sin UT"
              description="Crea una unidad tributaria si no aparece."
            />
          )}
        </SectionCard>

        <SectionCard title="Conceptos ISLR">
          {(concepts || []).length ? (
            <DataTable>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Nombre</Th>
                </tr>
              </thead>
              <tbody>
                {(concepts || []).map((c) => (
                  <tr key={c.id}>
                    <Td className="font-mono text-xs">{c.code}</Td>
                    <Td className="max-w-[180px] truncate">{c.name}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <EmptyState
              title="Sin conceptos"
              description="Corre SQL 04 y luego clona el catálogo."
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
