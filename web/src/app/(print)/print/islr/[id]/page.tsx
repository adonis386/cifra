import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export default async function PrintIslrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getActiveCompany();
  if (!company) notFound();

  const supabase = await createClient();
  const [{ data: fullCompany }, { data: wh }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, rif, address, phone")
      .eq("id", company.id)
      .single(),
    supabase
      .from("withholding_islr")
      .select(
        "id, voucher_number, period, voucher_date, amount_untaxed, amount_withheld, partners(name, rif, address, phone), withholding_islr_lines(amount_untaxed, amount_withheld, rate, concept_id, islr_concepts(code, name), invoices(invoice_number, control_number, invoice_date))",
      )
      .eq("id", id)
      .eq("company_id", company.id)
      .single(),
  ]);

  if (!wh) notFound();

  const partner = wh.partners as unknown as
    | { name: string; rif: string; address: string | null; phone: string | null }
    | { name: string; rif: string; address: string | null; phone: string | null }[]
    | null;
  const p = Array.isArray(partner) ? partner[0] : partner;
  const lines = (wh.withholding_islr_lines || []) as Array<{
    amount_untaxed: number;
    amount_withheld: number;
    rate: number;
    islr_concepts: { code: string; name: string } | { code: string; name: string }[] | null;
    invoices:
      | { invoice_number: string; control_number: string | null; invoice_date: string }
      | { invoice_number: string; control_number: string | null; invoice_date: string }[]
      | null;
  }>;

  const periodLabel = `${wh.period.slice(4, 6)}/${wh.period.slice(0, 4)}`;

  return (
    <div className="print-sheet">
      <PrintToolbar backHref="/app/withholdings" />

      <p className="print-title" style={{ marginBottom: 16 }}>
        Comprobante de Retención de ISLR {wh.voucher_number}
      </p>

      <table className="print-box" style={{ marginBottom: 14 }}>
        <tbody>
          <tr>
            <td>
              <div style={{ fontSize: 10 }}>Agente de Retención</div>
              <strong>{fullCompany?.name}</strong>
            </td>
            <td>
              <div style={{ fontSize: 10 }}>RIF Agente</div>
              <strong>{fullCompany?.rif}</strong>
            </td>
            <td>
              <div style={{ fontSize: 10 }}>Período</div>
              <strong>{periodLabel}</strong>
            </td>
          </tr>
          <tr>
            <td colSpan={3}>
              <div style={{ fontSize: 10 }}>Dirección fiscal del agente</div>
              {fullCompany?.address || "—"}
            </td>
          </tr>
          <tr>
            <td>
              <div style={{ fontSize: 10 }}>Sujeto retenido</div>
              <strong>{p?.name}</strong>
            </td>
            <td>
              <div style={{ fontSize: 10 }}>RIF retenido</div>
              <strong>{p?.rif}</strong>
            </td>
            <td>
              <div style={{ fontSize: 10 }}>Fecha</div>
              <strong>{wh.voucher_date}</strong>
            </td>
          </tr>
          <tr>
            <td>
              <div style={{ fontSize: 10 }}>Dirección retenido</div>
              {p?.address || "—"}
            </td>
            <td colSpan={2}>
              <div style={{ fontSize: 10 }}>Teléfono</div>
              {p?.phone || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="print-table">
        <thead>
          <tr>
            <th>Fecha factura</th>
            <th>Nº Factura</th>
            <th>Nº Control</th>
            <th>Concepto</th>
            <th>Base</th>
            <th>% Ret.</th>
            <th>ISLR retenido</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const concept = Array.isArray(l.islr_concepts)
              ? l.islr_concepts[0]
              : l.islr_concepts;
            const inv = Array.isArray(l.invoices) ? l.invoices[0] : l.invoices;
            return (
              <tr key={i}>
                <td>{inv?.invoice_date || wh.voucher_date}</td>
                <td>{inv?.invoice_number || "—"}</td>
                <td>{inv?.control_number || "—"}</td>
                <td>
                  {concept?.code || "—"} {concept?.name || ""}
                </td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_untaxed)}</td>
                <td style={{ textAlign: "right" }}>{Number(l.rate).toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_withheld)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} style={{ textAlign: "right", fontWeight: 700 }}>
              Totales
            </td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(wh.amount_untaxed)}
            </td>
            <td />
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(wh.amount_withheld)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p style={{ marginTop: 28, fontSize: 11 }}>
        Emitido por Cifra · {fullCompany?.name} · {fullCompany?.rif}
      </p>
    </div>
  );
}
