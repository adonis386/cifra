import { agingBucket, partnerName } from "@/lib/export/aging";
import { getActiveCompany, getExchangeRate } from "@/lib/company";
import { createClient } from "@/lib/supabase/server";

export async function requireCompanyContext() {
  const company = await getActiveCompany();
  if (!company) return null;
  const supabase = await createClient();
  const { data: full } = await supabase
    .from("companies")
    .select("id, name, rif, address, phone, email")
    .eq("id", company.id)
    .single();
  return { company, full: full || company, supabase };
}

export async function loadOpenInvoices(kind: "receivable" | "payable") {
  const ctx = await requireCompanyContext();
  if (!ctx) return null;
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const moveTypes =
    kind === "receivable"
      ? ["out_invoice", "out_refund"]
      : ["in_invoice", "in_refund"];

  const [{ data: invoices }, rate] = await Promise.all([
    ctx.supabase
      .from("invoices")
      .select(
        "id, invoice_date, due_date, invoice_number, amount_total, amount_residual, exchange_rate, payment_state, partners(name, rif)",
      )
      .eq("company_id", ctx.company.id)
      .in("move_type", moveTypes)
      .gt("amount_residual", 0)
      .neq("state", "cancelled")
      .order("invoice_date"),
    getExchangeRate(ctx.company.id, todayIso),
  ]);

  const rows = (invoices || []).map((inv) => {
    const p = partnerName(inv.partners as never);
    const due = inv.due_date || inv.invoice_date;
    return {
      tercero: p.name,
      rif: p.rif,
      factura: inv.invoice_number,
      emision: inv.invoice_date,
      vence: due,
      aging: agingBucket(due, today),
      estado: inv.payment_state,
      total: Number(inv.amount_total),
      saldo: Number(inv.amount_residual),
      tasa: Number(inv.exchange_rate || rate || 0) || null,
    };
  });

  return { ...ctx, kind, rate, rows, today: todayIso };
}

export async function loadPartnerStatement(opts: {
  partnerId: string;
  from: string;
  to: string;
}) {
  const ctx = await requireCompanyContext();
  if (!ctx) return null;

  const { data: partner } = await ctx.supabase
    .from("partners")
    .select("id, name, rif, address, phone")
    .eq("company_id", ctx.company.id)
    .eq("id", opts.partnerId)
    .single();
  if (!partner) return null;

  const { data: invoices } = await ctx.supabase
    .from("invoices")
    .select(
      "invoice_date, invoice_number, move_type, amount_total, amount_paid, payment_state",
    )
    .eq("company_id", ctx.company.id)
    .eq("partner_id", opts.partnerId)
    .gte("invoice_date", opts.from)
    .lte("invoice_date", opts.to)
    .neq("state", "cancelled")
    .order("invoice_date");

  type Row = {
    fecha: string;
    documento: string;
    detalle: string;
    cargo: number;
    abono: number;
  };
  const rows: Row[] = [];
  for (const inv of invoices || []) {
    const isSale = String(inv.move_type).startsWith("out_");
    const total = Number(inv.amount_total);
    rows.push({
      fecha: inv.invoice_date,
      documento: inv.invoice_number,
      detalle: `${inv.move_type} · ${inv.payment_state}`,
      cargo: isSale ? total : 0,
      abono: isSale ? 0 : total,
    });
    const paid = Number(inv.amount_paid || 0);
    if (paid > 0) {
      rows.push({
        fecha: inv.invoice_date,
        documento: `PAGO/${inv.invoice_number}`,
        detalle: "Aplicación de pago",
        cargo: isSale ? 0 : paid,
        abono: isSale ? paid : 0,
      });
    }
  }
  rows.sort((a, b) => a.fecha.localeCompare(b.fecha));

  let balance = 0;
  const withBalance = rows.map((r) => {
    balance += r.cargo - r.abono;
    return { ...r, saldo: balance };
  });

  return {
    ...ctx,
    partner,
    from: opts.from,
    to: opts.to,
    rows: withBalance,
    openResidual: balance,
  };
}

