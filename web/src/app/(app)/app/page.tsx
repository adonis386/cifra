import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDual, formatMoney, getActiveCompany, getExchangeRate } from "@/lib/company";
import { Button } from "@/components/ui";
import { PageHeader } from "@/components/layout";
import { seniatMonthlyDue } from "@/lib/seniat/due-calendar";
import { monthBounds } from "@/domain/accounting/period";
import { AccountingRepository } from "@/repositories/accounting.repository";
import { POSTED_INVOICE_STATES } from "@/domain/invoices/invoice-state";

function greetingForHour(hour: number) {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function paymentLabel(state: string | null | undefined) {
  switch (state) {
    case "paid":
      return "Pagada";
    case "partial":
      return "Parcial";
    case "not_paid":
      return "Pendiente";
    default:
      return state || "—";
  }
}

function docStateLabel(state: string | null | undefined) {
  switch (state) {
    case "draft":
      return "Borrador";
    case "confirmed":
      return "Confirmada";
    case "done":
      return "Emitida";
    case "cancelled":
      return "Anulada";
    default:
      return state || "—";
  }
}

export default async function AppHomePage() {
  const company = await getActiveCompany();
  const hasCompany = Boolean(company);
  const today = new Date().toISOString().slice(0, 10);
  const greeting = greetingForHour(new Date().getUTCHours() - 4);
  const supabase = await createClient();

  const dues = seniatMonthlyDue(today);
  const periodYm = dues[0]?.period || today.slice(0, 7);
  const seniatBounds = monthBounds(periodYm) || {
    start: `${periodYm}-01`,
    end: `${periodYm}-31`,
    name: periodYm,
  };
  const periodStart = seniatBounds.start;
  const periodEnd = seniatBounds.end;
  const calendarYm = today.slice(0, 7);
  const month = monthBounds(calendarYm) || seniatBounds;
  const repo = company ? new AccountingRepository(supabase) : null;

  const [
    rate,
    { data: openInvoices },
    { count: invoiceCount },
    { data: recentInvoices },
    { data: booksForPeriod },
    { count: ivaWhCount },
    { count: islrWhCount },
    cashBank,
    openExtract,
    { count: monthMoveCount },
  ] = await Promise.all([
    company ? getExchangeRate(company.id, today) : Promise.resolve(null),
    company
      ? supabase
          .from("invoices")
          .select("id, move_type, amount_residual, amount_total, payment_state")
          .eq("company_id", company.id)
          .gt("amount_residual", 0)
          .in("state", [...POSTED_INVOICE_STATES])
      : Promise.resolve({ data: null }),
    company
      ? supabase
          .from("invoices")
          .select("*", { count: "exact", head: true })
          .eq("company_id", company.id)
          .in("state", [...POSTED_INVOICE_STATES])
          .gte("invoice_date", month.start)
      : Promise.resolve({ count: 0 }),
    company
      ? supabase
          .from("invoices")
          .select(
            "id, invoice_number, amount_total, payment_state, state, move_type, partners(name)",
          )
          .eq("company_id", company.id)
          .in("state", [...POSTED_INVOICE_STATES])
          .order("invoice_date", { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),
    company
      ? supabase
          .from("fiscal_books")
          .select("id, book_type, period_start, period_end")
          .eq("company_id", company.id)
          .lte("period_start", periodEnd)
          .gte("period_end", periodStart)
      : Promise.resolve({ data: null }),
    company
      ? supabase
          .from("withholding_iva")
          .select("*", { count: "exact", head: true })
          .eq("company_id", company.id)
          .eq("period", periodYm.replace("-", ""))
          .neq("state", "cancelled")
      : Promise.resolve({ count: 0 }),
    company
      ? supabase
          .from("withholding_islr")
          .select("*", { count: "exact", head: true })
          .eq("company_id", company.id)
          .eq("period", periodYm.replace("-", ""))
          .neq("state", "cancelled")
      : Promise.resolve({ count: 0 }),
    repo
      ? repo.cashBankBalance(company!.id)
      : Promise.resolve({ cash: 0, bank: 0, total: 0 }),
    repo ? repo.listOpenStatementLines(company!.id) : Promise.resolve([]),
    company
      ? supabase
          .from("account_moves")
          .select("*", { count: "exact", head: true })
          .eq("company_id", company.id)
          .gte("move_date", month.start)
          .lte("move_date", month.end)
      : Promise.resolve({ count: 0 }),
  ]);

  const saleOpen = (openInvoices || []).filter((i) =>
    String(i.move_type).startsWith("out_"),
  );
  const purchaseOpen = (openInvoices || []).filter((i) =>
    String(i.move_type).startsWith("in_"),
  );
  const cxc = saleOpen.reduce((s, i) => s + Number(i.amount_residual || 0), 0);
  const cxp = purchaseOpen.reduce(
    (s, i) => s + Number(i.amount_residual || 0),
    0,
  );
  const unreconciledAmount = (openExtract || []).reduce(
    (s, l) => s + Math.abs(Number(l.amount || 0)),
    0,
  );
  const unreconciledCount = openExtract?.length || 0;
  const money = (n: number) =>
    rate ? formatDual(n, rate) : `Bs ${formatMoney(n)}`;
  const hasSaleBook = (booksForPeriod || []).some((b) => b.book_type === "sale");
  const hasPurchaseBook = (booksForPeriod || []).some(
    (b) => b.book_type === "purchase",
  );

  if (!hasCompany) {
    return (
      <div className="sifra-motion-in space-y-6">
        <PageHeader
          eyebrow="Bienvenido"
          title="Sifra"
          description="Registra tu empresa con RIF para emitir libros y retenciones SENIAT."
          actions={
            <Link href="/app/empresa/nueva">
              <Button type="button">
                <Plus className="h-4 w-4" aria-hidden />
                Crear empresa
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="sifra-motion-in flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {greeting}
          </p>
          <h1 className="truncate text-[1.75rem] font-bold tracking-tight text-[var(--color-foreground)] md:text-[1.85rem]">
            {company!.name}
          </h1>
        </div>
        <Link href="/app/invoices/new" className="shrink-0">
          <Button type="button" className="px-[18px] py-3">
            Nueva factura
          </Button>
        </Link>
      </div>

      <div className="sifra-motion-in-delay flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[18px] py-4">
        <span className="text-xs text-[var(--color-muted-foreground)]">
          Tasa BCV
        </span>
        <span className="text-base font-bold tracking-tight">
          {rate ? `${formatMoney(rate)} Bs / USD` : "Sin tasa del día"}
        </span>
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {rate
            ? "Actualizada hoy · dual currency"
            : "Configúrala en Configuración"}
        </span>
        {!rate ? (
          <Link
            href="/app/config"
            className="text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            Ir a config
          </Link>
        ) : null}
      </div>

      <div className="sifra-motion-in-delay grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Por cobrar",
            value: money(cxc),
            hint: `${saleOpen.length} factura${saleOpen.length === 1 ? "" : "s"} abierta${saleOpen.length === 1 ? "" : "s"}`,
            href: "/app/receivables",
          },
          {
            label: "Por pagar",
            value: money(cxp),
            hint: `${purchaseOpen.length} factura${purchaseOpen.length === 1 ? "" : "s"} abierta${purchaseOpen.length === 1 ? "" : "s"}`,
            href: "/app/payables",
          },
          {
            label: "Caja y bancos",
            value: money(cashBank.total),
            hint: `Caja ${formatMoney(cashBank.cash)} · Bancos ${formatMoney(cashBank.bank)}`,
            href: "/app/treasury",
          },
          {
            label: "Por conciliar",
            value: money(unreconciledAmount),
            hint: `${unreconciledCount} línea${unreconciledCount === 1 ? "" : "s"} de extracto`,
            href: "/app/treasury",
          },
          {
            label: "Asientos del mes",
            value: String(monthMoveCount ?? 0),
            hint: month.name,
            href: "/app/entries",
          },
          {
            label: "Facturas del mes",
            value: String(invoiceCount ?? 0),
            hint: "Ventas + compras",
            href: "/app/invoices",
          },
        ].map((m) => (
          <Link
            key={m.label}
            href={m.href}
            className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[18px] transition-colors hover:border-[var(--color-primary)]/40"
          >
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {m.label}
            </p>
            <p className="mt-2 text-[1.35rem] font-bold tracking-tight tabular-nums">
              {m.value}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
              {m.hint}
            </p>
          </Link>
        ))}
      </div>

      <section className="sifra-motion-in-delay rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[18px]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Vencimientos SENIAT</h2>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Período {periodYm} · vence el 15
          </p>
        </div>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {dues.map((d) => {
            let status = "Pendiente";
            let href = "/app/books";
            if (d.label === "IVA") {
              status = hasSaleBook && hasPurchaseBook
                ? `Libros emitidos${(ivaWhCount || 0) > 0 ? ` · ${ivaWhCount} ret.` : ""}`
                : "Pendiente de libro";
              href = "/app/books";
            } else if (d.label.startsWith("ISLR")) {
              status =
                (islrWhCount || 0) > 0
                  ? `${islrWhCount} comprobante${(islrWhCount || 0) === 1 ? "" : "s"}`
                  : "Sin retenciones";
              href = "/app/withholdings";
            } else {
              href = "/app/withholdings?tab=municipal";
              status = "Declaración municipal";
            }
            return (
              <li key={d.label}>
                <Link
                  href={href}
                  className="block rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 transition-colors hover:border-[var(--color-primary)]/40"
                >
                  <p className="text-xs text-[var(--color-muted-foreground)]">{d.label}</p>
                  <p className="mt-1 text-sm font-semibold">Vence {d.due}</p>
                  <p
                    className={`mt-1 text-[11px] ${
                      d.overdue
                        ? "font-semibold text-[var(--color-destructive)]"
                        : "text-[var(--color-muted-foreground)]"
                    }`}
                  >
                    {d.overdue ? "Vencido · " : ""}
                    {status}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="sifra-motion-in-delay rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[18px]">
        <h2 className="text-sm font-semibold">Actividad reciente</h2>
        {(recentInvoices || []).length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-muted-foreground)]">
            Aún no hay documentos. Crea la primera factura.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--color-muted)]">
            {(recentInvoices || []).map((inv) => {
              const partner = inv.partners as
                | { name: string }
                | { name: string }[]
                | null;
              const partnerName = Array.isArray(partner)
                ? partner[0]?.name
                : partner?.name;
              return (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <Link
                    href={`/app/invoices/${inv.id}`}
                    className="font-semibold text-[var(--color-primary)] hover:underline"
                  >
                    {inv.invoice_number}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-[var(--color-foreground)]/80">
                    {partnerName || "—"}
                  </span>
                  <span className="font-semibold tabular-nums">
                    Bs {formatMoney(inv.amount_total)}
                  </span>
                  <span className="w-24 text-right text-xs text-[var(--color-muted-foreground)]">
                    {docStateLabel(inv.state)}
                    {inv.payment_state && inv.state !== "draft"
                      ? ` · ${paymentLabel(inv.payment_state)}`
                      : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
