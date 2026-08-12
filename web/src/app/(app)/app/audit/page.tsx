import Link from "next/link";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  Td,
  Th,
} from "@/components/layout";

export default async function AuditPage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Auditoría" />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: logs, error } = await supabase
    .from("audit_logs")
    .select("id, action, entity, entity_id, payload, created_at, user_id")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(150);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Libro"
        title="Auditoría"
        description="Bitácora de cambios: quién hizo qué sobre asientos, extractos y documentos. Reporte de control interno, no el menú técnico de Odoo."
      />

      <SectionCard title="Actividad reciente">
        {error ? (
          <p className="text-sm text-[var(--color-destructive)]">{error.message}</p>
        ) : (logs || []).length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Acción</Th>
                <Th>Entidad</Th>
                <Th>Detalle</Th>
              </tr>
            </thead>
            <tbody>
              {(logs || []).map((log) => {
                const payload = log.payload as Record<string, unknown> | null;
                const detail = payload
                  ? Object.entries(payload)
                      .slice(0, 4)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(" · ")
                  : log.entity_id || "—";
                return (
                  <tr key={log.id}>
                    <Td className="whitespace-nowrap text-xs">
                      {new Date(log.created_at).toLocaleString("es-VE")}
                    </Td>
                    <Td className="font-medium">{log.action}</Td>
                    <Td className="font-mono text-xs">{log.entity}</Td>
                    <Td className="max-w-[360px] truncate text-xs text-[var(--color-muted-foreground)]">
                      {detail}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState
            title="Sin eventos aún"
            description="Al crear asientos o extractos se registra la bitácora aquí."
          />
        )}
      </SectionCard>
    </div>
  );
}
