import { AppShell } from "@/components/app-shell";
import { getActiveCompany, getUserCompanies } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [companies, active] = await Promise.all([
    getUserCompanies(),
    getActiveCompany(),
  ]);

  return (
    <AppShell
      email={user?.email}
      companies={companies}
      activeCompanyId={active?.id ?? companies[0]?.id}
    >
      {children}
    </AppShell>
  );
}
