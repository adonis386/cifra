import Link from "next/link";
import { PartnerForm } from "@/components/partners/partner-form";
import { getActiveCompany } from "@/lib/company";
import { PageHeader, SectionCard } from "@/components/layout";

export default async function NewPartnerPage() {
  const company = await getActiveCompany();
  if (!company) {
    return (
      <div className="space-y-6">
        <PageHeader title="Nuevo cliente o proveedor" />
        <Link
          href="/app/empresa/nueva"
          className="text-sm font-semibold text-[var(--color-primary)] underline"
        >
          Crear empresa
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operar"
        title="Nuevo cliente o proveedor"
        description="Identidad SENIAT, dirección en Venezuela y datos de contacto."
        actions={
          <Link
            href="/app/partners"
            className="text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
          >
            Volver al listado
          </Link>
        }
      />
      <SectionCard>
        <PartnerForm />
      </SectionCard>
    </div>
  );
}
