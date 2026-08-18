import { notFound } from "next/navigation";
import { PrintFooter, PrintLetterhead } from "@/components/print/print-branding";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { getCompanyPrintProfile } from "@/lib/company-print";
import { createClient } from "@/lib/supabase/server";

type BookLine = {
  rank: number;
  emission_date: string;
  registration_date?: string | null;
  partner_rif: string;
  partner_name: string;
  invoice_number: string;
  control_number: string | null;
  doc_type: string;
  debit_note?: string | null;
  credit_note?: string | null;
  affected_document?: string | null;
  amount_untaxed: number;
  amount_tax: number;
  amount_exempt: number;
  amount_total: number;
  amount_retained: number;
  base_general?: number;
  tax_general?: number;
  rate_general?: number;
  base_reduced?: number;
  tax_reduced?: number;
  rate_reduced?: number;
  base_additional?: number;
  tax_additional?: number;
  rate_additional?: number;
  base_import?: number;
  tax_import?: number;
  rate_import?: number;
  igtf_amount?: number;
  igtf_rate?: number;
  voucher_number?: string | null;
};

function n(v: unknown) {
  return Number(v || 0);
}

export default async function PrintBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getActiveCompany();
  if (!company) notFound();

  const supabase = await createClient();
  const [profile, { data: book }] = await Promise.all([
    getCompanyPrintProfile(company.id),
    supabase
      .from("fiscal_books")
      .select("id, name, book_type, period_start, period_end, state")
      .eq("id", id)
      .eq("company_id", company.id)
      .single(),
  ]);
  if (!book || !profile) notFound();

  const { data: linesRaw } = await supabase
    .from("fiscal_book_lines")
    .select("*")
    .eq("book_id", book.id)
    .order("rank");

  const lines = (linesRaw || []) as BookLine[];
  const isPurchase = book.book_type === "purchase";
  const title = isPurchase
    ? "Libro de Compras según Art. 75 del Reglamento de la Ley del IVA"
    : "Libro de Ventas según Art. 75 del Reglamento de la Ley del IVA";

  const tot = lines.reduce(
    (a, l) => {
      a.total += n(l.amount_total);
      a.exempt += n(l.amount_exempt);
      a.baseG += n(l.base_general ?? l.amount_untaxed);
      a.taxG += n(l.tax_general ?? l.amount_tax);
      a.baseR += n(l.base_reduced);
      a.taxR += n(l.tax_reduced);
      a.baseA += n(l.base_additional);
      a.taxA += n(l.tax_additional);
      a.baseI += n(l.base_import);
      a.taxI += n(l.tax_import);
      a.ret += n(l.amount_retained);
      return a;
    },
    {
      total: 0,
      exempt: 0,
      baseG: 0,
      taxG: 0,
      baseR: 0,
      taxR: 0,
      baseA: 0,
      taxA: 0,
      baseI: 0,
      taxI: 0,
      ret: 0,
    },
  );

  const fmtDate = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return y && m && day ? `${day}/${m}/${y}` : d;
  };

  return (
    <div className="print-sheet" style={{ fontSize: 10 }}>
      <PrintToolbar
        backHref={`/app/books?id=${book.id}`}
        xlsxHref={`/api/export/book?id=${book.id}`}
      />

      <PrintLetterhead company={profile} documentTitle={title} />
      <p style={{ marginBottom: 10, fontSize: 11 }}>
        Período desde: <strong>{fmtDate(book.period_start)}</strong> hasta{" "}
        <strong>{fmtDate(book.period_end)}</strong> · Expresado en Bolívares (Bs.)
      </p>

      <div style={{ overflowX: "auto" }}>
        <table className="print-table" style={{ fontSize: 8 }}>
          <thead>
            <tr>
              <th>N° Op.</th>
              <th>Fecha Emisión</th>
              <th>Tipo Doc.</th>
              <th>Documento</th>
              <th>N° ND</th>
              <th>N° NC</th>
              <th>Fact. Afectada</th>
              <th>N° Control</th>
              <th>Razón Social</th>
              <th>RIF</th>
              <th>{isPurchase ? "Total Compras + Imp." : "Total Ventas + Imp."}</th>
              <th>Exento / SDCF</th>
              <th>ET Base</th>
              <th>(%)</th>
              <th>ET Imp.</th>
              <th>NA Base 16%</th>
              <th>(%)</th>
              <th>NA Imp. 16%</th>
              <th>NA Base 8%</th>
              <th>(%)</th>
              <th>NA Imp. 8%</th>
              <th>NA Base 31%</th>
              <th>(%)</th>
              <th>NA Imp. 31%</th>
              <th>Comp. Ret. IVA</th>
              <th>IVA Retenido</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const baseG = n(l.base_general ?? l.amount_untaxed);
              const taxG = n(l.tax_general ?? l.amount_tax);
              const rateG = n(l.rate_general) || (taxG > 0 ? 16 : 0);
              const baseR = n(l.base_reduced);
              const taxR = n(l.tax_reduced);
              const rateR = n(l.rate_reduced) || (taxR > 0 ? 8 : 0);
              const baseA = n(l.base_additional);
              const taxA = n(l.tax_additional);
              const rateA = n(l.rate_additional) || (taxA > 0 ? 31 : 0);
              const baseI = n(l.base_import);
              const taxI = n(l.tax_import);
              const rateI = n(l.rate_import) || (taxI > 0 ? 16 : 0);
              return (
                <tr key={l.rank}>
                  <td style={{ textAlign: "center" }}>{l.rank}</td>
                  <td>{fmtDate(l.emission_date)}</td>
                  <td style={{ textAlign: "center" }}>{l.doc_type}</td>
                  <td>{l.invoice_number}</td>
                  <td>{l.debit_note || ""}</td>
                  <td>{l.credit_note || ""}</td>
                  <td>{l.affected_document || ""}</td>
                  <td>{l.control_number || ""}</td>
                  <td>{l.partner_name}</td>
                  <td>{l.partner_rif}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(n(l.amount_total))}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(n(l.amount_exempt))}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(baseI)}</td>
                  <td style={{ textAlign: "center" }}>{rateI || ""}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(taxI)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(baseG)}</td>
                  <td style={{ textAlign: "center" }}>{rateG || ""}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(taxG)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(baseR)}</td>
                  <td style={{ textAlign: "center" }}>{rateR || ""}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(taxR)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(baseA)}</td>
                  <td style={{ textAlign: "center" }}>{rateA || ""}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(taxA)}</td>
                  <td>{l.voucher_number || ""}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(n(l.amount_retained))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={10} style={{ textAlign: "right", fontWeight: 700 }}>
                Totales
              </td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.total)}</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.exempt)}</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.baseI)}</td>
              <td />
              <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.taxI)}</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.baseG)}</td>
              <td />
              <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.taxG)}</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.baseR)}</td>
              <td />
              <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.taxR)}</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.baseA)}</td>
              <td />
              <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.taxA)}</td>
              <td />
              <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.ret)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ marginTop: 18, fontSize: 11 }}>
        <p style={{ fontWeight: 700, marginBottom: 6 }}>RESUMEN GENERAL</p>
        <table className="print-table" style={{ maxWidth: 520 }}>
          <thead>
            <tr>
              <th>Concepto</th>
              <th style={{ textAlign: "right" }}>Base Imponible</th>
              <th style={{ textAlign: "right" }}>
                {isPurchase ? "Crédito Fiscal" : "Débito Fiscal"}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {isPurchase ? "Compras" : "Ventas"} internas alícuota general
              </td>
              <td style={{ textAlign: "right" }}>{formatMoney(tot.baseG)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(tot.taxG)}</td>
            </tr>
            <tr>
              <td>
                {isPurchase ? "Compras" : "Ventas"} internas alícuota reducida
              </td>
              <td style={{ textAlign: "right" }}>{formatMoney(tot.baseR)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(tot.taxR)}</td>
            </tr>
            <tr>
              <td>
                {isPurchase ? "Compras" : "Ventas"} internas alícuota adicional
              </td>
              <td style={{ textAlign: "right" }}>{formatMoney(tot.baseA)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(tot.taxA)}</td>
            </tr>
            <tr>
              <td>Importaciones / ET</td>
              <td style={{ textAlign: "right" }}>{formatMoney(tot.baseI)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(tot.taxI)}</td>
            </tr>
            <tr>
              <td>Total exentas / SDCF</td>
              <td style={{ textAlign: "right" }}>{formatMoney(tot.exempt)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(0)}</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 700 }}>Totales generales</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>
                {formatMoney(tot.baseG + tot.baseR + tot.baseA + tot.baseI + tot.exempt)}
              </td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>
                {formatMoney(tot.taxG + tot.taxR + tot.taxA + tot.taxI)}
              </td>
            </tr>
            <tr>
              <td>Total IVA retenido</td>
              <td colSpan={2} style={{ textAlign: "right", fontWeight: 700 }}>
                {formatMoney(tot.ret)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <PrintFooter company={profile} />
    </div>
  );
}
