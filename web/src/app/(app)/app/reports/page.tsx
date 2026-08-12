import Link from "next/link";
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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string }>;
}) {
  const company = await getActiveCompany();
  const params = await searchParams;
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reportes" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: partners }, { count: openAr }, { count: openAp }, { data: recentPayments }] =
    await Promise.all([
      supabase.from("partners").select("id, name, rif").eq("company_id", company.id).order("name"),
      supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company.id)
        .in("move_type", ["out_invoice", "out_refund"])
        .gt("amount_residual", 0),
      supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company.id)
        .in("move_type", ["in_invoice", "in_refund"])
        .gt("amount_residual", 0),
      supabase
        .from("payments")
        .select("payment_date, payment_type, amount")
        .eq("company_id", company.id)
        .order("payment_date", { ascending: false })
        .limit(12),
    ]);

  const partnerId = params.partner || partners?.[0]?.id || "";
  let ledger: Array<{
    move_date: string;
    name: string | null;
    debit: number;
    credit: number;
    move: string;
  }> = [];

  if (partnerId) {
    const { data: lines } = await supabase
      .from("account_move_lines")
      .select("name, debit, credit, account_moves(move_date, name)")
      .eq("company_id", company.id)
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: true })
      .limit(100);

    ledger = (lines || []).map((l) => {
      const move = l.account_moves as unknown as
        | { move_date: string; name: string }
        | { move_date: string; name: string }[]
        | null;
      const m = Array.isArray(move) ? move[0] : move;
      return {
        move_date: m?.move_date || "",
        name: l.name,
        debit: Number(l.debit),
        credit: Number(l.credit),
        move: m?.name || "",
      };
    });
  }

  let running = 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Contabilidad"
        title="Reportes"
        description="Resumen CxC/CxP y libro auxiliar de tercero (partner ledger)."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SectionCard title="Facturas CxC abiertas">
          <p className="text-3xl font-bold text-[var(--color-primary)]">{openAr ?? 0}</p>
          <Link href="/app/receivables" className="mt-2 inline-block text-sm font-semibold text-[var(--color-primary)] underline">
            Ver aging
          </Link>
        </SectionCard>
        <SectionCard title="Facturas CxP abiertas">
          <p className="text-3xl font-bold text-[var(--color-primary)]">{openAp ?? 0}</p>
          <Link href="/app/payables" className="mt-2 inline-block text-sm font-semibold text-[var(--color-primary)] underline">
            Ver aging
          </Link>
        </SectionCard>
        <SectionCard title="Pagos recientes">
          <p className="text-3xl font-bold text-[var(--color-primary)]">{recentPayments?.length ?? 0}</p>
          <Link href="/app/payments" className="mt-2 inline-block text-sm font-semibold text-[var(--color-primary)] underline">
            Ir a pagos
          </Link>
        </SectionCard>
      </div>

      <SectionCard title="Libro auxiliar de tercero" description="Movimientos contables del partner seleccionado.">
        <form className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="mb-1.5 block text-sm font-medium" htmlFor="partner">
              Tercero
            </label>
            <select
              id="partner"
              name="partner"
              defaultValue={partnerId}
              className="w-full rounded-[14px] border border-[var(--color-border)] bg-white px-3.5 py-3 text-sm"
            >
              {(partners || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.rif})
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-[14px] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Ver libro
          </button>
        </form>

        {ledger.length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Asiento</Th>
                <Th>Detalle</Th>
                <Th className="text-right">Débito</Th>
                <Th className="text-right">Crédito</Th>
                <Th className="text-right">Saldo</Th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row, idx) => {
                running += row.debit - row.credit;
                return (
                  <tr key={`${row.move}-${idx}`}>
                    <Td>{row.move_date}</Td>
                    <Td className="font-mono text-xs">{row.move}</Td>
                    <Td>{row.name || "—"}</Td>
                    <Td className="text-right font-mono text-xs">{formatMoney(row.debit)}</Td>
                    <Td className="text-right font-mono text-xs">{formatMoney(row.credit)}</Td>
                    <Td className="text-right font-mono text-xs font-semibold">{formatMoney(running)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState title="Sin movimientos" description="Elige un tercero con facturas o pagos contabilizados." />
        )}
      </SectionCard>
    </div>
  );
}
