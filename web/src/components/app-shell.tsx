"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  FileText,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings2,
  Landmark,
  Users,
  Wallet,
  ScrollText,
} from "lucide-react";
import { CompanySwitcher } from "@/components/company-switcher";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui";

type Company = { id: string; name: string; rif: string };

const groups = [
  {
    label: "Operar",
    items: [
      { href: "/app", label: "Inicio", icon: LayoutDashboard },
      { href: "/app/invoices", label: "Facturas", icon: FileText },
      { href: "/app/partners", label: "Clientes / proveedores", icon: Users },
      { href: "/app/payments", label: "Cobros / Pagos", icon: Wallet },
    ],
  },
  {
    label: "Libro",
    items: [
      { href: "/app/treasury", label: "Tesorería", icon: Landmark },
      { href: "/app/entries", label: "Asientos", icon: ScrollText },
    ],
  },
  {
    label: "Cumplir",
    items: [
      { href: "/app/books", label: "Libros", icon: BookOpen },
      { href: "/app/withholdings", label: "Retenciones", icon: Receipt },
    ],
  },
];

export function AppShell({
  children,
  email,
  companies,
  activeCompanyId,
}: {
  children: React.ReactNode;
  email?: string | null;
  companies: Company[];
  activeCompanyId?: string | null;
}) {
  const pathname = usePathname();
  const active =
    companies.find((c) => c.id === activeCompanyId) || companies[0] || null;

  return (
    <div className="flex min-h-screen text-[var(--color-foreground)]">
      <aside className="cifra-motion-soft sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col bg-[var(--color-sidebar)] px-5 py-7 md:flex">
        <div className="mb-8 px-1">
          <p className="text-[1.75rem] font-bold leading-none tracking-tight text-white">
            Cifra
          </p>
          <p className="mt-1.5 text-xs text-[var(--color-sidebar-muted)]">
            Contabilidad VE
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto pb-4">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-sidebar-muted)]">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === "/app"
                      ? pathname === "/app"
                      : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] transition-colors duration-200 ${
                        isActive
                          ? "bg-[var(--color-sidebar-hover)] font-semibold text-[var(--color-sidebar-active)]"
                          : "font-medium text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-white"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto space-y-3 border-t border-white/10 pt-4">
          <Link
            href="/app/config"
            className={`flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] font-medium transition-colors ${
              pathname.startsWith("/app/config")
                ? "bg-[var(--color-sidebar-hover)] text-white"
                : "text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-white"
            }`}
          >
            <Settings2 className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Configuración
          </Link>
          <p className="px-2.5 text-[10px] leading-relaxed text-[var(--color-sidebar-muted)]">
            Desarrollado por{" "}
            <a
              href="https://www.informaticagonzalez.com"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[#93c5fd] hover:underline"
            >
              Informática González
            </a>
          </p>
          <form action={signOut}>
            <Button
              type="submit"
              variant="ghost"
              className="w-full justify-start text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Salir
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border)]/80 bg-white/70 px-4 py-3 backdrop-blur-md md:px-10">
          <div className="min-w-0 md:hidden">
            <p className="text-lg font-bold tracking-tight">Cifra</p>
          </div>
          <CompanySwitcher
            companies={companies}
            activeCompanyId={activeCompanyId || active?.id}
          />
          <span className="hidden max-w-[180px] truncate text-xs text-[var(--color-muted-foreground)] sm:inline">
            {email}
          </span>
        </header>

        <main className="cifra-motion-in flex-1 px-4 py-6 pb-24 md:px-10 md:py-8 md:pb-10">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-white/95 px-2 py-2 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-around">
          {groups
            .flatMap((g) => g.items)
            .filter((item) =>
              [
                "/app",
                "/app/invoices",
                "/app/treasury",
                "/app/books",
                "/app/withholdings",
              ].includes(item.href),
            )
            .map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/app"
                  ? pathname === "/app"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-col items-center gap-1 rounded-[var(--radius-md)] px-2 py-1.5 text-[10px] font-semibold ${
                    isActive
                      ? "text-[var(--color-primary)]"
                      : "text-[var(--color-muted-foreground)]"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
        </div>
      </nav>
    </div>
  );
}
