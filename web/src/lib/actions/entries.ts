"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/actions/audit";
import { assertPeriodOpen } from "@/lib/actions/periods";

export type ActionState = { error?: string; success?: string };

type EntryLineInput = {
  account_id: string;
  name?: string;
  debit: number;
  credit: number;
  partner_id?: string | null;
};

function revalidateLibro() {
  revalidatePath("/app/entries");
  revalidatePath("/app/ledger");
  revalidatePath("/app/treasury");
  revalidatePath("/app/accounts");
  revalidatePath("/app/statements");
  revalidatePath("/app/reports");
  revalidatePath("/app/audit");
  revalidatePath("/app");
}

/** Asiento manual (ajuste / apertura / misceláneo). Debe cuadrar débito = crédito. */
export async function createManualEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const moveDate = String(formData.get("move_date") || "");
  const ref = String(formData.get("ref") || "").trim();
  const journalId = String(formData.get("journal_id") || "") || null;
  const notes = String(formData.get("notes") || "").trim();
  let lines: EntryLineInput[] = [];
  try {
    lines = JSON.parse(String(formData.get("lines_json") || "[]"));
  } catch {
    return { error: "Líneas inválidas." };
  }

  if (!moveDate) return { error: "Indica la fecha del asiento." };
  const periodOk = await assertPeriodOpen(company.id, moveDate);
  if (!periodOk.ok) return { error: periodOk.error };
  if (lines.length < 2) return { error: "Un asiento necesita al menos 2 líneas." };

  const normalized = lines.map((l) => ({
    account_id: String(l.account_id || ""),
    name: String(l.name || "").trim() || null,
    debit: Number(l.debit || 0),
    credit: Number(l.credit || 0),
    partner_id: l.partner_id || null,
  }));

  for (const l of normalized) {
    if (!l.account_id) return { error: "Cada línea necesita una cuenta." };
    if (l.debit < 0 || l.credit < 0) return { error: "Débito/crédito no pueden ser negativos." };
    if (l.debit > 0 && l.credit > 0) {
      return { error: "Una línea no puede tener débito y crédito a la vez." };
    }
  }

  const totalDebit = Number(
    normalized.reduce((s, l) => s + l.debit, 0).toFixed(2),
  );
  const totalCredit = Number(
    normalized.reduce((s, l) => s + l.credit, 0).toFixed(2),
  );
  if (totalDebit <= 0) return { error: "El asiento debe tener montos." };
  if (Math.abs(totalDebit - totalCredit) > 0.009) {
    return {
      error: `El asiento no cuadra: débito ${totalDebit} ≠ crédito ${totalCredit}.`,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const stamp = moveDate.replace(/-/g, "");
  const moveName = `ASI/${stamp}/${String(Date.now()).slice(-5)}`;

  const { data: move, error: moveErr } = await supabase
    .from("account_moves")
    .insert({
      company_id: company.id,
      journal_id: journalId,
      name: moveName,
      ref: ref || null,
      move_date: moveDate,
      state: "confirmed",
      notes: notes || null,
      created_by: user?.id,
    })
    .select("id")
    .single();

  if (moveErr) return { error: moveErr.message };

  const { error: lineErr } = await supabase.from("account_move_lines").insert(
    normalized.map((l) => ({
      move_id: move.id,
      company_id: company.id,
      account_id: l.account_id,
      partner_id: l.partner_id,
      name: l.name,
      debit: l.debit,
      credit: l.credit,
      amount_residual: 0,
    })),
  );
  if (lineErr) {
    await supabase.from("account_moves").delete().eq("id", move.id);
    return { error: lineErr.message };
  }

  await writeAuditLog({
    companyId: company.id,
    userId: user?.id,
    action: "create",
    entity: "account_move",
    entityId: move.id,
    payload: { name: moveName, debit: totalDebit, credit: totalCredit },
  });

  revalidateLibro();
  return { success: `Asiento ${moveName} publicado.` };
}

export async function createBankStatement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const journalId = String(formData.get("journal_id") || "");
  const statementDate = String(formData.get("statement_date") || "");
  const name = String(formData.get("name") || "").trim();
  const balanceStart = Number(formData.get("balance_start") || 0);
  const balanceEnd = Number(formData.get("balance_end") || 0);
  const exchangeRate = Number(formData.get("exchange_rate") || 0) || null;

  if (!journalId || !statementDate) {
    return { error: "Indica diario (caja/banco) y fecha." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const label =
    name || `Extracto ${statementDate}`;

  const { data: st, error } = await supabase
    .from("bank_statements")
    .insert({
      company_id: company.id,
      journal_id: journalId,
      name: label,
      statement_date: statementDate,
      balance_start: balanceStart,
      balance_end: balanceEnd,
      exchange_rate: exchangeRate,
      state: "open",
      created_by: user?.id,
    })
    .select("id")
    .single();

  if (error) {
    if (/bank_statements|schema cache|column/i.test(error.message)) {
      return {
        error:
          "Los extractos no están disponibles. Revisa la conexión a la base.",
      };
    }
    return { error: error.message };
  }

  await writeAuditLog({
    companyId: company.id,
    userId: user?.id,
    action: "create",
    entity: "bank_statement",
    entityId: st.id,
    payload: { name: label, balance_end: balanceEnd },
  });

  revalidatePath("/app/treasury");
  revalidatePath("/app/audit");
  return { success: `Extracto "${label}" creado.` };
}

export async function addBankStatementLine(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Sin empresa." };

  const statementId = String(formData.get("statement_id") || "");
  const lineDate = String(formData.get("line_date") || "");
  const amount = Number(formData.get("amount") || 0);
  const paymentRef = String(formData.get("payment_ref") || "").trim();
  const partnerName = String(formData.get("partner_name") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const paymentId = String(formData.get("payment_id") || "").trim() || null;

  if (!statementId || !lineDate) {
    return { error: "Fecha es obligatoria." };
  }

  const supabase = await createClient();

  let amountFinal = amount;
  let refFinal = paymentRef;
  let partnerFinal = partnerName;
  let reconciled = false;
  let partnerId: string | null = null;
  let moveLineId: string | null = null;

  if (paymentId) {
    const { data: pay } = await supabase
      .from("payments")
      .select("id, amount, payment_type, reference, memo, partner_id, move_id, partners(name)")
      .eq("id", paymentId)
      .eq("company_id", company.id)
      .maybeSingle();
    if (!pay) return { error: "Pago no encontrado." };
    const signed =
      pay.payment_type === "outbound"
        ? -Math.abs(Number(pay.amount))
        : Math.abs(Number(pay.amount));
    if (!amountFinal) amountFinal = signed;
    refFinal = refFinal || String(pay.reference || pay.memo || "");
    const p = pay.partners as unknown as { name?: string } | { name?: string }[] | null;
    partnerFinal =
      partnerFinal ||
      (Array.isArray(p) ? p[0]?.name : p?.name) ||
      "";
    partnerId = pay.partner_id;
    reconciled = true;
    if (pay.move_id) {
      const { data: ml } = await supabase
        .from("account_move_lines")
        .select("id")
        .eq("move_id", pay.move_id)
        .limit(1)
        .maybeSingle();
      moveLineId = ml?.id || null;
    }
  }

  if (!amountFinal) return { error: "Fecha y monto son obligatorios." };

  const payload: Record<string, unknown> = {
    statement_id: statementId,
    company_id: company.id,
    line_date: lineDate,
    amount: amountFinal,
    payment_ref: refFinal || null,
    partner_name: partnerFinal || null,
    notes: notes || null,
    is_reconciled: reconciled,
    partner_id: partnerId,
    move_line_id: moveLineId,
    payment_id: paymentId,
  };

  const { error } = await supabase.from("bank_statement_lines").insert(payload);
  if (error && /payment_id|column|schema/i.test(error.message)) {
    delete payload.payment_id;
    const retry = await supabase.from("bank_statement_lines").insert(payload);
    if (retry.error) return { error: retry.error.message };
  } else if (error) {
    return { error: error.message };
  }
  revalidatePath("/app/treasury");
  return {
    success: reconciled
      ? "Línea agregada y conciliada con el pago."
      : "Línea de extracto agregada.",
  };
}

export async function reconcileStatementLine(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Sin empresa." };
  const lineId = String(formData.get("line_id") || "");
  const paymentId = String(formData.get("payment_id") || "").trim();
  if (!lineId || !paymentId) return { error: "Elige un pago para conciliar." };

  const supabase = await createClient();
  const { data: pay } = await supabase
    .from("payments")
    .select("id, reference, memo, partner_id, move_id, partners(name)")
    .eq("id", paymentId)
    .eq("company_id", company.id)
    .maybeSingle();
  if (!pay) return { error: "Pago no encontrado." };

  const p = pay.partners as unknown as { name?: string } | { name?: string }[] | null;
  const partnerName = Array.isArray(p) ? p[0]?.name : p?.name;
  let moveLineId: string | null = null;
  if (pay.move_id) {
    const { data: ml } = await supabase
      .from("account_move_lines")
      .select("id")
      .eq("move_id", pay.move_id)
      .limit(1)
      .maybeSingle();
    moveLineId = ml?.id || null;
  }

  const patch: Record<string, unknown> = {
    is_reconciled: true,
    payment_id: paymentId,
    partner_id: pay.partner_id,
    partner_name: partnerName || null,
    payment_ref: pay.reference || pay.memo || null,
    move_line_id: moveLineId,
  };
  const { error } = await supabase
    .from("bank_statement_lines")
    .update(patch)
    .eq("id", lineId)
    .eq("company_id", company.id);
  if (error && /payment_id|column/i.test(error.message)) {
    delete patch.payment_id;
    const retry = await supabase
      .from("bank_statement_lines")
      .update(patch)
      .eq("id", lineId)
      .eq("company_id", company.id);
    if (retry.error) return { error: retry.error.message };
  } else if (error) {
    return { error: error.message };
  }
  revalidatePath("/app/treasury");
  return { success: "Línea conciliada." };
}
