import Link from "next/link";
import {
  formatDual,
  formatMoney,
  getActiveCompany,
  getExchangeRate,
} from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  Td,
  Th,
} from "@/components/layout";

export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string; from?: string; to?: string }>;
}) {
  const company = await getActiveCompany();
  const params = await searchParams;
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Estado de cuenta" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from || `${today.slice(0, 4)}-01-01`;
  const to = params.to || today;

  const [{ data: partners }, rate] = await Promise.all([
    supabase
      .from("partners")
      .select("id, name, rif, kind")
      .eq("company_id", company.id)
      .order("name"),
    getExchangeRate(company.id, today),
  ]);

  const partnerId = params.partner || partners?.[0]?.id || "";
  const partner = (partners || []).find((p) => p.id === partnerId);

  const [{ data: invoices }, { data: lines }] = partnerId
    ? await Promise.all([
        supabase
          .from("invoices")
          .select(
            "id, invoice_date, invoice_number, move_type, amount_total, amount_residual, amount_paid, payment_state, exchange_rate",
          )
          .eq("company_id", company.id)
          .eq("partner_id", partnerId)
          .gte("invoice_date", from)
          .lte("invoice_date", to)
          .neq("state", "cancelled")
          .order("invoice_date"),
        supabase
          .from("account_move_lines")
          .select("id, name, debit, credit, account_moves!inner(move_date, name)")
          .eq("company_id", company.id)
          .eq("partner_id", partnerId)
          .gte("account_moves.move_date", from)
          .lte("account_moves.move_date", to)
          .limit(300),
      ])
    : [{ data: null }, { data: null }];

  type Row = {
    date: string;
    doc: string;
    detail: string;
    debit: number;
    credit: number;
  };

  const rows: Row[] = [];
  for (const inv of invoices || []) {
    const isSale = String(inv.move_type).startsWith("out_");
    const total = Number(inv.amount_total);
    rows.push({
      date: inv.invoice_date,
      doc: inv.invoice_number,
      detail: `${inv.move_type} · ${inv.payment_state}`,
      debit: isSale ? total : 0,
      credit: isSale ? 0 : total,
    });
    const paid = Number(inv.amount_paid || 0);
    if (paid > 0) {
      rows.push({
        date: inv.invoice_date,
        doc: `PAGO/${inv.invoice_number}`,
        detail: "Aplicación de cobro/pago",
        debit: isSale ? 0 : paid,
        credit: isSale ? paid : 0,
      });
    }
  }

  for (const l of lines || []) {
    const move = l.account_moves as unknown as
      | { move_date: string; name: string }
      | { move_date: string; name: string }[]
      | null;
    const m = Array.isArray(move) ? move[0] : move;
    if (!m) continue;
    if ((invoices || []).some((inv) => m.name?.includes(inv.invoice_number))) {
      continue;
    }
    rows.push({
      date: m.move_date,
      doc: m.name,
      detail: l.name || "Movimiento contable",
      debit: Number(l.debit),
      credit: Number(l.credit),
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  const openResidual = (invoices || []).reduce(
    (s, i) => s + Number(i.amount_residual || 0),
    0,
  );
  const rowsWithBalance = rows.reduce<Array<(typeof rows)[number] & { balance: number }>>(
    (acc, r) => {
      const prev = acc.length ? acc[acc.length - 1].balance : 0;
      acc.push({ ...r, balance: prev + r.debit - r.credit });
      return acc;
    },
    [],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Libro"
        title="Estado de cuenta"
        description="Reporte de contacto: facturas, cobros/pagos y saldo del tercero. Pensado para enviar al cliente o proveedor."
      />

      <SectionCard title="Seleccionar contacto">
        <form className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm font-medium" htmlFor="partner">
              Tercero
            </label>
            <select
              id="partner"
              name="partner"
              defaultValue={partnerId}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3.5 py-3 text-sm"
            >
              {(partners || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.rif})
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
              Generar estado
            </button>
          </div>
        </form>
      </SectionCard>

      {partner && (
        <>
          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--brand-accent-muted)] px-6 py-5 text-[var(--color-foreground)]">
            <p className="text-sm text-[var(--color-muted-foreground)]">Estado de cuenta</p>
            <h2 className="mt-1 text-xl font-bold">{partner.name}</h2>
            <p className="font-mono text-sm text-[var(--color-muted-foreground)]">{partner.rif}</p>
            <p className="mt-4 text-sm text-[var(--color-muted-foreground)]">Saldo pendiente</p>
            <p className="font-mono text-2xl font-bold text-[var(--color-primary)]">
              {rate
                ? formatDual(openResidual, rate)
                : `${formatMoney(openResidual)} Bs`}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              Período {from} → {to}
            </p>
          </section>

          <SectionCard title="Movimientos">
            {rows.length ? (
              <DataTable>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Documento</Th>
                    <Th>Detalle</Th>
                    <Th className="text-right">Cargo</Th>
                    <Th className="text-right">Abono</Th>
                    <Th className="text-right">Saldo</Th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithBalance.map((r, idx) => (
                      <tr key={`${r.doc}-${idx}`}>
                        <Td>{r.date}</Td>
                        <Td className="font-mono text-xs">{r.doc}</Td>
                        <Td className="text-xs">{r.detail}</Td>
                        <Td className="text-right font-mono text-xs">
                          {r.debit ? formatMoney(r.debit) : "—"}
                        </Td>
                        <Td className="text-right font-mono text-xs">
                          {r.credit ? formatMoney(r.credit) : "—"}
                        </Td>
                        <Td className="text-right font-mono text-xs font-semibold">
                          {formatMoney(r.balance)}
                        </Td>
                      </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : (
              <EmptyState title="Sin movimientos en el período" />
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
