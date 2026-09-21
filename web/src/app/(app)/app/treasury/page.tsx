import Link from "next/link";
import {
  LiquidityJournalForm,
  ReconcileLineForm,
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
  liquiditySignedAmount,
  suggestLiquidityMatches,
} from "@/domain/accounting/reconcile.service";
import { monthBounds } from "@/domain/accounting/period";
import { AccountingRepository } from "@/repositories/accounting.repository";
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
  const bounds = monthBounds(today.slice(0, 7));
  const repo = new AccountingRepository(supabase);

  const [{ data: journals }, { data: moveLines }, rate, statementsRes, paymentsRes, unmatchedLiquidity, openExtract] =
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
      supabase
        .from("payments")
        .select("id, payment_date, amount, payment_type, reference, partners(name)")
        .eq("company_id", company.id)
        .order("payment_date", { ascending: false })
        .limit(80),
      repo.listUnmatchedLiquidityLines({ companyId: company.id }),
      repo.listOpenStatementLines(company.id),
    ]);

  const statements = statementsRes.error ? [] : statementsRes.data || [];
  const migrationNeeded = Boolean(
    statementsRes.error &&
      /bank_statements|schema cache|relation/i.test(statementsRes.error.message),
  );
  const payments = (paymentsRes.data || []).map((p) => {
    const partner = p.partners as unknown as
      | { name: string }
      | { name: string }[]
      | null;
    const name = Array.isArray(partner) ? partner[0]?.name : partner?.name;
    return {
      id: p.id,
      payment_date: p.payment_date,
      amount: Number(p.amount || 0),
      payment_type: p.payment_type,
      reference: p.reference,
      partner_name: name || "—",
    };
  });

  const bal = new Map<string, number>();
  for (const l of moveLines || []) {
    bal.set(
      l.account_id,
      (bal.get(l.account_id) || 0) + Number(l.debit) - Number(l.credit),
    );
  }

  const liquidityOptions = unmatchedLiquidity.map((l) => ({
    id: l.id,
    debit: l.debit,
    credit: l.credit,
    move_date: l.move_date,
    journal_id: l.journal_id,
    amount: liquiditySignedAmount(l.debit, l.credit),
    label: `${l.move_date} · ${l.move_name || "Asiento"} · ${formatMoney(liquiditySignedAmount(l.debit, l.credit))} · ${l.account_code}`,
  }));

  const periodLiquidity = unmatchedLiquidity.filter((l) => {
    if (!bounds) return true;
    return l.move_date >= bounds.start && l.move_date <= bounds.end;
  });
  const periodExtract = openExtract.filter((l) => {
    if (!bounds) return true;
    return l.line_date >= bounds.start && l.line_date <= bounds.end;
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Libro"
        title="Caja y bancos"
        description="Saldos de caja y banco, y cruce del extracto con las líneas de liquidez."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LiquidityJournalForm />
            {!migrationNeeded ? (
              <StatementCreateForm journals={journals || []} initialRate={rate || 0} />
            ) : null}
            <Link
              href="/app/payments"
              className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
            >
              Registrar cobro/pago
            </Link>
          </div>
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
            description="Usa Agregar banco o caja arriba."
          />
        )}
      </div>

      <SectionCard
        title="Sin conciliar"
        description={`Extracto vs movimientos de caja/banco${bounds ? ` · ${bounds.name}` : ""}.`}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Extracto ({periodExtract.length})
            </p>
            {periodExtract.length ? (
              <DataTable>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Corte</Th>
                    <Th className="text-right">Monto</Th>
                    <Th>Cruce</Th>
                  </tr>
                </thead>
                <tbody>
                  {periodExtract.map((l) => {
                    const matches = suggestLiquidityMatches(
                      {
                        amount: l.amount,
                        line_date: l.line_date,
                        journal_id: l.journal_id,
                      },
                      liquidityOptions,
                    ).map((m) => ({
                      id: m.id,
                      move_date: m.move_date,
                      amount: liquiditySignedAmount(m.debit, m.credit),
                      label: liquidityOptions.find((o) => o.id === m.id)?.label || m.id,
                    }));
                    return (
                      <tr key={l.id}>
                        <Td>{l.line_date}</Td>
                        <Td className="text-xs">{l.statement_name || "—"}</Td>
                        <Td className="text-right font-mono text-xs">
                          {formatMoney(l.amount)}
                        </Td>
                        <Td>
                          <ReconcileLineForm lineId={l.id} matches={matches} />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            ) : (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                No hay líneas de extracto pendientes.
              </p>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Caja / banco ({periodLiquidity.length})
            </p>
            {periodLiquidity.length ? (
              <DataTable>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Asiento</Th>
                    <Th className="text-right">Monto</Th>
                  </tr>
                </thead>
                <tbody>
                  {periodLiquidity.map((l) => (
                    <tr key={l.id}>
                      <Td>{l.move_date || "—"}</Td>
                      <Td>
                        <Link
                          href={`/app/entries/${l.move_id}`}
                          className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
                        >
                          {l.move_name || "Asiento"}
                        </Link>
                        <div className="text-[11px] text-[var(--color-muted-foreground)]">
                          {l.account_code} · {l.name || l.account_name}
                        </div>
                      </Td>
                      <Td className="text-right font-mono text-xs">
                        {formatMoney(liquiditySignedAmount(l.debit, l.credit))}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                No hay movimientos de caja/banco pendientes de cruce.
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Conciliaciones">
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
                  className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-4"
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{st.name}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {j ? `${j.code} · ${j.name}` : "—"} · {st.statement_date}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{st.state}</Badge>
                      <StatementLineForm statementId={st.id} payments={payments} />
                    </div>
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
                      Final del banco:{" "}
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
                            <Td>
                              {l.is_reconciled ? (
                                "Sí"
                              ) : (
                                <ReconcileLineForm
                                  lineId={l.id}
                                  matches={suggestLiquidityMatches(
                                    {
                                      amount: Number(l.amount),
                                      line_date: l.line_date,
                                      journal_id: st.journal_id,
                                    },
                                    liquidityOptions,
                                  ).map((m) => ({
                                    id: m.id,
                                    move_date: m.move_date,
                                    amount: liquiditySignedAmount(m.debit, m.credit),
                                    label:
                                      liquidityOptions.find((o) => o.id === m.id)?.label ||
                                      m.id,
                                  }))}
                                />
                              )}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  ) : (
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      Sin líneas todavía.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="Sin conciliaciones"
            description={
              migrationNeeded
                ? "No hay cortes en esta empresa."
                : "Crea el primer corte arriba."
            }
          />
        )}
      </SectionCard>
    </div>
  );
}
