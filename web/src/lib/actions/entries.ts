"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/actions/audit";
import { assertPeriodOpen } from "@/lib/actions/periods";
import {
  dateNearby,
  statementMatchesLiquidity,
} from "@/domain/accounting/reconcile.service";
import { round2 } from "@/domain/money";
import { AccountingRepository } from "@/repositories/accounting.repository";

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

  const repo = new AccountingRepository(supabase);
  const flags = await repo.listAccountReconcileFlags(
    company.id,
    normalized.map((l) => l.account_id),
  );

  const payloads = normalized.map((l) => {
    const residual = flags.get(l.account_id)
      ? round2(Math.abs(l.debit - l.credit))
      : 0;
    return {
      move_id: move.id,
      company_id: company.id,
      account_id: l.account_id,
      partner_id: l.partner_id,
      name: l.name,
      debit: l.debit,
      credit: l.credit,
      amount_residual: residual,
      reconciled: residual <= 0.009,
    };
  });
  const { error: lineErr } = await supabase.from("account_move_lines").insert(payloads);
  if (lineErr && /reconciled|column|schema cache/i.test(lineErr.message)) {
    const retry = await supabase.from("account_move_lines").insert(
      payloads.map(({ reconciled: _r, ...row }) => row),
    );
    if (retry.error) {
      await supabase.from("account_moves").delete().eq("id", move.id);
      return { error: retry.error.message };
    }
  } else if (lineErr) {
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
    name || `Corte ${statementDate}`;

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
          "Los cortes de banco no están disponibles. Revisa la conexión a la base.",
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
  return { success: `Corte "${label}" creado.` };
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
  const periodOk = await assertPeriodOpen(company.id, lineDate);
  if (!periodOk.ok) return { error: periodOk.error };

  const supabase = await createClient();

  let amountFinal = amount;
  let refFinal = paymentRef;
  let partnerFinal = partnerName;
  let reconciled = false;
  let partnerId: string | null = null;
  let moveLineId: string | null = null;

  const repo = new AccountingRepository(supabase);

  if (paymentId) {
    const { payment: pay, line } = await repo.liquidityLineForPayment(
      paymentId,
      company.id,
    );
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
    moveLineId = line?.id || null;
    if (moveLineId && statementMatchesLiquidity(amountFinal, Number(line?.debit), Number(line?.credit))) {
      reconciled = true;
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
      : "Línea agregada.",
  };
}

export async function reconcileStatementLine(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Sin empresa." };
  const lineId = String(formData.get("line_id") || "");
  const moveLineId = String(formData.get("move_line_id") || "").trim();
  const paymentId = String(formData.get("payment_id") || "").trim();
  if (!lineId || (!moveLineId && !paymentId)) {
    return { error: "Elige un movimiento de caja o banco para conciliar." };
  }

  const supabase = await createClient();
  const repo = new AccountingRepository(supabase);

  const { data: statementLine } = await supabase
    .from("bank_statement_lines")
    .select(
      "id, amount, line_date, is_reconciled, statement_id, bank_statements(journal_id)",
    )
    .eq("id", lineId)
    .eq("company_id", company.id)
    .maybeSingle();
  if (!statementLine) return { error: "Línea de extracto no encontrada." };
  if (statementLine.is_reconciled) return { success: "Ya estaba conciliada." };

  const periodOk = await assertPeriodOpen(company.id, String(statementLine.line_date));
  if (!periodOk.ok) return { error: periodOk.error };

  const st = Array.isArray(statementLine.bank_statements)
    ? statementLine.bank_statements[0]
    : statementLine.bank_statements;
  const statementJournalId = st?.journal_id || null;

  let targetId = moveLineId;
  let linkedPaymentId: string | null = paymentId || null;
  let partnerId: string | null = null;
  let partnerName: string | null = null;
  let paymentRef: string | null = null;

  if (!targetId && paymentId) {
    const found = await repo.liquidityLineForPayment(paymentId, company.id);
    if (!found.payment) return { error: "Pago no encontrado." };
    if (!found.line) {
      return { error: "Ese pago no tiene línea de caja o banco." };
    }
    targetId = found.line.id;
    const p = found.payment.partners as unknown as
      | { name?: string }
      | { name?: string }[]
      | null;
    partnerId = found.payment.partner_id;
    partnerName = Array.isArray(p) ? p[0]?.name || null : p?.name || null;
    paymentRef = found.payment.reference || found.payment.memo || null;
  }

  const { data: moveLine } = await supabase
    .from("account_move_lines")
    .select(
      "id, debit, credit, partner_id, name, account_accounts(account_type), account_moves(move_date, journal_id, payment_id, name)",
    )
    .eq("id", targetId)
    .eq("company_id", company.id)
    .maybeSingle();
  if (!moveLine) return { error: "Movimiento de caja/banco no encontrado." };

  const account = Array.isArray(moveLine.account_accounts)
    ? moveLine.account_accounts[0]
    : moveLine.account_accounts;
  if (account?.account_type !== "asset_cash") {
    return { error: "Conciliar el extracto contra una línea de caja o banco." };
  }

  const move = Array.isArray(moveLine.account_moves)
    ? moveLine.account_moves[0]
    : moveLine.account_moves;
  if (statementJournalId && move?.journal_id && statementJournalId !== move.journal_id) {
    return { error: "El movimiento debe ser del mismo diario del extracto." };
  }
  if (
    !statementMatchesLiquidity(
      Number(statementLine.amount),
      Number(moveLine.debit),
      Number(moveLine.credit),
    )
  ) {
    return { error: "El monto del extracto no coincide con el movimiento (tolerancia 0,01)." };
  }
  if (move?.move_date && !dateNearby(String(statementLine.line_date), String(move.move_date))) {
    return { error: "La fecha no coincide (máximo 7 días)." };
  }

  const already = await repo.matchedLiquidityIds(company.id);
  if (already.has(moveLine.id)) {
    return { error: "Ese movimiento de caja/banco ya está conciliado." };
  }

  const patch: Record<string, unknown> = {
    is_reconciled: true,
    move_line_id: moveLine.id,
    payment_id: linkedPaymentId || move?.payment_id || null,
    partner_id: partnerId || moveLine.partner_id || null,
    partner_name: partnerName,
    payment_ref: paymentRef || moveLine.name || null,
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
  revalidatePath("/app");
  return { success: "Línea conciliada con caja/banco." };
}
