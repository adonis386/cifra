import Link from "next/link";
import { BookForm } from "@/components/books/book-form";
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
        .select(
          "rank, emission_date, partner_rif, partner_name, invoice_number, control_number, doc_type, amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained",
        )
        .eq("book_id", selectedId)
        .order("rank")
    : { data: [] };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="SENIAT"
        title="Libros fiscales"
        description="Libro de compras y ventas generado desde facturas del período."
      />

      <SectionCard title="Generar período">
        <BookForm />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <SectionCard title="Histórico">
          <div className="space-y-2">
            {(books || []).map((b) => (
              <Link
                key={b.id}
                href={`/app/books?id=${b.id}`}
                className={`block rounded-[14px] border px-3 py-3 text-sm transition-colors duration-200 ${
                  b.id === selectedId
                    ? "border-[var(--color-primary)] bg-[var(--color-muted)]"
                    : "border-[var(--color-border)] hover:bg-[var(--color-muted)]"
                }`}
              >
                <div className="font-semibold">{b.name}</div>
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  {b.period_start} → {b.period_end}
                </div>
              </Link>
            ))}
            {!books?.length && (
              <EmptyState title="Sin libros" description="Genera el primero arriba." />
            )}
          </div>
        </SectionCard>

        <SectionCard title="Detalle del libro">
          {(lines || []).length ? (
            <DataTable>
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>Fecha</Th>
                  <Th>RIF</Th>
                  <Th>Nombre</Th>
                  <Th>Factura</Th>
                  <Th>Control</Th>
                  <Th className="text-right">Base</Th>
                  <Th className="text-right">IVA</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {(lines || []).map((l) => (
                  <tr key={`${l.rank}-${l.invoice_number}`}>
                    <Td>{l.rank}</Td>
                    <Td className="whitespace-nowrap">{l.emission_date}</Td>
                    <Td className="font-mono text-xs">{l.partner_rif}</Td>
                    <Td>{l.partner_name}</Td>
                    <Td>{l.invoice_number}</Td>
                    <Td className="font-mono text-xs">{l.control_number}</Td>
                    <Td className="text-right font-mono text-xs">{formatMoney(l.amount_untaxed)}</Td>
                    <Td className="text-right font-mono text-xs">{formatMoney(l.amount_tax)}</Td>
                    <Td className="text-right font-mono text-xs font-semibold">{formatMoney(l.amount_total)}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          ) : (
            <EmptyState title="Sin líneas" description="Selecciona o genera un libro." />
          )}
        </SectionCard>
      </div>
    </div>
  );
}
