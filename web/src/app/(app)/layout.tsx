import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

type Company = {
  id: string;
  name: string;
  rif: string;
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: memberships } = await supabase
    .from("company_members")
    .select("company_id, companies(id, name, rif)")
    .eq("user_id", user!.id);

  const companies: Company[] = (memberships || [])
    .map((m) => {
      const c = m.companies as unknown as Company | Company[] | null;
      if (!c) return null;
      return Array.isArray(c) ? c[0] : c;
    })
    .filter(Boolean) as Company[];

  return (
    <AppShell
      email={user?.email}
      companies={companies}
      activeCompanyId={companies[0]?.id}
    >
      {children}
    </AppShell>
  );
}
