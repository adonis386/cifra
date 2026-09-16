import Link from "next/link";
import { notFound } from "next/navigation";
import { PartnerForm } from "@/components/partners/partner-form";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { PartnersRepository } from "@/repositories/partners.repository";
import { mapPartnerRecord } from "@/domain/partners/partner.service";
import { PageHeader, SectionCard } from "@/components/layout";

export default async function PartnerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getActiveCompany();
  if (!company) notFound();

  const supabase = await createClient();
  const row = await new PartnersRepository(supabase).getById(id, company.id);
  if (!row) notFound();

  const partner = mapPartnerRecord(row as Record<string, unknown>);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operar"
        title={partner.name || "Cliente o proveedor"}
        description="Edita identidad SENIAT, dirección y contacto."
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
        <PartnerForm partner={partner} />
      </SectionCard>
    </div>
  );
}
