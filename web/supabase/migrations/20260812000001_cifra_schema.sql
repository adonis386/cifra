-- Sifra: schema inicial (multi-empresa + fiscal VE)
-- Run in Supabase SQL Editor or via supabase db push

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.member_role as enum ('owner', 'admin', 'accountant', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.partner_kind as enum ('customer', 'supplier', 'both');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.person_type as enum ('natural', 'juridica');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_move_type as enum (
    'out_invoice', 'out_refund', 'in_invoice', 'in_refund'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fiscal_doc_type as enum ('01', '02', '03', '04', '05');
exception when duplicate_object then null; end $$;
-- 01 factura, 02 N/D, 03 N/C, 04/05 otros (importación etc.)

do $$ begin
  create type public.operation_type as enum ('C', 'V');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.doc_state as enum ('draft', 'confirmed', 'done', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.book_type as enum ('purchase', 'sale');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.export_kind as enum ('iva_txt', 'islr_xml', 'municipal_txt', 'book_pdf', 'book_xlsx');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Helpers (membership helpers are created AFTER company_members exists)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Companies & members
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rif text not null,
  address text,
  phone text,
  email text,
  is_withholding_agent boolean not null default true,
  is_special_taxpayer boolean not null default false,
  logo_path text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_rif_unique unique (rif),
  constraint companies_rif_format check (rif ~ '^[VEJPGCvejpgc][0-9]{6,9}$')
);

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'accountant',
  created_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index if not exists idx_company_members_user on public.company_members (user_id);
create index if not exists idx_company_members_company on public.company_members (company_id);

-- Membership helpers (must exist only after company_members table)
create or replace function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.company_role(p_company_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.company_members m
  where m.company_id = p_company_id
    and m.user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_write_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin', 'accountant')
  );
$$;

create or replace function public.can_admin_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Partners (clientes / proveedores)
-- ---------------------------------------------------------------------------
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind public.partner_kind not null default 'both',
  person_type public.person_type not null default 'juridica',
  rif text not null,
  name text not null,
  address text,
  phone text,
  email text,
  is_withholding_agent boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, rif)
);

create index if not exists idx_partners_company on public.partners (company_id);

drop trigger if exists trg_partners_updated_at on public.partners;
create trigger trg_partners_updated_at
before update on public.partners
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tax / ISLR catalogs
-- ---------------------------------------------------------------------------
create table if not exists public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  code text not null,
  name text not null,
  rate numeric(7,4) not null,
  withholding_rate numeric(7,4) not null default 0,
  is_exempt boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

create table if not exists public.islr_concepts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

create table if not exists public.islr_rates (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.islr_concepts (id) on delete cascade,
  person_type public.person_type not null,
  rate numeric(7,4) not null,
  subtract_ut numeric(12,4) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null,
  prefix text not null default '',
  next_number bigint not null default 1,
  padding int not null default 8,
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  partner_id uuid not null references public.partners (id),
  move_type public.invoice_move_type not null,
  operation_type public.operation_type not null,
  doc_type public.fiscal_doc_type not null default '01',
  state public.doc_state not null default 'draft',
  invoice_date date not null,
  invoice_number text not null,
  control_number text,
  affected_document text,
  import_file_number text,
  currency_code text not null default 'VES',
  amount_untaxed numeric(18,2) not null default 0,
  amount_tax numeric(18,2) not null default 0,
  amount_exempt numeric(18,2) not null default 0,
  amount_total numeric(18,2) not null default 0,
  amount_retained_iva numeric(18,2) not null default 0,
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoices_company_date on public.invoices (company_id, invoice_date);
create index if not exists idx_invoices_partner on public.invoices (partner_id);

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  description text not null,
  quantity numeric(18,4) not null default 1,
  price_unit numeric(18,4) not null default 0,
  tax_rate_id uuid references public.tax_rates (id),
  tax_rate numeric(7,4) not null default 16,
  amount_untaxed numeric(18,2) not null default 0,
  amount_tax numeric(18,2) not null default 0,
  amount_total numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_lines_invoice on public.invoice_lines (invoice_id);

-- ---------------------------------------------------------------------------
-- Withholding IVA
-- ---------------------------------------------------------------------------
create table if not exists public.withholding_iva (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  partner_id uuid not null references public.partners (id),
  voucher_number text not null,
  period char(6) not null,
  voucher_date date not null,
  state public.doc_state not null default 'draft',
  amount_untaxed numeric(18,2) not null default 0,
  amount_tax numeric(18,2) not null default 0,
  amount_withheld numeric(18,2) not null default 0,
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, voucher_number)
);