export async function loadLedger(opts: {
  accountId: string;
  from: string;
  to: string;
}) {
  const ctx = await requireCompanyContext();
  if (!ctx) return null;

  const { data: account } = await ctx.supabase
    .from("account_accounts")
    .select("id, code, name, account_type")
    .eq("company_id", ctx.company.id)
    .eq("id", opts.accountId)
    .single();
  if (!account) return null;

  const { data } = await ctx.supabase
    .from("account_move_lines")
    .select(
      "id, name, debit, credit, partners(name), account_moves!inner(move_date, name, state)",
    )
    .eq("company_id", ctx.company.id)
    .eq("account_id", opts.accountId)
    .gte("account_moves.move_date", opts.from)
    .lte("account_moves.move_date", opts.to)
    .order("created_at", { ascending: true })
    .limit(1000);

  const lines = (data || []).map((l) => {
    const move = l.account_moves as unknown as
      | { move_date: string; name: string }
      | { move_date: string; name: string }[]
      | null;
    const m = Array.isArray(move) ? move[0] : move;
    const p = partnerName(l.partners as never);
    return {
      fecha: m?.move_date || "",
      asiento: m?.name || "",
      detalle: l.name || "—",
      tercero: p.name,
      debe: Number(l.debit),
      haber: Number(l.credit),
    };
  });
  lines.sort((a, b) => a.fecha.localeCompare(b.fecha));

  let balance = 0;
  const withBalance = lines.map((l) => {
    balance += l.debe - l.haber;
    return { ...l, saldo: balance };
  });

  return {
    ...ctx,
    account,
    from: opts.from,
    to: opts.to,
    rows: withBalance,
    totalDebit: lines.reduce((s, l) => s + l.debe, 0),
    totalCredit: lines.reduce((s, l) => s + l.haber, 0),
  };
}

export async function loadTrialBalance() {
  const ctx = await requireCompanyContext();
  if (!ctx) return null;

  const { data: lines } = await ctx.supabase
    .from("account_move_lines")
    .select("account_id, debit, credit, account_accounts(code, name)")
    .eq("company_id", ctx.company.id);

  const tb = new Map<
    string,
    { codigo: string; cuenta: string; debe: number; haber: number }
  >();
  for (const l of lines || []) {
    const acc = l.account_accounts as unknown as
      | { code: string; name: string }
      | { code: string; name: string }[]
      | null;
    const a = Array.isArray(acc) ? acc[0] : acc;
    if (!a) continue;
    const cur = tb.get(l.account_id) || {
      codigo: a.code,
      cuenta: a.name,
      debe: 0,
      haber: 0,
    };
    cur.debe += Number(l.debit);
    cur.haber += Number(l.credit);
    tb.set(l.account_id, cur);
  }

  const rows = Array.from(tb.values())
    .map((r) => ({
      ...r,
      saldo: r.debe - r.haber,
    }))
    .sort((x, y) => x.codigo.localeCompare(y.codigo));

  return { ...ctx, rows };
}

export async function loadInvoicesList() {
  const ctx = await requireCompanyContext();
  if (!ctx) return null;

  const { data: invoices } = await ctx.supabase
    .from("invoices")
    .select(
      "invoice_date, move_type, invoice_number, control_number, amount_untaxed, amount_tax, amount_total, amount_retained_iva, amount_residual, payment_state, currency_code, exchange_rate, partners(name, rif)",
    )
    .eq("company_id", ctx.company.id)
    .order("invoice_date", { ascending: false })
    .limit(2000);

  const moveLabel: Record<string, string> = {
    in_invoice: "Compra",
    in_refund: "N/C compra",
    out_invoice: "Venta",
    out_refund: "N/C venta",
  };

  const rows = (invoices || []).map((inv) => {
    const p = partnerName(inv.partners as never);
    return {
      fecha: inv.invoice_date,
      tipo: moveLabel[inv.move_type] || inv.move_type,
      tercero: p.name,
      rif: p.rif,
      factura: inv.invoice_number,
      control: inv.control_number || "",
      base: Number(inv.amount_untaxed),
      iva: Number(inv.amount_tax),
      total: Number(inv.amount_total),
      ret_iva: Number(inv.amount_retained_iva),
      residual: Number(inv.amount_residual),
      estado: inv.payment_state,
      moneda: inv.currency_code,
      tasa: Number(inv.exchange_rate || 0) || null,
    };
  });

  return { ...ctx, rows };
}

