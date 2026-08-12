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

/** URL pública estable del logo en bucket `logos`. */
export function publicLogoUrl(
  logoPath: string | null | undefined,
  cacheKey?: string | number | null,
): string | null {
  if (!logoPath) return null;
  if (/^https?:\/\//i.test(logoPath)) {
    return withCacheBust(logoPath, cacheKey);
  }

  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!base) return null;

  // Path canónico: {company_id}/logo.ext
  const clean = logoPath.replace(/^\/+/, "");
  const url = `${base}/storage/v1/object/public/logos/${clean}`;
  return withCacheBust(url, cacheKey);
}

function withCacheBust(url: string, cacheKey?: string | number | null) {
  if (cacheKey == null || cacheKey === "") return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${encodeURIComponent(String(cacheKey))}`;
}

export async function getCompanyPrintProfile(
  companyId: string,
): Promise<CompanyPrintProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, rif, address, phone, email, website, logo_path, print_subtitle, print_footer, print_show_logo, updated_at",
    )
    .eq("id", companyId)
    .single();

  if (error || !data) {
    const { data: basic } = await supabase
      .from("companies")
      .select("id, name, rif, address, phone, email, logo_path, updated_at")
      .eq("id", companyId)
      .single();
    if (!basic) return null;
    return {
      id: basic.id,
      name: basic.name,
      rif: basic.rif,
      address: basic.address,
      phone: basic.phone,
      email: basic.email,
      website: null,
      logo_path: basic.logo_path,
      print_subtitle: null,
      print_footer: null,
      print_show_logo: true,
      logo_url: await resolveLogoUrl(
        supabase,
        basic.logo_path,
        (basic as { updated_at?: string }).updated_at,
      ),
    };
  }

  const showLogo = data.print_show_logo ?? true;
  return {
    id: data.id,
    name: data.name,
    rif: data.rif,
    address: data.address,
    phone: data.phone,
    email: data.email,
    website: data.website ?? null,
    logo_path: data.logo_path,
    print_subtitle: data.print_subtitle ?? null,
    print_footer: data.print_footer ?? null,
    print_show_logo: showLogo,
    logo_url: showLogo
      ? await resolveLogoUrl(
          supabase,
          data.logo_path,
          (data as { updated_at?: string }).updated_at,
        )
      : null,
  };
}

async function resolveLogoUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  logoPath: string | null | undefined,
  cacheKey?: string | null,
): Promise<string | null> {
  if (!logoPath) return null;

  // 1) URL pública (bucket logos público)
  const pub = publicLogoUrl(logoPath, cacheKey);
  if (pub) {
    // Verificar que el objeto exista; si falla, intentar signed
    try {
      const head = await fetch(pub, { method: "HEAD", cache: "no-store" });
      if (head.ok) return pub;
    } catch {
      /* red / CORS HEAD — seguimos a signed */
    }
  }

  // 2) Signed URL (bucket privado o HEAD falló)
  const clean = logoPath.replace(/^\/+/, "");
  if (!/^https?:\/\//i.test(clean)) {
    const { data: signed, error } = await supabase.storage
      .from("logos")
      .createSignedUrl(clean, 60 * 60 * 12);
    if (!error && signed?.signedUrl) {
      return withCacheBust(signed.signedUrl, cacheKey);
    }
  }

  return pub;
}
