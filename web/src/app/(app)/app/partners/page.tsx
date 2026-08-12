import Link from "next/link";
import { PartnerForm } from "@/components/partners/partner-form";
import { deletePartner } from "@/lib/actions/partners";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui";
import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  Td,
  Th,
} from "@/components/layout";

export default async function PartnersPage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Terceros" description="Registra clientes y proveedores con RIF." />
        <EmptyState title="Sin empresa" description="Crea una empresa para continuar." />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: partners } = await supabase
    .from("partners")
    .select("id, name, rif, kind, person_type, phone, email")
    .eq("company_id", company.id)
    .order("name");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Maestros"
        title="Terceros"
        description="Clientes y proveedores con RIF para facturas, libros y retenciones."
      />

      <SectionCard title="Nuevo tercero" description="Datos fiscales mínimos del partner.">
        <PartnerForm />
      </SectionCard>

      <SectionCard title="Listado">
        {(partners || []).length ? (
          <DataTable>
            <thead>
              <tr>
                <Th>Nombre</Th>
                <Th>RIF</Th>
                <Th>Tipo</Th>
                <Th>Persona</Th>
                <Th>Contacto</Th>
                <Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {(partners || []).map((p) => (
                <tr key={p.id}>
                  <Td className="font-medium">{p.name}</Td>
                  <Td className="font-mono text-xs">{p.rif}</Td>
                  <Td>
                    <Badge tone="primary">{p.kind}</Badge>
                  </Td>
                  <Td className="capitalize">{p.person_type}</Td>
                  <Td className="text-[var(--color-muted-foreground)]">{p.phone || p.email || "—"}</Td>
                  <Td className="text-right">
                    <form action={deletePartner}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button type="submit" variant="ghost" className="text-[var(--color-destructive)]">
                        Eliminar
                      </Button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState title="Sin terceros" description="Agrega el primero con el formulario de arriba." />
        )}
      </SectionCard>
    </div>
  );
}