export async function loadFiscalBook(bookId: string) {
  const ctx = await requireCompanyContext();
  if (!ctx) return null;

  const { data: book } = await ctx.supabase
    .from("fiscal_books")
    .select("id, name, book_type, period_start, period_end, state")
    .eq("id", bookId)
    .eq("company_id", ctx.company.id)
    .single();
  if (!book) return null;

  const { data: lines } = await ctx.supabase
    .from("fiscal_book_lines")
    .select("*")
    .eq("book_id", book.id)
    .order("rank");

  const rows = (lines || []).map((l) => {
    const baseG = Number(l.base_general ?? l.amount_untaxed ?? 0);
    const taxG = Number(l.tax_general ?? l.amount_tax ?? 0);
    const baseR = Number(l.base_reduced ?? 0);
    const taxR = Number(l.tax_reduced ?? 0);
    const baseA = Number(l.base_additional ?? 0);
    const taxA = Number(l.tax_additional ?? 0);
    const baseI = Number(l.base_import ?? 0);
    const taxI = Number(l.tax_import ?? 0);
    return {
      nro_op: l.rank,
      fecha_emision: l.emission_date,
      tipo_doc: l.doc_type,
      documento: l.invoice_number,
      nota_debito: l.debit_note || "",
      nota_credito: l.credit_note || "",
      factura_afectada: l.affected_document || "",
      nro_control: l.control_number || "",
      razon_social: l.partner_name,
      rif: l.partner_rif,
      total_con_iva: Number(l.amount_total),
      exento_sdcf: Number(l.amount_exempt),
      et_base: baseI,
      et_pct: Number(l.rate_import || 0) || (taxI > 0 ? 16 : 0),
      et_impuesto: taxI,
      na_base_16: baseG,
      na_pct_16: Number(l.rate_general || 0) || (taxG > 0 ? 16 : 0),
      na_imp_16: taxG,
      na_base_8: baseR,
      na_pct_8: Number(l.rate_reduced || 0) || (taxR > 0 ? 8 : 0),
      na_imp_8: taxR,
      na_base_31: baseA,
      na_pct_31: Number(l.rate_additional || 0) || (taxA > 0 ? 31 : 0),
      na_imp_31: taxA,
      comp_retencion_iva: l.voucher_number || "",
      iva_retenido: Number(l.amount_retained),
    };
  });

  return { ...ctx, book, rows };
}

export async function loadPayments() {
  const ctx = await requireCompanyContext();
  if (!ctx) return null;

  const { data: payments } = await ctx.supabase
    .from("payments")
    .select(
      "payment_date, payment_type, amount, currency_code, exchange_rate, reference, memo, state, partners(name, rif)",
    )
    .eq("company_id", ctx.company.id)
    .order("payment_date", { ascending: false })
    .limit(2000);

  const rows = (payments || []).map((p) => {
    const partner = partnerName(p.partners as never);
    return {
      fecha: p.payment_date,
      tipo: p.payment_type === "inbound" ? "Cobro" : "Pago",
      tercero: partner.name,
      rif: partner.rif,
      monto: Number(p.amount),
      moneda: p.currency_code,
      tasa: Number(p.exchange_rate || 0) || null,
      referencia: p.reference || "",
      memo: p.memo || "",
      estado: p.state,
    };
  });

  return { ...ctx, rows };
}
