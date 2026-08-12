-- =============================================================================
-- Cifra — Seed de demo para reportes
-- User: f97bbcb7-d10b-472c-9fcb-c470ed9e11a9
--
-- Cómo usar:
--   1. Supabase → SQL Editor → New query
--   2. Pega este archivo completo → Run
--   3. Recarga la app (tablero, CxC/CxP, mayor, estado de cuenta, reportes)
--
-- Idempotente: borra datos previos con notes = 'SEED_CIFRA_REPORTS' de la
-- empresa del usuario (o crea empresa demo si no tiene).
-- =============================================================================

do $$
declare
  v_user uuid := 'f97bbcb7-d10b-472c-9fcb-c470ed9e11a9';
  v_company uuid;
  v_rate numeric := 764.348600;
  v_rate_date date := current_date;

  -- partners
  v_cli1 uuid := 'a1000000-0000-4000-8000-000000000001';
  v_cli2 uuid := 'a1000000-0000-4000-8000-000000000002';
  v_prov1 uuid := 'a1000000-0000-4000-8000-000000000003';
  v_prov2 uuid := 'a1000000-0000-4000-8000-000000000004';

  -- accounts / journals (resolved after seed_company_accounting)
  v_cxc uuid; v_cxp uuid; v_ing uuid; v_gas uuid; v_iva_db uuid; v_iva_cr uuid;
  v_banco uuid; v_caja uuid;
  v_j_ven uuid; v_j_com uuid; v_j_ban uuid; v_j_caj uuid; v_j_misc uuid;

  -- invoices
  v_inv1 uuid := 'b2000000-0000-4000-8000-000000000001';
  v_inv2 uuid := 'b2000000-0000-4000-8000-000000000002';
  v_inv3 uuid := 'b2000000-0000-4000-8000-000000000003';
  v_inv4 uuid := 'b2000000-0000-4000-8000-000000000004';
  v_inv5 uuid := 'b2000000-0000-4000-8000-000000000005';
  v_inv6 uuid := 'b2000000-0000-4000-8000-000000000006';

  -- moves / payments
  v_mov uuid;
  v_pay1 uuid := 'c3000000-0000-4000-8000-000000000001';
  v_pay2 uuid := 'c3000000-0000-4000-8000-000000000002';
  v_pay3 uuid := 'c3000000-0000-4000-8000-000000000003';
  v_stmt uuid := 'd4000000-0000-4000-8000-000000000001';
  v_wh_iva uuid := 'e6000000-0000-4000-8000-000000000001';
  v_wh_iva2 uuid := 'e6000000-0000-4000-8000-000000000002';
  v_book_sale uuid := 'f7000000-0000-4000-8000-000000000001';
  v_book_pur uuid := 'f7000000-0000-4000-8000-000000000002';

  v_untaxed numeric; v_tax numeric; v_total numeric; v_ret numeric; v_residual numeric;
  v_usd numeric;
  v_period text := to_char(current_date, 'YYYYMM');
