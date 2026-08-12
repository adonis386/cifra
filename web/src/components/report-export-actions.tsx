import Link from "next/link";
import { FileDown, Printer } from "lucide-react";

/** Acciones PDF (vista impresión) + Excel para reportes. */
export function ReportExportActions({
  pdfHref,
  xlsxHref,
  label = "Exportar",
}: {
  pdfHref?: string;
  xlsxHref?: string;
  label?: string;
}) {
  if (!pdfHref && !xlsxHref) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={label}>
      {pdfHref ? (
        <Link
          href={pdfHref}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          PDF / Imprimir
        </Link>
      ) : null}
      {xlsxHref ? (
        <a
          href={xlsxHref}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-primary-soft)]"
        >
          <FileDown className="h-3.5 w-3.5" aria-hidden />
          Excel
        </a>
      ) : null}
    </div>
  );
}
