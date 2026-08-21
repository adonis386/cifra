import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelInvoiceButton } from "@/components/invoices/cancel-invoice-button";
import { EditIvaRetentionForm } from "@/components/invoices/edit-iva-retention-form";
import {
  formatDual,
  formatMoney,
  getActiveCompany,
} from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  DataTable,
  PageHeader,
  SectionCard,
  Td,
  Th,
} from "@/components/layout";
import { computeIslrForInvoice } from "@/lib/actions/islr";

const moveLabel: Record<string, string> = {
  in_invoice: "Compra",
  in_refund: "N/C compra",
  out_invoice: "Venta",
  out_refund: "N/C venta",
};

function unwrap<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] || null : raw;
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getActiveCompany();
  if (!company) notFound();

  const supabase = await createClient();
  const { data: inv, error: invError } = await supabase
    .from("invoices")
    .select(
      `id, move_type, state, invoice_date, registration_date, due_date,
       invoice_number, control_number, affected_document, currency_code, exchange_rate,
       amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva,
       amount_retained_islr, amount_paid, amount_residual, payment_state, notes, sin_cred,
       partners(name, rif, address, phone, person_type),
       invoice_lines(id, description, quantity, price_unit, tax_rate, amount_untaxed, amount_tax, amount_total)`,
    )
    .eq("id", id)
    .eq("company_id", company.id)
    .maybeSingle();

  if (invError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Factura" description="No se pudo abrir el documento." />
        <p className="text-sm text-[var(--color-destructive)]">{invError.message}</p>
        <Link
          href="/app/invoices"
          className="text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
        >
          Volver al listado
        </Link>
      </div>
    );
  }

  if (!inv) notFound();

  const partner = unwrap(
    inv.partners as
      | { name: string; rif: string; address: string | null; phone: string | null }
      | { name: string; rif: string; address: string | null; phone: string | null }[]
      | null,
  );
  const lines = (inv.invoice_lines || []) as Array<{
    id: string;
    description: string;
    quantity: number;
    price_unit: number;
    tax_rate: number;
    amount_untaxed: number;
    amount_tax: number;
    amount_total: number;
  }>;

  const [{ data: ivaLine }, { data: islrLine }, islr, igtfRes] = await Promise.all([
    supabase
      .from("withholding_iva_lines")
      .select("withholding_id, withholding_iva(id, state, voucher_number)")
      .eq("invoice_id", inv.id)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("withholding_islr_lines")
      .select("withholding_id, withholding_islr(id, state, voucher_number)")
      .eq("invoice_id", inv.id)
      .limit(1)
      .maybeSingle(),
    computeIslrForInvoice(inv.id, company.id),
    supabase
      .from("invoices")
      .select("igtf_rate, amount_igtf")
      .eq("id", inv.id)
      .maybeSingle(),
  ]);

  const ivaWh = unwrap(
    ivaLine?.withholding_iva as unknown as
      | { id: string; state: string; voucher_number: string }
      | { id: string; state: string; voucher_number: string }[]
      | null,
  );
  const islrWh = unwrap(
    islrLine?.withholding_islr as unknown as
      | { id: string; state: string; voucher_number: string }
      | { id: string; state: string; voucher_number: string }[]
      | null,
  );

  const rate = Number(inv.exchange_rate || 0) || null;
  const igtf = igtfRes.error
    ? 0
    : Number((igtfRes.data as { amount_igtf?: number } | null)?.amount_igtf || 0);
  const cancelled = inv.state === "cancelled";
  const money = (n: number) => (rate ? formatDual(n, rate) : formatMoney(n));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Documento"
        title={`Factura ${inv.invoice_number}`}
        description={`${moveLabel[inv.move_type] || inv.move_type} · ${inv.invoice_date}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/app/invoices"
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-semibold hover:border-[var(--color-primary)]"
            >
              Volver al listado
            </Link>
            <Link
              href={`/print/invoice/${inv.id}`}
              target="_blank"
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white"
            >
              Imprimir
            </Link>
            {ivaWh?.id && ivaWh.state !== "cancelled" ? (
              <Link
                href={`/print/iva/${ivaWh.id}`}
                target="_blank"
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
              >
                PDF IVA
              </Link>
            ) : null}
            {islrWh?.id && islrWh.state !== "cancelled" ? (
              <Link
                href={`/print/islr/${islrWh.id}`}
                target="_blank"
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
              >
                PDF ISLR
              </Link>
            ) : Number(inv.amount_retained_islr || 0) > 0 ? (
              <Link
                href="/app/withholdings"
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-semibold"
              >
                Generar ISLR
              </Link>
            ) : null}
            {!cancelled ? (
              <CancelInvoiceButton
                invoiceId={inv.id}
                redirectTo="/app/invoices"
              />
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone={cancelled ? "warning" : "success"}>
          {cancelled ? "Anulada" : inv.state}
        </Badge>
        <Badge>{inv.payment_state || "—"}</Badge>
        {inv.sin_cred ? <Badge>sin libro</Badge> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Tercero">
          <p className="font-semibold">{partner?.name}</p>
          <p className="font-mono text-sm text-[var(--color-muted-foreground)]">
            {partner?.rif}
          </p>
          {partner?.address ? (
            <p className="mt-2 text-sm">{partner.address}</p>
          ) : null}
          {partner?.phone ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">{partner.phone}</p>
          ) : null}
        </SectionCard>
        <SectionCard title="Control">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-[var(--color-muted-foreground)]">N° control</dt>
            <dd className="font-mono">{inv.control_number || "—"}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Registro (libro)</dt>
            <dd>{inv.registration_date || inv.invoice_date}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Afecta</dt>
            <dd>{inv.affected_document || "—"}</dd>
            <dt className="text-[var(--color-muted-foreground)]">Moneda</dt>
            <dd>
              {inv.currency_code}
              {rate ? ` · tasa ${formatMoney(rate)}` : ""}
            </dd>
          </dl>
        </SectionCard>
      </div>

      <SectionCard title="Líneas">
        <DataTable>
          <thead>
            <tr>
              <Th>Descripción</Th>
              <Th className="text-right">Cant.</Th>
              <Th className="text-right">Precio</Th>
              <Th className="text-right">IVA %</Th>
              <Th className="text-right">Base</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <Td>{l.description}</Td>
                <Td className="text-right font-mono">{Number(l.quantity)}</Td>
                <Td className="text-right font-mono">{formatMoney(l.price_unit)}</Td>
                <Td className="text-right font-mono">{Number(l.tax_rate)}</Td>
                <Td className="text-right font-mono">{formatMoney(l.amount_untaxed)}</Td>
                <Td className="text-right font-mono">{formatMoney(l.amount_total)}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </SectionCard>

      <SectionCard title="Totales y retenciones">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-muted-foreground)]">Base</span>
            <span className="font-mono">{money(Number(inv.amount_untaxed))}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-muted-foreground)]">IVA</span>
            <span className="font-mono">{money(Number(inv.amount_tax))}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-muted-foreground)]">Exento</span>
            <span className="font-mono">{money(Number(inv.amount_exempt))}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-muted-foreground)]">Total</span>
            <span className="font-mono font-semibold">{money(Number(inv.amount_total))}</span>
          </div>
          {igtf > 0 ? (
            <div className="flex justify-between gap-4">
              <span className="text-[var(--color-muted-foreground)]">IGTF</span>
              <span className="font-mono">{money(igtf)}</span>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-muted-foreground)]">Ret. IVA</span>
            <span className="font-mono">{money(Number(inv.amount_retained_iva))}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-muted-foreground)]">Ret. ISLR</span>
            <span className="font-mono">
              {money(Number(inv.amount_retained_islr))}
              {islr.totalSubtract > 0
                ? ` · sustr. ${formatMoney(islr.totalSubtract)}`
                : ""}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-muted-foreground)]">Saldo</span>
            <span className="font-mono font-semibold">{money(Number(inv.amount_residual))}</span>
          </div>
        </dl>
        {!cancelled && Number(inv.amount_tax) > 0 ? (
          <div className="mt-4">
            <EditIvaRetentionForm
              invoiceId={inv.id}
              amountTax={Number(inv.amount_tax || 0)}
              currentRetained={Number(inv.amount_retained_iva || 0)}
            />
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
