-- Sifra: dual currency (USD/Bs), fiscal VE fields, ISLR on lines, control sequences

-- ---------------------------------------------------------------------------
-- Exchange rates (BCV / tasa del día) — Bs por 1 USD
-- ---------------------------------------------------------------------------
create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  rate_date date not null,
  currency_code text not null default 'USD',
  rate numeric(18,6) not null check (rate > 0),
  source text not null default 'manual',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, rate_date, currency_code)
);

create index if not exists idx_exchange_rates_date
  on public.exchange_rates (company_id, rate_date desc);

alter table public.exchange_rates enable row level security;

drop policy if exists "exchange_rates_select" on public.exchange_rates;
create policy "exchange_rates_select" on public.exchange_rates for select to authenticated
using (company_id is null or public.is_company_member(company_id));

drop policy if exists "exchange_rates_write" on public.exchange_rates;
create policy "exchange_rates_write" on public.exchange_rates for all to authenticated
using (company_id is not null and public.can_write_company(company_id))
with check (company_id is not null and public.can_write_company(company_id));

-- ---------------------------------------------------------------------------
-- Company dual-currency defaults
-- ---------------------------------------------------------------------------
alter table public.companies
  add column if not exists currency_code text not null default 'VES',
  add column if not exists dual_currency boolean not null default true;

-- ---------------------------------------------------------------------------
-- Invoice fiscal + dual currency fields
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists sin_cred boolean not null default false,
  add column if not exists exchange_rate numeric(18,6),
  add column if not exists amount_untaxed_usd numeric(18,2),
  add column if not exists amount_tax_usd numeric(18,2),
  add column if not exists amount_exempt_usd numeric(18,2),
  add column if not exists amount_total_usd numeric(18,2),
  add column if not exists amount_residual_usd numeric(18,2),
  add column if not exists import_planilla text,
  add column if not exists import_date date;

comment on column public.invoices.sin_cred is 'Excluir del libro fiscal (Odoo sin_cred)';
comment on column public.invoices.exchange_rate is 'Bs por 1 USD (tasa del día del documento)';
comment on column public.invoices.import_file_number is 'N° expediente de importación';
comment on column public.invoices.import_planilla is 'N° planilla de importación';

-- ---------------------------------------------------------------------------
-- Invoice lines: ISLR concept
-- ---------------------------------------------------------------------------
alter table public.invoice_lines
  add column if not exists concept_id uuid references public.islr_concepts (id) on delete set null;

create index if not exists idx_invoice_lines_concept on public.invoice_lines (concept_id);

-- ---------------------------------------------------------------------------
-- Payments dual currency
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists exchange_rate numeric(18,6),
  add column if not exists amount_usd numeric(18,2);

-- ---------------------------------------------------------------------------
-- Next control number helper (sequences.code = 'nro_ctrl')
-- ---------------------------------------------------------------------------
create or replace function public.next_sequence_value(
  p_company_id uuid,
  p_code text,
  p_prefix text default '',
  p_padding int default 8
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
  v_prefix text;
  v_padding int;
begin
  insert into public.sequences (company_id, code, prefix, next_number, padding)
  values (p_company_id, p_code, coalesce(p_prefix, ''), 1, coalesce(p_padding, 8))
  on conflict (company_id, code) do nothing;

  update public.sequences
  set next_number = next_number + 1,
      updated_at = now()
  where company_id = p_company_id and code = p_code
  returning next_number - 1, prefix, padding
  into v_next, v_prefix, v_padding;

  return coalesce(v_prefix, '') || lpad(v_next::text, greatest(coalesce(v_padding, 8), 1), '0');
end;
$$;

grant execute on function public.next_sequence_value(uuid, text, text, int) to authenticated;

-- Seed default control sequences for existing companies
insert into public.sequences (company_id, code, prefix, next_number, padding)
select c.id, 'nro_ctrl', '', 1, 8
from public.companies c
where not exists (
  select 1 from public.sequences s
  where s.company_id = c.id and s.code = 'nro_ctrl'
);

-- Auto-create sequence when company is created
create or replace function public.handle_new_company_sequences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sequences (company_id, code, prefix, next_number, padding)
  values (new.id, 'nro_ctrl', '', 1, 8)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_company_sequences_seed on public.companies;
create trigger on_company_sequences_seed
after insert on public.companies
for each row execute function public.handle_new_company_sequences();

-- ---------------------------------------------------------------------------
-- Helper: latest rate on or before a date (company then global)
-- ---------------------------------------------------------------------------
create or replace function public.get_exchange_rate(
  p_company_id uuid,
  p_date date,
  p_currency text default 'USD'
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select rate
  from public.exchange_rates
  where currency_code = p_currency
    and rate_date <= p_date
    and (company_id = p_company_id or company_id is null)
  order by
    case when company_id = p_company_id then 0 else 1 end,
    rate_date desc
  limit 1;
$$;

grant execute on function public.get_exchange_rate(uuid, date, text) to authenticated;
