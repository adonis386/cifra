import Link from "next/link";
import { PaymentForm } from "@/components/payments/payment-form";
import { ReportExportActions } from "@/components/report-export-actions";
import { formatDual, formatMoney, getActiveCompany, getExchangeRate } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { POSTED_INVOICE_STATES } from "@/domain/invoices/invoice-state";
import {
  amountEnteredForCurrency,
  defaultPaymentMethod,
  normalizePaymentCurrency,
  paymentMethodLabel,
} from "@/domain/accounting/payment.service";
import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  Td,
  Th,
} from "@/components/layout";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string }>;
}) {
  const company = await getActiveCompany();
  const params = await searchParams;
  const invoiceId = String(params.invoice || "").trim();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Pagos" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: partners },
    { data: journals },
    { data: openInvoices },
    paymentsRes,
    rate,
  ] =
    await Promise.all([
      supabase.from("partners").select("id, name, rif").eq("company_id", company.id).order("name"),
      supabase
        .from("account_journals")
        .select("id, name, code, journal_type")
        .eq("company_id", company.id)
        .order("code"),
      supabase
        .from("invoices")
        .select(
          "id, partner_id, invoice_number, invoice_date, amount_residual, move_type, currency_code, exchange_rate",
        )
        .eq("company_id", company.id)
        .gt("amount_residual", 0)
        .in("state", [...POSTED_INVOICE_STATES])
        .order("invoice_date"),
      supabase
        .from("payments")
        .select(
          "id, payment_type, payment_date, amount, currency_code, payment_method, exchange_rate, amount_usd, reference, memo, state, partners(name, rif)",
        )
        .eq("company_id", company.id)
        .order("payment_date", { ascending: false })
        .limit(50),
      getExchangeRate(company.id, today),
    ]);
  let payments = paymentsRes.data;
  if (paymentsRes.error && /payment_method|column|schema/i.test(paymentsRes.error.message)) {
    const retry = await supabase
      .from("payments")
      .select(
        "id, payment_type, payment_date, amount, currency_code, exchange_rate, amount_usd, reference, memo, state, partners(name, rif)",
      )
      .eq("company_id", company.id)
      .order("payment_date", { ascending: false })
      .limit(50);
    payments = retry.data as typeof payments;
  }

  const invoiceOptions = (openInvoices || []).map((inv) => {
    const residual = Number(inv.amount_residual);
    const invRate = Number(inv.exchange_rate || 0);
    return {
      id: inv.id,
      partnerId: inv.partner_id,
      residual,
      rate: invRate || undefined,
      label: `${inv.invoice_date} · ${inv.invoice_number} · saldo ${
        invRate > 0 ? formatDual(residual, invRate) : formatMoney(residual)
      }`,
    };
  });
  const focused = invoiceOptions.find((inv) => inv.id === invoiceId);
  const focusedRow = (openInvoices || []).find((inv) => inv.id === invoiceId);
  const defaultType = String(focusedRow?.move_type || "").startsWith("in_")
    ? "outbound"
    : "inbound";
  const focusedRate = Number(focusedRow?.exchange_rate || rate || 0);
  const defaultCurrency =
    normalizePaymentCurrency(String(focusedRow?.currency_code || "")) === "USD" &&
    focusedRate > 0
      ? "USD"
      : "VES";
  const defaultAmount = focused
    ? amountEnteredForCurrency(focused.residual, defaultCurrency, focusedRate)
    : "";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operar"
        title="Cobros y pagos"
        description="Aplica cobros y pagos a facturas abiertas. Una factura puede partirse en varios medios."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PaymentForm
              partners={partners || []}
              journals={journals || []}
              invoices={invoiceOptions}
              initialRate={focusedRate || rate || 0}
              defaultType={defaultType}
              defaultPartnerId={focused?.partnerId || ""}
              defaultInvoiceId={focused?.id || ""}
              defaultAmount={defaultAmount}
              defaultCurrency={defaultCurrency}
              defaultMethod={defaultPaymentMethod(defaultCurrency)}
              autoOpen={Boolean(focused)}
              returnTo={focused ? `/app/invoices/${focused.id}` : undefined}
              buttonLabel={
                focused
                  ? defaultType === "outbound"
                    ? "Registrar pago"
                    : "Registrar cobro"
                  : "Registrar cobro o pago"
              }
            />
            <ReportExportActions xlsxHref="/api/export/payments" />
          </div>
        }
      />
      <SectionCard title="Últimos movimientos">
        {(payments || []).length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th>Medio</Th>
                <Th>Tercero</Th>
                <Th>Ref</Th>
                <Th className="text-right">Monto</Th>
              </tr>
            </thead>
            <tbody>
              {(payments || []).map((p) => {
                const partner = p.partners as unknown as
                  | { name: string; rif: string }
                  | { name: string; rif: string }[]
                  | null;
                const pr = Array.isArray(partner) ? partner[0] : partner;
                const payRate = Number(p.exchange_rate || rate || 0) || null;
                return (
                  <tr key={p.id}>
                    <Td>
                      <Link
                        href={`/app/payments/${p.id}`}
                        className="font-medium text-[var(--color-primary)] underline"
                      >
                        {p.payment_date}
                      </Link>
                    </Td>
                    <Td>
                      <Badge>{p.payment_type === "inbound" ? "Cobro" : "Pago"}</Badge>
                      {String(p.currency_code || "").toUpperCase() === "USD" ? (
                        <span className="ml-1 text-[10px] font-semibold uppercase text-[var(--color-muted-foreground)]">
                          USD
                        </span>
                      ) : null}
                    </Td>
                    <Td className="text-sm">
                      {paymentMethodLabel(
                        (p as { payment_method?: string | null }).payment_method,
                      ) || "—"}
                    </Td>
                    <Td>
                      <div className="font-medium">{pr?.name}</div>
                      <div className="font-mono text-xs text-[var(--color-muted-foreground)]">
                        {pr?.rif}
                      </div>
                    </Td>
                    <Td className="text-xs text-[var(--color-muted-foreground)]">
                      {p.reference || p.memo || "—"}
                    </Td>
                    <Td className="text-right font-mono text-xs">
                      {payRate ? formatDual(p.amount, payRate) : formatMoney(p.amount)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState title="Sin pagos" />
        )}
      </SectionCard>
    </div>
  );
}
