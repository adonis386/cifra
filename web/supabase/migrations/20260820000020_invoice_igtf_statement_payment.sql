-- IGTF en factura + extractos caja/banco + cierre de período.
-- Idempotente: en producción faltaban bank_statements / bank_statement_lines / accounting_periods.

-- ---------------------------------------------------------------------------
-- IGTF (impuesto al lado del documento, no suma al total)
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists igtf_rate numeric(7,4) not null default 0,
  add column if not exists amount_igtf numeric(18,2) not null default 0;

-- ---------------------------------------------------------------------------
-- Metadatos de conciliación en líneas de asiento
-- ---------------------------------------------------------------------------
alter table public.account_move_lines
  add column if not exists reconciled boolean not null default false,
  add column if not exists full_reconcile_id uuid,
  add column if not exists amount_currency numeric(18,2),
  add column if not exists currency_code text;

create index if not exists idx_move_lines_unreconciled
  on public.account_move_lines (company_id, account_id)
  where reconciled = false;

-- ---------------------------------------------------------------------------
-- Extractos caja/banco
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.statement_state as enum ('open', 'confirming', 'done');
exception when duplicate_object then null;
end $$;

create table if not exists public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  journal_id uuid not null references public.account_journals (id) on delete cascade,
  name text not null,
  statement_date date not null default current_date,
  balance_start numeric(18,2) not null default 0,
  balance_end numeric(18,2) not null default 0,
  currency_code text not null default 'VES',
  exchange_rate numeric(18,6),
  state public.statement_state not null default 'open',
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bank_statements_company
  on public.bank_statements (company_id, statement_date desc);

drop trigger if exists trg_bank_statements_updated_at on public.bank_statements;
create trigger trg_bank_statements_updated_at
before update on public.bank_statements
for each row execute function public.set_updated_at();

create table if not exists public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.bank_statements (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  line_date date not null,
  payment_ref text,
  partner_name text,
  partner_id uuid references public.partners (id) on delete set null,
  amount numeric(18,2) not null,
  amount_usd numeric(18,2),
  move_line_id uuid references public.account_move_lines (id) on delete set null,
  payment_id uuid references public.payments (id) on delete set null,
  is_reconciled boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_bank_statement_lines_statement
  on public.bank_statement_lines (statement_id);

alter table public.bank_statement_lines
  add column if not exists payment_id uuid references public.payments (id) on delete set null;

create index if not exists idx_bank_statement_lines_payment
  on public.bank_statement_lines (payment_id)
  where payment_id is not null;

-- ---------------------------------------------------------------------------
-- Cierre de período
-- ---------------------------------------------------------------------------
create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  date_start date not null,
  date_end date not null,
  is_closed boolean not null default false,
  closed_at timestamptz,
  closed_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, date_start, date_end)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.bank_statements enable row level security;
alter table public.bank_statement_lines enable row level security;
alter table public.accounting_periods enable row level security;

drop policy if exists "bank_statements_select" on public.bank_statements;
create policy "bank_statements_select" on public.bank_statements for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "bank_statements_write" on public.bank_statements;
create policy "bank_statements_write" on public.bank_statements for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

drop policy if exists "bank_statement_lines_select" on public.bank_statement_lines;
create policy "bank_statement_lines_select" on public.bank_statement_lines for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "bank_statement_lines_write" on public.bank_statement_lines;
create policy "bank_statement_lines_write" on public.bank_statement_lines for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

drop policy if exists "accounting_periods_select" on public.accounting_periods;
create policy "accounting_periods_select" on public.accounting_periods for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "accounting_periods_write" on public.accounting_periods;
create policy "accounting_periods_write" on public.accounting_periods for all to authenticated
using (public.can_admin_company(company_id))
with check (public.can_admin_company(company_id));
