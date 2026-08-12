"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany, validateRif } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export type BrandingState = {
  error?: string;
  success?: string;
};

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
  const logoFile = formData.get("logo") as File | null;

  if (!name) return { error: "La razón social es obligatoria." };
  const checked = validateRif(rifRaw || company.rif, "juridica");
  if (!checked.ok) return { error: checked.error };

  const supabase = await createClient();
  let logoPath: string | undefined;

  if (logoFile && logoFile.size > 0) {
    if (logoFile.size > 2 * 1024 * 1024) {
      return { error: "El logo no debe superar 2 MB." };
    }
    const type = logoFile.type || "";
    if (!/^image\/(png|jpeg|jpg|webp|svg\+xml)$/i.test(type)) {
      return { error: "Usa PNG, JPG, WEBP o SVG." };
    }
    const ext =
      type.includes("png")
        ? "png"
        : type.includes("webp")
          ? "webp"
          : type.includes("svg")
            ? "svg"
            : "jpg";
    const path = `${company.id}/logo.${ext}`;
    const buffer = Buffer.from(await logoFile.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from("logos")
      .upload(path, buffer, { contentType: type, upsert: true });
    if (upErr) return { error: `Logo: ${upErr.message}` };
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
  };
  if (logoPath) payload.logo_path = logoPath;

  const { error } = await supabase
    .from("companies")
    .update(payload)
    .eq("id", company.id);

  if (error) {
    if (/website|print_subtitle|print_footer|print_show_logo|column/i.test(error.message)) {
      // Migración 11 pendiente: guardar lo básico
      const { error: basicErr } = await supabase
        .from("companies")
        .update({
          name,
          rif: checked.rif,
          address: address || null,
          email: email || null,
          phone: phone || null,
          ...(logoPath ? { logo_path: logoPath } : {}),
        })
        .eq("id", company.id);
      if (basicErr) return { error: basicErr.message };
      return {
        success:
          "Datos guardados. Aplica la migración 11 para subtítulo/pie de membrete.",
      };
    }
    return { error: error.message };
  }

  revalidatePath("/app/config");
  revalidatePath("/print", "layout");
  return { success: "Membrete y datos de empresa actualizados." };
}
