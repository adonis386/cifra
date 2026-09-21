"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany, getActiveCompanyRole } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { assertPeriodOpen } from "@/lib/actions/periods";
import { logChatter } from "@/lib/actions/chatter";
import {
  invoiceEntryDomain,
  nextAccountCode,
  nextJournalCode,
  type InvoiceEntryAccounts,
} from "@/domain/accounting/invoice-entry.service";
import {
  fifoReconcile,
  pairReconcile,
  type ReconcilableLine,
} from "@/domain/accounting/reconcile.service";
import { round2 } from "@/domain/money";
import {
  normalizePaymentMethod,
  paymentMethodLabel,
  resolvePaymentPostedAmount,
} from "@/domain/accounting/payment.service";
import { paymentAdminActions } from "@/domain/access/roles";
import { AccountingRepository } from "@/repositories/accounting.repository";

export type ActionState = { error?: string; success?: string };

function revalidatePaymentSurfaces(invoiceIds: string[] = []) {
  revalidatePath("/app");
  revalidatePath("/app/payments");
  revalidatePath("/app/receivables");
  revalidatePath("/app/payables");
  revalidatePath("/app/invoices");
  revalidatePath("/app/entries");
  revalidatePath("/app/ledger");
  revalidatePath("/app/treasury");
  revalidatePath("/app/reports");
  for (const id of invoiceIds) revalidatePath(`/app/invoices/${id}`);
}

async function syncInvoicesFromLines(
  repo: AccountingRepository,
  companyId: string,
  invoiceIds: Array<string | null | undefined>,
  accountId: string,
) {
  const unique = [...new Set(invoiceIds.filter((id): id is string => Boolean(id)))];
  for (const invoiceId of unique) {
    const inv = await repo.invoiceTotals(invoiceId, companyId);
    if (!inv) continue;
    const residual = await repo.partnerResidualForInvoice(
      invoiceId,
      companyId,
      accountId,
    );
    await repo.syncInvoiceResidual(invoiceId, residual, Number(inv.amount_total));
  }
}

function asReconcilable(row: {
  id: string;
  account_id: string;
  partner_id?: string | null;
  debit?: number | string;
  credit?: number | string;
  amount_residual?: number | string;
  invoice_id?: string | null;
  name?: string | null;
}): ReconcilableLine {
  return {
    id: row.id,
    account_id: row.account_id,
    partner_id: row.partner_id || null,
    debit: Number(row.debit || 0),
    credit: Number(row.credit || 0),
    amount_residual: Number(row.amount_residual || 0),
    invoice_id: row.invoice_id || null,
    name: row.name || null,
  };
}

export async function ensureCompanyAccountingForm(formData: FormData): Promise<void> {
  await ensureCompanyAccounting(formData);
}

export async function ensureCompanyAccounting(
  _formData?: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };
  const supabase = await createClient();
  const { error } = await new AccountingRepository(supabase).seedPlan(company.id);
  if (error) return { error: error.message };
  revalidatePath("/app/accounts");
  revalidatePath("/app/treasury");
  revalidatePath("/app/config");
  return { success: "Plan de cuentas y diarios listos." };
}

/** Banco o caja extra para tesorería (cuenta 1.1.02.xx / 1.1.01.xx + diario). */
export async function createLiquidityJournal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const name = String(formData.get("name") || "").trim();
  const kind = String(formData.get("kind") || "bank") === "cash" ? "cash" : "bank";
  const number = String(formData.get("account_number") || "").trim();
  if (!name) return { error: "Indica el nombre del banco o la caja." };

  const supabase = await createClient();
  const repo = new AccountingRepository(supabase);
  const seeded = await ensureCompanyAccounting();
  if (seeded.error) return seeded;

  const [journals, accounts] = await Promise.all([
    repo.listJournalCodes(company.id),
    repo.listAccountCodes(company.id),
  ]);

  const journalCode = nextJournalCode(journals, kind === "cash" ? "CAJ" : "BAN");
  const accountCode = nextAccountCode(
    accounts,
    kind === "cash" ? "1.1.01" : "1.1.02",
  );
  const label = number ? `${name} · ${number}` : name;

  const { data: account, error: accErr } = await repo.insertAccount({
    company_id: company.id,
    code: accountCode,
    name: label,
    account_type: "asset_cash",
    reconcile: false,
    active: true,
  });
  if (accErr) return { error: accErr.message };

  const { error: jouErr } = await repo.insertJournal({
    company_id: company.id,
    code: journalCode,
    name: label,
    journal_type: kind,
    default_account_id: account.id,
    active: true,
  });
  if (jouErr) {
    await repo.deleteAccount(account.id);
    if (/duplicate|unique|23505/i.test(jouErr.message)) {
      return { error: "Ya existe un diario con ese código. Intenta de nuevo." };
    }
    return { error: jouErr.message };
  }

  revalidatePath("/app/treasury");
  revalidatePath("/app/payments");
  revalidatePath("/app/accounts");
  return {
    success: `${kind === "cash" ? "Caja" : "Banco"} ${journalCode} · ${label} (${accountCode}).`,
  };
}

