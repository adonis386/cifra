import type { SupabaseClient } from "@supabase/supabase-js";

export type ChatterMessage = {
  id: string;
  subtype: string;
  body: string;
  payment_id: string | null;
  author_name: string | null;
  created_at: string;
  files: Array<{
    id: string;
    filename: string;
    content_type: string | null;
    storage_path: string;
    file_size: number;
    url: string | null;
  }>;
};

export class ChatterRepository {
  constructor(private supabase: SupabaseClient) {}

  async insertMessage(row: Record<string, unknown>) {
    const first = await this.supabase.from("chatter_messages").insert(row).select("id").single();
    if (first.error && /chatter_messages|schema|column/i.test(first.error.message)) {
      return { data: null, error: first.error };
    }
    return first;
  }

  async insertFile(row: Record<string, unknown>) {
    return this.supabase.from("chatter_files").insert(row).select("id").single();
  }

  async listMessages(companyId: string, resModel: string, resId: string) {
    const { data, error } = await this.supabase
      .from("chatter_messages")
      .select(
        "id, subtype, body, payment_id, author_name, created_at, chatter_files(id, filename, content_type, storage_path, file_size)",
      )
      .eq("company_id", companyId)
      .eq("res_model", resModel)
      .eq("res_id", resId)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) return [];
    return data || [];
  }
}
