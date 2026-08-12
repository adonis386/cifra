"use client";

export function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="print-actions no-print">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-[14px] bg-[#059669] px-4 py-2.5 text-sm font-semibold text-white"
      >
        Imprimir / PDF
      </button>
      <a
        href={backHref}
        className="rounded-[14px] border border-[#1e3a5f]/30 px-4 py-2.5 text-sm font-semibold text-[#1e3a5f]"
      >
        Volver
      </a>
    </div>
  );
}