/** Create Odoo-like account.move for an invoice and set residual. */
export async function postInvoiceAccounting(invoiceId: string): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Sin empresa." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const repo = new AccountingRepository(supabase);

  const inv = await repo.getInvoice(invoiceId, company.id);
  if (!inv) return { error: "Factura no encontrada." };
  if (inv.state === "draft") {
    return { error: "El borrador no genera asiento. Registra la factura." };
  }
  if (inv.account_move_id) return { success: "Asiento ya existe." };

  const periodOk = await assertPeriodOpen(company.id, String(inv.invoice_date));
  if (!periodOk.ok) return { error: periodOk.error };

  const accounts = await repo.ensurePlan(company.id);
  if (!accounts) return { error: "Falta plan de cuentas. Ve a Contabilidad → Plan y regenera." };

  const isSale = String(inv.move_type).startsWith("out_");
  const journalCode = isSale ? "VEN" : "COM";
  const journalId = await repo.journalIdByCode(company.id, journalCode);

  const partnerAccount = isSale
    ? accounts.property_account_receivable_id
    : accounts.property_account_payable_id;
  const incomeExpense = isSale
    ? accounts.property_account_income_id
    : accounts.property_account_expense_id;
  const taxAccount = isSale
    ? accounts.property_account_tax_sale_id
    : accounts.property_account_tax_purchase_id;

  if (!partnerAccount || !incomeExpense) {
    return { error: "Falta plan de cuentas. Ve a Contabilidad → Plan y regenera." };
  }

  const sign = String(inv.move_type).includes("refund") ? -1 : 1;
  const entryAccounts: InvoiceEntryAccounts = {
    partnerAccount,
    incomeExpense,
    taxAccount: taxAccount || null,
  };
  const residualBase = Number(
    inv.amount_residual ??
      invoiceEntryDomain.residualAfterIva(
        Number(inv.amount_total),
        Number(inv.amount_retained_iva || 0),
      ),
  );
  const drafts = invoiceEntryDomain.buildLines({
    isSale,
    invoiceNumber: inv.invoice_number,
    partnerId: inv.partner_id,
    untaxed: Number(inv.amount_untaxed) * sign,
    tax: Number(inv.amount_tax) * sign,
    exempt: Number(inv.amount_exempt) * sign,
    total: Number(inv.amount_total) * sign,
    retainedIva: Number(inv.amount_retained_iva || 0),
    residual: residualBase,
    accounts: entryAccounts,
  });

  const moveName = `${journalCode}/${inv.invoice_number}`;
  const { data: move, error: moveErr } = await repo.insertMove({
    company_id: company.id,
    journal_id: journalId || null,
    name: moveName,
    ref: inv.control_number || inv.invoice_number,
    move_date: inv.invoice_date,
    state: "confirmed",
    partner_id: inv.partner_id,
    invoice_id: inv.id,
    created_by: user?.id,
  });
  if (moveErr) return { error: moveErr.message };

  const { error: lineErr } = await repo.insertMoveLines(
    move.id,
    company.id,
    inv.id,
    drafts,
  );
  if (lineErr) return { error: lineErr.message };

  await repo.updateInvoice(inv.id, {
    account_move_id: move.id,
    amount_residual: residualBase,
    amount_paid: 0,
    payment_state: residualBase <= 0 ? "paid" : "not_paid",
    due_date: inv.due_date || inv.invoice_date,
  });

  revalidatePath("/app");
  revalidatePath("/app/entries");
  revalidatePath("/app/ledger");
  return { success: `Asiento ${moveName}` };
}

