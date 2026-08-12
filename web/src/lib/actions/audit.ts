"use server";

import { createClient } from "@/lib/supabase/server";

export async function writeAuditLog(input: {
  companyId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}) {
  try {
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      company_id: input.companyId,
      user_id: input.userId || null,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId || null,
      payload: input.payload || null,
    });
  } catch {
    /* audit must never break the main flow */
  }
}
