import Link from "next/link";
import { BookForm } from "@/components/books/book-form";
import { DeleteBookButton } from "@/components/books/delete-book-button";
import { ReportExportActions } from "@/components/report-export-actions";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  Td,
  Th,
} from "@/components/layout";

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const company = await getActiveCompany();
  const params = await searchParams;
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Libros fiscales" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: books } = await supabase
    .from("fiscal_books")
    .select("id, name, book_type, period_start, period_end, state, created_at")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false });

  const selectedId = params.id || books?.[0]?.id;
  const { data: lines } = selectedId
    ? await supabase
        .from("fiscal_book_lines")
        .select("*")
        .eq("book_id", selectedId)
        .order("rank")
    : { data: [] };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="SENIAT · Art. 75"
        title="Libros fiscales"
        description="Libro de compras y ventas según Art. 75 del Reglamento de IVA (alícuotas 16/8/31, NC/ND, retención)."
      />

      <SectionCard title="Generar período">
        <BookForm />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <SectionCard title="Histórico" description="Puedes borrar libros que ya no uses.">
          <div className="space-y-2">
            {(books || []).map((b) => (
              <div
                key={b.id}
                className={`rounded-[var(--radius-md)] border px-3 py-3 text-sm transition-colors duration-200 ${
                  b.id === selectedId
                    ? "border-[var(--color-primary)] bg-[var(--color-muted)]"
                    : "border-[var(--color-border)] hover:bg-[var(--color-muted)]"
                }`}
              >
                <Link href={`/app/books?id=${b.id}`} className="block">
                  <div className="font-semibold">{b.name}</div>
                  <div className="text-xs text-[var(--color-muted-foreground)]">
                    {b.period_start} → {b.period_end}
                  </div>
                </Link>
                <DeleteBookButton bookId={b.id} />
              </div>
            ))}
            {!books?.length && (
              <EmptyState title="Sin libros" description="Genera el primero arriba." />
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Detalle del libro"
          description={
            selectedId
              ? "Vista resumida. Usa Imprimir/PDF o Excel para el formato completo Art. 75."
              : undefined
          }
        >
          {selectedId && (lines || []).length > 0 && (
            <div className="mb-4">
              <ReportExportActions
                pdfHref={`/print/book/${selectedId}`}
                xlsxHref={`/api/export/book?id=${selectedId}`}
              />
            </div>
          )}
          {(lines || []).length ? (
            <div className="overflow-x-auto">
              <DataTable>
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>Fecha</Th>
                    <Th>Tipo</Th>
                    <Th>Doc / NC / ND</Th>
                    <Th>RIF</Th>
                    <Th>Nombre</Th>
                    <Th className="text-right">Total</Th>
                    <Th className="text-right">Exento</Th>
                    <Th className="text-right">Base 16%</Th>
                    <Th className="text-right">IVA 16%</Th>
                    <Th className="text-right">Base 8%</Th>
                    <Th className="text-right">IVA 8%</Th>
                    <Th className="text-right">Ret. IVA</Th>
                  </tr>
                </thead>
                <tbody>
                  {(lines || []).map((l) => {
                    const doc =
                      l.credit_note || l.debit_note || l.invoice_number || "—";
                    return (
                      <tr key={`${l.rank}-${l.invoice_number}`}>
                        <Td>{l.rank}</Td>
                        <Td className="whitespace-nowrap">{l.emission_date}</Td>
                        <Td>{l.doc_type}</Td>
                        <Td className="font-mono text-xs">{doc}</Td>
                        <Td className="font-mono text-xs">{l.partner_rif}</Td>
                        <Td>{l.partner_name}</Td>
                        <Td className="text-right font-mono text-xs font-semibold">
                          {formatMoney(l.amount_total)}
                        </Td>
                        <Td className="text-right font-mono text-xs">
                          {formatMoney(l.amount_exempt)}
                        </Td>
                        <Td className="text-right font-mono text-xs">
                          {formatMoney(Number(l.base_general ?? l.amount_untaxed))}
                        </Td>
                        <Td className="text-right font-mono text-xs">
                          {formatMoney(Number(l.tax_general ?? l.amount_tax))}
                        </Td>
                        <Td className="text-right font-mono text-xs">
                          {formatMoney(Number(l.base_reduced || 0))}
                        </Td>
                        <Td className="text-right font-mono text-xs">
                          {formatMoney(Number(l.tax_reduced || 0))}
                        </Td>
                        <Td className="text-right font-mono text-xs">
                          {formatMoney(l.amount_retained)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </div>
          ) : (
            <EmptyState title="Sin líneas" description="Selecciona o genera un libro." />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
