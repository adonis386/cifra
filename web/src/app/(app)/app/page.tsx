import Link from "next/link";
import {
  BookOpen,
  FileDown,
  FileText,
  Landmark,
  Plus,
  Receipt,
  Settings2,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui";
import { PageHeader, SectionCard } from "@/components/layout";

const quickActions = [
  {
    href: "/app/invoices",
    label: "Facturas",
    icon: FileText,
    tone: "bg-[#e8f1ff] text-[#1e3a5f]",
  },
  {
    href: "/app/books",
    label: "Libros",
    icon: BookOpen,
    tone: "bg-[#e8f8f1] text-[#059669]",
  },
  {
    href: "/app/withholdings",
    label: "Retenciones",
    icon: FileDown,
    tone: "bg-[#fff4e8] text-[#c2410c]",
  },
  {
    href: "/app/municipal",
    label: "Municipal",
    icon: Landmark,
    tone: "bg-[#eef6ff] text-[#1d4ed8]",
  },
  {
    href: "/app/partners",
    label: "Terceros",
    icon: Users,
    tone: "bg-[#f3f4f6] text-[#374151]",
  },
  {
    href: "/app/config",
    label: "Config",
    icon: Settings2,
    tone: "bg-[#ecfdf5] text-[#047857]",
  },
];

export default async function AppHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: memberships } = await supabase
    .from("company_members")
    .select("company_id, companies(id, name, rif)")
    .eq("user_id", user!.id);

  const companies =
    memberships
      ?.map((m) => {
        const c = m.companies as
          | { id: string; name: string; rif: string }
          | { id: string; name: string; rif: string }[]
          | null;
        if (!c) return null;
        return Array.isArray(c) ? c[0] : c;
      })
      .filter(Boolean) || [];

  const company = companies[0] as
    | { id: string; name: string; rif: string }
    | undefined;
  const hasCompany = Boolean(company);

  const [{ count: partnerCount }, { count: invoiceCount }, { count: bookCount }] =
    await Promise.all([
      company
        ? supabase
            .from("partners")
            .select("*", { count: "exact", head: true })
            .eq("company_id", company.id)
        : Promise.resolve({ count: 0 }),
      company
        ? supabase
            .from("invoices")
            .select("*", { count: "exact", head: true })
            .eq("company_id", company.id)
        : Promise.resolve({ count: 0 }),
      company
        ? supabase
            .from("fiscal_books")
            .select("*", { count: "exact", head: true })
            .eq("company_id", company.id)
        : Promise.resolve({ count: 0 }),
    ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Panel"
        title={hasCompany ? company!.name : "Bienvenido a Cifra"}
        description={
          hasCompany
            ? `RIF ${company!.rif} · resumen operativo y accesos fiscales.`
            : "Registra tu empresa con RIF para emitir libros y retenciones SENIAT."
        }
        actions={
          !hasCompany ? (
            <Link href="/app/empresa/nueva">
              <Button type="button">
                <Plus className="h-4 w-4" aria-hidden />
                Crear empresa
              </Button>
            </Link>
          ) : undefined
        }
      />

      {hasCompany && (
        <section className="overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-soft)] px-6 py-7 text-white shadow-[var(--shadow-md)] md:px-8">
          <p className="text-sm text-white/70">Indicadores</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Terceros", value: partnerCount ?? 0 },
              { label: "Facturas", value: invoiceCount ?? 0 },
              { label: "Libros", value: bookCount ?? 0 },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-[18px] bg-white/10 px-4 py-3 backdrop-blur-sm"
              >
                <p className="text-xs text-white/70">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight">{stat.value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasCompany && (
        <>
          <SectionCard title="Accesos rápidos" description="Flujo operativo → fiscal → sistema.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {quickActions.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[var(--shadow-sm)]"
                  >
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.tone}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="text-sm font-semibold">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </SectionCard>

          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard title="Facturación">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Documentos con control, multi-alícuota e IVA retenido.
              </p>
              <Link
                href="/app/invoices"
                className="mt-4 inline-flex text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
              >
                Ir a facturas
              </Link>
            </SectionCard>
            <SectionCard title="Retenciones SENIAT">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  IVA TXT 99035 e ISLR XML.
                </p>
              </div>
              <Link
                href="/app/withholdings"
                className="mt-4 inline-flex text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
              >
                Ir a retenciones
              </Link>
            </SectionCard>
            <SectionCard title="Libros del período">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Compras y ventas listos para fiscalización.
              </p>
              <Link
                href="/app/books"
                className="mt-4 inline-flex text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
              >
                Ir a libros
              </Link>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
