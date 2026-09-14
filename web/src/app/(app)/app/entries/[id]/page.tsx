import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney, getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  DataTable,
  PageHeader,
  SectionCard,
  Td,
  Th,
} from "@/components/layout";

type Partner = { name: string; rif?: string } | null;
type Journal = { code: string; name: string } | null;
type Account = { code: string; name: string } | null;

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] || null : v;
}

export default async function EntryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getActiveCompany();
  if (!company) notFound();

  const supabase = await createClient();
  const { data: move } = await supabase
    .from("account_moves")
    .select(
      "id, name, move_date, ref, state, notes, invoice_id, payment_id, partners(name, rif), account_journals(code, name)",
    )
    .eq("company_id", company.id)
    .eq("id", id)
    .maybeSingle();

  if (!move) notFound();

  const { data: lines } = await supabase
    .from("account_move_lines")
    .select(
      "id, name, debit, credit, amount_residual, account_accounts(code, name), partners(name)",
    )
    .eq("move_id", move.id)
    .order("debit", { ascending: false });

  const partner = one(move.partners as Partner | Partner[]);
  const journal = one(move.account_journals as Journal | Journal[]);
  const rows = lines || [];
  const totalDebit = rows.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = rows.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.02;
  const posted =
    move.state === "posted" ||
    move.state === "confirmed" ||
    move.state === "done";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Libro"
        title={move.name || "Asiento"}
        description={`${move.move_date}${journal ? ` · ${journal.code} ${journal.name}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/app/entries"
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-semibold hover:border-[var(--color-primary)]"
            >
              Volver al listado
            </Link>
            {move.invoice_id ? (
              <Link
                href={`/app/invoices/${move.invoice_id}`}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm font-semibold hover:border-[var(--color-primary)]"
              >
                Ver factura
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge tone={posted ? "success" : "primary"}>{move.state}</Badge>
        <Badge tone={balanced ? "success" : "warning"}>
          {balanced ? "Cuadra" : "Descuadrado"}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Cabecera">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted-foreground)]">Fecha</dt>
              <dd className="font-medium">{move.move_date}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted-foreground)]">Número</dt>
              <dd className="font-mono text-xs">{move.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted-foreground)]">Diario</dt>
              <dd>{journal ? `${journal.code} · ${journal.name}` : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted-foreground)]">Ref</dt>
              <dd className="text-right">{move.ref || "—"}</dd>
            </div>
          </dl>
        </SectionCard>
        <SectionCard title="Tercero">
          <p className="font-semibold">{partner?.name || "—"}</p>
          {partner?.rif ? (
            <p className="mt-1 font-mono text-sm text-[var(--color-muted-foreground)]">
              {partner.rif}
            </p>
          ) : null}
        </SectionCard>
        <SectionCard title="Totales">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted-foreground)]">Débito</dt>
              <dd className="font-mono">{formatMoney(totalDebit)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted-foreground)]">Crédito</dt>
              <dd className="font-mono">{formatMoney(totalCredit)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-[var(--color-border)] pt-2">
              <dt className="font-semibold">Diferencia</dt>
              <dd className="font-mono font-semibold">
                {formatMoney(totalDebit - totalCredit)}
              </dd>
            </div>
          </dl>
          {move.notes ? (
            <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
              {move.notes}
            </p>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard title="Líneas del asiento">
        {rows.length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Cuenta</Th>
                <Th>Detalle</Th>
                <Th>Tercero</Th>
                <Th className="text-right">Débito</Th>
                <Th className="text-right">Crédito</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const account = one(
                  l.account_accounts as Account | Account[],
                );
                const linePartner = one(l.partners as Partner | Partner[]);
                return (
                  <tr key={l.id}>
                    <Td>
                      <div className="font-mono text-xs">
                        {account?.code || "—"}
                      </div>
                      <div className="text-sm">{account?.name || "—"}</div>
                    </Td>
                    <Td className="text-sm">{l.name || "—"}</Td>
                    <Td className="text-sm">{linePartner?.name || "—"}</Td>
                    <Td className="text-right font-mono text-xs">
                      {Number(l.debit || 0) > 0
                        ? formatMoney(Number(l.debit))
                        : "—"}
                    </Td>
                    <Td className="text-right font-mono text-xs">
                      {Number(l.credit || 0) > 0
                        ? formatMoney(Number(l.credit))
                        : "—"}
                    </Td>
                  </tr>
                );
              })}
              <tr>
                <Td colSpan={3} className="font-semibold">
                  Totales
                </Td>
                <Td className="text-right font-mono text-xs font-semibold">
                  {formatMoney(totalDebit)}
                </Td>
                <Td className="text-right font-mono text-xs font-semibold">
                  {formatMoney(totalCredit)}
                </Td>
              </tr>
            </tbody>
          </DataTable>
        ) : (
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Este asiento no tiene líneas.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
