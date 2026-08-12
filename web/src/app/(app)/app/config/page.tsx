import Link from "next/link";
import { ConfigForms } from "@/components/config/config-forms";
import { getActiveCompany } from "@/lib/company";
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
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: units }, { data: concepts }] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Sistema"
        title="Configuración fiscal"
        description="Unidad tributaria y catálogo ISLR (conceptos/tarifas de l10n_ve_full)."
      />

      <SectionCard
        title="Parámetros"
        description="Actualiza UT y copia el catálogo global a tu empresa."
      >
        <ConfigForms />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
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
                    <Td className="text-right font-mono text-xs">{Number(u.amount).toFixed(4)}</Td>
                    <Td>{u.company_id ? "Empresa" : "Global"}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <EmptyState title="Sin UT" description="Ejecuta la migración 04 o crea una UT." />
          )}
        </SectionCard>

        <SectionCard title="Conceptos ISLR">
          {(concepts || []).length ? (
            <DataTable>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Nombre</Th>
                  <Th>Ámbito</Th>
                </tr>
              </thead>
              <tbody>
                {(concepts || []).map((c) => (
                  <tr key={c.id}>
                    <Td className="font-mono text-xs">{c.code}</Td>
                    <Td className="max-w-[240px] truncate">{c.name}</Td>
                    <Td>{c.company_id ? "Empresa" : "Global"}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <EmptyState title="Sin conceptos" description="Corre SQL 04 y luego clona el catálogo." />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
