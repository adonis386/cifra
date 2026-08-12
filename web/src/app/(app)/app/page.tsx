import Link from "next/link";
import {
  BookOpen,
  FileDown,
  FileText,
  Plus,
  Receipt,
  Settings2,
  Wallet,
  Landmark,
  ArrowUpRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  formatDual,
  formatMoney,
  getExchangeRate,
} from "@/lib/company";
import { Button } from "@/components/ui";
import { PageHeader, SectionCard } from "@/components/layout";

const quickActions = [
  {
    href: "/app/invoices",
    label: "Facturas",
    icon: FileText,
    tone: "bg-[#e8f1ff] text-[#1e3a5f]",
  },
  {
    href: "/app/receivables",
    label: "Por cobrar",
    icon: Receipt,
    tone: "bg-[#ecfdf5] text-[#047857]",
  },
  {
    href: "/app/payables",
    label: "Por pagar",
    icon: BookOpen,
    tone: "bg-[#fff4e8] text-[#c2410c]",
  },
  {
    href: "/app/payments",
    label: "Pagos",
    icon: FileDown,
    tone: "bg-[#eef6ff] text-[#1d4ed8]",
  },
  {
    href: "/app/withholdings",
    label: "Retenciones",
    icon: FileDown,
    tone: "bg-[#f3f4f6] text-[#374151]",
  },
  {
    href: "/app/reports",
    label: "Reportes",
    icon: Settings2,
    tone: "bg-[#f8fafc] text-[#0f172a]",
  },
];

type JournalCard = {
  id: string;
  code: string;
  name: string;
  journal_type: string;
  balance: number;
  openCount: number;
  openAmount: number;
  href: string;
  cta: string;
  accent: string;
};

