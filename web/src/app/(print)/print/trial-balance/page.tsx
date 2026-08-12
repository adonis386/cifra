import { notFound } from "next/navigation";
import { PrintFooter, PrintLetterhead } from "@/components/print/print-branding";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { formatMoney } from "@/lib/company";
import { getCompanyPrintProfile } from "@/lib/company-print";
import { loadTrialBalance } from "@/lib/export/reports-data";

export default async function PrintTrialBalancePage() {
  const data = await loadTrialBalance();
  if (!data) notFound();
  const profile = await getCompanyPrintProfile(data.company.id);
  if (!profile) notFound();

  const totalDebit = data.rows.reduce((s, r) => s + r.debe, 0);
  const totalCredit = data.rows.reduce((s, r) => s + r.haber, 0);

  return (
    <div className="print-sheet">
      <PrintToolbar
        backHref="/app/accounts"
        xlsxHref="/api/export/trial-balance"
      />
      <PrintLetterhead
        company={profile}
        documentTitle="Balance de comprobación"
      />
      <p style={{ fontSize: 11, marginBottom: 14 }}>
        Saldos acumulados · Debe {formatMoney(totalDebit)} · Haber{" "}
        {formatMoney(totalCredit)}
      </p>

      <table className="print-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Cuenta</th>
            <th>Debe</th>
            <th>Haber</th>
            <th>Saldo</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.codigo}>
              <td>{r.codigo}</td>
              <td>{r.cuenta}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(r.debe)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(r.haber)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(r.saldo)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} style={{ textAlign: "right", fontWeight: 700 }}>
              Totales
            </td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(totalDebit)}
            </td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>
              {formatMoney(totalCredit)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
      <PrintFooter company={profile} />
    </div>
  );
}
