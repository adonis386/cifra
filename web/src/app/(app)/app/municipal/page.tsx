import Link from "next/link";
import { MunicipalForms } from "@/components/municipal/municipal-forms";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  Td,
  Th,
} from "@/components/layout";

export default async function MunicipalPage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Retención municipal" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: partners }, { data: rows }] = await Promise.all([
    supabase.from("partners").select("id, name, rif").eq("company_id", company.id).order("name"),
    supabase
      .from("withholding_municipal")
      .select(
        "id, voucher_number, period, voucher_date, activity_code, rate, amount_base, amount_withheld, partners(name, rif)",
      )
      .eq("company_id", company.id)
      .order("voucher_date", { ascending: false }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Alcaldía"
        title="Retención municipal"
        description="Comprobantes y TXT municipal."
      />
      <SectionCard title="Operaciones">
        <MunicipalForms partners={partners || []} />
      </SectionCard>
      <SectionCard title="Comprobantes">
        {(rows || []).length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Comprobante</Th>
                <Th>Período</Th>
                <Th>Sujeto</Th>
                <Th>Actividad</Th>
                <Th className="text-right">Base</Th>
                <Th className="text-right">%</Th>
                <Th className="text-right">Retenido</Th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((r) => {
                const partner = r.partners as unknown as
                  | { name: string; rif: string }
                  | { name: string; rif: string }[]
                  | null;
                const p = Array.isArray(partner) ? partner[0] : partner;
                return (
                  <tr key={r.id}>
                    <Td className="font-mono text-xs">{r.voucher_number}</Td>
                    <Td className="font-mono text-xs">{r.period}</Td>
                    <Td>
                      <div className="font-medium">{p?.name}</div>
                      <div className="font-mono text-xs text-[var(--color-muted-foreground)]">{p?.rif}</div>
                    </Td>
                    <Td>{r.activity_code || "—"}</Td>
                    <Td className="text-right font-mono text-xs">{formatMoney(r.amount_base)}</Td>
                    <Td className="text-right font-mono text-xs">{Number(r.rate).toFixed(2)}</Td>
                    <Td className="text-right font-mono text-xs font-semibold">
                      {formatMoney(r.amount_withheld)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState title="Sin retenciones municipales" />
        )}
      </SectionCard>
    </div>
  );
}
