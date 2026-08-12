import { notFound } from "next/navigation";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export default async function PrintBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getActiveCompany();
  if (!company) notFound();

  const supabase = await createClient();
  const [{ data: fullCompany }, { data: book }] = await Promise.all([
    supabase.from("companies").select("name, rif, address").eq("id", company.id).single(),
    supabase
      .from("fiscal_books")
      .select("id, name, book_type, period_start, period_end, state")
      .eq("id", id)
      .eq("company_id", company.id)
      .single(),
  ]);
  if (!book) notFound();

  const { data: lines } = await supabase
    .from("fiscal_book_lines")
    .select(
      "rank, emission_date, partner_rif, partner_name, invoice_number, control_number, doc_type, amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained",
    )
    .eq("book_id", book.id)
    .order("rank");

  const title =
    book.book_type === "sale" ? "Libro de Ventas" : "Libro de Compras";
  const totals = (lines || []).reduce(
    (acc, l) => {
      acc.untaxed += Number(l.amount_untaxed);
      acc.tax += Number(l.amount_tax);
      acc.exempt += Number(l.amount_exempt);
      acc.total += Number(l.amount_total);
      acc.retained += Number(l.amount_retained);
      return acc;
    },
    { untaxed: 0, tax: 0, exempt: 0, total: 0, retained: 0 },
  );

  return (
    <div className="print-sheet">
      <PrintToolbar
        backHref={`/app/books?id=${book.id}`}
        xlsxHref={`/api/export/book?id=${book.id}`}
      />

      <div style={{ marginBottom: 16 }}>
        <p className="print-title">{title}</p>
        <p style={{ margin: "4px 0" }}>
          <strong>{fullCompany?.name}</strong> · RIF {fullCompany?.rif}
        </p>
        <p style={{ margin: 0, fontSize: 11 }}>{fullCompany?.address || ""}</p>
        <p style={{ marginTop: 8 }}>
          Período: <strong>{book.period_start}</strong> → <strong>{book.period_end}</strong>
        </p>
      </div>

      <table className="print-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Fecha</th>
            <th>RIF</th>
            <th>Nombre</th>
            <th>Factura</th>
            <th>Control</th>
            <th>Tipo</th>
            <th>Base</th>
            <th>IVA</th>
            <th>Exento</th>
            <th>Total</th>
            <th>Ret. IVA</th>
          </tr>
        </thead>
        <tbody>
          {(lines || []).map((l) => (
            <tr key={l.rank}>
              <td style={{ textAlign: "center" }}>{l.rank}</td>
              <td>{l.emission_date}</td>
              <td>{l.partner_rif}</td>
              <td>{l.partner_name}</td>
              <td>{l.invoice_number}</td>
              <td>{l.control_number || "—"}</td>
              <td style={{ textAlign: "center" }}>{l.doc_type}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(l.amount_untaxed)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(l.amount_tax)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(l.amount_exempt)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(l.amount_total)}</td>
              <td style={{ textAlign: "right" }}>{formatMoney(l.amount_retained)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7} style={{ textAlign: "right", fontWeight: 700 }}>
              Totales
            </td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(totals.untaxed)}</td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(totals.tax)}</td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(totals.exempt)}</td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(totals.total)}</td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>{formatMoney(totals.retained)}</td>
          </tr>
        </tfoot>
      </table>

      <p style={{ marginTop: 24, fontSize: 11 }}>
        Generado con Cifra · basado en account.fiscal.book (l10n_ve_full)
      </p>
    </div>
  );
}