export default async function AppHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: memberships } = await supabase
    .from("company_members")
    .select("company_id, companies(id, name, rif)")
    .eq("user_id", user!.id);

  const companies =
    memberships
      ?.map((m) => {
        const c = m.companies as
          | { id: string; name: string; rif: string }
          | { id: string; name: string; rif: string }[]
          | null;
        if (!c) return null;
        return Array.isArray(c) ? c[0] : c;
      })
      .filter(Boolean) || [];

  const company = companies[0] as
    | { id: string; name: string; rif: string }
    | undefined;
  const hasCompany = Boolean(company);
  const today = new Date().toISOString().slice(0, 10);

  const [
    { count: partnerCount },
    { count: invoiceCount },
    { count: bookCount },
    rate,
    { data: journals },
    { data: moveLines },
    { data: openInvoices },
  ] = await Promise.all([
    company
      ? supabase
          .from("partners")
          .select("*", { count: "exact", head: true })
          .eq("company_id", company.id)
      : Promise.resolve({ count: 0 }),
    company
      ? supabase
          .from("invoices")
          .select("*", { count: "exact", head: true })
          .eq("company_id", company.id)
      : Promise.resolve({ count: 0 }),
    company
      ? supabase
          .from("fiscal_books")
          .select("*", { count: "exact", head: true })
          .eq("company_id", company.id)
      : Promise.resolve({ count: 0 }),
    company ? getExchangeRate(company.id, today) : Promise.resolve(null),
    company
      ? supabase
          .from("account_journals")
          .select("id, code, name, journal_type, default_account_id")
          .eq("company_id", company.id)
          .order("code")
      : Promise.resolve({ data: null }),
    company
      ? supabase
          .from("account_move_lines")
          .select("account_id, debit, credit")
          .eq("company_id", company.id)
      : Promise.resolve({ data: null }),
    company
      ? supabase
          .from("invoices")
          .select("id, move_type, amount_residual, amount_total")
          .eq("company_id", company.id)
          .gt("amount_residual", 0)
          .neq("state", "cancelled")
      : Promise.resolve({ data: null }),
  ]);

  const accountBalance = new Map<string, number>();
  for (const line of moveLines || []) {
    const bal = (accountBalance.get(line.account_id) || 0) + Number(line.debit) - Number(line.credit);
    accountBalance.set(line.account_id, bal);
  }

  const saleOpen = (openInvoices || []).filter((i) => String(i.move_type).startsWith("out_"));
  const purchaseOpen = (openInvoices || []).filter((i) => String(i.move_type).startsWith("in_"));

  const journalCards: JournalCard[] = (journals || [])
    .filter((j) => ["bank", "cash", "sale", "purchase"].includes(j.journal_type))
    .map((j) => {
      const isLiquidity = j.journal_type === "bank" || j.journal_type === "cash";
      const balance = j.default_account_id
        ? accountBalance.get(j.default_account_id) || 0
        : 0;
      const open = j.journal_type === "sale" ? saleOpen : j.journal_type === "purchase" ? purchaseOpen : [];
      const openAmount = open.reduce((s, i) => s + Number(i.amount_residual || 0), 0);
      const href =
        j.journal_type === "sale"
          ? "/app/receivables"
          : j.journal_type === "purchase"
            ? "/app/payables"
            : "/app/payments";
      const cta =
        j.journal_type === "sale"
          ? open.length
            ? `Cobrar ${open.length} doc.`
            : "Ver por cobrar"
          : j.journal_type === "purchase"
            ? open.length
              ? `Pagar ${open.length} doc.`
              : "Ver por pagar"
            : "Nueva transacción";
      const accent =
        j.journal_type === "bank"
          ? "from-[#1e3a5f] to-[#2d4a6f]"
          : j.journal_type === "cash"
            ? "from-[#0f766e] to-[#0d9488]"
            : j.journal_type === "sale"
              ? "from-[#047857] to-[#059669]"
              : "from-[#c2410c] to-[#ea580c]";
      return {
        id: j.id,
        code: j.code,
        name: j.name,
        journal_type: j.journal_type,
        balance: isLiquidity ? balance : openAmount,
        openCount: open.length,
        openAmount,
        href,
        cta,
        accent,
      };
    });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Tablero"
        title={hasCompany ? company!.name : "Bienvenido a Cifra"}
        description={
          hasCompany
            ? `RIF ${company!.rif}${rate ? ` · tasa ${formatMoney(rate)} Bs/USD` : " · configura la tasa del día en Configuración"}.`
            : "Registra tu empresa con RIF para emitir libros y retenciones SENIAT."
        }
        actions={
          !hasCompany ? (
            <Link href="/app/empresa/nueva">
              <Button type="button">
                <Plus className="h-4 w-4" aria-hidden />
                Crear empresa
              </Button>
            </Link>
          ) : (
            <Link href="/app/config">
              <Button type="button" variant="secondary">
                Tasa del día
              </Button>
            </Link>
          )
        }
      />

      {hasCompany && journalCards.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Diarios</h2>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Vista tipo Odoo Accounting: bancos, cajas y pendientes.
              </p>
            </div>
            <Link
              href="/app/accounts"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
            >
              Plan de cuentas <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {journalCards.map((card) => (
              <article
                key={card.id}
                className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
                      {card.code} · {card.journal_type}
                    </p>
                    <h3 className="mt-1 text-base font-semibold">{card.name}</h3>
                  </div>
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br ${card.accent} text-white`}
                  >
                    {card.journal_type === "bank" || card.journal_type === "cash" ? (
                      <Wallet className="h-4 w-4" aria-hidden />
                    ) : card.journal_type === "sale" ? (
                      <Receipt className="h-4 w-4" aria-hidden />
                    ) : (
                      <Landmark className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                </div>

                <div className="mt-4 flex-1">
                  <p className="text-[11px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    {card.journal_type === "bank" || card.journal_type === "cash"
                      ? "Balance"
                      : "Pendiente"}
                  </p>
                  <p
                    className={`mt-1 font-mono text-lg font-semibold tabular-nums ${
                      card.balance < 0 ? "text-[var(--color-destructive)]" : ""
                    }`}
                  >
                    {rate ? formatDual(card.balance, rate) : `${formatMoney(card.balance)} Bs`}
                  </p>
                  {(card.journal_type === "sale" || card.journal_type === "purchase") && (
                    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                      {card.openCount} documento{card.openCount === 1 ? "" : "s"} abierto
                      {card.openCount === 1 ? "" : "s"}
                    </p>
                  )}
                </div>

                <Link
                  href={card.href}
                  className={`mt-4 inline-flex items-center justify-center rounded-[14px] bg-gradient-to-r ${card.accent} px-3 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95`}
                >
                  {card.cta}
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

      {hasCompany && (
        <section className="overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-soft)] px-6 py-7 text-white shadow-[var(--shadow-md)] md:px-8">
          <p className="text-sm text-white/70">Indicadores</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Terceros", value: partnerCount ?? 0 },
              { label: "Facturas", value: invoiceCount ?? 0 },
              { label: "Libros", value: bookCount ?? 0 },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-[18px] bg-white/10 px-4 py-3 backdrop-blur-sm"
              >
                <p className="text-xs text-white/70">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">{stat.value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasCompany && (
        <>
          <SectionCard title="Accesos rápidos" description="Flujo operativo → fiscal → sistema.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {quickActions.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[var(--shadow-sm)]"
                  >
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.tone}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="text-sm font-semibold">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard title="Facturación">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Documentos con control, multi-alícuota, dual currency e IVA retenido.
              </p>
              <Link
                href="/app/invoices"
                className="mt-4 inline-flex text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
              >
                Ir a facturas
              </Link>
            </SectionCard>
            <SectionCard title="Retenciones SENIAT">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  IVA TXT 99035 e ISLR XML.
                </p>
              </div>
              <Link
                href="/app/withholdings"
                className="mt-4 inline-flex text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
              >
                Ir a retenciones
              </Link>
            </SectionCard>
            <SectionCard title="Libros del período">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Compras y ventas listos para fiscalización (excluye sin_cred).
              </p>
              <Link
                href="/app/books"
                className="mt-4 inline-flex text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
              >
                Ir a libros
              </Link>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
