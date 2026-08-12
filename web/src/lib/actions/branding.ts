"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany, validateRif } from "@/lib/company";
import { publicLogoUrl } from "@/lib/company-print";
import { createClient } from "@/lib/supabase/server";

export type BrandingState = {
  error?: string;
  success?: string;
  logo_url?: string | null;
  logo_path?: string | null;
};

function logoExtension(type: string, fileName: string) {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("svg")) return "svg";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  const fromName = fileName.split(".").pop()?.toLowerCase();
  if (fromName && ["png", "jpg", "jpeg", "webp", "svg"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  return "png";
}

export async function updateCompanyBranding(
  _prev: BrandingState,
  formData: FormData,
): Promise<BrandingState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const name = String(formData.get("name") || "").trim();
  const rifRaw = String(formData.get("rif") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const website = String(formData.get("website") || "").trim();
  const printSubtitle = String(formData.get("print_subtitle") || "").trim();
  const printFooter = String(formData.get("print_footer") || "").trim();
  const printShowLogo = formData.get("print_show_logo") === "on";
  const removeLogo = formData.get("remove_logo") === "on";
  const logoFile = formData.get("logo");

  if (!name) return { error: "La razón social es obligatoria." };
  const checked = validateRif(rifRaw || company.rif, "juridica");
  if (!checked.ok) return { error: checked.error };

  const supabase = await createClient();
  let logoPath: string | null | undefined;

  if (removeLogo) {
    logoPath = null;
    // Best-effort delete of previous objects
    const { data: existing } = await supabase
      .from("companies")
      .select("logo_path")
      .eq("id", company.id)
      .maybeSingle();
    if (existing?.logo_path && !/^https?:\/\//i.test(existing.logo_path)) {
      await supabase.storage.from("logos").remove([existing.logo_path]);
    }
  } else if (logoFile && typeof logoFile !== "string" && logoFile.size > 0) {
    if (logoFile.size > 2 * 1024 * 1024) {
      return { error: "El logo no debe superar 2 MB." };
    }
    const type = logoFile.type || "image/png";
    if (type && !/^image\/(png|jpeg|jpg|webp|svg\+xml)?$/i.test(type) && type !== "") {
      // algunos browsers mandan type vacío; validamos por extensión
      const okExt = /\.(png|jpe?g|webp|svg)$/i.test(logoFile.name || "");
      if (!okExt && type !== "") {
        return { error: "Usa PNG, JPG, WEBP o SVG." };
      }
    }
    const ext = logoExtension(type, logoFile.name || "logo.png");
    const path = `${company.id}/logo.${ext}`;
    const buffer = Buffer.from(await logoFile.arrayBuffer());

    // Quitar variantes previas para no dejar logos huérfanos con otra extensión
    const { data: listed } = await supabase.storage.from("logos").list(company.id);
    if (listed?.length) {
      await supabase.storage
        .from("logos")
        .remove(listed.map((f) => `${company.id}/${f.name}`));
    }

    const { error: upErr } = await supabase.storage
      .from("logos")
      .upload(path, buffer, {
        contentType: type || `image/${ext === "jpg" ? "jpeg" : ext}`,
        upsert: true,
        cacheControl: "3600",
      });

    if (upErr) {
      return {
        error: `No se pudo subir el logo a Supabase Storage (bucket logos): ${upErr.message}. Aplica la migración 12 y verifica que el bucket "logos" exista.`,
      };
    }
    logoPath = path;
  }

  const payload: Record<string, unknown> = {
    name,
    rif: checked.rif,
    address: address || null,
    email: email || null,
    phone: phone || null,
    website: website || null,
    print_subtitle: printSubtitle || null,
    print_footer: printFooter || null,
    print_show_logo: printShowLogo,
    updated_at: new Date().toISOString(),
  };
  if (logoPath !== undefined) payload.logo_path = logoPath;

  const { data: updated, error } = await supabase
    .from("companies")
    .update(payload)
    .eq("id", company.id)
    .select("logo_path, updated_at")
    .single();

  if (error) {
    if (/website|print_subtitle|print_footer|print_show_logo|column/i.test(error.message)) {
      const { data: basic, error: basicErr } = await supabase
        .from("companies")
        .update({
          name,
          rif: checked.rif,
          address: address || null,
          email: email || null,
          phone: phone || null,
          ...(logoPath !== undefined ? { logo_path: logoPath } : {}),
        })
        .eq("id", company.id)
        .select("logo_path, updated_at")
        .single();
      if (basicErr) return { error: basicErr.message };
      const url = publicLogoUrl(
        basic?.logo_path,
        (basic as { updated_at?: string } | null)?.updated_at,
      );
      revalidatePath("/app/config");
      revalidatePath("/print", "layout");
      return {
        success:
          "Datos guardados. Aplica migraciones 11 y 12 para membrete completo y logos públicos.",
        logo_path: basic?.logo_path ?? null,
        logo_url: url,
      };
    }
    return { error: error.message };
  }

  const finalPath = updated?.logo_path ?? logoPath ?? null;
  const cacheKey =
    (updated as { updated_at?: string } | null)?.updated_at || Date.now();

  // Siempre devolver URL para el preview en Config (print_show_logo solo afecta PDF)
  let logoUrl = publicLogoUrl(finalPath, cacheKey);
  if (finalPath && !/^https?:\/\//i.test(finalPath)) {
    const { data: signed } = await supabase.storage
      .from("logos")
      .createSignedUrl(finalPath.replace(/^\/+/, ""), 60 * 60 * 12);
    if (signed?.signedUrl) {
      // Preferir signed si el bucket aún no es público (migración 12 pendiente)
      try {
        const head = logoUrl
          ? await fetch(logoUrl, { method: "HEAD", cache: "no-store" })
          : null;
        if (!head?.ok) logoUrl = `${signed.signedUrl}${signed.signedUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(cacheKey))}`;
      } catch {
        logoUrl = signed.signedUrl;
      }
    }
  }

  revalidatePath("/app/config");
  revalidatePath("/print", "layout");
  revalidatePath("/app", "layout");

  return {
    success:
      logoPath === null
        ? "Logo eliminado y membrete actualizado."
        : logoPath
          ? "Membrete actualizado y logo guardado en Supabase Storage (bucket logos)."
          : "Membrete y datos de empresa actualizados.",
    logo_path: finalPath,
    logo_url: logoUrl,
  };
}
