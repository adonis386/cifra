"use server";

import { revalidatePath } from "next/cache";
import { getActiveCompany } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";
import { assertPeriodOpen } from "@/lib/actions/periods";

export type ActionState = { error?: string; success?: string };

type CompanyAccounts = {
  id: string;
  property_account_receivable_id: string | null;
  property_account_payable_id: string | null;
  property_account_income_id: string | null;
  property_account_expense_id: string | null;
  property_account_tax_sale_id: string | null;
  property_account_tax_purchase_id: string | null;
};

async function getCompanyAccounts(companyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select(
      "id, property_account_receivable_id, property_account_payable_id, property_account_income_id, property_account_expense_id, property_account_tax_sale_id, property_account_tax_purchase_id",
    )
    .eq("id", companyId)
    .single();
  return data as CompanyAccounts | null;
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
  const { error } = await supabase.rpc("seed_company_accounting", {
    p_company_id: company.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/app/accounts");
  revalidatePath("/app/config");
  return { success: "Plan de cuentas y diarios listos." };
}

/** Create Odoo-like account.move for an invoice and set residual. */
export async function postInvoiceAccounting(invoiceId: string): Promise<ActionState> {
  const company = await getActiveCompany();
  if (!company) return { error: "Sin empresa." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: inv } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("company_id", company.id)
    .single();
  if (!inv) return { error: "Factura no encontrada." };
  if (inv.account_move_id) return { success: "Asiento ya existe." };

  const props = await getCompanyAccounts(company.id);
  if (!props?.property_account_receivable_id) {
    await supabase.rpc("seed_company_accounting", { p_company_id: company.id });
  }
  const accounts = (await getCompanyAccounts(company.id))!;

  const isSale = String(inv.move_type).startsWith("out_");
  const journalCode = isSale ? "VEN" : "COM";
  const { data: journal } = await supabase
    .from("account_journals")
    .select("id")
    .eq("company_id", company.id)
    .eq("code", journalCode)
    .maybeSingle();

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
  const untaxed = Number(inv.amount_untaxed) * sign;
  const tax = Number(inv.amount_tax) * sign;
  const exempt = Number(inv.amount_exempt) * sign;
  const total = Number(inv.amount_total) * sign;
  // Residual cobrable/pagable net of IVA withheld at source (VE practice)
  const residualBase = Math.abs(
    Number(inv.amount_total) - Number(inv.amount_retained_iva || 0),
  );

  const moveName = `${journalCode}/${inv.invoice_number}`;
  const { data: move, error: moveErr } = await supabase
    .from("account_moves")
    .insert({
      company_id: company.id,
      journal_id: journal?.id || null,
      name: moveName,
      ref: inv.control_number || inv.invoice_number,
      move_date: inv.invoice_date,
      state: "confirmed",
      partner_id: inv.partner_id,
      invoice_id: inv.id,
      created_by: user?.id,
    })
    .select("id")
    .single();
  if (moveErr) return { error: moveErr.message };

  const lines: Array<Record<string, unknown>> = [];
  if (isSale) {
    // Debit CxC = total
    lines.push({
      move_id: move.id,
      company_id: company.id,
      account_id: partnerAccount,
      partner_id: inv.partner_id,
      name: `Factura ${inv.invoice_number}`,
      debit: Math.max(total, 0),
      credit: Math.max(-total, 0),
      amount_residual: residualBase,
      invoice_id: inv.id,
    });
    // Credit income
    lines.push({
      move_id: move.id,
      company_id: company.id,
      account_id: incomeExpense,
      partner_id: inv.partner_id,
      name: "Ingresos",
      debit: Math.max(-(untaxed + exempt), 0),
      credit: Math.max(untaxed + exempt, 0),
      amount_residual: 0,
      invoice_id: inv.id,
    });
    if (tax !== 0 && taxAccount) {
      lines.push({
        move_id: move.id,
        company_id: company.id,
        account_id: taxAccount,
        name: "IVA débito",
        debit: Math.max(-tax, 0),
        credit: Math.max(tax, 0),
        amount_residual: 0,
        invoice_id: inv.id,
      });
    }
  } else {
    // Debit expense + IVA, Credit CxP
    lines.push({
      move_id: move.id,
      company_id: company.id,
      account_id: incomeExpense,
      partner_id: inv.partner_id,
      name: "Compra / gasto",
      debit: Math.max(untaxed + exempt, 0),
      credit: Math.max(-(untaxed + exempt), 0),
      amount_residual: 0,
      invoice_id: inv.id,
    });
    if (tax !== 0 && taxAccount) {
      lines.push({
        move_id: move.id,
        company_id: company.id,
        account_id: taxAccount,
        name: "IVA crédito",
        debit: Math.max(tax, 0),
        credit: Math.max(-tax, 0),
        amount_residual: 0,
        invoice_id: inv.id,
      });
    }
    lines.push({
      move_id: move.id,
      company_id: company.id,
      account_id: partnerAccount,
      partner_id: inv.partner_id,
      name: `Factura ${inv.invoice_number}`,
      debit: Math.max(-total, 0),
      credit: Math.max(total, 0),
      amount_residual: residualBase,
      invoice_id: inv.id,
    });
  }

  const { error: lineErr } = await supabase.from("account_move_lines").insert(lines);
  if (lineErr) return { error: lineErr.message };

  await supabase
    .from("invoices")
    .update({
      account_move_id: move.id,
      amount_residual: residualBase,
      amount_paid: 0,
      payment_state: residualBase <= 0 ? "paid" : "not_paid",
      due_date: inv.due_date || inv.invoice_date,
    })
    .eq("id", inv.id);

  return { success: `Asiento ${moveName}` };
}

function paymentState(residual: number, total: number): string {
  if (residual <= 0.009) return "paid";
  if (residual < total - 0.009) return "partial";
  return "not_paid";
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
  const props = await getCompanyAccounts(company.id);
  if (!props?.property_account_receivable_id) {
    await supabase.rpc("seed_company_accounting", { p_company_id: company.id });
  }
  const accounts = (await getCompanyAccounts(company.id))!;

  // Resolve open invoices to allocate
  const moveTypes =
    paymentType === "inbound"
      ? ["out_invoice", "out_refund"]
      : ["in_invoice", "in_refund"];

  let openQuery = supabase
    .from("invoices")
    .select("id, amount_residual, amount_total, invoice_number")
    .eq("company_id", company.id)
    .eq("partner_id", partnerId)
    .in("move_type", moveTypes)
    .gt("amount_residual", 0)
    .neq("state", "cancelled")
    .order("invoice_date", { ascending: true });

  if (invoiceId) openQuery = openQuery.eq("id", invoiceId);

  const { data: openInvoices } = await openQuery;
  if (!openInvoices?.length) {
    return { error: "No hay facturas abiertas para ese tercero." };
  }

  let paymentId: string | null = null;
  {
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .insert({
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
      })
      .select("id")
      .single();

    if (!payErr && payment) {
      paymentId = payment.id;
    } else if (payErr && /exchange_rate|amount_usd|column/i.test(payErr.message)) {
      const { data: legacyPay, error: legacyErr } = await supabase
        .from("payments")
        .insert({
          company_id: company.id,
          partner_id: partnerId,
          journal_id: journalId,
          payment_type: paymentType,
          payment_date: paymentDate,
          amount,
          memo: memo || null,
          reference: reference || null,
          state: "confirmed",
          created_by: user?.id,
        })
        .select("id")
        .single();
      if (legacyErr) return { error: legacyErr.message };
      paymentId = legacyPay.id;
    } else if (payErr) {
      return { error: payErr.message };
    }
  }
  if (!paymentId) return { error: "No se pudo registrar el pago." };

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
    await supabase
      .from("invoices")
      .update({
        amount_residual: Math.max(newResidual, 0),
        amount_paid: Number(paidSoFar.toFixed(2)),
        payment_state: paymentState(newResidual, Number(inv.amount_total)),
      })
      .eq("id", inv.id);
    remaining = Number((remaining - apply).toFixed(2));
  }

  if (!allocations.length) {
    return { error: "No se pudo aplicar el pago." };
  }
  await supabase.from("payment_allocations").insert(allocations);

  // Simple payment move: bank/cash <-> receivable/payable
  const liquidity =
    accounts.property_account_receivable_id && paymentType === "inbound"
      ? (
          await supabase
            .from("account_accounts")
            .select("id")
            .eq("company_id", company.id)
            .eq("code", "1.1.02")
            .maybeSingle()
        ).data?.id
      : (
          await supabase
            .from("account_accounts")
            .select("id")
            .eq("company_id", company.id)
            .eq("code", "1.1.02")
            .maybeSingle()
        ).data?.id;

  const partnerAccount =
    paymentType === "inbound"
      ? accounts.property_account_receivable_id
      : accounts.property_account_payable_id;

  const applied = Number((amount - remaining).toFixed(2));
  if (liquidity && partnerAccount) {
    const { data: move } = await supabase
      .from("account_moves")
      .insert({
        company_id: company.id,
        journal_id: journalId,
        name: `PAY/${paymentDate.replace(/-/g, "")}/${String(Date.now()).slice(-4)}`,
        ref: reference || memo || null,
        move_date: paymentDate,
        state: "confirmed",
        partner_id: partnerId,
        payment_id: paymentId,
        created_by: user?.id,
      })
      .select("id")
      .single();

    if (move) {
      const lines =
        paymentType === "inbound"
          ? [
              {
                move_id: move.id,
                company_id: company.id,
                account_id: liquidity,
                name: "Cobro",
                debit: applied,
                credit: 0,
                amount_residual: 0,
              },
              {
                move_id: move.id,
                company_id: company.id,
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
                move_id: move.id,
                company_id: company.id,
                account_id: partnerAccount,
                partner_id: partnerId,
                name: "CxP",
                debit: applied,
                credit: 0,
                amount_residual: 0,
              },
              {
                move_id: move.id,
                company_id: company.id,
                account_id: liquidity,
                name: "Pago",
                debit: 0,
                credit: applied,
                amount_residual: 0,
              },
            ];
      await supabase.from("account_move_lines").insert(lines);
      await supabase.from("payments").update({ move_id: move.id }).eq("id", paymentId);
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

async function accountIdByCode(companyId: string, code: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("account_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("code", code)
    .maybeSingle();
  return data?.id || null;
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

  const { data: inv } = await supabase
    .from("invoices")
    .select("id, move_type, partner_id, invoice_number")
    .eq("id", input.invoiceId)
    .eq("company_id", company.id)
    .single();
  if (!inv) return { error: "Factura no encontrada." };

  const ref = `WH-${input.kind.toUpperCase()}-${input.voucherNumber}`;
  const { data: existing } = await supabase
    .from("account_moves")
    .select("id")
    .eq("company_id", company.id)
    .eq("ref", ref)
    .maybeSingle();
  if (existing) return { success: "Asiento de retención ya existe." };

  const props = await getCompanyAccounts(company.id);
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
      ? await accountIdByCode(company.id, "2.1.03")
      : await accountIdByCode(company.id, "2.1.04");

  if (!partnerAccount || (isSale && !ivaDebito) || (!isSale && !liability)) {
    return { error: "Faltan cuentas de retención en el plan. Regenera el plan VE." };
  }

  const { data: journal } = await supabase
    .from("account_journals")
    .select("id")
    .eq("company_id", company.id)
    .eq("code", "MISC")
    .maybeSingle();

  const { data: move, error: moveErr } = await supabase
    .from("account_moves")
    .insert({
      company_id: company.id,
      journal_id: journal?.id || null,
      name: ref,
      ref,
      move_date: input.date,
      state: "confirmed",
      partner_id: inv.partner_id,
      invoice_id: inv.id,
      notes: `Retención ${input.kind.toUpperCase()} ${input.voucherNumber}`,
      created_by: user?.id,
    })
    .select("id")
    .single();
  if (moveErr) return { error: moveErr.message };

  const label = input.kind === "iva" ? "Retención IVA" : "Retención ISLR";
  const lines = isSale
    ? [
        {
          move_id: move.id,
          company_id: company.id,
          account_id: ivaDebito!,
          name: `${label} ${inv.invoice_number}`,
          debit: amount,
          credit: 0,
          amount_residual: 0,
          invoice_id: inv.id,
        },
        {
          move_id: move.id,
          company_id: company.id,
          account_id: partnerAccount,
          partner_id: inv.partner_id,
          name: `${label} ${inv.invoice_number}`,
          debit: 0,
          credit: amount,
          amount_residual: 0,
          invoice_id: inv.id,
        },
      ]
    : [
        {
          move_id: move.id,
          company_id: company.id,
          account_id: partnerAccount,
          partner_id: inv.partner_id,
          name: `${label} ${inv.invoice_number}`,
          debit: amount,
          credit: 0,
          amount_residual: 0,
          invoice_id: inv.id,
        },
        {
          move_id: move.id,
          company_id: company.id,
          account_id: liability!,
          name: `${label} ${input.voucherNumber}`,
          debit: 0,
          credit: amount,
          amount_residual: 0,
          invoice_id: inv.id,
        },
      ];

  const { error: lineErr } = await supabase.from("account_move_lines").insert(lines);
  if (lineErr) return { error: lineErr.message };

  revalidatePath("/app/ledger");
  revalidatePath("/app/entries");
  return { success: `Asiento ${ref}` };
}
