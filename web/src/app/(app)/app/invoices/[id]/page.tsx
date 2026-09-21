import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelInvoiceButton } from "@/components/invoices/cancel-invoice-button";
import { EditIvaRetentionForm } from "@/components/invoices/edit-iva-retention-form";
import { DocumentChatter } from "@/components/chatter/document-chatter";
import { ResetPaymentButton } from "@/components/payments/reset-payment-button";
import {
  formatDual,
  formatMoney,
  getActiveCompanyRole,
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
import { loadDocumentChatter } from "@/lib/actions/chatter";
import { isSaleMoveType } from "@/domain/invoices/invoice-state";
import { paymentAdminActions } from "@/domain/access/roles";
import { paymentMethodLabel } from "@/domain/accounting/payment.service";

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
  const access = await getActiveCompanyRole();
  if (!access) notFound();
  const company = access.company;
  const isAdmin = access.isAdmin;

  const supabase = await createClient();
  const { data: inv, error: invError } = await supabase
    .from("invoices")
    .select(
      `id, partner_id, move_type, state, invoice_date, registration_date, due_date,
       invoice_number, control_number, affected_document, currency_code, exchange_rate,
       amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva,
       amount_retained_islr, amount_paid, amount_residual, payment_state, notes, sin_cred,
       account_move_id,
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

  const [{ data: ivaLine }, { data: islrLine }, islr, igtfRes, allocationsRes] =
    await Promise.all([
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
    supabase
      .from("payment_allocations")
      .select(
        "id, amount, created_at, payments(id, payment_date, payment_type, reference, memo, exchange_rate, payment_method, currency_code, state, amount)",
      )
      .eq("invoice_id", inv.id)
      .order("created_at"),
  ]);
  let allocations = allocationsRes.data;
  if (allocationsRes.error && /payment_method|column|schema/i.test(allocationsRes.error.message)) {
    const retry = await supabase
      .from("payment_allocations")
      .select(
        "id, amount, created_at, payments(id, payment_date, payment_type, reference, memo, exchange_rate, state, amount)",
      )
      .eq("invoice_id", inv.id)
      .order("created_at");
    allocations = retry.data as typeof allocations;
  }

  const [{ data: linkedPays }, chatter] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, payment_date, payment_type, reference, memo, payment_method, state, amount",
      )
      .eq("company_id", company.id)
      .eq("invoice_id", inv.id)
      .order("payment_date", { ascending: false }),
    loadDocumentChatter(company.id, "invoice", inv.id),
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
  const draft = inv.state === "draft";
  const sale = isSaleMoveType(inv.move_type);
  const residual = Number(inv.amount_residual || 0);
  const paid = Number(inv.amount_paid || 0);
  const canCollect = !cancelled && !draft && residual > 0.005;
  const money = (n: number) => (rate ? formatDual(n, rate) : formatMoney(n));
  const paymentRows = (allocations || []).map((row) => {
    const pay = unwrap(
      row.payments as
        | {
            id?: string;
            payment_date: string;
            payment_type: string;
            reference: string | null;
            memo: string | null;
            exchange_rate: number | null;
            payment_method?: string | null;
            currency_code?: string | null;
            state?: string | null;
            amount?: number | null;
          }
        | {
            id?: string;
            payment_date: string;
            payment_type: string;
            reference: string | null;
            memo: string | null;
            exchange_rate: number | null;
            payment_method?: string | null;
            currency_code?: string | null;
            state?: string | null;
            amount?: number | null;
          }[]
        | null,
    );
    return {
      id: pay?.id || row.id,
      amount: Number(row.amount || 0),
      date: pay?.payment_date || String(row.created_at || "").slice(0, 10),
      kind: pay?.payment_type === "outbound" ? "Pago" : "Cobro",
      method: paymentMethodLabel(pay?.payment_method) || "—",
      ref: pay?.reference || pay?.memo || "—",
      state: String(pay?.state || "confirmed"),
    };
  });
  const seenPay = new Set(paymentRows.map((row) => row.id));
  for (const pay of linkedPays || []) {
    if (seenPay.has(pay.id)) continue;
    paymentRows.push({
      id: pay.id,
      amount: Number(pay.amount || 0),
      date: pay.payment_date,
      kind: pay.payment_type === "outbound" ? "Pago" : "Cobro",
      method: paymentMethodLabel(pay.payment_method) || "—",
      ref: pay.reference || pay.memo || "—",
      state: String(pay.state || "draft"),
    });
  }

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
            {draft ? (
              <Link
                href={`/app/invoices/new?draft=${inv.id}`}
                className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white"
              >
                Continuar borrador
              </Link>
            ) : (
              <Link
                href={`/print/invoice/${inv.id}`}
                target="_blank"
                className={`rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold ${
                  canCollect
                    ? "border border-[var(--color-border)] bg-white hover:border-[var(--color-primary)]"
                    : "bg-[var(--color-primary)] text-white"
                }`}
              >
                Imprimir
              </Link>
            )}
            {canCollect ? (
              <Link
                href={`/app/payments?invoice=${inv.id}`}
                className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white"
              >
                {sale ? "Registrar cobro" : "Registrar pago"}
              </Link>
            ) : null}
            {inv.account_move_id ? (
              <Link
                href={`/app/entries/${inv.account_move_id}`}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-semibold hover:border-[var(--color-primary)]"
              >
                Ver asiento
              </Link>
            ) : null}
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
        <Badge tone={cancelled ? "warning" : draft ? "neutral" : "success"}>
          {cancelled ? "Anulada" : draft ? "Borrador" : inv.state}
        </Badge>
        {draft ? null : (
          <Badge tone={residual <= 0.005 ? "success" : "warning"}>
            {residual <= 0.005 ? "Pagada" : sale ? "Por cobrar" : "Por pagar"}
          </Badge>
        )}
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
        <dl className="grid gap-2 text-sm">
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
            <span className="text-[var(--color-muted-foreground)]">Total documento</span>
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

      {!draft ? (
        <SectionCard title={sale ? "Por cobrar" : "Por pagar"}>
          <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-foreground)]">
              {residual <= 0.005
                ? "Saldo"
                : sale
                  ? "Monto adeudado"
                  : "Total a pagar"}
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">
              {money(residual)}
            </p>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              {residual <= 0.005
                ? "Esta factura quedó en cero."
                : `Puedes partir el saldo en varios medios (divisas, Zelle, transferencia, pago móvil, débito o crédito).`}
            </p>
          </div>
          <dl className="mb-4 grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-[var(--color-muted-foreground)]">Total documento</span>
              <span className="font-mono">{money(Number(inv.amount_total))}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[var(--color-muted-foreground)]">Retenciones</span>
              <span className="font-mono">
                {money(
                  Number(inv.amount_retained_iva || 0) +
                    Number(inv.amount_retained_islr || 0),
                )}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-[var(--color-muted-foreground)]">
                {sale ? "Cobrado" : "Pagado"}
              </span>
              <span className="font-mono">{money(paid)}</span>
            </div>
          </dl>
          {paymentRows.length ? (
            <DataTable>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Movimiento</Th>
                  <Th>Medio</Th>
                  <Th>Ref</Th>
                  <Th className="text-right">Aplicado</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((row) => {
                  const adminActs = paymentAdminActions(row.state);
                  return (
                  <tr key={row.id}>
                    <Td className="whitespace-nowrap">{row.date}</Td>
                    <Td>
                      {row.kind}
                      {row.state === "draft" ? (
                        <Badge tone="warning">Borrador</Badge>
                      ) : null}
                    </Td>
                    <Td>{row.method}</Td>
                    <Td className="text-xs text-[var(--color-muted-foreground)]">
                      {row.ref}
                    </Td>
                    <Td className="text-right font-mono">{money(row.amount)}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Link
                          href={`/app/payments/${row.id}`}
                          className="text-xs font-semibold text-[var(--color-primary)] underline"
                        >
                          Ver
                        </Link>
                        {isAdmin && adminActs.canEdit ? (
                          <Link
                            href={`/app/payments/${row.id}`}
                            className="text-xs font-semibold underline"
                          >
                            Editar
                          </Link>
                        ) : null}
                        {isAdmin && adminActs.canReset ? (
                          <ResetPaymentButton paymentId={row.id} />
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                  );
                })}
              </tbody>
            </DataTable>
          ) : (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Aún no hay cobros ni pagos aplicados a esta factura.
            </p>
          )}
          {canCollect ? (
            <div className="mt-4">
              <Link
                href={`/app/payments?invoice=${inv.id}`}
                className="inline-flex rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-white"
              >
                {sale ? "Registrar cobro" : "Registrar pago"}
              </Link>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {!draft ? (
        <DocumentChatter
          resModel="invoice"
          resId={inv.id}
          messages={chatter}
          payments={paymentRows.map((row) => ({
            id: row.id,
            label: `${row.date} · ${row.method} · ${row.kind}`,
          }))}
        />
      ) : null}
    </div>
  );
}
