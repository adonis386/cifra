import { createClient } from "@/lib/supabase/server";

export type CompanyPrintProfile = {
  id: string;
  name: string;
  rif: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_path: string | null;
  logo_url: string | null;
  print_subtitle: string | null;
  print_footer: string | null;
  print_show_logo: boolean;
};

export async function getCompanyPrintProfile(
  companyId: string,
): Promise<CompanyPrintProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, rif, address, phone, email, website, logo_path, print_subtitle, print_footer, print_show_logo",
    )
    .eq("id", companyId)
    .single();

  if (error || !data) {
    // Fallback si aún no aplicaron migración 11
    const { data: basic } = await supabase
      .from("companies")
      .select("id, name, rif, address, phone, email, logo_path")
      .eq("id", companyId)
      .single();
    if (!basic) return null;
    return {
      ...basic,
      website: null,
      print_subtitle: null,
      print_footer: null,
      print_show_logo: true,
      logo_url: await resolveLogoUrl(supabase, basic.logo_path),
    };
  }

  return {
    ...data,
    website: data.website ?? null,
    print_subtitle: data.print_subtitle ?? null,
    print_footer: data.print_footer ?? null,
    print_show_logo: data.print_show_logo ?? true,
    logo_url: data.print_show_logo
      ? await resolveLogoUrl(supabase, data.logo_path)
      : null,
  };
}

async function resolveLogoUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  logoPath: string | null | undefined,
): Promise<string | null> {
  if (!logoPath) return null;
  if (/^https?:\/\//i.test(logoPath)) return logoPath;

  const { data: pub } = supabase.storage.from("logos").getPublicUrl(logoPath);
  if (pub?.publicUrl) return pub.publicUrl;

  const { data: signed } = await supabase.storage
    .from("logos")
    .createSignedUrl(logoPath, 60 * 60);
  return signed?.signedUrl || null;
}
