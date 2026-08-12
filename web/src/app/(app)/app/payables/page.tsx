import Link from "next/link";
import { formatMoney, getActiveCompany } from "@/lib/company";
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

function agingBucket(dueDate: string | null, today: Date) {
  if (!dueDate) return "current";
  const due = new Date(dueDate + "T00:00:00");
  const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export default async function PayablesPage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Cuentas por pagar" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date();
  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, invoice_date, due_date, invoice_number, amount_total, amount_residual, payment_state, partners(name, rif)",
    )
    .eq("company_id", company.id)
    .in("move_type", ["in_invoice", "in_refund"])
    .gt("amount_residual", 0)
    .neq("state", "cancelled")
    .order("invoice_date");

  const buckets: Record<string, number> = {
    current: 0,
    "1-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  };
  let total = 0;
  for (const inv of invoices || []) {
    const r = Number(inv.amount_residual);
    total += r;
    buckets[agingBucket(inv.due_date || inv.invoice_date, today)] += r;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Contabilidad"
        title="Cuentas por pagar"
        description="Saldos a proveedores (liability_payable) con antigüedad."
        actions={
          <Link
            href="/app/payments"
            className="text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
          >
            Registrar pago
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total CxP", value: total },
          { label: "Al día", value: buckets.current },
          { label: "1–30", value: buckets["1-30"] },
          { label: "31–60", value: buckets["31-60"] },
          { label: "61–90", value: buckets["61-90"] },
          { label: "90+", value: buckets["90+"] },
        ].map((s) => (
          <SectionCard key={s.label}>
            <p className="text-xs text-[var(--color-muted-foreground)]">{s.label}</p>
            <p className="mt-1 font-mono text-lg font-semibold">{formatMoney(s.value)}</p>
          </SectionCard>
        ))}
      </div>

      <SectionCard title="Facturas abiertas">
        {(invoices || []).length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Proveedor</Th>
                <Th>Factura</Th>
                <Th>Emisión</Th>
                <Th>Vence</Th>
                <Th>Aging</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Saldo</Th>
              </tr>
            </thead>
            <tbody>
              {(invoices || []).map((inv) => {
                const partner = inv.partners as unknown as
                  | { name: string; rif: string }
                  | { name: string; rif: string }[]
                  | null;
                const p = Array.isArray(partner) ? partner[0] : partner;
                const bucket = agingBucket(inv.due_date || inv.invoice_date, today);
                return (
                  <tr key={inv.id}>
                    <Td>
                      <div className="font-medium">{p?.name}</div>
                      <div className="font-mono text-xs text-[var(--color-muted-foreground)]">{p?.rif}</div>
                    </Td>
                    <Td>{inv.invoice_number}</Td>
                    <Td>{inv.invoice_date}</Td>
                    <Td>{inv.due_date || inv.invoice_date}</Td>
                    <Td>
                      <Badge tone={bucket === "current" ? "success" : bucket === "90+" ? "warning" : "primary"}>
                        {bucket}
                      </Badge>
                    </Td>
                    <Td className="text-right font-mono text-xs">{formatMoney(inv.amount_total)}</Td>
                    <Td className="text-right font-mono text-xs font-semibold">
                      {formatMoney(inv.amount_residual)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState title="Sin saldos por pagar" />
        )}
      </SectionCard>
    </div>
  );
}
