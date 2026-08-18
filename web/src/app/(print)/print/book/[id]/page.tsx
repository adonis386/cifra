import { notFound } from "next/navigation";
import { PrintFooter, PrintLetterhead } from "@/components/print/print-branding";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { getCompanyPrintProfile } from "@/lib/company-print";
import { createClient } from "@/lib/supabase/server";

type BookLine = Record<string, unknown> & {
  rank: number;
  emission_date: string;
  partner_rif: string;
  partner_name: string;
  invoice_number: string;
  control_number: string | null;
  doc_type: string;
};

function n(v: unknown) {
  return Number(v || 0);
}

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
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
    : "Libro de Ventas según Art. 76 del Reglamento de la Ley del IVA";

  const tot = lines.reduce(
    (a, l) => {
      a.total += n(l.amount_total);
      a.exempt += n(l.amount_exempt);
      a.exonerated += n(l.amount_exonerated);
      a.export += n(l.amount_export);
      a.baseG += n(l.base_general ?? (isPurchase ? l.amount_untaxed : 0));
      a.taxG += n(l.tax_general ?? (isPurchase ? l.amount_tax : 0));
      a.baseR += n(l.base_reduced);
      a.taxR += n(l.tax_reduced);
      a.baseA += n(l.base_additional);
      a.taxA += n(l.tax_additional);
      a.baseI += n(l.base_import);
      a.taxI += n(l.tax_import);
      a.baseN += n(l.base_natural);
      a.taxN += n(l.tax_natural);
      a.baseNr += n(l.base_natural_reduced);
      a.taxNr += n(l.tax_natural_reduced);
      a.baseNa += n(l.base_natural_additional);
      a.taxNa += n(l.tax_natural_additional);
      a.ret += n(l.amount_retained);
      return a;
    },
    {
      total: 0,
      exempt: 0,
      exonerated: 0,
      export: 0,
      baseG: 0,
      taxG: 0,
      baseR: 0,
      taxR: 0,
      baseA: 0,
      taxA: 0,
      baseI: 0,
      taxI: 0,
      baseN: 0,
      taxN: 0,
      baseNr: 0,
      taxNr: 0,
      baseNa: 0,
      taxNa: 0,
      ret: 0,
    },
  );

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
        {isPurchase ? (
          <PurchaseTable lines={lines} tot={tot} />
        ) : (
          <SalesTable lines={lines} tot={tot} />
        )}
      </div>

      <div style={{ marginTop: 18, fontSize: 11 }}>
        <p style={{ fontWeight: 700, marginBottom: 6 }}>RESUMEN GENERAL</p>
        <table className="print-table" style={{ maxWidth: 560 }}>
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
            {isPurchase ? (
              <>
                <tr>
                  <td>Compras internas alícuota general</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(tot.baseG)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(tot.taxG)}</td>
                </tr>
                <tr>
                  <td>Compras internas alícuota reducida</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(tot.baseR)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(tot.taxR)}</td>
                </tr>
                <tr>
                  <td>Compras internas alícuota adicional</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(tot.baseA)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(tot.taxA)}</td>
                </tr>
                <tr>
                  <td>Importaciones / ET</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(tot.baseI)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(tot.taxI)}</td>
                </tr>
              </>
            ) : (
              <>
                <tr>
                  <td>Ventas internas alícuota general (CO)</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(tot.baseG)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(tot.taxG)}</td>
                </tr>
                <tr>
                  <td>Ventas internas alícuota reducida (CO)</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(tot.baseR)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(tot.taxR)}</td>
                </tr>
                <tr>
                  <td>Ventas a personas naturales (NO)</td>
                  <td style={{ textAlign: "right" }}>
                    {formatMoney(tot.baseN + tot.baseNr + tot.baseNa)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {formatMoney(tot.taxN + tot.taxNr + tot.taxNa)}
                  </td>
                </tr>
                <tr>
                  <td>Total ventas exentas</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(tot.exempt)}</td>
                  <td style={{ textAlign: "right" }}>{formatMoney(0)}</td>
                </tr>
              </>
            )}
            <tr>
              <td style={{ fontWeight: 700 }}>Totales generales</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>
                {formatMoney(
                  tot.baseG +
                    tot.baseR +
                    tot.baseA +
                    tot.baseI +
                    tot.baseN +
                    tot.baseNr +
                    tot.baseNa +
                    tot.exempt +
                    tot.export,
                )}
              </td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>
                {formatMoney(
                  tot.taxG +
                    tot.taxR +
                    tot.taxA +
                    tot.taxI +
                    tot.taxN +
                    tot.taxNr +
                    tot.taxNa,
                )}
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

function PurchaseTable({
  lines,
  tot,
}: {
  lines: BookLine[];
  tot: Record<string, number>;
}) {
  return (
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
          <th>Total Compras + Imp.</th>
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
              <td>{String(l.debit_note || "")}</td>
              <td>{String(l.credit_note || "")}</td>
              <td>{String(l.affected_document || "")}</td>
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
              <td>{String(l.voucher_number || "")}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(n(l.amount_retained))}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={10} style={{ textAlign: "right", fontWeight: 700 }}>
            TOTALES
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
  );
}

