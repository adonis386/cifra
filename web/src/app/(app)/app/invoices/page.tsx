import Link from "next/link";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { deleteInvoice } from "@/lib/actions/invoices";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui";
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

export default async function InvoicesPage() {
  const company = await getActiveCompany();
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
  const [{ data: partners }, { data: invoices }] = await Promise.all([
    supabase.from("partners").select("id, name, rif").eq("company_id", company.id).order("name"),
    supabase
      .from("invoices")
      .select(
        "id, move_type, invoice_date, invoice_number, control_number, amount_untaxed, amount_tax, amount_total, amount_retained_iva, amount_retained_islr, partners(name, rif)",
      )
      .eq("company_id", company.id)
      .order("invoice_date", { ascending: false }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Documentos"
        title="Facturas"
        description="Compras y ventas con control fiscal, multi-alícuota y retenciones."
      />

      <SectionCard title="Registrar documento" description="Usa líneas para 16%, 8% y exento.">
        <InvoiceForm partners={partners || []} />
      </SectionCard>

      <SectionCard title="Documentos">
        {(invoices || []).length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th>Tercero</Th>
                <Th>Factura / Control</Th>
                <Th className="text-right">Base</Th>
                <Th className="text-right">IVA</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Ret. IVA</Th>
                <Th className="text-right"></Th>
              </tr>
            </thead>
            <tbody>
              {(invoices || []).map((inv) => {
                const partner = inv.partners as unknown as
                  | { name: string; rif: string }
                  | { name: string; rif: string }[]
                  | null;
                const p = Array.isArray(partner) ? partner[0] : partner;
                return (
                  <tr key={inv.id}>
                    <Td className="whitespace-nowrap">{inv.invoice_date}</Td>
                    <Td>
                      <Badge>{moveLabel[inv.move_type] || inv.move_type}</Badge>
                    </Td>
                    <Td>
                      <div className="font-medium">{p?.name}</div>
                      <div className="font-mono text-xs text-[var(--color-muted-foreground)]">{p?.rif}</div>
                    </Td>
                    <Td>
                      <div>{inv.invoice_number}</div>
                      <div className="font-mono text-xs text-[var(--color-muted-foreground)]">
                        Ctrl: {inv.control_number || "—"}
                      </div>
                    </Td>
                    <Td className="text-right font-mono text-xs">{formatMoney(inv.amount_untaxed)}</Td>
                    <Td className="text-right font-mono text-xs">{formatMoney(inv.amount_tax)}</Td>
                    <Td className="text-right font-mono text-xs font-semibold">{formatMoney(inv.amount_total)}</Td>
                    <Td className="text-right font-mono text-xs">{formatMoney(inv.amount_retained_iva)}</Td>
                    <Td className="text-right">
                      <form action={deleteInvoice}>
                        <input type="hidden" name="id" value={inv.id} />
                        <Button type="submit" variant="ghost" className="text-[var(--color-destructive)]">
                          Eliminar
                        </Button>
                      </form>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState title="Sin facturas" description="Registra la primera con el formulario." />
        )}
      </SectionCard>
    </div>
  );
}
