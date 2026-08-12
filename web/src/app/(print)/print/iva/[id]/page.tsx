import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

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
    affected_document: string | null;
    amount_total: number;
    amount_untaxed: number;
    amount_exempt: number;
    alicuota: number;
    amount_withheld: number;
  }>;

  const periodLabel = `${wh.period.slice(4, 6)}/${wh.period.slice(0, 4)}`;

  return (
    <div className="print-sheet">
      <PrintToolbar backHref="/app/withholdings" />

      <table style={{ width: "100%", marginBottom: 12 }}>
        <tbody>
          <tr>
            <td style={{ width: "55%" }}>
              <p className="print-title">Comprobante de Retención de IVA</p>
              <p style={{ fontSize: 10, marginTop: 6 }}>
                LEY IVA – ART. 11: serán responsables del pago del impuesto en calidad de
                agentes de retención los compradores o adquirientes designados por la
                Administración Tributaria.
              </p>
              <p style={{ fontSize: 11 }}>
                Providencia Administrativa N° SNAT/2015/0049
              </p>
            </td>
            <td>
              <table className="print-box">
                <tbody>
                  <tr>
                    <td>
                      <strong>Nro. Comprobante</strong>
                      <div>{wh.voucher_number}</div>
                    </td>
                    <td>
                      <strong>Fecha</strong>
                      <div>{wh.voucher_date}</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="print-box" style={{ marginBottom: 14 }}>
        <tbody>
          <tr>
            <td colSpan={2}>
              <div style={{ fontSize: 10 }}>Agente de Retención</div>
              <strong>{fullCompany?.name}</strong>
            </td>
            <td>
              <div style={{ fontSize: 10 }}>RIF Agente</div>
              <strong>{fullCompany?.rif}</strong>
            </td>
            <td>
              <div style={{ fontSize: 10 }}>Período Fiscal</div>
              <strong>{periodLabel}</strong>
            </td>
          </tr>
          <tr>
            <td colSpan={4}>
              <div style={{ fontSize: 10 }}>Dirección fiscal del agente</div>
              {fullCompany?.address || "—"}
            </td>
          </tr>
          <tr>
            <td colSpan={2}>
              <div style={{ fontSize: 10 }}>Sujeto retenido</div>
              <strong>{p?.name}</strong>
            </td>
            <td colSpan={2}>
              <div style={{ fontSize: 10 }}>RIF retenido</div>
              <strong>{p?.rif}</strong>
            </td>
          </tr>
          <tr>
            <td colSpan={4}>
              <div style={{ fontSize: 10 }}>Dirección fiscal del retenido</div>
              {p?.address || "—"}
            </td>
          </tr>
        </tbody>
      </table>

      <table className="print-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Nº Factura</th>
            <th>Nº Control</th>
            <th>Tipo</th>
            <th>Doc. afectado</th>
            <th>Total doc.</th>
            <th>Base</th>
            <th>Exento</th>
            <th>% Alic.</th>
            <th>IVA</th>
            <th>IVA retenido</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const iva = Number(((Number(l.amount_untaxed) * Number(l.alicuota)) / 100).toFixed(2));
            return (
              <tr key={i}>
                <td>{l.invoice_date || "—"}</td>
                <td>{l.invoice_number || "—"}</td>
                <td>{l.control_number || "—"}</td>
                <td style={{ textAlign: "center" }}>{l.doc_type}</td>
                <td>{l.affected_document || "0"}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_total)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_untaxed)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_exempt)}</td>
                <td style={{ textAlign: "right" }}>{Number(l.alicuota).toFixed(2)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(iva)}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(l.amount_withheld)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} style={{ textAlign: "right", fontWeight: 700 }}>
              Totales
            </td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(lines.reduce((s, l) => s + Number(l.amount_total), 0))}
            </td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(wh.amount_untaxed)}
            </td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(lines.reduce((s, l) => s + Number(l.amount_exempt), 0))}
            </td>
            <td />
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(wh.amount_tax)}
            </td>
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
