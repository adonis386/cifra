import { CompanyForm } from "@/components/company-form";
import { PageHeader, SectionCard } from "@/components/layout";

export default function NewCompanyPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Sistema"
        title="Nueva empresa"
        description="Datos fiscales del contribuyente (RIF, nombre y domicilio)."
      />
      <SectionCard title="Identificación fiscal">
        <CompanyForm />
      </SectionCard>
    </div>
  );
}
