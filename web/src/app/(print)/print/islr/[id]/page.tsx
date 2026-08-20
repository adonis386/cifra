import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { computeIslrForInvoice } from "@/lib/actions/islr";

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
}

function money(n: number) {
  return formatMoney(n);
}

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
        "id, voucher_number, period, voucher_date, partners(name, rif, address, phone, person_type), withholding_islr_lines(invoice_id)",
      )
      .eq("id", id)
      .eq("company_id", company.id)
      .single(),
  ]);

  if (!wh) notFound();

  const partner = Array.isArray(wh.partners) ? wh.partners[0] : wh.partners;
  const p = partner as {
    name: string;
    rif: string;
    address: string | null;
    phone: string | null;
    person_type?: string;
  } | null;

  const invoiceId = (wh.withholding_islr_lines || [])[0]?.invoice_id as
    | string
    | undefined;
  const computed = invoiceId
    ? await computeIslrForInvoice(invoiceId, company.id)
    : { lines: [], totalBase: 0, totalSubtract: 0, totalWithheld: 0 };

  const period = String(wh.period || "");
  const year = period.slice(0, 4);
  const month = period.slice(4, 6);

  return (
    <div className="print-sheet" style={{ fontSize: 12 }}>
      <PrintToolbar backHref="/app/withholdings" />

      <p className="print-title" style={{ textAlign: "center", marginBottom: 4 }}>
        Comprobante de Retención de ISLR {wh.voucher_number}
      </p>
      <p style={{ textAlign: "center", fontSize: 10, margin: "0 0 12px" }}>
        Decreto 1.808 · Gaceta Oficial 36.203 · 12/05/1997
      </p>

      <table className="print-box" style={{ marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={{ width: "40%" }}>
              <div style={{ fontSize: 9 }}>Nombre o Razón Social del Agente de Retención:</div>
              <strong>{fullCompany?.name}</strong>
            </td>
            <td style={{ width: "40%" }}>
              <div style={{ fontSize: 9 }}>Registro de Información Fiscal del Agente de Retención:</div>
              <strong style={{ fontFamily: "monospace" }}>{fullCompany?.rif}</strong>
            </td>
            <td>
              <div style={{ fontSize: 9 }}>Período Fiscal:</div>
              <strong>
                {year}-{month}
              </strong>
            </td>
          </tr>
          <tr>
            <td colSpan={3}>
              <div style={{ fontSize: 9 }}>Dirección Fiscal del Agente de Retención:</div>
              <strong>{fullCompany?.address || "—"}</strong>
            </td>
          </tr>
          <tr>
            <td>
              <div style={{ fontSize: 9 }}>Nombre o Razón Social del Sujeto Retenido:</div>
              <strong>{p?.name}</strong>
            </td>
            <td>
              <div style={{ fontSize: 9 }}>Registro de Información Fiscal del Sujeto Retenido:</div>
              <strong style={{ fontFamily: "monospace" }}>{p?.rif}</strong>
            </td>
            <td>
              <div style={{ fontSize: 9 }}>Fecha:</div>
              <strong>{fmtDate(wh.voucher_date)}</strong>
            </td>
          </tr>
          <tr>
            <td>
              <div style={{ fontSize: 9 }}>Dirección Fiscal del Sujeto Retenido:</div>
              {p?.address || "—"}
            </td>
            <td colSpan={2}>
              <div style={{ fontSize: 9 }}>Teléfono del Sujeto Retenido:</div>
              {p?.phone || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="print-table">
        <thead>
          <tr>
            <th>Fecha Factura</th>
            <th>N° de Factura</th>
            <th>N° Control</th>
            <th>Concepto de Retención</th>
            <th>% de Retención</th>
            <th>Monto Total del Documento</th>
            <th>Base</th>
            <th>Sustraendo</th>
            <th>ISLR Monto Retenido</th>
          </tr>
        </thead>
        <tbody>
          {computed.lines.map((l, i) => (
            <tr key={i}>
              <td style={{ textAlign: "center" }}>{fmtDate(l.invoiceDate)}</td>
              <td style={{ textAlign: "center" }}>{l.invoiceNumber}</td>
              <td style={{ textAlign: "center" }}>{l.controlNumber || "—"}</td>
              <td style={{ fontSize: 9 }}>{l.conceptName}</td>
              <td style={{ textAlign: "right" }}>{Number(l.rate).toFixed(2)}</td>
              <td style={{ textAlign: "right" }}>{money(l.invoiceTotal)}</td>
              <td style={{ textAlign: "right" }}>{money(l.base)}</td>
              <td style={{ textAlign: "right" }}>{money(l.subtract)}</td>
              <td style={{ textAlign: "right" }}>{money(l.withheld)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ width: "100%", marginTop: 10 }}>
        <tbody>
          <tr>
            <td style={{ textAlign: "right", padding: "4px 8px" }}>
              Total Base Imponible:
            </td>
            <td style={{ width: 140, textAlign: "right", fontWeight: 700 }}>
              {money(computed.totalBase)}
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: "right", padding: "4px 8px" }}>
              Total Sustraendo (UT × % × 83.3334):
            </td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {money(computed.totalSubtract)}
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: "right", padding: "4px 8px" }}>
              <b>Total Impuesto Retenido:</b>
            </td>
            <td style={{ textAlign: "right" }}>
              <b>{money(computed.totalWithheld)}</b>
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ marginTop: 10, fontSize: 9, color: "#333" }}>
        Impuesto retenido = (base × alícuota) − sustraendo. Persona natural
        residente: sustraendo = valor UT × porcentaje de retención × 83.3334
        (tabla SENIAT / Decreto 1808).
      </p>

      <table className="print-box" style={{ marginTop: 28 }}>
        <tbody>
          <tr>
            <td style={{ width: "50%", height: 90, textAlign: "center" }}>
              <div style={{ height: 48 }} />
              <div style={{ borderTop: "1px solid #000", margin: "0 24px", paddingTop: 6 }}>
                <b>{fullCompany?.name}</b>
                <br />
                Firma y sello del agente de retención
              </div>
            </td>
            <td style={{ textAlign: "center" }}>
              <div style={{ height: 48 }} />
              <div style={{ borderTop: "1px solid #000", margin: "0 24px", paddingTop: 6 }}>
                <b>{p?.name}</b>
                <br />
                Sujeto retenido
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
