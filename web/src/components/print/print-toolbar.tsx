"use client";

export function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="print-actions no-print">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-[var(--radius-md)] bg-[var(--brand-accent)] px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-[var(--brand-accent-hover)]"
      >
        Imprimir / PDF
      </button>
      <a
        href={backHref}
        className="rounded-[var(--radius-md)] border border-[var(--color-foreground)] px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-[var(--color-foreground)] transition-colors hover:border-[var(--brand-accent)] hover:text-[var(--brand-accent)]"
      >
        Volver
      </a>
    </div>
  );
}
