"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { ChatterRepository, type ChatterMessage } from "@/repositories/chatter.repository";

export type ChatterState = { error?: string; success?: string };

async function authorName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string | undefined,
  email: string | undefined,
) {
  if (!userId) return email || "Usuario";
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return String(data?.full_name || data?.email || email || "Usuario");
}

export async function logChatter(input: {
  companyId: string;
  resModel: "invoice" | "payment";
  resId: string;
  subtype?: "comment" | "notification";
  body: string;
  paymentId?: string | null;
  userId?: string | null;
  authorName?: string | null;
}) {
  try {
    const supabase = await createClient();
    const repo = new ChatterRepository(supabase);
    await repo.insertMessage({
      company_id: input.companyId,
      res_model: input.resModel,
      res_id: input.resId,
      subtype: input.subtype || "notification",
      body: input.body,
      payment_id: input.paymentId || null,
      author_name: input.authorName || null,
      created_by: input.userId || null,
    });
    revalidatePath(`/app/invoices/${input.resId}`);
    if (input.resModel === "payment") revalidatePath(`/app/payments/${input.resId}`);
  } catch {
    /* chatter must never break the cobro */
  }
}

export async function loadDocumentChatter(
  companyId: string,
  resModel: "invoice" | "payment",
  resId: string,
) {
  const supabase = await createClient();
  const repo = new ChatterRepository(supabase);
  const rows = await repo.listMessages(companyId, resModel, resId);
  const messages: ChatterMessage[] = [];
  for (const row of rows) {
    const rawFiles = (row as { chatter_files?: unknown }).chatter_files;
    const files = Array.isArray(rawFiles) ? rawFiles : rawFiles ? [rawFiles] : [];
    const withUrls = [];
    for (const file of files as Array<{
      id: string;
      filename: string;
      content_type: string | null;
      storage_path: string;
      file_size: number;
    }>) {
      const { data } = await supabase.storage
        .from("chatter")
        .createSignedUrl(file.storage_path, 60 * 60);
      withUrls.push({
        id: file.id,
        filename: file.filename,
        content_type: file.content_type,
        storage_path: file.storage_path,
        file_size: file.file_size,
        url: data?.signedUrl || null,
      });
    }
    messages.push({
      id: row.id as string,
      subtype: String(row.subtype || "comment"),
      body: String(row.body || ""),
      payment_id: (row.payment_id as string | null) || null,
      author_name: (row.author_name as string | null) || null,
      created_at: String(row.created_at || ""),
      files: withUrls,
    });
  }
  return messages;
}

export async function postChatterMessage(
  _prev: ChatterState,
  formData: FormData,
): Promise<ChatterState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const resModel = String(formData.get("res_model") || "") as "invoice" | "payment";
  const resId = String(formData.get("res_id") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const paymentId = String(formData.get("payment_id") || "").trim() || null;
  const file = formData.get("file");
  if (!resId || (resModel !== "invoice" && resModel !== "payment")) {
    return { error: "Documento no indicado." };
  }
  if (!body && !(file && typeof file !== "string" && file.size > 0)) {
    return { error: "Escribe una nota o adjunta el comprobante." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const repo = new ChatterRepository(supabase);
  const name = await authorName(supabase, user?.id, user?.email);
  const inserted = await repo.insertMessage({
    company_id: company.id,
    res_model: resModel,
    res_id: resId,
    subtype: "comment",
    body: body || "Comprobante adjunto",
    payment_id: paymentId,
    author_name: name,
    created_by: user?.id || null,
  });
  if (inserted.error || !inserted.data) {
    return { error: "No se pudo guardar en el chatter. Aplica la migración de chatter." };
  }

  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) return { error: "El archivo no debe superar 8 MB." };
    const safe = (file.name || "comprobante").replace(/[^\w.\-]+/g, "_").slice(0, 80);
    const path = `${company.id}/${resId}/${inserted.data.id}-${safe}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage.from("chatter").upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) return { error: upErr.message };
    await repo.insertFile({
      company_id: company.id,
      message_id: inserted.data.id,
      payment_id: paymentId,
      filename: file.name || safe,
      content_type: file.type || null,
      storage_path: path,
      file_size: file.size,
      created_by: user?.id || null,
    });
  }

  revalidatePath(`/app/invoices/${resId}`);
  revalidatePath(`/app/payments/${resId}`);
  return { success: "Publicado en el chatter." };
}