function SalesTable({
  lines,
  tot,
}: {
  lines: BookLine[];
  tot: Record<string, number>;
}) {
  return (
    <table className="print-table" style={{ fontSize: 7.5 }}>
      <thead>
        <tr>
          <th>N° Op.</th>
          <th>Fecha Emisión</th>
          <th>Tipo Doc.</th>
          <th>N° Documento</th>
          <th>N° ND</th>
          <th>N° NC</th>
          <th>Fact. Afectada</th>
          <th>Serial Maq. Fiscal</th>
          <th>Número Z</th>
          <th>Razón Social</th>
          <th>RIF</th>
          <th>Exp. Exportación</th>
          <th>Total Ventas + Imp.</th>
          <th>Exoneradas / No sujetas</th>
          <th>Total Exportación</th>
          <th>Ventas Exentas</th>
          <th>CO Base 16%</th>
          <th>(%)</th>
          <th>CO Imp. 16%</th>
          <th>CO Base 8%</th>
          <th>(%)</th>
          <th>CO Imp. 8%</th>
          <th>CO Base 31%</th>
          <th>(%)</th>
          <th>CO Imp. 31%</th>
          <th>Base Imp.</th>
          <th>Venta exenta</th>
          <th>(%)</th>
          <th>Impuesto</th>
          <th>NO Base 8%</th>
          <th>(%)</th>
          <th>NO Imp. 8%</th>
          <th>NO Base 31%</th>
          <th>(%)</th>
          <th>NO Imp. 31%</th>
          <th>Retención IVA</th>
          <th>Comp. Ret. IVA</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const baseG = n(l.base_general);
          const taxG = n(l.tax_general);
          const rateG = n(l.rate_general) || (taxG > 0 ? 16 : 0);
          const baseR = n(l.base_reduced);
          const taxR = n(l.tax_reduced);
          const rateR = n(l.rate_reduced) || (taxR > 0 ? 8 : 0);
          const baseA = n(l.base_additional);
          const taxA = n(l.tax_additional);
          const rateA = n(l.rate_additional) || (taxA > 0 ? 31 : 0);
          const baseN = n(l.base_natural);
          const taxN = n(l.tax_natural);
          const rateN = n(l.rate_natural) || (taxN > 0 ? 16 : 0);
          const baseNr = n(l.base_natural_reduced);
          const taxNr = n(l.tax_natural_reduced);
          const rateNr = taxNr > 0 ? 8 : 0;
          const baseNa = n(l.base_natural_additional);
          const taxNa = n(l.tax_natural_additional);
          const rateNa = taxNa > 0 ? 31 : 0;
          const exempt = n(l.amount_exempt);
          return (
            <tr key={l.rank}>
              <td style={{ textAlign: "center" }}>{l.rank}</td>
              <td>{fmtDate(l.emission_date)}</td>
              <td style={{ textAlign: "center" }}>{l.doc_type}</td>
              <td>{l.invoice_number}</td>
              <td>{String(l.debit_note || "")}</td>
              <td>{String(l.credit_note || "")}</td>
              <td>{String(l.affected_document || "")}</td>
              <td>{String(l.machine_serial || l.control_number || "")}</td>
              <td>{String(l.z_number || "")}</td>
              <td>{l.partner_name}</td>
              <td>{l.partner_rif}</td>
              <td>{String(l.export_file || "")}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(n(l.amount_total))}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(n(l.amount_exonerated))}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(n(l.amount_export))}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(exempt)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(baseG)}</td>
              <td style={{ textAlign: "center" }}>{rateG || ""}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(taxG)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(baseR)}</td>
              <td style={{ textAlign: "center" }}>{rateR || ""}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(taxR)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(baseA)}</td>
              <td style={{ textAlign: "center" }}>{rateA || ""}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(taxA)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(baseN)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(exempt)}</td>
              <td style={{ textAlign: "center" }}>{rateN || ""}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(taxN)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(baseNr)}</td>
              <td style={{ textAlign: "center" }}>{rateNr || ""}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(taxNr)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(baseNa)}</td>
              <td style={{ textAlign: "center" }}>{rateNa || ""}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(taxNa)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(n(l.amount_retained))}</td>
              <td>{String(l.voucher_number || "")}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={12} style={{ textAlign: "right", fontWeight: 700 }}>
            TOTALES
          </td>
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.total)}</td>
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.exonerated)}</td>
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.export)}</td>
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.exempt)}</td>
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.baseG)}</td>
          <td />
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.taxG)}</td>
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.baseR)}</td>
          <td />
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.taxR)}</td>
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.baseA)}</td>
          <td />
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.taxA)}</td>
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.baseN)}</td>
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.exempt)}</td>
          <td />
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.taxN)}</td>
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.baseNr)}</td>
          <td />
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.taxNr)}</td>
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.baseNa)}</td>
          <td />
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.taxNa)}</td>
          <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(tot.ret)}</td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}
