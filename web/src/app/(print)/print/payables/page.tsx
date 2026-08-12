import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { formatMoney } from "@/lib/company";
import { loadOpenInvoices } from "@/lib/export/reports-data";

export default async function PrintPayablesPage() {
  const data = await loadOpenInvoices("payable");
  if (!data) notFound();

  const total = data.rows.reduce((s, r) => s + r.saldo, 0);

  return (
    <div className="print-sheet">
      <PrintToolbar backHref="/app/payables" xlsxHref="/api/export/payables" />

      <p className="print-title" style={{ color: "#0f172a" }}>
        Cuentas por pagar
      </p>
      <p style={{ margin: "4px 0" }}>
        <strong>{data.full.name}</strong> · RIF {data.full.rif}
      </p>
      <p style={{ fontSize: 11, marginBottom: 14 }}>
        Corte {data.today} · Total saldo {formatMoney(total)} Bs
      </p>

      <table className="print-table">
        <thead>
          <tr>
            <th>Proveedor</th>
            <th>RIF</th>
            <th>Factura</th>
            <th>Emisión</th>
            <th>Vence</th>
            <th>Aging</th>
            <th>Total</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={`${r.factura}-${r.emision}`}>
              <td>{r.tercero}</td>
              <td>{r.rif}</td>
              <td>{r.factura}</td>
              <td>{r.emision}</td>
              <td>{r.vence}</td>
              <td style={{ textAlign: "center" }}>{r.aging}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(r.total)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(r.saldo)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7} style={{ textAlign: "right", fontWeight: 700 }}>
              Total
            </td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
