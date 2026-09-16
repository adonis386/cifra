"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { assertPeriodOpen } from "@/lib/actions/periods";
import {
  invoiceEntryDomain,
  nextAccountCode,
  nextJournalCode,
  type InvoiceEntryAccounts,
} from "@/domain/accounting/invoice-entry.service";
import { AccountingRepository } from "@/repositories/accounting.repository";

export type ActionState = { error?: string; success?: string };

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
  if (inv.account_move_id) return { success: "Asiento ya existe." };

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
  const drafts = invoiceEntryDomain.buildLines({
    isSale,
    invoiceNumber: inv.invoice_number,
    partnerId: inv.partner_id,
    untaxed: Number(inv.amount_untaxed) * sign,
    tax: Number(inv.amount_tax) * sign,
    exempt: Number(inv.amount_exempt) * sign,
    total: Number(inv.amount_total) * sign,
    retainedIva: Number(inv.amount_retained_iva || 0),
    accounts: entryAccounts,
  });
  const residualBase = invoiceEntryDomain.residualAfterIva(
    Number(inv.amount_total),
    Number(inv.amount_retained_iva || 0),
  );

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
  const amount = Number(formData.get("amount") || 0);
  const memo = String(formData.get("memo") || "").trim();
  const reference = String(formData.get("reference") || "").trim();
  const journalId = String(formData.get("journal_id") || "") || null;
  const invoiceId = String(formData.get("invoice_id") || "") || null;
  const exchangeRate = Number(formData.get("exchange_rate") || 0) || null;
  const amountUsd =
    exchangeRate && exchangeRate > 0
      ? Number((amount / exchangeRate).toFixed(2))
      : null;

  if (!partnerId || !paymentDate || amount <= 0) {
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

  const { data: payment, error: payErr } = await repo.insertPayment({
    company_id: company.id,
    partner_id: partnerId,
    journal_id: journalId,
    payment_type: paymentType,
    payment_date: paymentDate,
    amount,
    exchange_rate: exchangeRate,
    amount_usd: amountUsd,
    memo: memo || null,
    reference: reference || null,
    state: "confirmed",
    created_by: user?.id,
  });
  if (payErr) return { error: payErr.message };
  if (!payment) return { error: "No se pudo registrar el pago." };
  const paymentId = payment.id as string;

  let remaining = amount;
  const allocations: Array<{
    payment_id: string;
    company_id: string;
    invoice_id: string;
    amount: number;
  }> = [];

  for (const inv of openInvoices) {
    if (remaining <= 0) break;
    const due = Number(inv.amount_residual);
    const apply = Math.min(due, remaining);
    if (apply <= 0) continue;
    allocations.push({
      payment_id: paymentId,
      company_id: company.id,
      invoice_id: inv.id,
      amount: Number(apply.toFixed(2)),
    });
    const newResidual = Number((due - apply).toFixed(2));
    const paidSoFar = Number(inv.amount_total) - newResidual;
    await repo.updateInvoice(inv.id, {
      amount_residual: Math.max(newResidual, 0),
      amount_paid: Number(paidSoFar.toFixed(2)),
      payment_state: invoiceEntryDomain.paymentState(
        newResidual,
        Number(inv.amount_total),
      ),
    });
    remaining = Number((remaining - apply).toFixed(2));
  }

  if (!allocations.length) {
    return { error: "No se pudo aplicar el pago." };
  }
  await repo.insertAllocations(allocations);

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

  const applied = Number((amount - remaining).toFixed(2));
  if (liquidity && partnerAccount) {
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

    if (move) {
      const lines =
        paymentType === "inbound"
          ? [
              {
                account_id: liquidity,
                name: "Cobro",
                debit: applied,
                credit: 0,
                amount_residual: 0,
              },
              {
                account_id: partnerAccount,
                partner_id: partnerId,
                name: "CxC",
                debit: 0,
                credit: applied,
                amount_residual: 0,
              },
            ]
          : [
              {
                account_id: partnerAccount,
                partner_id: partnerId,
                name: "CxP",
                debit: applied,
                credit: 0,
                amount_residual: 0,
              },
              {
                account_id: liquidity,
                name: "Pago",
                debit: 0,
                credit: applied,
                amount_residual: 0,
              },
            ];
      await repo.insertMoveLines(move.id, company.id, null, lines);
      await repo.updatePaymentMove(paymentId, move.id);
    }
  }

  revalidatePath("/app/payments");
  revalidatePath("/app/receivables");
  revalidatePath("/app/payables");
  revalidatePath("/app/invoices");
  revalidatePath("/app/reports");
  return {
    success: `Pago registrado · aplicado ${applied.toFixed(2)}${
      remaining > 0 ? ` · sobrante ${remaining.toFixed(2)}` : ""
    }`,
  };
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
