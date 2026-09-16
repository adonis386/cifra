import type { SupabaseClient } from "@supabase/supabase-js";

export class PeriodsRepository {
  constructor(private supabase: SupabaseClient) {}

  async assertOpen(
    companyId: string,
    date: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!date) return { ok: true };
    const { data, error } = await this.supabase
      .from("accounting_periods")
      .select("name, date_start, date_end")
      .eq("company_id", companyId)
      .eq("is_closed", true)
      .lte("date_start", date)
      .gte("date_end", date)
      .limit(1);

    if (error) {
      if (/accounting_periods|schema cache|relation/i.test(error.message)) {
        return { ok: true };
      }
      return { ok: true };
    }
    const closed = data?.[0];
    if (closed) {
      return {
        ok: false,
        error: `El período ${closed.name} está cerrado (${closed.date_start} a ${closed.date_end}). No se pueden registrar documentos en esas fechas.`,
      };
    }
    return { ok: true };
  }

  async findByRange(companyId: string, dateStart: string, dateEnd: string) {
    const { data } = await this.supabase
      .from("accounting_periods")
      .select("id")
      .eq("company_id", companyId)
      .eq("date_start", dateStart)
      .eq("date_end", dateEnd)
      .maybeSingle();
    return data;
  }

  async closeExisting(id: string, userId: string | undefined) {
    return this.supabase
      .from("accounting_periods")
      .update({
        is_closed: true,
        closed_at: new Date().toISOString(),
        closed_by: userId,
      })
      .eq("id", id);
  }

  async insertClosed(row: {
    companyId: string;
    name: string;
    dateStart: string;
    dateEnd: string;
    userId: string | undefined;
  }) {
    return this.supabase.from("accounting_periods").insert({
      company_id: row.companyId,
      name: row.name,
      date_start: row.dateStart,
      date_end: row.dateEnd,
      is_closed: true,
      closed_at: new Date().toISOString(),
      closed_by: row.userId,
    });
  }

  async list(companyId: string) {
    const { data, error } = await this.supabase
      .from("accounting_periods")
      .select("id, name, date_start, date_end, is_closed, closed_at")
      .eq("company_id", companyId)
      .order("date_start", { ascending: false })
      .limit(36);
    if (error) return [];
    return data || [];
  }

  async reopen(id: string, companyId: string) {
    return this.supabase
      .from("accounting_periods")
      .update({ is_closed: false, closed_at: null, closed_by: null })
      .eq("id", id)
      .eq("company_id", companyId);
  }
}
