import type { SupabaseClient } from "@supabase/supabase-js";

const CORE_SELECT =
  "id, name, rif, kind, person_type, phone, email, address, notes, is_withholding_agent";

const FULL_SELECT = `${CORE_SELECT}, seniat_person_type, id_type, id_number, street, street2, city, state_name, zip, municipality, parish, country, job_title, mobile, website, honorific, lang, timezone, tags`;

function isMissingColumn(message: string) {
  return /column|schema cache|does not exist/i.test(message);
}

function coreRow(row: Record<string, unknown>) {
  const {
    seniat_person_type: _s,
    id_type: _it,
    id_number: _in,
    street: _st,
    street2: _st2,
    city: _c,
    state_name: _sn,
    zip: _z,
    municipality: _m,
    parish: _p,
    country: _co,
    job_title: _j,
    mobile: _mo,
    website: _w,
    honorific: _h,
    lang: _l,
    timezone: _tz,
    tags: _t,
    ...core
  } = row;
  return core;
}

export class PartnersRepository {
  constructor(private supabase: SupabaseClient) {}

  async list(companyId: string) {
    const full = await this.supabase
      .from("partners")
      .select(FULL_SELECT)
      .eq("company_id", companyId)
      .order("name");
    if (!full.error) return full.data || [];
    if (!isMissingColumn(full.error.message)) return [];
    const fallback = await this.supabase
      .from("partners")
      .select(CORE_SELECT)
      .eq("company_id", companyId)
      .order("name");
    return fallback.data || [];
  }

  async getById(id: string, companyId: string) {
    const full = await this.supabase
      .from("partners")
      .select(FULL_SELECT)
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!full.error) return full.data;
    if (!isMissingColumn(full.error.message)) return null;
    const fallback = await this.supabase
      .from("partners")
      .select(CORE_SELECT)
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle();
    return fallback.data;
  }

  async findDuplicateRif(companyId: string, rif: string, exceptId?: string) {
    let query = this.supabase
      .from("partners")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("rif", rif)
      .limit(1);
    if (exceptId) query = query.neq("id", exceptId);
    const { data } = await query;
    return data?.[0] || null;
  }

  async insert(row: Record<string, unknown>) {
    const first = await this.supabase.from("partners").insert(row);
    if (!first.error || !isMissingColumn(first.error.message)) return first;
    return this.supabase.from("partners").insert(coreRow(row));
  }

  async update(id: string, companyId: string, row: Record<string, unknown>) {
    const first = await this.supabase
      .from("partners")
      .update(row)
      .eq("id", id)
      .eq("company_id", companyId);
    if (!first.error || !isMissingColumn(first.error.message)) return first;
    return this.supabase
      .from("partners")
      .update(coreRow(row))
      .eq("id", id)
      .eq("company_id", companyId);
  }

  async delete(id: string, companyId: string) {
    return this.supabase
      .from("partners")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);
  }
}
