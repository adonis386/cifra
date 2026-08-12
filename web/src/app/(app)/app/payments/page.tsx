import Link from "next/link";
import { PaymentForm } from "@/components/payments/payment-form";
import { formatDual, formatMoney, getActiveCompany, getExchangeRate } from "@/lib/company";
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

export default async function PaymentsPage() {
  const company = await getActiveCompany();
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
  const [{ data: partners }, { data: journals }, { data: openInvoices }, { data: payments }, rate] =
    await Promise.all([
      supabase.from("partners").select("id, name, rif").eq("company_id", company.id).order("name"),
      supabase
        .from("account_journals")
        .select("id, name, code, journal_type")
        .eq("company_id", company.id)
        .order("code"),
      supabase
        .from("invoices")
        .select("id, partner_id, invoice_number, invoice_date, amount_residual, move_type")
        .eq("company_id", company.id)
        .gt("amount_residual", 0)
        .neq("state", "cancelled")
        .order("invoice_date"),
      supabase
        .from("payments")
        .select(
          "id, payment_type, payment_date, amount, exchange_rate, amount_usd, reference, memo, state, partners(name, rif)",
        )
        .eq("company_id", company.id)
        .order("payment_date", { ascending: false })
        .limit(50),
      getExchangeRate(company.id, today),
    ]);

  const invoiceOptions = (openInvoices || []).map((inv) => ({
    id: inv.id,
    partnerId: inv.partner_id,
    residual: Number(inv.amount_residual),
    label: `${inv.invoice_date} · ${inv.invoice_number} · saldo ${formatMoney(inv.amount_residual)}`,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Contabilidad"
        title="Pagos y cobros"
        description="Registro de account.payment con aplicación a facturas abiertas (FIFO o factura específica)."
      />
      <SectionCard title="Registrar" description="Inbound = cobro clientes · Outbound = pago proveedores.">
        <PaymentForm
          partners={partners || []}
          journals={journals || []}
          invoices={invoiceOptions}
          initialRate={rate || 0}
        />
      </SectionCard>
      <SectionCard title="Últimos movimientos">
        {(payments || []).length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
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
                    <Td>{p.payment_date}</Td>
                    <Td>
                      <Badge>{p.payment_type === "inbound" ? "Cobro" : "Pago"}</Badge>
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
