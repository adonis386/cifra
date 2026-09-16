import Link from "next/link";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { PartnersRepository } from "@/repositories/partners.repository";
import { mapPartnerRecord } from "@/domain/partners/partner.service";
import { deletePartner } from "@/lib/actions/partners";
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
        <PageHeader title="Clientes y proveedores" description="Registra clientes y proveedores con RIF." />
        <EmptyState title="Sin empresa" description="Crea una empresa para continuar." />
        <Link href="/app/empresa/nueva" className="text-sm font-semibold text-[var(--color-primary)] underline">
          Crear empresa
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const partners = await new PartnersRepository(supabase).list(company.id);
  const rows = (partners || []).map((p) => mapPartnerRecord(p as Record<string, unknown>));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operar"
        title="Clientes y proveedores"
        description="Ficha fiscal y de contacto para facturas, libros y retenciones."
        actions={
          <Link
            href="/app/partners/new"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 text-sm font-semibold text-white"
          >
            Nuevo
          </Link>
        }
      />

      <SectionCard title="Listado">
        {rows.length ? (
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
              {rows.map((p) => (
                <tr key={p.id}>
                  <Td className="font-medium">
                    <Link
                      href={`/app/partners/${p.id}`}
                      className="hover:text-[var(--color-primary)] hover:underline"
                    >
                      {p.name}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs">{p.rif}</Td>
                  <Td>
                    <Badge tone="primary">
                      {p.kind === "customer"
                        ? "Cliente"
                        : p.kind === "supplier"
                          ? "Proveedor"
                          : "Ambos"}
                    </Badge>
                  </Td>
                  <Td>{p.seniat_person_type || p.person_type}</Td>
                  <Td className="text-[var(--color-muted-foreground)]">
                    {p.phone || p.mobile || p.email || "—"}
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/app/partners/${p.id}`}
                        className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                      >
                        Editar
                      </Link>
                      <form action={deletePartner}>
                        <input type="hidden" name="id" value={p.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          className="text-[var(--color-destructive)]"
                        >
                          Eliminar
                        </Button>
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState
            title="Sin registros"
            description="Pulsa Nuevo para agregar el primero."
          />
        )}
      </SectionCard>
    </div>
  );
}
