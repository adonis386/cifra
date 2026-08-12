import Link from "next/link";
import { ManualEntryForm } from "@/components/entries/manual-entry-form";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  Td,
  Th,
  Badge,
} from "@/components/layout";

export default async function EntriesPage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Asientos" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: accounts }, { data: journals }, { data: partners }, { data: moves }] =
    await Promise.all([
      supabase
        .from("account_accounts")
        .select("id, code, name")
        .eq("company_id", company.id)
        .eq("active", true)
        .order("code"),
      supabase
        .from("account_journals")
        .select("id, code, name, journal_type")
        .eq("company_id", company.id)
        .order("code"),
      supabase.from("partners").select("id, name, rif").eq("company_id", company.id).order("name"),
      supabase
        .from("account_moves")
        .select(
          "id, name, move_date, ref, state, notes, journal_id, partners(name), account_journals(code, name)",
        )
        .eq("company_id", company.id)
        .order("move_date", { ascending: false })
        .limit(80),
    ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Libro"
        title="Asientos"
        description="Partida doble de Cifra: lo que genera facturas/pagos y los ajustes manuales. Sin jerga de ‘apuntes’."
      />

      <SectionCard
        title="Nuevo asiento manual"
        description="Para apertura, reclasificación o ajuste. Debe cuadrar débito = crédito."
      >
        <ManualEntryForm
          accounts={accounts || []}
          journals={journals || []}
          partners={partners || []}
        />
      </SectionCard>

      <SectionCard title="Libro de asientos">
        {(moves || []).length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Número</Th>
                <Th>Origen</Th>
                <Th>Tercero</Th>
                <Th>Ref</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {(moves || []).map((m) => {
                const partner = m.partners as unknown as
                  | { name: string }
                  | { name: string }[]
                  | null;
                const p = Array.isArray(partner) ? partner[0] : partner;
                const journal = m.account_journals as unknown as
                  | { code: string; name: string }
                  | { code: string; name: string }[]
                  | null;
                const j = Array.isArray(journal) ? journal[0] : journal;
                return (
                  <tr key={m.id}>
                    <Td className="whitespace-nowrap">{m.move_date}</Td>
                    <Td className="font-mono text-xs">{m.name}</Td>
                    <Td className="text-xs">
                      {j ? `${j.code}` : "—"}
                    </Td>
                    <Td>{p?.name || "—"}</Td>
                    <Td className="max-w-[180px] truncate text-xs text-[var(--color-muted-foreground)]">
                      {m.ref || m.notes || "—"}
                    </Td>
                    <Td>
                      <Badge tone={m.state === "posted" || m.state === "confirmed" || m.state === "done" ? "success" : "primary"}>
                        {m.state}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState
            title="Sin asientos"
            description="Registra facturas o publica un asiento manual."
          />
        )}
      </SectionCard>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        El mayor por cuenta está en{" "}
        <Link href="/app/ledger" className="font-semibold text-[var(--color-primary)] underline">
          Mayor
        </Link>
        .
      </p>
    </div>
  );
}