begin
  -- ---------------------------------------------------------------------------
  -- 0) Validar usuario + migraciones mínimas
  -- ---------------------------------------------------------------------------
  if not exists (select 1 from auth.users where id = v_user) then
    raise exception 'User % no existe en auth.users', v_user;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'amount_residual'
  ) then
    raise exception 'Falta migración 07 (accounting_core). Aplícala antes del seed.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'exchange_rate'
  ) then
    raise exception 'Falta migración 08 (dual_currency_fiscal). Aplícala antes del seed.';
  end if;

  -- ---------------------------------------------------------------------------
  -- 1) Empresa del usuario (o crear demo)
  -- ---------------------------------------------------------------------------
  select cm.company_id into v_company
  from public.company_members cm
  where cm.user_id = v_user
  order by cm.created_at
  limit 1;

  if v_company is null then
    insert into public.companies (id, name, rif, address, phone, email, is_withholding_agent, is_special_taxpayer, created_by)
    values (
      'e5000000-0000-4000-8000-000000000001',
      'Cifra Demo Seed CA',
      'J500000001',
      'Caracas, VE',
      '0212-5550000',
      'demo@cifra.local',
      true,
      true,
      v_user
    )
    on conflict (rif) do update set name = excluded.name
    returning id into v_company;

    if v_company is null then
      select id into v_company from public.companies where rif = 'J500000001';
    end if;

    insert into public.company_members (company_id, user_id, role)
    values (v_company, v_user, 'owner')
    on conflict (company_id, user_id) do update set role = 'owner';
  end if;

  raise notice 'Seed company_id=%', v_company;

  -- Plan de cuentas / diarios
  perform public.seed_company_accounting(v_company);

  select id into v_cxc from public.account_accounts where company_id = v_company and code = '1.1.03';
  select id into v_banco from public.account_accounts where company_id = v_company and code = '1.1.02';
  select id into v_caja from public.account_accounts where company_id = v_company and code = '1.1.01';
  select id into v_iva_cr from public.account_accounts where company_id = v_company and code = '1.1.04';
  select id into v_cxp from public.account_accounts where company_id = v_company and code = '2.1.01';
  select id into v_iva_db from public.account_accounts where company_id = v_company and code = '2.1.02';
  select id into v_ing from public.account_accounts where company_id = v_company and code = '4.1.01';
  select id into v_gas from public.account_accounts where company_id = v_company and code = '5.1.01';

  select id into v_j_ven from public.account_journals where company_id = v_company and code = 'VEN';
  select id into v_j_com from public.account_journals where company_id = v_company and code = 'COM';
  select id into v_j_ban from public.account_journals where company_id = v_company and code = 'BAN';
  select id into v_j_caj from public.account_journals where company_id = v_company and code = 'CAJ';
  select id into v_j_misc from public.account_journals where company_id = v_company and code = 'MISC';

  -- ---------------------------------------------------------------------------
  -- 2) Limpieza de seed anterior
  -- ---------------------------------------------------------------------------
  delete from public.payment_allocations
  where company_id = v_company
    and payment_id in (
      select id from public.payments where company_id = v_company and coalesce(memo, '') = 'SEED_CIFRA_REPORTS'
    );

  delete from public.payments
  where company_id = v_company and coalesce(memo, '') = 'SEED_CIFRA_REPORTS';

  delete from public.account_move_lines
  where company_id = v_company
    and move_id in (
      select id from public.account_moves where company_id = v_company and coalesce(notes, '') = 'SEED_CIFRA_REPORTS'
    );

  delete from public.account_moves
  where company_id = v_company and coalesce(notes, '') = 'SEED_CIFRA_REPORTS';

  delete from public.invoice_lines
  where company_id = v_company
    and invoice_id in (
      select id from public.invoices where company_id = v_company and coalesce(notes, '') = 'SEED_CIFRA_REPORTS'
    );

  delete from public.invoices
  where company_id = v_company and coalesce(notes, '') = 'SEED_CIFRA_REPORTS';

  delete from public.partners
  where company_id = v_company and coalesce(notes, '') = 'SEED_CIFRA_REPORTS';

  delete from public.exchange_rates
  where company_id = v_company and source = 'seed';

  delete from public.audit_logs
  where company_id = v_company and action = 'seed' and entity = 'demo_reports';

  delete from public.withholding_iva_lines
  where company_id = v_company
    and withholding_id in (
      select id from public.withholding_iva
      where company_id = v_company and coalesce(notes, '') = 'SEED_CIFRA_REPORTS'
    );
  delete from public.withholding_iva
  where company_id = v_company and coalesce(notes, '') = 'SEED_CIFRA_REPORTS';

  delete from public.fiscal_book_lines
  where company_id = v_company
    and book_id in (
      select id from public.fiscal_books
      where company_id = v_company and coalesce(notes, '') = 'SEED_CIFRA_REPORTS'
    );
  delete from public.fiscal_books
  where company_id = v_company and coalesce(notes, '') = 'SEED_CIFRA_REPORTS';

  -- bank statements (migración 09; ignore if missing)
  begin
    delete from public.bank_statement_lines
    where company_id = v_company
      and statement_id in (
        select id from public.bank_statements
        where company_id = v_company and coalesce(notes, '') = 'SEED_CIFRA_REPORTS'
      );
    delete from public.bank_statements
    where company_id = v_company and coalesce(notes, '') = 'SEED_CIFRA_REPORTS';
  exception when undefined_table then
    null;
  end;

  -- ---------------------------------------------------------------------------
  -- 3) Tasa BCV demo
  -- ---------------------------------------------------------------------------
  insert into public.exchange_rates (company_id, rate_date, currency_code, rate, source, created_by)
  values (v_company, v_rate_date, 'USD', v_rate, 'seed', v_user)
  on conflict (company_id, rate_date, currency_code)
  do update set rate = excluded.rate, source = 'seed';

  -- ---------------------------------------------------------------------------
  -- 4) Terceros
  -- ---------------------------------------------------------------------------
  insert into public.partners (id, company_id, kind, person_type, rif, name, address, phone, email, is_withholding_agent, notes)
  values
    (v_cli1, v_company, 'customer', 'juridica', 'J301112223', 'Comercial Los Andes CA', 'Mérida', '0274-1112233', 'compras@andes.ve', true, 'SEED_CIFRA_REPORTS'),
    (v_cli2, v_company, 'customer', 'juridica', 'J304445556', 'Distribuidora Caribe SA', 'Valencia', '0241-4445556', 'cxc@caribe.ve', true, 'SEED_CIFRA_REPORTS'),
    (v_prov1, v_company, 'supplier', 'juridica', 'J307778889', 'Suministros del Centro CA', 'Maracay', '0243-7778889', 'ventas@centro.ve', true, 'SEED_CIFRA_REPORTS'),
    (v_prov2, v_company, 'supplier', 'natural', 'V123456789', 'Pedro Pérez Servicios', 'Caracas', '0414-1234567', 'pedro@mail.ve', false, 'SEED_CIFRA_REPORTS')
  on conflict (company_id, rif) do update
    set name = excluded.name, notes = 'SEED_CIFRA_REPORTS', kind = excluded.kind;

  -- Re-resolve IDs if conflict updated existing rows
  select id into v_cli1 from public.partners where company_id = v_company and rif = 'J301112223';
  select id into v_cli2 from public.partners where company_id = v_company and rif = 'J304445556';
  select id into v_prov1 from public.partners where company_id = v_company and rif = 'J307778889';
  select id into v_prov2 from public.partners where company_id = v_company and rif = 'V123456789';

  -- ---------------------------------------------------------------------------
  -- Helper local: insert invoice + lines + accounting move
  -- ---------------------------------------------------------------------------
  -- INV1 venta abierta (aging current)
  v_untaxed := 10000.00; v_tax := 1600.00; v_total := 11600.00; v_ret := 1200.00;
  v_residual := v_total - v_ret; -- 10400 neto cobrable tras retención
  v_usd := round(v_total / v_rate, 2);
  insert into public.invoices (
    id, company_id, partner_id, move_type, operation_type, doc_type, state,
    invoice_date, due_date, invoice_number, control_number,
    currency_code, exchange_rate,
    amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva,
    amount_untaxed_usd, amount_tax_usd, amount_total_usd, amount_residual_usd,
    amount_residual, amount_paid, payment_state, notes, created_by, sin_cred
  ) values (
    v_inv1, v_company, v_cli1, 'out_invoice', 'V', '01', 'confirmed',
    current_date - 5, current_date + 25, 'FV-SEED-001', '00-00000001',
    'VES', v_rate,
    v_untaxed, v_tax, 0, v_total, v_ret,
    round(v_untaxed/v_rate,2), round(v_tax/v_rate,2), v_usd, round(v_residual/v_rate,2),
    v_residual, 0, 'not_paid', 'SEED_CIFRA_REPORTS', v_user, false
  );

  insert into public.invoice_lines (invoice_id, company_id, description, quantity, price_unit, tax_rate, amount_untaxed, amount_tax, amount_total)
  values (v_inv1, v_company, 'Servicio de consultoría', 1, v_untaxed, 16, v_untaxed, v_tax, v_total);

  insert into public.account_moves (company_id, journal_id, name, ref, move_date, state, partner_id, invoice_id, notes, created_by)
  values (v_company, v_j_ven, 'VEN/FV-SEED-001', '00-00000001', current_date - 5, 'confirmed', v_cli1, v_inv1, 'SEED_CIFRA_REPORTS', v_user)
  returning id into v_mov;

  update public.invoices set account_move_id = v_mov where id = v_inv1;

  insert into public.account_move_lines (move_id, company_id, account_id, partner_id, name, debit, credit, amount_residual, invoice_id) values
    (v_mov, v_company, v_cxc, v_cli1, 'Cliente FV-SEED-001', v_total, 0, v_residual, v_inv1),
    (v_mov, v_company, v_ing, v_cli1, 'Ventas', 0, v_untaxed, 0, v_inv1),
    (v_mov, v_company, v_iva_db, v_cli1, 'IVA débito', 0, v_tax, 0, v_inv1);

  -- INV2 venta parcial (aging 1-30)
  v_untaxed := 5000.00; v_tax := 800.00; v_total := 5800.00; v_ret := 0;
  v_residual := 2800.00; -- pagó 3000
  insert into public.invoices (
    id, company_id, partner_id, move_type, operation_type, doc_type, state,
    invoice_date, due_date, invoice_number, control_number,
    currency_code, exchange_rate,
    amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva,
    amount_untaxed_usd, amount_tax_usd, amount_total_usd, amount_residual_usd,
    amount_residual, amount_paid, payment_state, notes, created_by, sin_cred
  ) values (
    v_inv2, v_company, v_cli2, 'out_invoice', 'V', '01', 'confirmed',
    current_date - 40, current_date - 10, 'FV-SEED-002', '00-00000002',
    'VES', v_rate,
    v_untaxed, v_tax, 0, v_total, v_ret,
    round(v_untaxed/v_rate,2), round(v_tax/v_rate,2), round(v_total/v_rate,2), round(v_residual/v_rate,2),
    v_residual, 3000.00, 'partial', 'SEED_CIFRA_REPORTS', v_user, false
  );
  insert into public.invoice_lines (invoice_id, company_id, description, quantity, price_unit, tax_rate, amount_untaxed, amount_tax, amount_total)
  values (v_inv2, v_company, 'Venta mercadería', 10, 500, 16, v_untaxed, v_tax, v_total);

  insert into public.account_moves (company_id, journal_id, name, ref, move_date, state, partner_id, invoice_id, notes, created_by)
  values (v_company, v_j_ven, 'VEN/FV-SEED-002', '00-00000002', current_date - 40, 'confirmed', v_cli2, v_inv2, 'SEED_CIFRA_REPORTS', v_user)
  returning id into v_mov;
  update public.invoices set account_move_id = v_mov where id = v_inv2;
  insert into public.account_move_lines (move_id, company_id, account_id, partner_id, name, debit, credit, amount_residual, invoice_id) values
    (v_mov, v_company, v_cxc, v_cli2, 'Cliente FV-SEED-002', v_total, 0, v_residual, v_inv2),
    (v_mov, v_company, v_ing, v_cli2, 'Ventas', 0, v_untaxed, 0, v_inv2),
    (v_mov, v_company, v_iva_db, v_cli2, 'IVA débito', 0, v_tax, 0, v_inv2);

  -- INV3 venta vencida 90+
  v_untaxed := 2000.00; v_tax := 320.00; v_total := 2320.00;
  v_residual := v_total;
  insert into public.invoices (
    id, company_id, partner_id, move_type, operation_type, doc_type, state,
    invoice_date, due_date, invoice_number, control_number,
    currency_code, exchange_rate,
    amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva,
    amount_untaxed_usd, amount_tax_usd, amount_total_usd, amount_residual_usd,
    amount_residual, amount_paid, payment_state, notes, created_by, sin_cred
  ) values (
    v_inv3, v_company, v_cli1, 'out_invoice', 'V', '01', 'confirmed',
    current_date - 120, current_date - 100, 'FV-SEED-003', '00-00000003',
    'VES', v_rate,
    v_untaxed, v_tax, 0, v_total, 0,
    round(v_untaxed/v_rate,2), round(v_tax/v_rate,2), round(v_total/v_rate,2), round(v_residual/v_rate,2),
    v_residual, 0, 'not_paid', 'SEED_CIFRA_REPORTS', v_user, false
  );
  insert into public.invoice_lines (invoice_id, company_id, description, quantity, price_unit, tax_rate, amount_untaxed, amount_tax, amount_total)
  values (v_inv3, v_company, 'Soporte mensual atrasado', 1, v_untaxed, 16, v_untaxed, v_tax, v_total);
  insert into public.account_moves (company_id, journal_id, name, ref, move_date, state, partner_id, invoice_id, notes, created_by)
  values (v_company, v_j_ven, 'VEN/FV-SEED-003', '00-00000003', current_date - 120, 'confirmed', v_cli1, v_inv3, 'SEED_CIFRA_REPORTS', v_user)
  returning id into v_mov;
  update public.invoices set account_move_id = v_mov where id = v_inv3;
  insert into public.account_move_lines (move_id, company_id, account_id, partner_id, name, debit, credit, amount_residual, invoice_id) values
    (v_mov, v_company, v_cxc, v_cli1, 'Cliente FV-SEED-003', v_total, 0, v_residual, v_inv3),
    (v_mov, v_company, v_ing, v_cli1, 'Ventas', 0, v_untaxed, 0, v_inv3),
    (v_mov, v_company, v_iva_db, v_cli1, 'IVA débito', 0, v_tax, 0, v_inv3);

  -- INV4 compra abierta
  v_untaxed := 8000.00; v_tax := 1280.00; v_total := 9280.00; v_ret := 960.00;
  v_residual := v_total - v_ret;
  insert into public.invoices (
    id, company_id, partner_id, move_type, operation_type, doc_type, state,
    invoice_date, due_date, invoice_number, control_number,
    currency_code, exchange_rate,
    amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva,
    amount_untaxed_usd, amount_tax_usd, amount_total_usd, amount_residual_usd,
    amount_residual, amount_paid, payment_state, notes, created_by, sin_cred
  ) values (
    v_inv4, v_company, v_prov1, 'in_invoice', 'C', '01', 'confirmed',
    current_date - 12, current_date + 18, 'FC-SEED-001', '00-11110001',
    'VES', v_rate,
    v_untaxed, v_tax, 0, v_total, v_ret,
    round(v_untaxed/v_rate,2), round(v_tax/v_rate,2), round(v_total/v_rate,2), round(v_residual/v_rate,2),
    v_residual, 0, 'not_paid', 'SEED_CIFRA_REPORTS', v_user, false
  );
  insert into public.invoice_lines (invoice_id, company_id, description, quantity, price_unit, tax_rate, amount_untaxed, amount_tax, amount_total)
  values (v_inv4, v_company, 'Compra insumos', 1, v_untaxed, 16, v_untaxed, v_tax, v_total);
  insert into public.account_moves (company_id, journal_id, name, ref, move_date, state, partner_id, invoice_id, notes, created_by)
  values (v_company, v_j_com, 'COM/FC-SEED-001', '00-11110001', current_date - 12, 'confirmed', v_prov1, v_inv4, 'SEED_CIFRA_REPORTS', v_user)
  returning id into v_mov;
  update public.invoices set account_move_id = v_mov where id = v_inv4;
  insert into public.account_move_lines (move_id, company_id, account_id, partner_id, name, debit, credit, amount_residual, invoice_id) values
    (v_mov, v_company, v_gas, v_prov1, 'Gasto / compra', v_untaxed, 0, 0, v_inv4),
    (v_mov, v_company, v_iva_cr, v_prov1, 'IVA crédito', v_tax, 0, 0, v_inv4),
    (v_mov, v_company, v_cxp, v_prov1, 'Proveedor FC-SEED-001', 0, v_total, v_residual, v_inv4);

  -- INV5 compra parcial
  v_untaxed := 3000.00; v_tax := 480.00; v_total := 3480.00;
  v_residual := 1480.00;
  insert into public.invoices (
    id, company_id, partner_id, move_type, operation_type, doc_type, state,
    invoice_date, due_date, invoice_number, control_number,
    currency_code, exchange_rate,
    amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva,
    amount_untaxed_usd, amount_tax_usd, amount_total_usd, amount_residual_usd,
    amount_residual, amount_paid, payment_state, notes, created_by, sin_cred
  ) values (
    v_inv5, v_company, v_prov2, 'in_invoice', 'C', '01', 'confirmed',
    current_date - 50, current_date - 20, 'FC-SEED-002', '00-11110002',
    'VES', v_rate,
    v_untaxed, v_tax, 0, v_total, 0,
    round(v_untaxed/v_rate,2), round(v_tax/v_rate,2), round(v_total/v_rate,2), round(v_residual/v_rate,2),
    v_residual, 2000.00, 'partial', 'SEED_CIFRA_REPORTS', v_user, false
  );
  insert into public.invoice_lines (invoice_id, company_id, description, quantity, price_unit, tax_rate, amount_untaxed, amount_tax, amount_total)
  values (v_inv5, v_company, 'Honorarios', 1, v_untaxed, 16, v_untaxed, v_tax, v_total);
  insert into public.account_moves (company_id, journal_id, name, ref, move_date, state, partner_id, invoice_id, notes, created_by)
  values (v_company, v_j_com, 'COM/FC-SEED-002', '00-11110002', current_date - 50, 'confirmed', v_prov2, v_inv5, 'SEED_CIFRA_REPORTS', v_user)
  returning id into v_mov;
  update public.invoices set account_move_id = v_mov where id = v_inv5;
  insert into public.account_move_lines (move_id, company_id, account_id, partner_id, name, debit, credit, amount_residual, invoice_id) values
    (v_mov, v_company, v_gas, v_prov2, 'Honorarios', v_untaxed, 0, 0, v_inv5),
    (v_mov, v_company, v_iva_cr, v_prov2, 'IVA crédito', v_tax, 0, 0, v_inv5),
    (v_mov, v_company, v_cxp, v_prov2, 'Proveedor FC-SEED-002', 0, v_total, v_residual, v_inv5);

  -- INV6 venta pagada (para estado de cuenta con abono)
  v_untaxed := 1500.00; v_tax := 240.00; v_total := 1740.00;
  insert into public.invoices (
    id, company_id, partner_id, move_type, operation_type, doc_type, state,
    invoice_date, due_date, invoice_number, control_number,
    currency_code, exchange_rate,
    amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained_iva,
    amount_untaxed_usd, amount_tax_usd, amount_total_usd, amount_residual_usd,
    amount_residual, amount_paid, payment_state, notes, created_by, sin_cred
  ) values (
    v_inv6, v_company, v_cli2, 'out_invoice', 'V', '01', 'confirmed',
    current_date - 20, current_date - 5, 'FV-SEED-004', '00-00000004',
    'VES', v_rate,
    v_untaxed, v_tax, 0, v_total, 0,
    round(v_untaxed/v_rate,2), round(v_tax/v_rate,2), round(v_total/v_rate,2), 0,
    0, v_total, 'paid', 'SEED_CIFRA_REPORTS', v_user, false
  );
  insert into public.invoice_lines (invoice_id, company_id, description, quantity, price_unit, tax_rate, amount_untaxed, amount_tax, amount_total)
  values (v_inv6, v_company, 'Licencia software', 1, v_untaxed, 16, v_untaxed, v_tax, v_total);
  insert into public.account_moves (company_id, journal_id, name, ref, move_date, state, partner_id, invoice_id, notes, created_by)
  values (v_company, v_j_ven, 'VEN/FV-SEED-004', '00-00000004', current_date - 20, 'confirmed', v_cli2, v_inv6, 'SEED_CIFRA_REPORTS', v_user)
  returning id into v_mov;
  update public.invoices set account_move_id = v_mov where id = v_inv6;
  insert into public.account_move_lines (move_id, company_id, account_id, partner_id, name, debit, credit, amount_residual, invoice_id) values
    (v_mov, v_company, v_cxc, v_cli2, 'Cliente FV-SEED-004', v_total, 0, 0, v_inv6),
    (v_mov, v_company, v_ing, v_cli2, 'Ventas', 0, v_untaxed, 0, v_inv6),
    (v_mov, v_company, v_iva_db, v_cli2, 'IVA débito', 0, v_tax, 0, v_inv6);

  -- ---------------------------------------------------------------------------
  -- 5) Pagos + asientos de tesorería
  -- ---------------------------------------------------------------------------
  insert into public.payments (
    id, company_id, partner_id, journal_id, payment_type, payment_date,
    amount, currency_code, exchange_rate, amount_usd, memo, reference, state, created_by
  ) values (
    v_pay1, v_company, v_cli2, v_j_ban, 'inbound', current_date - 15,
    3000.00, 'VES', v_rate, round(3000/v_rate,2), 'SEED_CIFRA_REPORTS', 'TRF-IN-001', 'confirmed', v_user
  );

  insert into public.payment_allocations (payment_id, company_id, invoice_id, amount)
  values (v_pay1, v_company, v_inv2, 3000.00);

  insert into public.account_moves (company_id, journal_id, name, ref, move_date, state, partner_id, payment_id, notes, created_by)
  values (v_company, v_j_ban, 'PAY/SEED-IN-001', 'TRF-IN-001', current_date - 15, 'confirmed', v_cli2, v_pay1, 'SEED_CIFRA_REPORTS', v_user)
  returning id into v_mov;
  update public.payments set move_id = v_mov where id = v_pay1;
  insert into public.account_move_lines (move_id, company_id, account_id, partner_id, name, debit, credit, amount_residual) values
    (v_mov, v_company, v_banco, v_cli2, 'Cobro banco', 3000.00, 0, 0),
    (v_mov, v_company, v_cxc, v_cli2, 'Aplicación CxC', 0, 3000.00, 0);

  insert into public.payments (
    id, company_id, partner_id, journal_id, payment_type, payment_date,
    amount, currency_code, exchange_rate, amount_usd, memo, reference, state, created_by
  ) values (
    v_pay2, v_company, v_cli2, v_j_caj, 'inbound', current_date - 8,
    1740.00, 'VES', v_rate, round(1740/v_rate,2), 'SEED_CIFRA_REPORTS', 'CASH-IN-004', 'confirmed', v_user
  );
  insert into public.payment_allocations (payment_id, company_id, invoice_id, amount)
  values (v_pay2, v_company, v_inv6, 1740.00);

  insert into public.account_moves (company_id, journal_id, name, ref, move_date, state, partner_id, payment_id, notes, created_by)
  values (v_company, v_j_caj, 'PAY/SEED-IN-002', 'CASH-IN-004', current_date - 8, 'confirmed', v_cli2, v_pay2, 'SEED_CIFRA_REPORTS', v_user)
  returning id into v_mov;
  update public.payments set move_id = v_mov where id = v_pay2;
  insert into public.account_move_lines (move_id, company_id, account_id, partner_id, name, debit, credit, amount_residual) values
    (v_mov, v_company, v_caja, v_cli2, 'Cobro caja', 1740.00, 0, 0),
    (v_mov, v_company, v_cxc, v_cli2, 'Aplicación CxC', 0, 1740.00, 0);

  -- Pago parcial a proveedor (CxP / aging)
  insert into public.payments (
    id, company_id, partner_id, journal_id, payment_type, payment_date,
    amount, currency_code, exchange_rate, amount_usd, memo, reference, state, created_by
  ) values (
    v_pay3, v_company, v_prov2, v_j_ban, 'outbound', current_date - 18,
    2000.00, 'VES', v_rate, round(2000/v_rate,2), 'SEED_CIFRA_REPORTS', 'TRF-OUT-002', 'confirmed', v_user
  );
  insert into public.payment_allocations (payment_id, company_id, invoice_id, amount)
  values (v_pay3, v_company, v_inv5, 2000.00);

  insert into public.account_moves (company_id, journal_id, name, ref, move_date, state, partner_id, payment_id, notes, created_by)
  values (v_company, v_j_ban, 'PAY/SEED-OUT-001', 'TRF-OUT-002', current_date - 18, 'confirmed', v_prov2, v_pay3, 'SEED_CIFRA_REPORTS', v_user)
  returning id into v_mov;
  update public.payments set move_id = v_mov where id = v_pay3;
  insert into public.account_move_lines (move_id, company_id, account_id, partner_id, name, debit, credit, amount_residual) values
    (v_mov, v_company, v_cxp, v_prov2, 'Aplicación CxP', 2000.00, 0, 0),
    (v_mov, v_company, v_banco, v_prov2, 'Pago banco', 0, 2000.00, 0);

  -- Asiento manual de ajuste (MISC) para mayor
  insert into public.account_moves (company_id, journal_id, name, ref, move_date, state, notes, created_by)
  values (v_company, v_j_misc, 'ASI/SEED-AJUSTE-1', 'Apertura capital seed', current_date - 60, 'confirmed', 'SEED_CIFRA_REPORTS', v_user)
  returning id into v_mov;
  insert into public.account_move_lines (move_id, company_id, account_id, name, debit, credit, amount_residual)
  select v_mov, v_company, id, 'Caja apertura', 50000, 0, 0 from public.account_accounts where company_id = v_company and code = '1.1.01';
  insert into public.account_move_lines (move_id, company_id, account_id, name, debit, credit, amount_residual)
  select v_mov, v_company, id, 'Capital', 0, 50000, 0 from public.account_accounts where company_id = v_company and code = '3.1.01';

  -- ---------------------------------------------------------------------------
  -- 6) Retenciones IVA (Cumplir)
  -- ---------------------------------------------------------------------------
  insert into public.withholding_iva (
    id, company_id, partner_id, voucher_number, period, voucher_date, state,
    amount_untaxed, amount_tax, amount_withheld, notes, created_by
  ) values (
    v_wh_iva, v_company, v_cli1, 'SEED-RET-IVA-001', v_period, current_date - 4, 'confirmed',
    10000.00, 1600.00, 1200.00, 'SEED_CIFRA_REPORTS', v_user
  );
  insert into public.withholding_iva_lines (
    withholding_id, company_id, invoice_id, operation_type, doc_type,
    invoice_number, control_number, invoice_date,
    amount_total, amount_untaxed, amount_withheld, amount_exempt, alicuota
  ) values (
    v_wh_iva, v_company, v_inv1, 'V', '01',
    'FV-SEED-001', '00-00000001', current_date - 5,
    11600.00, 10000.00, 1200.00, 0, 16
  );

  insert into public.withholding_iva (
    id, company_id, partner_id, voucher_number, period, voucher_date, state,
    amount_untaxed, amount_tax, amount_withheld, notes, created_by
  ) values (
    v_wh_iva2, v_company, v_prov1, 'SEED-RET-IVA-002', v_period, current_date - 10, 'confirmed',
    8000.00, 1280.00, 960.00, 'SEED_CIFRA_REPORTS', v_user
  );
  insert into public.withholding_iva_lines (
    withholding_id, company_id, invoice_id, operation_type, doc_type,
    invoice_number, control_number, invoice_date,
    amount_total, amount_untaxed, amount_withheld, amount_exempt, alicuota
  ) values (
    v_wh_iva2, v_company, v_inv4, 'C', '01',
    'FC-SEED-001', '00-11110001', current_date - 12,
    9280.00, 8000.00, 960.00, 0, 16
  );

  -- ---------------------------------------------------------------------------
  -- 7) Libros fiscales pregenerados (ventas + compras — últimos ~4 meses)
  -- ---------------------------------------------------------------------------
  insert into public.fiscal_books (
    id, company_id, name, book_type, period_start, period_end, state, notes, created_by
  ) values (
    v_book_sale, v_company,
    'SEED — Libro de Ventas',
    'sale', (current_date - 130), current_date,
    'done', 'SEED_CIFRA_REPORTS', v_user
  );

  insert into public.fiscal_book_lines (
    book_id, company_id, invoice_id, rank, emission_date, partner_rif, partner_name,
    invoice_number, control_number, doc_type,
    amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained
  )
  select
    v_book_sale, v_company, i.id,
    row_number() over (order by i.invoice_date, i.invoice_number),
    i.invoice_date, p.rif, p.name,
    i.invoice_number, i.control_number, i.doc_type,
    i.amount_untaxed, i.amount_tax, i.amount_exempt, i.amount_total, i.amount_retained_iva
  from public.invoices i
  join public.partners p on p.id = i.partner_id
  where i.company_id = v_company
    and i.notes = 'SEED_CIFRA_REPORTS'
    and i.move_type in ('out_invoice', 'out_refund')
    and coalesce(i.sin_cred, false) = false;

  insert into public.fiscal_books (
    id, company_id, name, book_type, period_start, period_end, state, notes, created_by
  ) values (
    v_book_pur, v_company,
    'SEED — Libro de Compras',
    'purchase', (current_date - 130), current_date,
    'done', 'SEED_CIFRA_REPORTS', v_user
  );

  insert into public.fiscal_book_lines (
    book_id, company_id, invoice_id, rank, emission_date, partner_rif, partner_name,
    invoice_number, control_number, doc_type,
    amount_untaxed, amount_tax, amount_exempt, amount_total, amount_retained
  )
  select
    v_book_pur, v_company, i.id,
    row_number() over (order by i.invoice_date, i.invoice_number),
    i.invoice_date, p.rif, p.name,
    i.invoice_number, i.control_number, i.doc_type,
    i.amount_untaxed, i.amount_tax, i.amount_exempt, i.amount_total, i.amount_retained_iva
  from public.invoices i
  join public.partners p on p.id = i.partner_id
  where i.company_id = v_company
    and i.notes = 'SEED_CIFRA_REPORTS'
    and i.move_type in ('in_invoice', 'in_refund')
    and coalesce(i.sin_cred, false) = false;

  -- ---------------------------------------------------------------------------
  -- 8) Extracto banco (si existe migración 09)
  -- ---------------------------------------------------------------------------
  begin
    insert into public.bank_statements (
      id, company_id, journal_id, name, statement_date,
      balance_start, balance_end, currency_code, exchange_rate, state, notes, created_by
    ) values (
      v_stmt, v_company, v_j_ban, 'Extracto seed ' || to_char(current_date, 'YYYY-MM'),
      current_date, 0, 1000, 'VES', v_rate, 'open', 'SEED_CIFRA_REPORTS', v_user
    );
    insert into public.bank_statement_lines (
      statement_id, company_id, line_date, payment_ref, partner_name, amount, is_reconciled
    ) values
      (v_stmt, v_company, current_date - 15, 'TRF-IN-001', 'Distribuidora Caribe SA', 3000.00, false),
      (v_stmt, v_company, current_date - 18, 'TRF-OUT-002', 'Pedro Pérez Servicios', -2000.00, false),
      (v_stmt, v_company, current_date - 3, 'COMISION', 'Banco', -25.00, false);
  exception when undefined_table or undefined_column then
    raise notice 'bank_statements no disponible (aplica migración 09)';
  end;

  -- ---------------------------------------------------------------------------
  -- 9) Auditoría
  -- ---------------------------------------------------------------------------
  insert into public.audit_logs (company_id, user_id, action, entity, entity_id, payload)
  values (
    v_company, v_user, 'seed', 'demo_reports', v_company,
    jsonb_build_object(
      'invoices', 6,
      'partners', 4,
      'payments', 3,
      'withholdings_iva', 2,
      'fiscal_books', 2,
      'rate', v_rate,
      'message', 'Seed reportes Cifra'
    )
  );

  raise notice 'OK seed reportes para user % company %', v_user, v_company;
end $$;

-- Resumen rápido
select 'partners' as kind, count(*)::text as n
from public.partners where notes = 'SEED_CIFRA_REPORTS'
union all
select 'invoices', count(*)::text from public.invoices where notes = 'SEED_CIFRA_REPORTS'
union all
select 'payments', count(*)::text from public.payments where memo = 'SEED_CIFRA_REPORTS'
union all
select 'moves', count(*)::text from public.account_moves where notes = 'SEED_CIFRA_REPORTS'
union all
select 'wh_iva', count(*)::text from public.withholding_iva where notes = 'SEED_CIFRA_REPORTS'
union all
select 'fiscal_books', count(*)::text from public.fiscal_books where notes = 'SEED_CIFRA_REPORTS'
union all
select 'open_ar', coalesce(sum(amount_residual),0)::text
from public.invoices
where notes = 'SEED_CIFRA_REPORTS' and move_type in ('out_invoice','out_refund') and amount_residual > 0
union all
select 'open_ap', coalesce(sum(amount_residual),0)::text
from public.invoices
where notes = 'SEED_CIFRA_REPORTS' and move_type in ('in_invoice','in_refund') and amount_residual > 0;
