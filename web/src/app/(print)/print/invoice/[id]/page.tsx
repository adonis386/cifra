import { notFound } from "next/navigation";
import { PrintFooter, PrintLetterhead } from "@/components/print/print-branding";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { getCompanyPrintProfile } from "@/lib/company-print";
import { createClient } from "@/lib/supabase/server";

const moveTitle: Record<string, string> = {
  out_invoice: "Factura de venta",
  out_refund: "Nota de crédito (venta)",
  in_invoice: "Factura de compra",
  in_refund: "Nota de crédito (compra)",
};

export default async function PrintInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getActiveCompany();
  if (!company) notFound();

  const supabase = await createClient();
  const [profile, { data: inv }] = await Promise.all([
    getCompanyPrintProfile(company.id),
    supabase
      .from("invoices")
      .select(
        `id, move_type, operation_type, doc_type, state, invoice_date, due_date,
         invoice_number, control_number, affected_document, currency_code, exchange_rate,
         amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva,
         amount_retained_islr, amount_paid, amount_residual, notes, sin_cred,
         amount_total_usd, amount_untaxed_usd, amount_tax_usd,
         partners(name, rif, address, phone, email),
         invoice_lines(id, description, quantity, price_unit, tax_rate, amount_untaxed, amount_tax, amount_total)`,
      )
      .eq("id", id)
      .eq("company_id", company.id)
      .single(),
  ]);

  if (!inv || !profile) notFound();

  const partner = inv.partners as unknown as
    | {
        name: string;
        rif: string;
        address: string | null;
        phone: string | null;
        email: string | null;
      }
    | {
        name: string;
        rif: string;
        address: string | null;
        phone: string | null;
        email: string | null;
      }[]
    | null;
  const p = Array.isArray(partner) ? partner[0] : partner;
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

  const rate = Number(inv.exchange_rate || 0);
  const title = moveTitle[inv.move_type] || "Documento fiscal";
  const neto =
    Number(inv.amount_total) -
    Number(inv.amount_retained_iva || 0) -
    Number(inv.amount_retained_islr || 0);

  return (
    <div className="print-sheet">
      <PrintToolbar backHref="/app/invoices" />

      <PrintLetterhead company={profile} documentTitle={title} />

      <table className="print-box" style={{ marginBottom: 14 }}>
        <tbody>
          <tr>
            <td>
              <strong>Nº factura</strong>
              <div style={{ fontFamily: "monospace" }}>{inv.invoice_number}</div>
            </td>
            <td>
              <strong>Nº control</strong>
              <div style={{ fontFamily: "monospace" }}>
                {inv.control_number || "—"}
              </div>
            </td>
            <td>
              <strong>Fecha</strong>
              <div>{inv.invoice_date}</div>
            </td>
            <td>
              <strong>Vence</strong>
              <div>{inv.due_date || "—"}</div>
            </td>
          </tr>
          <tr>
            <td>
              <strong>Tipo doc.</strong>
              <div>{inv.doc_type}</div>
            </td>
            <td colSpan={3}>
              <strong>Moneda</strong>
              <div>
                {inv.currency_code || "VES"}
                {rate > 0 ? ` · tasa ${formatMoney(rate)}` : ""}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="print-box" style={{ marginBottom: 14 }}>
        <tbody>
          <tr>
            <td colSpan={2}>
              <div style={{ fontSize: 10 }}>Cliente / Proveedor</div>
              <strong>{p?.name || "—"}</strong>
            </td>
            <td>
              <div style={{ fontSize: 10 }}>RIF</div>
              <strong>{p?.rif || "—"}</strong>
            </td>
            <td>
              <div style={{ fontSize: 10 }}>Teléfono</div>
              {p?.phone || "—"}
            </td>
          </tr>
          <tr>
            <td colSpan={4}>
              <div style={{ fontSize: 10 }}>Dirección</div>
              {p?.address || "—"}
            </td>
          </tr>
          {inv.affected_document ? (
            <tr>
              <td colSpan={4}>
                <div style={{ fontSize: 10 }}>Documento afectado</div>
                {inv.affected_document}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <table className="print-table">
        <thead>
          <tr>
            <th style={{ width: "36%" }}>Descripción</th>
            <th>Cant.</th>
            <th>P. unitario</th>
            <th>% IVA</th>
            <th>Base</th>
            <th>IVA</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.length ? (
            lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td style={{ textAlign: "right" }}>{Number(l.quantity)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.price_unit)}</td>
                <td style={{ textAlign: "right" }}>{Number(l.tax_rate).toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_untaxed)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_tax)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_total)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} style={{ textAlign: "center" }}>
                Sin líneas
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <table style={{ width: "100%", marginTop: 14 }}>
        <tbody>
          <tr>
            <td style={{ width: "52%", verticalAlign: "top", fontSize: 11 }}>
              {inv.notes ? (
                <>
                  <strong>Notas</strong>
                  <div>{inv.notes}</div>
                </>
              ) : null}
              {inv.sin_cred ? (
                <p style={{ marginTop: 8 }}>
                  Documento marcado sin derecho a crédito fiscal (sin libro).
                </p>
              ) : null}
            </td>
            <td>
              <table className="print-box">
                <tbody>
                  <tr>
                    <td>Base imponible</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {formatMoney(inv.amount_untaxed)} Bs
                    </td>
                  </tr>
                  <tr>
                    <td>Exento / SDCF</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {formatMoney(inv.amount_exempt)} Bs
                    </td>
                  </tr>
                  <tr>
                    <td>IVA</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {formatMoney(inv.amount_tax)} Bs
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontFamily: "monospace",
                        fontWeight: 700,
                      }}
                    >
                      {formatMoney(inv.amount_total)} Bs
                      {inv.amount_total_usd != null && rate > 0
                        ? ` · $ ${formatMoney(inv.amount_total_usd)}`
                        : ""}
                    </td>
                  </tr>
                  <tr>
                    <td>Ret. IVA</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      {formatMoney(inv.amount_retained_iva || 0)} Bs
                    </td>
                  </tr>
                  {Number(inv.amount_retained_islr || 0) > 0 ? (
                    <tr>
                      <td>Ret. ISLR</td>
                      <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                        {formatMoney(inv.amount_retained_islr)} Bs
                      </td>
                    </tr>
                  ) : null}
                  <tr>
                    <td>
                      <strong>Neto a pagar / cobrar</strong>
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontFamily: "monospace",
                        fontWeight: 700,
                      }}
                    >
                      {formatMoney(neto)} Bs
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", marginTop: 48 }}>
        <tbody>
          <tr>
            <td
              style={{
                width: "45%",
                textAlign: "center",
                borderTop: "1px solid #111",
                paddingTop: 8,
              }}
            >
              Emisor
            </td>
            <td style={{ width: "10%" }} />
            <td
              style={{
                width: "45%",
                textAlign: "center",
                borderTop: "1px solid #111",
                paddingTop: 8,
              }}
            >
              Receptor
            </td>
          </tr>
        </tbody>
      </table>

      <PrintFooter company={profile} />
    </div>
  );
}
