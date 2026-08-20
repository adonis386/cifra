import Link from "next/link";
import { CancelInvoiceButton } from "@/components/invoices/cancel-invoice-button";
import { ReportExportActions } from "@/components/report-export-actions";
import {
  formatDual,
  formatMoney,
  getActiveCompany,
} from "@/lib/company";
import { sameInvoiceNumber } from "@/lib/invoice-number";
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

const moveLabel: Record<string, string> = {
  in_invoice: "Compra",
  in_refund: "N/C compra",
  out_invoice: "Venta",
  out_refund: "N/C venta",
};

type InvoiceFilters = {
  tipo?: string;
  partner?: string;
  from?: string;
  to?: string;
  q?: string;
  estado?: string;
};

function filterQuery(base: InvoiceFilters, patch: Partial<InvoiceFilters>) {
  const merged = { ...base, ...patch };
  const p = new URLSearchParams();
  if (merged.tipo && merged.tipo !== "todas") p.set("tipo", merged.tipo);
  if (merged.partner) p.set("partner", merged.partner);
  if (merged.from) p.set("from", merged.from);
  if (merged.to) p.set("to", merged.to);
  if (merged.q) p.set("q", merged.q);
  if (merged.estado) p.set("estado", merged.estado);
  const s = p.toString();
  return s ? `/app/invoices?${s}` : "/app/invoices";
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<InvoiceFilters>;
}) {
  const company = await getActiveCompany();
  const params = await searchParams;
  const tipo =
    params.tipo === "ventas" || params.tipo === "compras" ? params.tipo : "todas";
  const partnerId = String(params.partner || "").trim();
  const from = String(params.from || "").trim();
  const to = String(params.to || "").trim();
  const q = String(params.q || "").trim();
  const estado = String(params.estado || "").trim();
  const filters: InvoiceFilters = {
    tipo,
    partner: partnerId,
    from,
    to,
    q,
    estado,
  };

  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Facturas" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const saleTypes = ["out_invoice", "out_refund"];
  const purchaseTypes = ["in_invoice", "in_refund"];
  let invoiceQuery = supabase
    .from("invoices")
    .select(
      "id, move_type, state, invoice_date, invoice_number, control_number, amount_untaxed, amount_tax, amount_total, amount_retained_iva, amount_retained_islr, exchange_rate, amount_total_usd, sin_cred, currency_code, payment_state, partner_id, partners(name, rif)",
    )
    .eq("company_id", company.id)
    .order("invoice_date", { ascending: false });

  if (estado === "cancelled") invoiceQuery = invoiceQuery.eq("state", "cancelled");
  else if (estado === "confirmed") invoiceQuery = invoiceQuery.eq("state", "confirmed");
  else invoiceQuery = invoiceQuery.neq("state", "cancelled");

  if (tipo === "ventas") invoiceQuery = invoiceQuery.in("move_type", saleTypes);
  if (tipo === "compras") invoiceQuery = invoiceQuery.in("move_type", purchaseTypes);
  if (partnerId) invoiceQuery = invoiceQuery.eq("partner_id", partnerId);
  if (from) invoiceQuery = invoiceQuery.gte("invoice_date", from);
  if (to) invoiceQuery = invoiceQuery.lte("invoice_date", to);
  if (estado === "paid" || estado === "not_paid" || estado === "partial") {
    invoiceQuery = invoiceQuery.eq("payment_state", estado);
  }

  const [{ data: partners }, { data: invoicesRaw }] = await Promise.all([
      supabase
        .from("partners")
        .select("id, name, rif, person_type")
        .eq("company_id", company.id)
        .order("name"),
      invoiceQuery,
    ]);
  const invoices = q
    ? (invoicesRaw || []).filter((inv) => {
        const num = String(inv.invoice_number || "");
        const ctrl = String(inv.control_number || "");
        return (
          sameInvoiceNumber(num, q) ||
          num.toLowerCase().includes(q.toLowerCase()) ||
          ctrl.toLowerCase().includes(q.toLowerCase())
        );
      })
    : invoicesRaw || [];

  const exportQs = new URLSearchParams();
  if (tipo !== "todas") exportQs.set("tipo", tipo);
  if (partnerId) exportQs.set("partner", partnerId);
  if (from) exportQs.set("from", from);
  if (to) exportQs.set("to", to);
  if (q) exportQs.set("q", q);
  if (estado) exportQs.set("estado", estado);
  const exportHref = `/api/export/invoices${exportQs.toString() ? `?${exportQs}` : ""}`;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Documentos"
        title="Facturas"
        description="Compras y ventas con control, IVA, ISLR y saldo."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/app/invoices/new"
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white"
            >
              Nueva factura
            </Link>
            <ReportExportActions xlsxHref={exportHref} />
          </div>
        }
      />

      <SectionCard title="Documentos">
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filtrar facturas">
          {(
            [
              { id: "todas", label: "Todas" },
              { id: "ventas", label: "Facturas venta" },
              { id: "compras", label: "Facturas compra" },
            ] as const
          ).map((opt) => {
            const active = tipo === opt.id;
            return (
              <Link
                key={opt.id}
                href={filterQuery(filters, { tipo: opt.id })}
                role="tab"
                aria-selected={active}
                className={`rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-[var(--color-primary)] text-white"
                    : "border border-[var(--color-border)] bg-white text-[var(--color-foreground)] hover:border-[var(--color-primary)]"
                }`}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>

        <form method="get" className="mb-4 grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 md:grid-cols-6">
          {tipo !== "todas" ? <input type="hidden" name="tipo" value={tipo} /> : null}
          <div>
            <label htmlFor="partner" className="mb-1 block text-xs font-medium">Tercero</label>
            <select
              id="partner"
              name="partner"
              defaultValue={partnerId}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              {(partners || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="from" className="mb-1 block text-xs font-medium">Desde</label>
            <input
              id="from"
              name="from"
              type="date"
              defaultValue={from}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="to" className="mb-1 block text-xs font-medium">Hasta</label>
            <input
              id="to"
              name="to"
              type="date"
              defaultValue={to}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="q" className="mb-1 block text-xs font-medium">Nº factura</label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              placeholder="146 = 000146"
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-2 font-mono text-sm"
            />
          </div>
          <div>
            <label htmlFor="estado" className="mb-1 block text-xs font-medium">Estado</label>
            <select
              id="estado"
              name="estado"
              defaultValue={estado}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">Activas</option>
              <option value="confirmed">Confirmadas</option>
              <option value="not_paid">Pendiente de pago</option>
              <option value="partial">Pago parcial</option>
              <option value="paid">Pagadas</option>
              <option value="cancelled">Anuladas</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white"
            >
              Filtrar
            </button>
            <Link
              href="/app/invoices"
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
            >
              Limpiar
            </Link>
          </div>
        </form>

        {invoices.length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th>Tercero</Th>
                <Th>Factura / Control</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Ret. IVA</Th>
                <Th className="text-right">Ret. ISLR</Th>
                <Th className="text-right"></Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const partner = inv.partners as unknown as
                  | { name: string; rif: string }
                  | { name: string; rif: string }[]
                  | null;
                const p = Array.isArray(partner) ? partner[0] : partner;
                const rateVal = Number(inv.exchange_rate || 0) || null;
                const cancelled = inv.state === "cancelled";
                return (
                  <tr key={inv.id}>
                    <Td className="whitespace-nowrap">{inv.invoice_date}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge>{moveLabel[inv.move_type] || inv.move_type}</Badge>
                        {inv.sin_cred ? <Badge>sin libro</Badge> : null}
                        {cancelled ? <Badge tone="warning">Anulada</Badge> : null}
                      </div>
                    </Td>
                    <Td>
                      <div className="font-medium">{p?.name}</div>
                      <div className="font-mono text-xs text-[var(--color-muted-foreground)]">
                        {p?.rif}
                      </div>
                    </Td>
                    <Td>
                      <Link
                        href={`/app/invoices/${inv.id}`}
                        className="font-mono text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
                      >
                        {inv.invoice_number}
                      </Link>
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        Ctrl: {inv.control_number || "—"}
                      </div>
                    </Td>
                    <Td className="text-right font-mono text-xs">
                      {rateVal
                        ? formatDual(inv.amount_total, rateVal)
                        : formatMoney(inv.amount_total)}
                    </Td>
                    <Td className="text-right font-mono">
                      {formatMoney(inv.amount_retained_iva)}
                    </Td>
                    <Td className="text-right font-mono">
                      {formatMoney(inv.amount_retained_islr)}
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/app/invoices/${inv.id}`}
                          className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
                        >
                          Ver
                        </Link>
                        <Link
                          href={`/print/invoice/${inv.id}`}
                          target="_blank"
                          className="rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
                        >
                          Imprimir
                        </Link>
                        {!cancelled ? <CancelInvoiceButton invoiceId={inv.id} /> : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState title="Sin facturas" description="Registra un documento con Nueva factura." />
        )}
      </SectionCard>
    </div>
  );
}