export async function registerPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const partnerId = String(formData.get("partner_id") || "");
  const paymentType = String(formData.get("payment_type") || "inbound") as
    | "inbound"
    | "outbound";
  const paymentDate = String(formData.get("payment_date") || "");
  const enteredAmount = Number(formData.get("amount") || 0);
  const memo = String(formData.get("memo") || "").trim();
  const reference = String(formData.get("reference") || "").trim();
  const journalId = String(formData.get("journal_id") || "") || null;
  const invoiceId = String(formData.get("invoice_id") || "") || null;
  const existingId = String(formData.get("payment_id") || "").trim();
  const intent = String(formData.get("intent") || "confirm");
  const exchangeRate = Number(formData.get("exchange_rate") || 0) || null;
  const method = normalizePaymentMethod(String(formData.get("payment_method") || ""));
  const methodLabel = paymentMethodLabel(method);
  const posted = resolvePaymentPostedAmount({
    amount: enteredAmount,
    currency: String(formData.get("currency_code") || "VES"),
    exchangeRate,
  });
  if (!posted.ok) return { error: posted.error };
  const { amountBs: amount, amountUsd, currencyCode, exchangeRate: postedRate } = posted;

  if (!partnerId || !paymentDate) {
    return { error: "Completa tercero, fecha y monto." };
  }

  const periodOk = await assertPeriodOpen(company.id, paymentDate);
  if (!periodOk.ok) return { error: periodOk.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const repo = new AccountingRepository(supabase);
  const accounts = await repo.ensurePlan(company.id);
  if (!accounts) return { error: "Falta plan de cuentas. Ve a Contabilidad → Plan y regenera." };

  const paymentFields = {
    partner_id: partnerId,
    journal_id: journalId,
    payment_type: paymentType,
    payment_date: paymentDate,
    amount,
    currency_code: currencyCode,
    payment_method: method,
    exchange_rate: postedRate,
    amount_usd: amountUsd,
    memo: memo || null,
    reference: reference || null,
    invoice_id: invoiceId,
  };

  let paymentId = existingId;
  if (existingId) {
    const access = await getActiveCompanyRole();
    if (!access?.isAdmin) return { error: "Solo un administrador puede editar un cobro." };
    const existing = await repo.getPayment(existingId, company.id);
    if (!existing) return { error: "Pago no encontrado." };
    if (existing.state !== "draft") {
      return { error: "Vuelve el cobro a borrador para editarlo." };
    }
    if (existing.move_id && intent === "confirm") {
      return { error: "Este cobro ya tiene asiento." };
    }
    await repo.updatePayment(existingId, company.id, {
      ...paymentFields,
      state: intent === "confirm" ? "confirmed" : "draft",
    });
    if (intent !== "confirm") {
      if (invoiceId) {
        await logChatter({
          companyId: company.id,
          resModel: "invoice",
          resId: invoiceId,
          body: `Borrador de ${methodLabel} actualizado.`,
          paymentId: existingId,
          userId: user?.id,
          authorName: user?.email || "Admin",
        });
      }
      revalidatePaymentSurfaces(invoiceId ? [invoiceId] : []);
      return { success: "Borrador actualizado." };
    }
  } else {
    const { data: payment, error: payErr } = await repo.insertPayment({
      company_id: company.id,
      ...paymentFields,
      state: "confirmed",
      created_by: user?.id,
    });
    if (payErr) return { error: payErr.message };
    if (!payment) return { error: "No se pudo registrar el pago." };
    paymentId = payment.id as string;
  }

  const moveTypes =
    paymentType === "inbound"
      ? ["out_invoice", "out_refund"]
      : ["in_invoice", "in_refund"];

  const openInvoices = await repo.listOpenInvoices({
    companyId: company.id,
    partnerId,
    moveTypes,
    invoiceId,
  });
  if (!openInvoices.length) {
    return { error: "No hay facturas abiertas para ese tercero." };
  }

  let liquidity: string | null = null;
  if (journalId) {
    liquidity = await repo.journalDefaultAccount(journalId, company.id);
  }
  if (!liquidity) {
    liquidity = await repo.accountIdByCode(company.id, "1.1.02");
  }

  const partnerAccount =
    paymentType === "inbound"
      ? accounts.property_account_receivable_id
      : accounts.property_account_payable_id;

  if (!liquidity || !partnerAccount) {
    return { error: "Faltan cuentas de caja/banco o CxC/CxP." };
  }

  const { data: move } = await repo.insertMove({
    company_id: company.id,
    journal_id: journalId,
    name: `PAY/${paymentDate.replace(/-/g, "")}/${String(Date.now()).slice(-4)}`,
    ref: reference || memo || null,
    move_date: paymentDate,
    state: "confirmed",
    partner_id: partnerId,
    payment_id: paymentId,
    created_by: user?.id,
  });
  if (!move) return { error: "No se pudo crear el asiento del pago." };

  const cobroName = paymentType === "inbound" ? `Cobro ${methodLabel}` : `Pago ${methodLabel}`;
  const lines =
    paymentType === "inbound"
      ? [
          {
            account_id: liquidity,
            name: cobroName,
            debit: amount,
            credit: 0,
            amount_residual: 0,
          },
          {
            account_id: partnerAccount,
            partner_id: partnerId,
            name: "CxC",
            debit: 0,
            credit: amount,
            amount_residual: amount,
          },
        ]
      : [
          {
            account_id: partnerAccount,
            partner_id: partnerId,
            name: "CxP",
            debit: amount,
            credit: 0,
            amount_residual: amount,
          },
          {
            account_id: liquidity,
            name: cobroName,
            debit: 0,
            credit: amount,
            amount_residual: 0,
          },
        ];

  const inserted = await repo.insertMoveLines(move.id, company.id, null, lines);
  if (inserted.error) return { error: inserted.error.message };
  await repo.updatePaymentMove(paymentId, move.id);

  const partnerRow = (inserted.data || []).find(
    (row) => row.account_id === partnerAccount && row.partner_id === partnerId,
  );
  const counterparts = await repo.listOpenInvoicePartnerLines({
    companyId: company.id,
    partnerId,
    accountId: partnerAccount,
    invoiceId,
  });

  let leftover = amount;
  const allocations: Array<{
    payment_id: string;
    company_id: string;
    invoice_id: string;
    amount: number;
  }> = [];

  if (partnerRow && counterparts.length) {
    const result = fifoReconcile(asReconcilable(partnerRow), counterparts);
    if (result.partials.length) {
      const recErr = await repo.applyReconcile(
        company.id,
        result.partials,
        result.patches,
      );
      if (recErr) return { error: recErr.message };
      leftover = result.leftover;
      for (const row of result.appliedByInvoice) {
        allocations.push({
          payment_id: paymentId,
          company_id: company.id,
          invoice_id: row.invoice_id,
          amount: row.amount,
        });
      }
      await syncInvoicesFromLines(
        repo,
        company.id,
        result.appliedByInvoice.map((r) => r.invoice_id),
        partnerAccount,
      );
    }
  }

  if (!allocations.length) {
    let remaining = amount;
    for (const inv of openInvoices) {
      if (remaining <= 0.009) break;
      const due = Number(inv.amount_residual);
      const apply = Math.min(due, remaining);
      if (apply <= 0.009) continue;
      allocations.push({
        payment_id: paymentId,
        company_id: company.id,
        invoice_id: inv.id,
        amount: round2(apply),
      });
      const newResidual = round2(due - apply);
      await repo.syncInvoiceResidual(
        inv.id,
        Math.max(newResidual, 0),
        Number(inv.amount_total),
      );
      remaining = round2(remaining - apply);
    }
    leftover = remaining;
  }

  if (!allocations.length) {
    return { error: "No se pudo aplicar el pago." };
  }
  await repo.insertAllocations(allocations);
  const applied = round2(amount - leftover);
  const appliedLabel =
    currencyCode === "USD" && amountUsd != null
      ? `$ ${amountUsd.toFixed(2)} / ${applied.toFixed(2)} Bs`
      : `${applied.toFixed(2)} Bs`;
  const firstInvoice = allocations[0]?.invoice_id;
  if (firstInvoice) {
    await repo.updatePayment(paymentId, company.id, { invoice_id: firstInvoice });
  }
  for (const alloc of allocations) {
    await logChatter({
      companyId: company.id,
      resModel: "invoice",
      resId: alloc.invoice_id,
      body: `${methodLabel} · ${appliedLabel} aplicado a la factura.`,
      paymentId,
      userId: user?.id,
      authorName: user?.email || "Usuario",
    });
  }

  revalidatePaymentSurfaces(allocations.map((a) => a.invoice_id));
  return {
    success: `Pago registrado · aplicado ${appliedLabel}${
      leftover > 0.009 ? ` · sobrante ${leftover.toFixed(2)} Bs` : ""
    }`,
  };
}

