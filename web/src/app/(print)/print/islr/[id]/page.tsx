import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
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
  const [{ data: fullCompany }, first] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, rif, address, phone")
      .eq("id", company.id)
      .single(),
    supabase
      .from("withholding_islr")
      .select(
        "id, voucher_number, period, voucher_date, amount_untaxed, amount_withheld, partners(name, rif, address, phone, person_type), withholding_islr_lines(amount_untaxed, amount_withheld, amount_subtract, rate, concept_id, islr_concepts(code, name), invoices(invoice_number, control_number, invoice_date))",
      )
      .eq("id", id)
      .eq("company_id", company.id)
      .single(),
  ]);

  let wh = first.data;
  if (!wh && first.error) {
    const retry = await supabase
      .from("withholding_islr")
      .select(
        "id, voucher_number, period, voucher_date, amount_untaxed, amount_withheld, partners(name, rif, address, phone, person_type), withholding_islr_lines(amount_untaxed, amount_withheld, rate, concept_id, islr_concepts(code, name), invoices(invoice_number, control_number, invoice_date))",
      )
      .eq("id", id)
      .eq("company_id", company.id)
      .single();
    wh = retry.data;
  }

  if (!wh) notFound();

  const partner = wh.partners as unknown as
    | {
        name: string;
        rif: string;
        address: string | null;
        phone: string | null;
        person_type?: string;
      }
    | {
        name: string;
        rif: string;
        address: string | null;
        phone: string | null;
        person_type?: string;
      }[]
    | null;
  const p = Array.isArray(partner) ? partner[0] : partner;
  const lines = (wh.withholding_islr_lines || []) as Array<{
    amount_untaxed: number;
    amount_withheld: number;
    amount_subtract?: number;
    rate: number;
    islr_concepts: { code: string; name: string } | { code: string; name: string }[] | null;
    invoices:
      | { invoice_number: string; control_number: string | null; invoice_date: string }
      | { invoice_number: string; control_number: string | null; invoice_date: string }[]
      | null;
  }>;

  const box: CSSProperties = {
    border: "1px solid #222",
    padding: "6px 8px",
  };
  const subtractTotal = lines.reduce(
    (s, l) => s + Number(l.amount_subtract || 0),
    0,
  );
  const personLabel =
    p?.person_type === "natural" ? "Natural" : "Jurídica";

  return (
    <div className="print-sheet" style={{ fontSize: 11 }}>
      <PrintToolbar backHref="/app/withholdings" />

      <table style={{ width: "100%", marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={{ width: "70%" }}>
              <p
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  margin: 0,
                  textAlign: "center",
                }}
              >
                Comprobante de Retención de Impuesto sobre la Renta
              </p>
              <p
                style={{
                  fontSize: 10,
                  textAlign: "center",
                  margin: "6px 0 0",
                }}
              >
                SEGÚN GACETA DECRETO 1808 DEL 12/05/1997
              </p>
            </td>
            <td style={{ ...box, verticalAlign: "top" }}>
              <div style={{ fontSize: 9 }}>DÍA MES AÑO</div>
              <strong>{fmtDate(wh.voucher_date)}</strong>
              <div style={{ fontSize: 9, marginTop: 8 }}>No. Comprobante</div>
              <strong style={{ fontFamily: "monospace" }}>{wh.voucher_number}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
        <tbody>
          <tr>
            <td colSpan={2} style={{ ...box, background: "#f3f3f3", fontWeight: 700 }}>
              AGENTE DE RETENCIÓN
            </td>
          </tr>
          <tr>
            <td style={{ ...box, width: "45%" }}>
              <div style={{ fontSize: 9 }}>Empresa:</div>
              <strong>{fullCompany?.name}</strong>
              <div style={{ marginTop: 6, fontSize: 9 }}>
                R.I.F.: <strong style={{ fontFamily: "monospace" }}>{fullCompany?.rif}</strong>
              </div>
            </td>
            <td style={box}>
              <div style={{ fontSize: 9 }}>Dirección:</div>
              {fullCompany?.address || "—"}
              <div style={{ marginTop: 6, fontSize: 9 }}>
                Teléfono: {fullCompany?.phone || "—"}
              </div>
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ ...box, background: "#f3f3f3", fontWeight: 700 }}>
              CONTRIBUYENTE
            </td>
          </tr>
          <tr>
            <td style={box}>
              <div style={{ fontSize: 9 }}>Persona: {personLabel}</div>
              <div style={{ fontSize: 9, marginTop: 4 }}>Razón Social:</div>
              <strong>{p?.name}</strong>
            </td>
            <td style={box}>
              <div style={{ fontSize: 9 }}>Dirección:</div>
              {p?.address || "—"}
              <div style={{ marginTop: 6, fontSize: 9 }}>
                R.I.F.: <strong style={{ fontFamily: "monospace" }}>{p?.rif}</strong>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="print-table" style={{ fontSize: 10 }}>
        <thead>
          <tr>
            <th>Número Documento</th>
            <th>Número control</th>
            <th>Fecha Documento</th>
            <th>Descripción</th>
            <th>% Alícuota</th>
            <th>Base Imponible</th>
            <th>Sustraendo (1)</th>
            <th>Impuesto retenido Bs. (2)</th>
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
                <td>{inv?.invoice_number || "—"}</td>
                <td>{inv?.control_number || "—"}</td>
                <td>{fmtDate(inv?.invoice_date || wh.voucher_date)}</td>
                <td>
                  {concept?.name || concept?.code || "SERVICIOS"}
                </td>
                <td style={{ textAlign: "right" }}>{Number(l.rate).toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_untaxed)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_subtract || 0)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_withheld)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p style={{ marginTop: 8, fontSize: 9 }}>
        (1) Sustraendo persona natural residente: valor UT × % retención × 83.3334.
        Impuesto retenido (2) = (base × %) − sustraendo.
      </p>

      <table style={{ width: "100%", marginTop: 14, maxWidth: 420, marginLeft: "auto" }}>
        <tbody>
          <tr>
            <td style={{ padding: "4px 8px" }}>Total Base Imponible Bs.</td>
            <td style={{ textAlign: "right", fontWeight: 700, padding: "4px 8px" }}>
              {formatMoney(wh.amount_untaxed)}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "4px 8px" }}>Total Sustraendo (1) Bs.</td>
            <td style={{ textAlign: "right", fontWeight: 700, padding: "4px 8px" }}>
              {formatMoney(subtractTotal)}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "4px 8px" }}>Total Retenido al Proveedor Bs.:</td>
            <td style={{ textAlign: "right", fontWeight: 700, padding: "4px 8px" }}>
              {formatMoney(wh.amount_withheld)}
            </td>
          </tr>
        </tbody>
      </table>

      <div
        style={{
          marginTop: 48,
          borderTop: "1px solid #222",
          paddingTop: 8,
          maxWidth: 320,
          marginLeft: "auto",
          textAlign: "center",
          fontSize: 10,
        }}
      >
        FIRMA Y SELLO DEL AGENTE DE RETENCIÓN
        <div style={{ marginTop: 8, fontWeight: 600 }}>{fullCompany?.name}</div>
      </div>
    </div>
  );
}
