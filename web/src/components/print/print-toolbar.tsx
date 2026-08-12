"use client";

import Link from "next/link";

export function PrintToolbar({
  backHref,
  xlsxHref,
}: {
  backHref: string;
  xlsxHref?: string;
}) {
  return (
    <div className="print-actions no-print">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-soft)]"
      >
        Imprimir / PDF
      </button>
      {xlsxHref ? (
        <a
          href={xlsxHref}
          className="rounded-[var(--radius-md)] bg-[#15803d] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95"
        >
          Descargar Excel
        </a>
      ) : null}
      <Link
        href={backHref}
        className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold text-[var(--color-foreground)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
      >
        Volver
      </Link>
    </div>
  );
}
