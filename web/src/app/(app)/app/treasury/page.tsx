import Link from "next/link";
import {
  StatementCreateForm,
  StatementLineForm,
} from "@/components/treasury/statement-forms";
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

export default async function TreasuryPage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Caja y bancos" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: journals }, { data: moveLines }, rate, statementsRes] =
    await Promise.all([
      supabase
        .from("account_journals")
        .select("id, code, name, journal_type, default_account_id")
        .eq("company_id", company.id)
        .in("journal_type", ["bank", "cash"])
        .order("code"),
      supabase
        .from("account_move_lines")
        .select("account_id, debit, credit")
        .eq("company_id", company.id),
      getExchangeRate(company.id, today),
      supabase
        .from("bank_statements")
        .select(
          "id, name, statement_date, balance_start, balance_end, state, journal_id, account_journals(code, name), bank_statement_lines(id, line_date, amount, payment_ref, partner_name, is_reconciled)",
        )
        .eq("company_id", company.id)
        .order("statement_date", { ascending: false })
        .limit(20),
    ]);

  const statements = statementsRes.error ? [] : statementsRes.data || [];
  const migrationNeeded = Boolean(
    statementsRes.error &&
      /bank_statements|schema cache|relation/i.test(statementsRes.error.message),
  );

  const bal = new Map<string, number>();
  for (const l of moveLines || []) {
    bal.set(
      l.account_id,
      (bal.get(l.account_id) || 0) + Number(l.debit) - Number(l.credit),
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Libro"
        title="Caja y bancos"
        description="Tesorería Cifra: saldos reales + extractos para conciliar. No es el tablero de diarios de Odoo."
        actions={
          <Link
            href="/app/payments"
            className="text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
          >
            Registrar cobro/pago
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(journals || []).map((j) => {
          const balance = j.default_account_id
            ? bal.get(j.default_account_id) || 0
            : 0;
          return (
            <SectionCard key={j.id} title={`${j.code} · ${j.name}`}>
              <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                {j.journal_type === "cash" ? "Caja" : "Banco"} · balance libro
              </p>
              <p
                className={`mt-2 font-mono text-xl font-semibold ${
                  balance < 0 ? "text-[var(--color-destructive)]" : ""
                }`}
              >
                {rate ? formatDual(balance, rate) : `${formatMoney(balance)} Bs`}
              </p>
            </SectionCard>
          );
        })}
        {!journals?.length && (
          <EmptyState
            title="Sin caja/banco"
            description="Regenera el plan VE en Libro → Plan."
          />
        )}
      </div>

      <SectionCard
        title="Nuevo extracto"
        description="Carga el corte del banco o arqueo de caja para ir conciliando."
      >
        {migrationNeeded ? (
          <p className="text-sm text-[var(--color-destructive)]">
            Aplica la migración{" "}
            <code>20260812000009_cifra_libro.sql</code> en Supabase para activar
            extractos.
          </p>
        ) : (
          <StatementCreateForm journals={journals || []} initialRate={rate || 0} />
        )}
      </SectionCard>

      <SectionCard title="Extractos">
        {statements.length ? (
          <div className="space-y-6">
            {statements.map((st) => {
              const journal = st.account_journals as unknown as
                | { code: string; name: string }
                | { code: string; name: string }[]
                | null;
              const j = Array.isArray(journal) ? journal[0] : journal;
              const lines = (st.bank_statement_lines || []) as Array<{
                id: string;
                line_date: string;
                amount: number;
                payment_ref: string | null;
                partner_name: string | null;
                is_reconciled: boolean;
              }>;
              const sumLines = lines.reduce((s, l) => s + Number(l.amount), 0);
              return (
                <div
                  key={st.id}
                  className="rounded-[14px] border border-[var(--color-border)] p-4"
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{st.name}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {j ? `${j.code} · ${j.name}` : "—"} · {st.statement_date}
                      </p>
                    </div>
                    <Badge>{st.state}</Badge>
                  </div>
                  <div className="mb-4 grid gap-2 sm:grid-cols-3 text-sm">
                    <p>
                      Inicial:{" "}
                      <span className="font-mono">{formatMoney(st.balance_start)}</span>
                    </p>
                    <p>
                      Líneas:{" "}
                      <span className="font-mono">{formatMoney(sumLines)}</span>
                    </p>
                    <p>
                      Final extracto:{" "}
                      <span className="font-mono">{formatMoney(st.balance_end)}</span>
                    </p>
                  </div>

                  {lines.length ? (
                    <DataTable>
                      <thead>
                        <tr>
                          <Th>Fecha</Th>
                          <Th>Ref</Th>
                          <Th>Tercero</Th>
                          <Th className="text-right">Monto</Th>
                          <Th>Conciliado</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => (
                          <tr key={l.id}>
                            <Td>{l.line_date}</Td>
                            <Td className="text-xs">{l.payment_ref || "—"}</Td>
                            <Td>{l.partner_name || "—"}</Td>
                            <Td className="text-right font-mono text-xs">
                              {formatMoney(l.amount)}
                            </Td>
                            <Td>{l.is_reconciled ? "Sí" : "No"}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  ) : (
                    <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">
                      Sin líneas todavía.
                    </p>
                  )}

                  <div className="mt-4">
                    <StatementLineForm statementId={st.id} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="Sin extractos"
            description={
              migrationNeeded
                ? "Falta la migración 09."
                : "Crea el primer extracto arriba."
            }
          />
        )}
      </SectionCard>
    </div>
  );
}
