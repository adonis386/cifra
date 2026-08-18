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

/** Descompone correlativo SENIAT AAAAMM######## */
function splitVoucher(voucher: string, period: string) {
  const digits = String(voucher || "").replace(/\D/g, "");
  const p = String(period || "").replace(/\D/g, "");
  const year = (digits.slice(0, 4) || p.slice(0, 4) || "").padStart(4, "0");
  const month = (digits.slice(4, 6) || p.slice(4, 6) || "").padStart(2, "0");
  const corr = (digits.slice(6) || digits || "0").padStart(8, "0").slice(-8);
  return { year, month, corr };
}

export default async function PrintIvaPage({
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
      .select("id, name, rif, address, phone, email")
      .eq("id", company.id)
      .single(),
    supabase
      .from("withholding_iva")
      .select(
        "id, voucher_number, period, voucher_date, amount_untaxed, amount_tax, amount_withheld, partners(name, rif, address, phone), withholding_iva_lines(*)",
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
  const lines = (wh.withholding_iva_lines || []) as Array<{
    invoice_date: string | null;
    invoice_number: string | null;
    control_number: string | null;
    doc_type: string;
    operation_type?: string;
    affected_document: string | null;
    amount_total: number;
    amount_untaxed: number;
    amount_exempt: number;
    alicuota: number;
    amount_withheld: number;
  }>;

  const { year, month, corr } = splitVoucher(wh.voucher_number, wh.period);
  const box: CSSProperties = {
    border: "1px solid #222",
    padding: "6px 8px",
  };

  return (
    <div className="print-sheet" style={{ fontSize: 11 }}>
      <PrintToolbar backHref="/app/withholdings" />

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
        <tbody>
          <tr>
            <td style={{ ...box, width: "58%", verticalAlign: "top" }}>
              <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>
                COMPROBANTE DE RETENCIÓN DEL IMPUESTO AL VALOR AGREGADO
              </p>
              <p style={{ fontSize: 9, margin: "6px 0 0", lineHeight: 1.35 }}>
                (Ley IVA - Art. 11: &quot;Serán responsables del pago del impuesto en calidad
                de agentes de retención, los compradores o adquirientes de determinados
                bienes muebles y los receptores de ciertos servicios, a quienes la
                Administración Tributaria designe como tal&quot;)
              </p>
            </td>
            <td style={{ ...box, verticalAlign: "top" }}>
              <div style={{ fontSize: 9, fontWeight: 700 }}>0. NRO. COMPROBANTE</div>
              <table style={{ width: "100%", marginTop: 4, fontFamily: "monospace" }}>
                <tbody>
                  <tr>
                    <td style={{ textAlign: "center", border: "1px solid #444", padding: 4 }}>
                      {year}
                    </td>
                    <td style={{ textAlign: "center", border: "1px solid #444", padding: 4 }}>
                      {month}
                    </td>
                    <td style={{ textAlign: "center", border: "1px solid #444", padding: 4 }}>
                      {corr}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={3} style={{ fontSize: 8, textAlign: "center", paddingTop: 2 }}>
                      Año — Mes emisión — correlativo
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
            <td style={{ ...box, width: "18%", verticalAlign: "top" }}>
              <div style={{ fontSize: 9, fontWeight: 700 }}>1. FECHA</div>
              <div style={{ marginTop: 8, fontWeight: 700 }}>{fmtDate(wh.voucher_date)}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 8 }}>
        <tbody>
          <tr>
            <td style={{ ...box, width: "50%" }}>
              <div style={{ fontSize: 9 }}>2. NOMBRE O RAZÓN SOCIAL DEL AGENTE DE RETENCIÓN</div>
              <strong>{fullCompany?.name}</strong>
            </td>
            <td style={{ ...box, width: "28%" }}>
              <div style={{ fontSize: 9 }}>3. RIF DEL AGENTE DE RETENCIÓN</div>
              <strong style={{ fontFamily: "monospace" }}>{fullCompany?.rif}</strong>
            </td>
            <td style={{ ...box }}>
              <div style={{ fontSize: 9 }}>4. PERÍODO FISCAL</div>
              <div>
                AÑO: <strong>{year}</strong> · Mes: <strong>{month}</strong>
              </div>
            </td>
          </tr>
          <tr>
            <td colSpan={3} style={box}>
              <div style={{ fontSize: 9 }}>5. DIRECCIÓN FISCAL DEL AGENTE DE RETENCIÓN</div>
              {fullCompany?.address || "—"}
            </td>
          </tr>
          <tr>
            <td style={box}>
              <div style={{ fontSize: 9 }}>6. NOMBRE O RAZÓN SOCIAL DEL SUJETO RETENIDO</div>
              <strong>{p?.name}</strong>
            </td>
            <td colSpan={2} style={box}>
              <div style={{ fontSize: 9 }}>7. RIF DEL CONTRIBUYENTE</div>
              <strong style={{ fontFamily: "monospace" }}>{p?.rif}</strong>
            </td>
          </tr>
          <tr>
            <td colSpan={3} style={box}>
              <div style={{ fontSize: 9 }}>8. DIRECCIÓN FISCAL DEL SUJETO RETENIDO</div>
              {p?.address || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="print-table" style={{ fontSize: 9 }}>
        <thead>
          <tr>
            <th>Op.Nr.</th>
            <th>Fecha factura</th>
            <th>N° factura</th>
            <th>N° Control</th>
            <th>N° ND</th>
            <th>N° NC</th>
            <th>Tipo Tr.</th>
            <th>N° Fact. Afectada</th>
            <th>Total compras c/IVA</th>
            <th>Sin der. créd. fiscal</th>
            <th>Base imponible</th>
            <th>% Alíc.</th>
            <th>Impuesto IVA</th>
            <th>IVA retenido</th>
            <th>% Ret.</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const iva = Number(
              ((Number(l.amount_untaxed) * Number(l.alicuota)) / 100).toFixed(2),
            );
            const retPct =
              iva > 0
                ? Number(((Number(l.amount_withheld) / iva) * 100).toFixed(0))
                : 0;
            const isNc = l.doc_type === "03";
            const isNd = l.doc_type === "02";
            return (
              <tr key={i}>
                <td style={{ textAlign: "center" }}>
                  {String(i + 1).padStart(3, "0")}
                </td>
                <td>{fmtDate(l.invoice_date || "")}</td>
                <td>{isNc || isNd ? "" : l.invoice_number || "—"}</td>
                <td>{l.control_number || "—"}</td>
                <td>{isNd ? l.invoice_number : ""}</td>
                <td>{isNc ? l.invoice_number : ""}</td>
                <td style={{ textAlign: "center" }}>{l.doc_type || "01"}</td>
                <td>{l.affected_document || ""}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_total)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_exempt)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_untaxed)}</td>
                <td style={{ textAlign: "right" }}>{Number(l.alicuota).toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(iva)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_withheld)}</td>
                <td style={{ textAlign: "right" }}>{retPct}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={8} style={{ textAlign: "right", fontWeight: 700 }}>
              Total:
            </td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(lines.reduce((s, l) => s + Number(l.amount_total), 0))}
            </td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(lines.reduce((s, l) => s + Number(l.amount_exempt), 0))}
            </td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(wh.amount_untaxed)}
            </td>
            <td />
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(wh.amount_tax)}
            </td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(wh.amount_withheld)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>

      <table style={{ width: "100%", marginTop: 28, borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ ...box, width: "55%", height: 90, verticalAlign: "top" }}>
              <div style={{ fontSize: 9, fontWeight: 700 }}>
                AGENTE DE RETENCIÓN (SELLO, FECHA Y FIRMA)
              </div>
              <div style={{ marginTop: 16 }}>{fullCompany?.name}</div>
              <div style={{ marginTop: 20 }}>{fmtDate(wh.voucher_date)}</div>
            </td>
            <td style={{ ...box, verticalAlign: "top" }}>
              <div style={{ fontSize: 9, fontWeight: 700 }}>
                PARA USO DE LA ADMINISTRACIÓN DE HACIENDA
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
