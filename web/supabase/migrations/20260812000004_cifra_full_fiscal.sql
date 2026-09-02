-- Sifra full fiscal extras: UT + municipal tables + concept codes helpers

create table if not exists public.tax_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  name text not null default 'UT',
  amount numeric(18,4) not null,
  date_from date not null,
  date_to date,
  created_at timestamptz not null default now()
);

alter table public.tax_units enable row level security;

drop policy if exists "tax_units_select" on public.tax_units;
create policy "tax_units_select" on public.tax_units for select to authenticated
using (company_id is null or public.is_company_member(company_id));

drop policy if exists "tax_units_write" on public.tax_units;
create policy "tax_units_write" on public.tax_units for all to authenticated
using (company_id is not null and public.can_admin_company(company_id))
with check (company_id is not null and public.can_admin_company(company_id));

create table if not exists public.withholding_municipal (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  partner_id uuid not null references public.partners (id),
  voucher_number text not null,
  period char(6) not null,
  voucher_date date not null,
  activity_code text,
  rate numeric(7,4) not null default 0,
  amount_base numeric(18,2) not null default 0,
  amount_withheld numeric(18,2) not null default 0,
  state public.doc_state not null default 'draft',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, voucher_number)
);

alter table public.withholding_municipal enable row level security;

drop policy if exists "wh_muni_select" on public.withholding_municipal;
create policy "wh_muni_select" on public.withholding_municipal for select to authenticated
using (public.is_company_member(company_id));

drop policy if exists "wh_muni_write" on public.withholding_municipal;
create policy "wh_muni_write" on public.withholding_municipal for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

-- Useful columns on islr concepts if missing
alter table public.islr_concepts
  add column if not exists withholdable boolean not null default true;

alter table public.islr_rates
  add column if not exists code text,
  add column if not exists base_percent numeric(7,4) not null default 100,
  add column if not exists minimum_ut numeric(12,4) not null default 0;

alter table public.invoices
  add column if not exists amount_retained_islr numeric(18,2) not null default 0;

-- Seed global UT (example; update in Config)
insert into public.tax_units (company_id, name, amount, date_from)
select null, 'UT vigente', 0.40, current_date
where not exists (select 1 from public.tax_units where company_id is null);

-- Seed common ISLR concepts (global templates)
insert into public.islr_concepts (company_id, code, name, withholdable)
select null, v.code, v.name, v.withholdable
from (values
  ('000', 'NO APLICA RETENCION', false),
  ('001', 'Honorarios Profesionales No Mercantiles', true),
  ('002', 'Pagos a Empresas Contratistas o Subcontratistas', true),
  ('003', 'Pagos por Gastos de Transporte / Fletes', true),
  ('004', 'Publicidad y Propaganda', true),
  ('005', 'Arrendamiento de inmuebles', true),
  ('006', 'Comisiones', true),
  ('007', 'Asistencia Técnica', true),
  ('008', 'Regalías', true),
  ('009', 'Intereses', true)
) as v(code, name, withholdable)
where not exists (
  select 1 from public.islr_concepts c where c.company_id is null and c.code = v.code
);

-- Sample rates for juridica domiciliada on main concepts
insert into public.islr_rates (concept_id, person_type, rate, subtract_ut, code, base_percent, minimum_ut)
select c.id, 'juridica', r.rate, 0, r.code, 100, 0.33
from public.islr_concepts c
join (values
  ('001', '001', 3::numeric),
  ('002', '002', 2::numeric),
  ('003', '003', 3::numeric),
  ('004', '004', 5::numeric),
  ('005', '005', 3::numeric),
  ('006', '006', 5::numeric),
  ('007', '007', 5::numeric),
  ('008', '008', 5::numeric),
  ('009', '009', 5::numeric)
) as r(concept_code, code, rate) on c.code = r.concept_code
where c.company_id is null
  and not exists (
    select 1 from public.islr_rates x
    where x.concept_id = c.id and x.person_type = 'juridica' and x.code = r.code
  );

insert into public.islr_rates (concept_id, person_type, rate, subtract_ut, code, base_percent, minimum_ut)
select c.id, 'natural', r.rate, r.sub, r.code, 100, 83.3334
from public.islr_concepts c
join (values
  ('001', '101', 3::numeric, 2.5::numeric),
  ('002', '102', 2::numeric, 0::numeric),
  ('005', '105', 3::numeric, 2.5::numeric),
  ('006', '106', 5::numeric, 0::numeric)
) as r(concept_code, code, rate, sub) on c.code = r.concept_code
where c.company_id is null
  and not exists (
    select 1 from public.islr_rates x
    where x.concept_id = c.id and x.person_type = 'natural' and x.code = r.code
  );
