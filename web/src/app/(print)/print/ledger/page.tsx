import { notFound } from "next/navigation";
import { PrintFooter, PrintLetterhead } from "@/components/print/print-branding";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { formatMoney } from "@/lib/company";
import { getCompanyPrintProfile } from "@/lib/company-print";
import { loadLedger } from "@/lib/export/reports-data";

export default async function PrintLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const from = params.from || `${today.slice(0, 8)}01`;
  const to = params.to || today;
  const accountId = params.account || "";
  if (!accountId) notFound();

  const data = await loadLedger({ accountId, from, to });
  if (!data) notFound();
  const profile = await getCompanyPrintProfile(data.company.id);
  if (!profile) notFound();

  const qs = new URLSearchParams({ account: accountId, from, to }).toString();

  return (
    <div className="print-sheet">
      <PrintToolbar
        backHref={`/app/ledger?${qs}`}
        xlsxHref={`/api/export/ledger?${qs}`}
      />
      <PrintLetterhead company={profile} documentTitle="Mayor contable" />
      <p style={{ margin: "0 0 4px" }}>
        Cuenta <strong>{data.account.code}</strong> — {data.account.name}
      </p>
      <p style={{ fontSize: 11, marginBottom: 14 }}>
        Período {from} → {to} · Debe {formatMoney(data.totalDebit)} · Haber{" "}
        {formatMoney(data.totalCredit)}
      </p>

      <table className="print-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Asiento</th>
            <th>Detalle</th>
            <th>Tercero</th>
            <th>Debe</th>
            <th>Haber</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={`${r.asiento}-${i}`}>
              <td>{r.fecha}</td>
              <td>{r.asiento}</td>
              <td>{r.detalle}</td>
              <td>{r.tercero}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(r.debe)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(r.haber)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(r.saldo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <PrintFooter company={profile} />
    </div>
  );
}
