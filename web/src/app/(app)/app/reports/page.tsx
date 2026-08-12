import Link from "next/link";
import {
  BarChart3,
  ClipboardList,
  Library,
  Scale,
  ScrollText,
  ShieldCheck,
  Landmark,
} from "lucide-react";
import { ReportExportActions } from "@/components/report-export-actions";
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

const hubs: Array<{
  href: string;
  title: string;
  desc: string;
  icon: typeof BarChart3;
  pdf?: string;
  xlsx?: string;
}> = [
  {
    href: "/app/receivables",
    title: "Cuentas por cobrar",
    desc: "Aging de clientes · PDF y Excel.",
    icon: BarChart3,
    pdf: "/print/receivables",
    xlsx: "/api/export/receivables",
  },
  {
    href: "/app/payables",
    title: "Cuentas por pagar",
    desc: "Aging de proveedores · PDF y Excel.",
    icon: BarChart3,
    pdf: "/print/payables",
    xlsx: "/api/export/payables",
  },
  {
    href: "/app/statements",
    title: "Estado de cuenta",
    desc: "Reporte de contacto · PDF y Excel.",
    icon: ClipboardList,
  },
  {
    href: "/app/ledger",
    title: "Mayor",
    desc: "Movimientos por cuenta · PDF y Excel.",
    icon: Library,
  },
  {
    href: "/app/accounts",
    title: "Balance de comprobación",
    desc: "Saldos debe/haber · PDF y Excel.",
    icon: Scale,
    pdf: "/print/trial-balance",
    xlsx: "/api/export/trial-balance",
  },
  {
    href: "/app/books",
    title: "Libros fiscales",
    desc: "Compras/ventas SENIAT · PDF y Excel.",
    icon: ScrollText,
  },
  {
    href: "/app/invoices",
    title: "Facturas",
    desc: "Listado + impresión unitaria · Excel.",
    icon: Landmark,
    xlsx: "/api/export/invoices",
  },
  {
    href: "/app/payments",
    title: "Pagos y cobros",
    desc: "Tesorería aplicada · Excel.",
    icon: ShieldCheck,
    xlsx: "/api/export/payments",
  },
];

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

  const ledgerWithBalance = ledger.reduce<
    Array<(typeof ledger)[number] & { balance: number }>
  >((acc, row) => {
    const prev = acc.length ? acc[acc.length - 1].balance : 0;
    acc.push({ ...row, balance: prev + row.debit - row.credit });
    return acc;
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Libro"
        title="Reportes"
        description="Centro de lectura Cifra: cobranzas, mayor, estados de cuenta y control. No replica el menú Reportes de Odoo."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {hubs.map((h) => {
          const Icon = h.icon;
          return (
            <div
              key={h.href}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-sm)]"
            >
              <Link href={h.href} className="block transition-opacity hover:opacity-90">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-muted)] text-[var(--color-primary)]">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <p className="mt-3 font-semibold">{h.title}</p>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{h.desc}</p>
              </Link>
              {(h.pdf || h.xlsx) && (
                <div className="mt-4 border-t border-[var(--color-border)] pt-3">
                  <ReportExportActions pdfHref={h.pdf} xlsxHref={h.xlsx} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SectionCard title="CxC abiertas">
          <p className="text-3xl font-bold text-[var(--color-primary)]">{openAr ?? 0}</p>
          <Link href="/app/receivables" className="mt-2 inline-block text-sm font-semibold text-[var(--color-primary)] underline">
            Ver aging
          </Link>
        </SectionCard>
        <SectionCard title="CxP abiertas">
          <p className="text-3xl font-bold text-[var(--color-primary)]">{openAp ?? 0}</p>
          <Link href="/app/payables" className="mt-2 inline-block text-sm font-semibold text-[var(--color-primary)] underline">
            Ver aging
          </Link>
        </SectionCard>
        <SectionCard title="Pagos recientes">
          <p className="text-3xl font-bold text-[var(--color-primary)]">{recentPayments?.length ?? 0}</p>
          <div className="mt-2 flex items-center gap-2 text-[var(--color-muted-foreground)]">
            <BarChart3 className="h-4 w-4" aria-hidden />
            <Link href="/app/payments" className="text-sm font-semibold text-[var(--color-primary)] underline">
              Ir a pagos
            </Link>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Vista rápida de contacto"
        description="Atajo al estado de cuenta. Para el reporte completo usa Libro → Estado de cuenta."
      >
        <form className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
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
          <button
            type="submit"
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Ver
          </button>
          {partnerId && (
            <Link
              href={`/app/statements?partner=${partnerId}`}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold"
            >
              Estado completo
            </Link>
          )}
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
              {ledgerWithBalance.map((row, idx) => (
                  <tr key={`${row.move}-${idx}`}>
                    <Td>{row.move_date}</Td>
                    <Td className="font-mono text-xs">{row.move}</Td>
                    <Td>{row.name || "—"}</Td>
                    <Td className="text-right font-mono text-xs">{formatMoney(row.debit)}</Td>
                    <Td className="text-right font-mono text-xs">{formatMoney(row.credit)}</Td>
                    <Td className="text-right font-mono text-xs font-semibold">{formatMoney(row.balance)}</Td>
                  </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState title="Sin movimientos" description="Elige un tercero con facturas o pagos contabilizados." />
        )}
      </SectionCard>
    </div>
  );
}
