import Link from "next/link";
import { ensureCompanyAccountingForm } from "@/lib/actions/accounting";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui";
import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  Td,
  Th,
} from "@/components/layout";

export default async function AccountsPage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Plan de cuentas" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: accounts }, { data: journals }, { data: moves }] = await Promise.all([
    supabase
      .from("account_accounts")
      .select("id, code, name, account_type, reconcile, active")
      .eq("company_id", company.id)
      .order("code"),
    supabase
      .from("account_journals")
      .select("id, code, name, journal_type")
      .eq("company_id", company.id)
      .order("code"),
    supabase
      .from("account_moves")
      .select("id, name, move_date, ref, state, partners(name)")
      .eq("company_id", company.id)
      .order("move_date", { ascending: false })
      .limit(30),
  ]);

  // Trial balance lite: sum debit/credit per account
  const { data: lines } = await supabase
    .from("account_move_lines")
    .select("account_id, debit, credit, account_accounts(code, name)")
    .eq("company_id", company.id);

  const tb = new Map<string, { code: string; name: string; debit: number; credit: number }>();
  for (const l of lines || []) {
    const acc = l.account_accounts as unknown as
      | { code: string; name: string }
      | { code: string; name: string }[]
      | null;
    const a = Array.isArray(acc) ? acc[0] : acc;
    if (!a) continue;
    const cur = tb.get(l.account_id) || { code: a.code, name: a.name, debit: 0, credit: 0 };
    cur.debit += Number(l.debit);
    cur.credit += Number(l.credit);
    tb.set(l.account_id, cur);
  }
  const trial = Array.from(tb.values()).sort((x, y) => x.code.localeCompare(y.code));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Libro"
        title="Plan de cuentas"
        description="Catálogo VE de Cifra (activo, pasivo, ingreso, gasto) y orígenes de asiento. El balance de comprobación vive aquí."
        actions={
          <form action={ensureCompanyAccountingForm}>
            <Button type="submit" variant="secondary">
              Regenerar plan VE
            </Button>
          </form>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Cuentas">
          {(accounts || []).length ? (
            <DataTable>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Nombre</Th>
                  <Th>Tipo</Th>
                </tr>
              </thead>
              <tbody>
                {(accounts || []).map((a) => (
                  <tr key={a.id}>
                    <Td className="font-mono text-xs">{a.code}</Td>
                    <Td>{a.name}</Td>
                    <Td className="text-xs text-[var(--color-muted-foreground)]">{a.account_type}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <EmptyState
              title="Sin plan de cuentas"
              description="Ejecuta la migración 07 o pulsa Regenerar plan VE."
            />
          )}
        </SectionCard>

        <SectionCard title="Orígenes">
          {(journals || []).length ? (
            <DataTable>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Nombre</Th>
                  <Th>Tipo</Th>
                </tr>
              </thead>
              <tbody>
                {(journals || []).map((j) => (
                  <tr key={j.id}>
                    <Td className="font-mono text-xs">{j.code}</Td>
                    <Td>{j.name}</Td>
                    <Td>{j.journal_type}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <EmptyState title="Sin diarios" />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Balance de comprobación">
        {trial.length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Cuenta</Th>
                <Th className="text-right">Débito</Th>
                <Th className="text-right">Crédito</Th>
                <Th className="text-right">Saldo</Th>
              </tr>
            </thead>
            <tbody>
              {trial.map((t) => (
                <tr key={t.code}>
                  <Td>
                    <span className="font-mono text-xs">{t.code}</span> {t.name}
                  </Td>
                  <Td className="text-right font-mono text-xs">{formatMoney(t.debit)}</Td>
                  <Td className="text-right font-mono text-xs">{formatMoney(t.credit)}</Td>
                  <Td className="text-right font-mono text-xs font-semibold">
                    {formatMoney(t.debit - t.credit)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState title="Sin movimientos" description="Al registrar facturas se generan asientos." />
        )}
      </SectionCard>

      <SectionCard title="Últimos asientos" description="Ver el libro completo en Asientos.">
        {(moves || []).length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Asiento</Th>
                <Th>Tercero</Th>
                <Th>Ref</Th>
              </tr>
            </thead>
            <tbody>
              {(moves || []).map((m) => {
                const partner = m.partners as unknown as
                  | { name: string }
                  | { name: string }[]
                  | null;
                const p = Array.isArray(partner) ? partner[0] : partner;
                return (
                  <tr key={m.id}>
                    <Td>{m.move_date}</Td>
                    <Td className="font-mono text-xs">{m.name}</Td>
                    <Td>{p?.name || "—"}</Td>
                    <Td className="text-xs">{m.ref || "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState title="Sin asientos" />
        )}
      </SectionCard>
    </div>
  );
}
