-- Sifra accounting core (Odoo-inspired): chart, journals, moves, payments, residuals

-- Payment / residual enums
do $$ begin
  create type public.payment_state as enum (
    'not_paid', 'in_payment', 'partial', 'paid', 'reversed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.account_type as enum (
    'asset_receivable', 'asset_cash', 'asset_current',
    'liability_payable', 'liability_current',
    'equity', 'income', 'expense', 'off_balance'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.journal_type as enum (
    'sale', 'purchase', 'cash', 'bank', 'general'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_type as enum ('inbound', 'outbound');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Chart of accounts
-- ---------------------------------------------------------------------------
create table if not exists public.account_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  code text not null,
  name text not null,
  account_type public.account_type not null,
  reconcile boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

create index if not exists idx_accounts_company on public.account_accounts (company_id);

create table if not exists public.account_journals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null,
  name text not null,
  journal_type public.journal_type not null,
  default_account_id uuid references public.account_accounts (id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

-- ---------------------------------------------------------------------------
-- Journal entries (account.move)
-- ---------------------------------------------------------------------------
create table if not exists public.account_moves (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  journal_id uuid references public.account_journals (id),
  name text not null,
  ref text,
  move_date date not null default current_date,
  state public.doc_state not null default 'draft',
  partner_id uuid references public.partners (id),
  invoice_id uuid references public.invoices (id) on delete set null,
  payment_id uuid, -- filled after payments table exists
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_moves_company_date on public.account_moves (company_id, move_date);

drop trigger if exists trg_account_moves_updated_at on public.account_moves;
create trigger trg_account_moves_updated_at
before update on public.account_moves
for each row execute function public.set_updated_at();

create table if not exists public.account_move_lines (
  id uuid primary key default gen_random_uuid(),
  move_id uuid not null references public.account_moves (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  account_id uuid not null references public.account_accounts (id),
  partner_id uuid references public.partners (id),
  name text,
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  amount_residual numeric(18,2) not null default 0,
  invoice_id uuid references public.invoices (id) on delete set null,
  created_at timestamptz not null default now(),
  check (debit >= 0 and credit >= 0),
  check (not (debit > 0 and credit > 0))
);

create index if not exists idx_move_lines_account on public.account_move_lines (account_id);
create index if not exists idx_move_lines_partner on public.account_move_lines (partner_id);

-- ---------------------------------------------------------------------------
-- Payments (account.payment) + allocations
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  partner_id uuid not null references public.partners (id),
  journal_id uuid references public.account_journals (id),
  payment_type public.payment_type not null,
  payment_date date not null default current_date,
  amount numeric(18,2) not null check (amount > 0),
  currency_code text not null default 'VES',
  memo text,
  reference text,
  state public.doc_state not null default 'posted',
  move_id uuid references public.account_moves (id) on delete set null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_company on public.payments (company_id, payment_date);
create index if not exists idx_payments_partner on public.payments (partner_id);

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

-- link account_moves.payment_id now that payments exists
alter table public.account_moves
  drop constraint if exists account_moves_payment_id_fkey;
alter table public.account_moves
  add constraint account_moves_payment_id_fkey
  foreign key (payment_id) references public.payments (id) on delete set null;

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id),
  amount numeric(18,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_alloc_invoice on public.payment_allocations (invoice_id);

-- ---------------------------------------------------------------------------
-- Invoice residual / payment fields (Odoo payment_state / amount_residual)
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists due_date date,
  add column if not exists amount_residual numeric(18,2),
  add column if not exists amount_paid numeric(18,2) not null default 0,
  add column if not exists payment_state public.payment_state not null default 'not_paid',
  add column if not exists account_move_id uuid references public.account_moves (id) on delete set null;

update public.invoices
set amount_residual = coalesce(amount_residual, amount_total - coalesce(amount_paid, 0))
where amount_residual is null;

alter table public.invoices
  alter column amount_residual set default 0;

-- ---------------------------------------------------------------------------
-- Company accounting defaults
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists property_account_receivable_id uuid references public.account_accounts (id),
  add column if not exists property_account_payable_id uuid references public.account_accounts (id),
  add column if not exists property_account_income_id uuid references public.account_accounts (id),
  add column if not exists property_account_expense_id uuid references public.account_accounts (id),
  add column if not exists property_account_tax_sale_id uuid references public.account_accounts (id),
  add column if not exists property_account_tax_purchase_id uuid references public.account_accounts (id);

-- ---------------------------------------------------------------------------
-- Seed helper: create default VE chart + journals for a company
-- ---------------------------------------------------------------------------
create or replace function public.seed_company_accounting(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caja uuid; v_banco uuid; v_cxc uuid; v_iva_cr uuid;
  v_cxp uuid; v_iva_db uuid; v_ret_iva uuid; v_ret_islr uuid;
  v_cap uuid; v_ing uuid; v_gas uuid;
begin
  if exists (select 1 from public.account_accounts where company_id = p_company_id) then
    return;
  end if;

  insert into public.account_accounts (company_id, code, name, account_type, reconcile) values
    (p_company_id, '1.1.01', 'Caja', 'asset_cash', false) returning id into v_caja;
  insert into public.account_accounts (company_id, code, name, account_type, reconcile) values
    (p_company_id, '1.1.02', 'Bancos', 'asset_cash', false) returning id into v_banco;
  insert into public.account_accounts (company_id, code, name, account_type, reconcile) values
    (p_company_id, '1.1.03', 'Cuentas por cobrar clientes', 'asset_receivable', true) returning id into v_cxc;
  insert into public.account_accounts (company_id, code, name, account_type, reconcile) values
    (p_company_id, '1.1.04', 'IVA crédito fiscal', 'asset_current', false) returning id into v_iva_cr;
  insert into public.account_accounts (company_id, code, name, account_type, reconcile) values
    (p_company_id, '2.1.01', 'Cuentas por pagar proveedores', 'liability_payable', true) returning id into v_cxp;
  insert into public.account_accounts (company_id, code, name, account_type, reconcile) values
    (p_company_id, '2.1.02', 'IVA débito fiscal', 'liability_current', false) returning id into v_iva_db;
  insert into public.account_accounts (company_id, code, name, account_type, reconcile) values
    (p_company_id, '2.1.03', 'Retenciones IVA por pagar', 'liability_current', false) returning id into v_ret_iva;
  insert into public.account_accounts (company_id, code, name, account_type, reconcile) values
    (p_company_id, '2.1.04', 'Retenciones ISLR por pagar', 'liability_current', false) returning id into v_ret_islr;
  insert into public.account_accounts (company_id, code, name, account_type, reconcile) values
    (p_company_id, '3.1.01', 'Capital', 'equity', false) returning id into v_cap;
  insert into public.account_accounts (company_id, code, name, account_type, reconcile) values
    (p_company_id, '4.1.01', 'Ingresos por ventas', 'income', false) returning id into v_ing;
  insert into public.account_accounts (company_id, code, name, account_type, reconcile) values
    (p_company_id, '5.1.01', 'Compras / gastos', 'expense', false) returning id into v_gas;

  insert into public.account_journals (company_id, code, name, journal_type, default_account_id) values
    (p_company_id, 'VEN', 'Ventas', 'sale', v_ing),
    (p_company_id, 'COM', 'Compras', 'purchase', v_gas),
    (p_company_id, 'BAN', 'Banco', 'bank', v_banco),
    (p_company_id, 'CAJ', 'Caja', 'cash', v_caja),
    (p_company_id, 'MISC', 'Misceláneo', 'general', null);

  update public.companies set
    property_account_receivable_id = v_cxc,
    property_account_payable_id = v_cxp,
    property_account_income_id = v_ing,
    property_account_expense_id = v_gas,
    property_account_tax_sale_id = v_iva_db,
    property_account_tax_purchase_id = v_iva_cr
  where id = p_company_id;
end;
$$;

-- Auto-seed on company create
create or replace function public.handle_new_company_accounting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_company_accounting(new.id);
  return new;
end;
$$;

drop trigger if exists on_company_accounting_seed on public.companies;
create trigger on_company_accounting_seed
after insert on public.companies
for each row execute function public.handle_new_company_accounting();

-- Seed existing companies
do $$
declare r record;
begin
  for r in select id from public.companies loop
    perform public.seed_company_accounting(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.account_accounts enable row level security;
alter table public.account_journals enable row level security;
alter table public.account_moves enable row level security;
alter table public.account_move_lines enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;

drop policy if exists "accounts_select" on public.account_accounts;
create policy "accounts_select" on public.account_accounts for select to authenticated
using (company_id is null or public.is_company_member(company_id));
drop policy if exists "accounts_write" on public.account_accounts;
create policy "accounts_write" on public.account_accounts for all to authenticated
using (company_id is not null and public.can_admin_company(company_id))
with check (company_id is not null and public.can_admin_company(company_id));

drop policy if exists "journals_select" on public.account_journals;
create policy "journals_select" on public.account_journals for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "journals_write" on public.account_journals;
create policy "journals_write" on public.account_journals for all to authenticated
using (public.can_admin_company(company_id))
with check (public.can_admin_company(company_id));

drop policy if exists "moves_select" on public.account_moves;
create policy "moves_select" on public.account_moves for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "moves_write" on public.account_moves;
create policy "moves_write" on public.account_moves for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

drop policy if exists "move_lines_select" on public.account_move_lines;
create policy "move_lines_select" on public.account_move_lines for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "move_lines_write" on public.account_move_lines;
create policy "move_lines_write" on public.account_move_lines for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "payments_write" on public.payments;
create policy "payments_write" on public.payments for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

drop policy if exists "payment_alloc_select" on public.payment_allocations;
create policy "payment_alloc_select" on public.payment_allocations for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "payment_alloc_write" on public.payment_allocations;
create policy "payment_alloc_write" on public.payment_allocations for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));
