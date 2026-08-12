import Link from "next/link";
import { ReportExportActions } from "@/components/report-export-actions";
import { formatDual, formatMoney, getActiveCompany, getExchangeRate } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  Td,
  Th,
} from "@/components/layout";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; from?: string; to?: string }>;
}) {
  const company = await getActiveCompany();
  const params = await searchParams;
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mayor" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from || `${today.slice(0, 8)}01`;
  const to = params.to || today;

  const [{ data: accounts }, rate] = await Promise.all([
    supabase
      .from("account_accounts")
      .select("id, code, name, account_type")
      .eq("company_id", company.id)
      .order("code"),
    getExchangeRate(company.id, today),
  ]);

  const accountId = params.account || accounts?.[0]?.id || "";
  const selected = (accounts || []).find((a) => a.id === accountId);

  let lines: Array<{
    id: string;
    move_date: string;
    move_name: string;
    name: string | null;
    debit: number;
    credit: number;
    partner: string;
  }> = [];

  if (accountId) {
    const { data } = await supabase
      .from("account_move_lines")
      .select(
        "id, name, debit, credit, partners(name), account_moves!inner(move_date, name, state)",
      )
      .eq("company_id", company.id)
      .eq("account_id", accountId)
      .gte("account_moves.move_date", from)
      .lte("account_moves.move_date", to)
      .order("created_at", { ascending: true })
      .limit(500);

    lines = (data || []).map((l) => {
      const move = l.account_moves as unknown as
        | { move_date: string; name: string }
        | { move_date: string; name: string }[]
        | null;
      const m = Array.isArray(move) ? move[0] : move;
      const partner = l.partners as unknown as
        | { name: string }
        | { name: string }[]
        | null;
      const p = Array.isArray(partner) ? partner[0] : partner;
      return {
        id: l.id,
        move_date: m?.move_date || "",
        move_name: m?.name || "",
        name: l.name,
        debit: Number(l.debit),
        credit: Number(l.credit),
        partner: p?.name || "—",
      };
    });
    lines.sort((a, b) => a.move_date.localeCompare(b.move_date));
  }

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const rowsWithBalance = lines.reduce<
    Array<(typeof lines)[number] & { balance: number }>
  >((acc, row) => {
    const prev = acc.length ? acc[acc.length - 1].balance : 0;
    acc.push({ ...row, balance: prev + row.debit - row.credit });
    return acc;
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Libro"
        title="Mayor"
        description="Movimientos por cuenta contable, con saldo corrido y dual $ / Bs cuando hay tasa BCV."
        actions={
          accountId ? (
            <ReportExportActions
              pdfHref={`/print/ledger?account=${accountId}&from=${from}&to=${to}`}
              xlsxHref={`/api/export/ledger?account=${accountId}&from=${from}&to=${to}`}
            />
          ) : undefined
        }
      />

      <SectionCard title="Filtros">
        <form className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium" htmlFor="account">
              Cuenta
            </label>
            <select
              id="account"
              name="account"
              defaultValue={accountId}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3.5 py-3 text-sm"
            >
              {(accounts || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="from">
              Desde
            </label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={from}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3.5 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="to">
              Hasta
            </label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={to}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3.5 py-3 text-sm"
            />
          </div>
          <div className="md:col-span-4">
            <button
              type="submit"
              className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Ver mayor
            </button>
          </div>
        </form>
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-3">
        <SectionCard>
          <p className="text-xs text-[var(--color-muted-foreground)]">Débitos</p>
          <p className="mt-1 font-mono text-lg font-semibold">
            {rate ? formatDual(totalDebit, rate) : formatMoney(totalDebit)}
          </p>
        </SectionCard>
        <SectionCard>
          <p className="text-xs text-[var(--color-muted-foreground)]">Créditos</p>
          <p className="mt-1 font-mono text-lg font-semibold">
            {rate ? formatDual(totalCredit, rate) : formatMoney(totalCredit)}
          </p>
        </SectionCard>
        <SectionCard>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Saldo {selected ? `(${selected.code})` : ""}
          </p>
          <p className="mt-1 font-mono text-lg font-semibold">
            {rate
              ? formatDual(totalDebit - totalCredit, rate)
              : formatMoney(totalDebit - totalCredit)}
          </p>
        </SectionCard>
      </div>

      <SectionCard
        title={selected ? `${selected.code} — ${selected.name}` : "Movimientos"}
        description="Orden cronológico del período."
      >
        {lines.length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Asiento</Th>
                <Th>Detalle</Th>
                <Th>Tercero</Th>
                <Th className="text-right">Débito</Th>
                <Th className="text-right">Crédito</Th>
                <Th className="text-right">Saldo</Th>
              </tr>
            </thead>
            <tbody>
              {rowsWithBalance.map((row) => (
                  <tr key={row.id}>
                    <Td>{row.move_date}</Td>
                    <Td className="font-mono text-xs">{row.move_name}</Td>
                    <Td>{row.name || "—"}</Td>
                    <Td className="text-xs">{row.partner}</Td>
                    <Td className="text-right font-mono text-xs">{formatMoney(row.debit)}</Td>
                    <Td className="text-right font-mono text-xs">{formatMoney(row.credit)}</Td>
                    <Td className="text-right font-mono text-xs font-semibold">
                      {formatMoney(row.balance)}
                    </Td>
                  </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState title="Sin movimientos en el período" />
        )}
      </SectionCard>
    </div>
  );
}
