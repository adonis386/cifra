-- Products catalog, invoice registration date, withholding sequences

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null default '',
  name text not null,
  description text,
  price_unit numeric(18,4) not null default 0,
  tax_code text not null default 'IVA16',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create index if not exists idx_products_company on public.products (company_id, active);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

alter table public.products enable row level security;

drop policy if exists "products_select" on public.products;
create policy "products_select" on public.products for select to authenticated
using (public.is_company_member(company_id));

drop policy if exists "products_write" on public.products;
create policy "products_write" on public.products for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

alter table public.invoice_lines
  add column if not exists product_id uuid references public.products (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Fecha de registro / contable (libros quincenales)
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists registration_date date;

update public.invoices
set registration_date = invoice_date
where registration_date is null;

alter table public.invoices
  alter column registration_date set default current_date;

comment on column public.invoices.registration_date is
  'Fecha de registro/contable para libros (puede diferir de invoice_date).';

alter table public.fiscal_book_lines
  add column if not exists registration_date date;

-- ---------------------------------------------------------------------------
-- Sequences for withholding vouchers (14 digits: YYYYMM + 8 seq)
-- ---------------------------------------------------------------------------
insert into public.sequences (company_id, code, prefix, next_number, padding)
select c.id, 'wh_iva', '', 1, 8
from public.companies c
where not exists (
  select 1 from public.sequences s
  where s.company_id = c.id and s.code = 'wh_iva'
);

insert into public.sequences (company_id, code, prefix, next_number, padding)
select c.id, 'wh_islr', '', 1, 8
from public.companies c
where not exists (
  select 1 from public.sequences s
  where s.company_id = c.id and s.code = 'wh_islr'
);

create or replace function public.handle_new_company_sequences()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sequences (company_id, code, prefix, next_number, padding)
  values
    (new.id, 'nro_ctrl', '', 1, 8),
    (new.id, 'wh_iva', '', 1, 8),
    (new.id, 'wh_islr', '', 1, 8)
  on conflict do nothing;
  return new;
end;
$$;