create index if not exists idx_wh_iva_company_period on public.withholding_iva (company_id, period);

drop trigger if exists trg_wh_iva_updated_at on public.withholding_iva;
create trigger trg_wh_iva_updated_at
before update on public.withholding_iva
for each row execute function public.set_updated_at();

create table if not exists public.withholding_iva_lines (
  id uuid primary key default gen_random_uuid(),
  withholding_id uuid not null references public.withholding_iva (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_id uuid references public.invoices (id),
  operation_type public.operation_type not null default 'C',
  doc_type public.fiscal_doc_type not null default '01',
  invoice_number text,
  control_number text,
  affected_document text default '0',
  invoice_date date,
  amount_total numeric(18,2) not null default 0,
  amount_untaxed numeric(18,2) not null default 0,
  amount_withheld numeric(18,2) not null default 0,
  amount_exempt numeric(18,2) not null default 0,
  alicuota numeric(7,4) not null default 16,
  expediente text not null default '0',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Withholding ISLR
-- ---------------------------------------------------------------------------
create table if not exists public.withholding_islr (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  partner_id uuid not null references public.partners (id),
  voucher_number text not null,
  period char(6) not null,
  voucher_date date not null,
  state public.doc_state not null default 'draft',
  amount_untaxed numeric(18,2) not null default 0,
  amount_withheld numeric(18,2) not null default 0,
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, voucher_number)
);

drop trigger if exists trg_wh_islr_updated_at on public.withholding_islr;
create trigger trg_wh_islr_updated_at
before update on public.withholding_islr
for each row execute function public.set_updated_at();

create table if not exists public.withholding_islr_lines (
  id uuid primary key default gen_random_uuid(),
  withholding_id uuid not null references public.withholding_islr (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_id uuid references public.invoices (id),
  concept_id uuid references public.islr_concepts (id),
  rate numeric(7,4) not null default 0,
  amount_untaxed numeric(18,2) not null default 0,
  amount_withheld numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Fiscal books
-- ---------------------------------------------------------------------------
create table if not exists public.fiscal_books (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  book_type public.book_type not null,
  period_start date not null,
  period_end date not null,
  state public.doc_state not null default 'draft',
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fiscal_books_company on public.fiscal_books (company_id, book_type, period_start);

drop trigger if exists trg_fiscal_books_updated_at on public.fiscal_books;
create trigger trg_fiscal_books_updated_at
before update on public.fiscal_books
for each row execute function public.set_updated_at();

create table if not exists public.fiscal_book_lines (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.fiscal_books (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_id uuid references public.invoices (id),
  rank int,
  emission_date date,
  partner_rif text,
  partner_name text,
  invoice_number text,
  control_number text,
  doc_type text,
  amount_untaxed numeric(18,2) not null default 0,
  amount_tax numeric(18,2) not null default 0,
  amount_exempt numeric(18,2) not null default 0,
  amount_total numeric(18,2) not null default 0,
  amount_retained numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_fiscal_book_lines_book on public.fiscal_book_lines (book_id);

-- ---------------------------------------------------------------------------
-- Export files metadata
-- ---------------------------------------------------------------------------
create table if not exists public.export_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind public.export_kind not null,
  period char(6),
  file_name text not null,
  storage_path text not null,
  related_id uuid,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_export_files_company on public.export_files (company_id, kind, period);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_company on public.audit_logs (company_id, created_at desc);
