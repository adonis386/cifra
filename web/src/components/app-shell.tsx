"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings2,
  Landmark,
  Users,
  Wallet,
  CircleDollarSign,
  HandCoins,
  Scale,
  BarChart3,
  ScrollText,
  Library,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { Button } from "@/components/ui";

type Company = { id: string; name: string; rif: string };

const groups = [
  {
    label: "Operar",
    items: [
      { href: "/app", label: "Inicio", icon: LayoutDashboard },
      { href: "/app/partners", label: "Terceros", icon: Users },
      { href: "/app/invoices", label: "Facturas", icon: FileText },
      { href: "/app/receivables", label: "Por cobrar", icon: CircleDollarSign },
      { href: "/app/payables", label: "Por pagar", icon: HandCoins },
      { href: "/app/payments", label: "Pagos", icon: Wallet },
    ],
  },
  {
    label: "Libro",
    items: [
      { href: "/app/treasury", label: "Caja y bancos", icon: Landmark },
      { href: "/app/entries", label: "Asientos", icon: ScrollText },
      { href: "/app/ledger", label: "Mayor", icon: Library },
      { href: "/app/statements", label: "Estado de cuenta", icon: ClipboardList },
      { href: "/app/accounts", label: "Plan", icon: Scale },
      { href: "/app/reports", label: "Reportes", icon: BarChart3 },
      { href: "/app/audit", label: "Auditoría", icon: ShieldCheck },
    ],
  },
  {
    label: "Cumplir",
    items: [
      { href: "/app/books", label: "Libros fiscales", icon: BookOpen },
      { href: "/app/withholdings", label: "Retenciones", icon: Receipt },
      { href: "/app/municipal", label: "Municipal", icon: Landmark },
    ],
  },
  {
    label: "Sistema",
    items: [{ href: "/app/config", label: "Configuración", icon: Settings2 }],
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
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-foreground)]">
      <div className="mx-auto flex min-h-screen max-w-[1440px] gap-4 p-3 md:p-4">
        <aside className="hidden w-64 shrink-0 rounded-[var(--radius-lg)] bg-[var(--color-surface)] px-3 py-5 shadow-[var(--shadow-sm)] md:flex md:flex-col">
          <div className="mb-6 px-3">
            <p className="text-lg font-bold tracking-tight text-[var(--color-primary)]">Cifra</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">Contabilidad Venezuela</p>
          </div>

          <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
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
                        className={`flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                          isActive
                            ? "bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)]"
                            : "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <form action={signOut} className="mt-auto px-1 pt-4">
            <Button type="submit" variant="ghost" className="w-full justify-start">
              <LogOut className="h-4 w-4" aria-hidden />
              Salir
            </Button>
          </form>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] bg-[var(--color-surface)] px-4 py-3 shadow-[var(--shadow-sm)] md:px-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{active ? active.name : "Sin empresa"}</p>
              <p className="truncate font-mono text-xs text-[var(--color-muted-foreground)]">
                {active ? active.rif : "Crea tu primera empresa"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden max-w-[180px] truncate text-xs text-[var(--color-muted-foreground)] sm:inline">
                {email}
              </span>
              <Link
                href="/app/empresa/nueva"
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-muted)] px-3 py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--color-primary)_12%,white)]"
              >
                <Building2 className="h-3.5 w-3.5" aria-hidden />
                Nueva empresa
              </Link>
            </div>
          </header>

          <main className="flex-1 rounded-[var(--radius-lg)] bg-[var(--color-surface)] px-4 py-6 pb-24 shadow-[var(--shadow-sm)] md:px-8 md:py-8 md:pb-8">
            {children}
          </main>
        </div>
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
                "/app/statements",
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
                  className={`flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold ${
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