export async function resetPaymentToDraft(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await getActiveCompanyRole();
  if (!access) return { error: "Crea una empresa primero." };
  if (!access.isAdmin) return { error: "Solo un administrador puede volver el cobro a borrador." };

  const paymentId = String(formData.get("payment_id") || "").trim();
  if (!paymentId) return { error: "Pago no indicado." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const repo = new AccountingRepository(supabase);
  const payment = await repo.getPayment(paymentId, access.company.id);
  if (!payment) return { error: "Pago no encontrado." };
  const actions = paymentAdminActions(String(payment.state || ""));
  if (!actions.canReset) return { error: "Este cobro ya está en borrador." };

  const { invoiceIds, restoredViaLines } = await repo.unpostPayment(paymentId, access.company.id);
  const linkedInvoice =
    String((payment as { invoice_id?: string | null }).invoice_id || "") || invoiceIds[0] || "";
  const accounts = await repo.ensurePlan(access.company.id);
  const partnerAccount =
    payment.payment_type === "outbound"
      ? accounts?.property_account_payable_id
      : accounts?.property_account_receivable_id;
  if (restoredViaLines && partnerAccount && invoiceIds.length) {
    await syncInvoicesFromLines(repo, access.company.id, invoiceIds, partnerAccount);
  }
  await repo.updatePayment(paymentId, access.company.id, {
    state: "draft",
    move_id: null,
    invoice_id: linkedInvoice || null,
  });

  const methodLabel = paymentMethodLabel(
    String((payment as { payment_method?: string | null }).payment_method || ""),
  );
  for (const invoiceId of invoiceIds.length ? invoiceIds : linkedInvoice ? [linkedInvoice] : []) {
    await logChatter({
      companyId: access.company.id,
      resModel: "invoice",
      resId: invoiceId,
      body: `${methodLabel || "Cobro"} vuelto a borrador por un administrador.`,
      paymentId,
      userId: user?.id,
      authorName: user?.email || "Admin",
    });
  }
  revalidatePaymentSurfaces(invoiceIds);
  revalidatePath(`/app/payments/${paymentId}`);
  return { success: "El cobro volvió a borrador. Ya puedes editarlo y confirmarlo." };
}

export async function reconcileMoveLines(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Crea una empresa primero." };

  const lineId = String(formData.get("line_id") || "");
  const counterpartId = String(formData.get("counterpart_id") || "");
  if (!lineId || !counterpartId) return { error: "Elige la contrapunta a conciliar." };

  const supabase = await createClient();
  const repo = new AccountingRepository(supabase);
  const [sourceRow, counterpartRow] = await Promise.all([
    repo.getMoveLine(lineId, company.id),
    repo.getMoveLine(counterpartId, company.id),
  ]);
  if (!sourceRow || !counterpartRow) return { error: "Línea no encontrada." };

  const sourceDate = String(
    (Array.isArray(sourceRow.account_moves)
      ? sourceRow.account_moves[0]?.move_date
      : (sourceRow.account_moves as { move_date?: string } | null)?.move_date) || "",
  );
  const counterpartDate = String(
    (Array.isArray(counterpartRow.account_moves)
      ? counterpartRow.account_moves[0]?.move_date
      : (counterpartRow.account_moves as { move_date?: string } | null)?.move_date) || "",
  );
  const lockDate = [sourceDate, counterpartDate].filter(Boolean).sort().at(-1) || "";
  if (lockDate) {
    const periodOk = await assertPeriodOpen(company.id, lockDate);
    if (!periodOk.ok) return { error: periodOk.error };
  }

  const result = pairReconcile(asReconcilable(sourceRow), asReconcilable(counterpartRow));
  if (result.error) return { error: result.error };
  const recErr = await repo.applyReconcile(company.id, result.partials, result.patches);
  if (recErr) return { error: recErr.message };

  await syncInvoicesFromLines(
    repo,
    company.id,
    [sourceRow.invoice_id, counterpartRow.invoice_id],
    sourceRow.account_id,
  );

  revalidatePaymentSurfaces(
    [sourceRow.invoice_id, counterpartRow.invoice_id].filter(Boolean) as string[],
  );
  revalidatePath(`/app/entries/${sourceRow.move_id}`);
  revalidatePath(`/app/entries/${counterpartRow.move_id}`);
  return { success: "Líneas conciliadas." };
}

/** Asiento de retención: compra Dr CxP / Cr ret. por pagar. Venta IVA Dr débito / Cr CxC. */
export async function postWithholdingAccounting(input: {
  invoiceId: string;
  kind: "iva" | "islr";
  amount: number;
  date: string;
  voucherNumber: string;
}): Promise<ActionState> {
  const amount = Number(input.amount || 0);
  if (amount <= 0.009) return { success: "Sin monto a contabilizar." };

  const company = await getActiveCompany();
  if (!company) return { error: "Sin empresa." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const repo = new AccountingRepository(supabase);

  const inv = await repo.getInvoiceLite(input.invoiceId, company.id);
  if (!inv) return { error: "Factura no encontrada." };

  const ref = `WH-${input.kind.toUpperCase()}-${input.voucherNumber}`;
  const existing = await repo.findMoveByRef(company.id, ref);
  if (existing) return { success: "Asiento de retención ya existe." };

  const props = await repo.getCompanyAccounts(company.id);
  const isSale = String(inv.move_type).startsWith("out_");
  if (isSale && input.kind === "islr") {
    return { success: "ISLR de venta no genera asiento." };
  }

  const partnerAccount = isSale
    ? props?.property_account_receivable_id
    : props?.property_account_payable_id;
  const ivaDebito = props?.property_account_tax_sale_id;
  const liability =
    input.kind === "iva"
      ? await repo.accountIdByCode(company.id, "2.1.03")
      : await repo.accountIdByCode(company.id, "2.1.04");

  if (!partnerAccount || (isSale && !ivaDebito) || (!isSale && !liability)) {
    return { error: "Faltan cuentas de retención en el plan. Regenera el plan VE." };
  }

  const journalId = await repo.journalIdByCode(company.id, "MISC");
  const { data: move, error: moveErr } = await repo.insertMove({
    company_id: company.id,
    journal_id: journalId || null,
    name: ref,
    ref,
    move_date: input.date,
    state: "confirmed",
    partner_id: inv.partner_id,
    invoice_id: inv.id,
    notes: `Retención ${input.kind.toUpperCase()} ${input.voucherNumber}`,
    created_by: user?.id,
  });
  if (moveErr) return { error: moveErr.message };

  const label = input.kind === "iva" ? "Retención IVA" : "Retención ISLR";
  const lines = isSale
    ? [
        {
          account_id: ivaDebito!,
          name: `${label} ${inv.invoice_number}`,
          debit: amount,
          credit: 0,
          amount_residual: 0,
        },
        {
          account_id: partnerAccount,
          partner_id: inv.partner_id,
          name: `${label} ${inv.invoice_number}`,
          debit: 0,
          credit: amount,
          amount_residual: 0,
        },
      ]
    : [
        {
          account_id: partnerAccount,
          partner_id: inv.partner_id,
          name: `${label} ${inv.invoice_number}`,
          debit: amount,
          credit: 0,
          amount_residual: 0,
        },
        {
          account_id: liability!,
          name: `${label} ${input.voucherNumber}`,
          debit: 0,
          credit: amount,
          amount_residual: 0,
        },
      ];

  const { error: lineErr } = await repo.insertMoveLines(move.id, company.id, inv.id, lines);
  if (lineErr) return { error: lineErr.message };

  revalidatePath("/app/ledger");
  revalidatePath("/app/entries");
  return { success: `Asiento ${ref}` };
}
