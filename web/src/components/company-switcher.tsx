"use client";

import { useTransition } from "react";
import { ChevronsUpDown } from "lucide-react";
import { setActiveCompany } from "@/lib/actions/active-company";

type CompanyOption = { id: string; name: string; rif: string };

export function CompanySwitcher({
  companies,
  activeCompanyId,
}: {
  companies: CompanyOption[];
  activeCompanyId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const active =
    companies.find((c) => c.id === activeCompanyId) || companies[0] || null;

  if (!companies.length) {
    return (
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">Sin empresa</p>
        <p className="truncate text-xs text-[var(--color-muted-foreground)]">
          Crea tu primera empresa
        </p>
      </div>
    );
  }

  if (companies.length === 1 && active) {
    return (
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{active.name}</p>
        <p className="truncate font-mono text-xs text-[var(--color-muted-foreground)]">
          {active.rif}
        </p>
      </div>
    );
  }

  return (
    <form
      action={setActiveCompany}
      className="min-w-0 max-w-[min(100%,320px)]"
      onChange={(e) => {
        const form = e.currentTarget;
        startTransition(() => {
          form.requestSubmit();
        });
      }}
    >
      <label className="sr-only" htmlFor="company_id">
        Empresa activa
      </label>
      <div className="relative">
        <select
          id="company_id"
          name="company_id"
          key={active?.id || "none"}
          defaultValue={active?.id}
          disabled={pending}
          className="w-full appearance-none truncate rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white py-2 pl-3 pr-9 text-sm font-semibold text-[var(--color-foreground)] transition-colors focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[color-mix(in_srgb,var(--color-primary)_18%,transparent)] disabled:opacity-60"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.rif}
            </option>
          ))}
        </select>
        <ChevronsUpDown
          className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]"
          aria-hidden
        />
      </div>
      {active ? (
        <p className="mt-1 truncate font-mono text-[11px] text-[var(--color-muted-foreground)]">
          {pending ? "Cambiando…" : `Activa · ${active.rif}`}
        </p>
      ) : null}
    </form>
  );
}
