"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Building2,
  Check,
  ChevronDown,
  LogOut,
  Plus,
  Settings2,
} from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { setActiveCompany } from "@/lib/actions/active-company";

type CompanyOption = {
  id: string;
  name: string;
  rif: string;
  logo_url?: string | null;
};

const itemClass =
  "flex w-full min-h-11 items-center gap-2.5 rounded-[var(--radius-md)] px-2 text-left text-sm transition-colors duration-200 motion-reduce:transition-none hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2";

function emailInitials(email?: string | null) {
  if (!email) return "U";
  return (
    email
      .split("@")[0]
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase() || "U"
  );
}

function CompanyMark({
  logoUrl,
  size = 32,
  rounded = "full",
}: {
  logoUrl?: string | null;
  size?: 32 | 44;
  rounded?: "full" | "xl";
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  const showLogo = Boolean(logoUrl) && !failed;
  const box = size === 44 ? "h-11 w-11" : "h-8 w-8";
  const radius = rounded === "full" ? "rounded-full" : "rounded-xl";

  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center overflow-hidden border border-[var(--color-border)] bg-white ${radius}`}
      aria-hidden
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element -- Storage público; tamaño fijo evita CLS
        <img
          src={logoUrl || ""}
          alt=""
          width={size}
          height={size}
          className={`${box} max-w-full object-contain`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-[var(--brand-accent-muted)] text-[var(--color-primary)]">
          <Building2 className={size === 44 ? "h-5 w-5" : "h-4 w-4"} />
        </span>
      )}
    </span>
  );
}

function SwitchLabel({ selected }: { selected: boolean }) {
  const { pending } = useFormStatus();
  if (pending) {
    return (
      <span className="shrink-0 text-xs font-medium text-[var(--color-muted-foreground)]">
        Cambiando…
      </span>
    );
  }
  if (selected) {
    return <Check className="h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden />;
  }
  return null;
}

export function CompanySwitcher({
  companies,
  activeCompanyId,
  email,
}: {
  companies: CompanyOption[];
  activeCompanyId?: string | null;
  email?: string | null;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const active =
    companies.find((c) => c.id === activeCompanyId) || companies[0] || null;
  const label = active?.name || "Tu perfil";

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const el = rootRef.current;
      if (e.target instanceof Node && el && !el.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        className="flex min-h-11 max-w-full items-center gap-2 rounded-full py-1 pl-1 pr-2 text-left transition-colors duration-200 motion-reduce:transition-none hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <CompanyMark logoUrl={active?.logo_url} />
        <span className="min-w-0 max-w-[9rem] sm:max-w-[14rem]">
          <span className="block truncate text-sm font-semibold leading-5">
            {label}
          </span>
          <span className="block truncate text-xs leading-4 text-[var(--color-muted-foreground)]">
            {email || active?.rif || "Cuenta"}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={menuId}
          className="absolute right-0 z-50 mt-2 w-[min(calc(100vw-1.5rem),20rem)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-md)]"
        >
          <div className="flex items-start gap-3 border-b border-[var(--color-border)] px-3 py-3">
            <CompanyMark logoUrl={active?.logo_url} size={44} rounded="xl" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-5">{label}</p>
              {active?.rif ? (
                <p className="truncate font-mono text-xs leading-4 text-[var(--color-muted-foreground)]">
                  {active.rif}
                </p>
              ) : null}
              {email ? (
                <p
                  className="mt-0.5 truncate text-xs leading-4 text-[var(--color-muted-foreground)]"
                  title={email}
                >
                  {email}
                </p>
              ) : null}
            </div>
          </div>

          {companies.length > 0 ? (
            <div className="max-h-[min(16rem,calc(100vh-18rem))] overflow-y-auto p-1">
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                Empresas
              </p>
              {companies.map((c) => {
                const selected = c.id === active?.id;
                return (
                  <form key={c.id} action={setActiveCompany}>
                    <button
                      type="submit"
                      name="company_id"
                      value={c.id}
                      className={itemClass}
                      aria-current={selected ? "true" : undefined}
                      onClick={(e) => {
                        if (selected) {
                          e.preventDefault();
                          setOpen(false);
                        }
                      }}
                    >
                      <CompanyMark logoUrl={c.logo_url} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.name}</span>
                        <span className="block truncate font-mono text-xs text-[var(--color-muted-foreground)]">
                          {c.rif}
                        </span>
                      </span>
                      <SwitchLabel selected={selected} />
                    </button>
                  </form>
                );
              })}
            </div>
          ) : null}

          <div className="space-y-0.5 border-t border-[var(--color-border)] p-1">
            <Link href="/app/empresa/nueva" className={itemClass} onClick={() => setOpen(false)}>
              <Plus className="h-4 w-4 shrink-0 text-[var(--color-primary)]" aria-hidden />
              Nueva empresa
            </Link>
            <Link href="/app/config" className={itemClass} onClick={() => setOpen(false)}>
              <Settings2 className="h-4 w-4 shrink-0" aria-hidden />
              Configuración y membrete
            </Link>
          </div>

          <div className="border-t border-[var(--color-border)] p-1">
            {email ? (
              <p className="flex min-h-11 items-center gap-2.5 px-2 text-sm">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent-muted)] text-[11px] font-bold tracking-wide text-[var(--color-primary)]"
                  aria-hidden
                >
                  {emailInitials(email)}
                </span>
                <span className="min-w-0 truncate text-[var(--color-muted-foreground)]" title={email}>
                  {email}
                </span>
              </p>
            ) : null}
            <form action={signOut}>
              <button type="submit" className={itemClass}>
                <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                Salir
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
