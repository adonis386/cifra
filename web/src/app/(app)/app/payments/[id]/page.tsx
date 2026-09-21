import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentForm } from "@/components/payments/payment-form";
import { ResetPaymentButton } from "@/components/payments/reset-payment-button";
import { DocumentChatter } from "@/components/chatter/document-chatter";
import {
  formatDual,
  formatMoney,
  getActiveCompanyRole,
  getExchangeRate,
} from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { loadDocumentChatter } from "@/lib/actions/chatter";
import { AccountingRepository } from "@/repositories/accounting.repository";
import {
  amountEnteredForCurrency,
  defaultPaymentMethod,
  normalizePaymentCurrency,
  normalizePaymentMethod,
  paymentMethodLabel,
} from "@/domain/accounting/payment.service";
import { paymentAdminActions } from "@/domain/access/roles";
import { Badge, PageHeader, SectionCard } from "@/components/layout";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getActiveCompanyRole();
  if (!access) notFound();
  const company = access.company;
  const supabase = await createClient();
  const repo = new AccountingRepository(supabase);
  const pay = await repo.getPayment(id, company.id);
  if (!pay) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: partners },
    { data: journals },
    { data: partner },
    rate,
    chatter,
  ] = await Promise.all([
    supabase.from("partners").select("id, name, rif").eq("company_id", company.id).order("name"),
    supabase
      .from("account_journals")
      .select("id, name, code, journal_type")
      .eq("company_id", company.id)
      .order("code"),
    supabase.from("partners").select("name, rif").eq("id", pay.partner_id).maybeSingle(),
    getExchangeRate(company.id, String(pay.payment_date || today)),
    loadDocumentChatter(company.id, "payment", id),
  ]);

  const invoiceId = String((pay as { invoice_id?: string | null }).invoice_id || "");
  const { data: invoice } = invoiceId
    ? await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, partner_id, amount_residual, exchange_rate")
        .eq("id", invoiceId)
        .eq("company_id", company.id)
        .maybeSingle()
    : { data: null };

  const currency = normalizePaymentCurrency(String(pay.currency_code || "VES"));
  const payRate = Number(pay.exchange_rate || invoice?.exchange_rate || rate || 0);
  const residual = Number(invoice?.amount_residual || pay.amount || 0);
  const defaultAmount =
    currency === "USD" && Number(pay.amount_usd || 0) > 0
      ? Number(pay.amount_usd).toFixed(2)
      : currency === "USD"
        ? amountEnteredForCurrency(Number(pay.amount), "USD", payRate)
        : Number(pay.amount).toFixed(2);
  const actions = paymentAdminActions(String(pay.state || ""));
  const method = paymentMethodLabel(
    String((pay as { payment_method?: string | null }).payment_method || ""),
  );
  const money = payRate ? (n: number) => formatDual(n, payRate) : formatMoney;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cobro / pago"
        title={method ? `${method}` : "Movimiento"}
        description={`${pay.payment_type === "outbound" ? "Pago" : "Cobro"} · ${pay.payment_date}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/app/payments"
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-semibold hover:border-[var(--color-primary)]"
            >
              Volver
            </Link>
            {invoiceId ? (
              <Link
                href={`/app/invoices/${invoiceId}`}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-semibold hover:border-[var(--color-primary)]"
              >
                Ver factura {invoice?.invoice_number || ""}
              </Link>
            ) : null}
            {access.isAdmin && actions.canReset ? (
              <ResetPaymentButton paymentId={pay.id} />
            ) : null}
          </div>
        }
      />
      <SectionCard title="Detalle">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-muted-foreground)]">Tercero</span>
            <span>{partner?.name}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-muted-foreground)]">Estado</span>
            <Badge tone={pay.state === "draft" ? "warning" : "success"}>
              {pay.state === "draft" ? "Borrador" : "Confirmado"}
            </Badge>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-muted-foreground)]">Monto</span>
            <span className="font-mono">{money(Number(pay.amount))}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--color-muted-foreground)]">Referencia</span>
            <span>{pay.reference || pay.memo || "—"}</span>
          </div>
        </dl>
      </SectionCard>
      {access.isAdmin && actions.canEdit ? (
        <PaymentForm
          partners={partners || []}
          journals={journals || []}
          invoices={
            invoice
              ? [
                  {
                    id: invoice.id,
                    partnerId: invoice.partner_id,
                    residual,
                    rate: Number(invoice.exchange_rate || 0) || undefined,
                    label: `${invoice.invoice_date} · ${invoice.invoice_number}`,
                  },
                ]
              : []
          }
          initialRate={payRate}
          defaultType={pay.payment_type === "outbound" ? "outbound" : "inbound"}
          defaultPartnerId={pay.partner_id}
          defaultInvoiceId={invoiceId}
          defaultAmount={defaultAmount}
          defaultCurrency={currency}
          defaultMethod={normalizePaymentMethod(
            String((pay as { payment_method?: string | null }).payment_method || "") ||
              defaultPaymentMethod(currency),
          )}
          paymentId={pay.id}
          defaultJournalId={pay.journal_id || ""}
          defaultReference={pay.reference || ""}
          defaultMemo={pay.memo || ""}
          defaultDate={String(pay.payment_date || today)}
          autoOpen
          returnTo={invoiceId ? `/app/invoices/${invoiceId}` : `/app/payments/${pay.id}`}
          buttonLabel="Editar borrador"
        />
      ) : null}
      <DocumentChatter
        resModel="payment"
        resId={pay.id}
        messages={chatter}
        payments={[{ id: pay.id, label: method || "Este cobro" }]}
      />
    </div>
  );
}
