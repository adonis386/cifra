import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { formatMoney } from "@/lib/company";
import { loadPartnerStatement } from "@/lib/export/reports-data";

export default async function PrintStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from || `${today.slice(0, 4)}-01-01`;
  const to = params.to || today;
  const partnerId = params.partner || "";
  if (!partnerId) notFound();

  const data = await loadPartnerStatement({ partnerId, from, to });
  if (!data) notFound();

  const qs = new URLSearchParams({ partner: partnerId, from, to }).toString();

  return (
    <div className="print-sheet">
      <PrintToolbar
        backHref={`/app/statements?${qs}`}
        xlsxHref={`/api/export/statements?${qs}`}
      />

      <p className="print-title" style={{ color: "#0f172a" }}>
        Estado de cuenta
      </p>
      <p style={{ margin: "4px 0" }}>
        <strong>{data.full.name}</strong> · RIF {data.full.rif}
      </p>
      <p style={{ margin: "8px 0 4px" }}>
        <strong>{data.partner.name}</strong> · {data.partner.rif}
      </p>
      <p style={{ fontSize: 11, marginBottom: 14 }}>
        Período {from} → {to} · Saldo {formatMoney(data.openResidual)} Bs
      </p>

      <table className="print-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Documento</th>
            <th>Detalle</th>
            <th>Cargo</th>
            <th>Abono</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={`${r.documento}-${i}`}>
              <td>{r.fecha}</td>
              <td>{r.documento}</td>
              <td>{r.detalle}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(r.cargo)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(r.abono)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(r.saldo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
