-- ISLR: sustraendo se resta del impuesto (base × %), no de la base.
-- Honorarios PN: sustraendo = UT × 3% × 83.3334
-- PJ domiciliada honorarios: 5%, sin sustraendo (tabla SENIAT).

alter table public.withholding_islr_lines
  add column if not exists amount_subtract numeric(18,2) not null default 0;

insert into public.islr_concepts (company_id, code, name, withholdable)
select null, '010', 'Honorarios Médicos', true
where not exists (
  select 1 from public.islr_concepts c
  where c.company_id is null and c.code = '010'
);

insert into public.islr_concepts (company_id, code, name, withholdable)
select distinct c.company_id, '010', 'Honorarios Médicos', true
from public.islr_concepts c
where c.company_id is not null
  and not exists (
    select 1 from public.islr_concepts x
    where x.company_id = c.company_id and x.code = '010'
  );

-- PN residente: 3% + factor 83.3334
insert into public.islr_rates (concept_id, person_type, rate, subtract_ut, code, base_percent, minimum_ut)
select c.id, 'natural', 3, 0, case when c.code = '010' then '110' else '101' end, 100, 83.3334
from public.islr_concepts c
where c.code in ('001', '010')
  and not exists (
    select 1 from public.islr_rates x
    where x.concept_id = c.id and x.person_type = 'natural'
  );

insert into public.islr_rates (concept_id, person_type, rate, subtract_ut, code, base_percent, minimum_ut)
select c.id, 'juridica', 5, 0, case when c.code = '010' then '010' else '001' end, 100, 0
from public.islr_concepts c
where c.code in ('001', '010')
  and not exists (
    select 1 from public.islr_rates x
    where x.concept_id = c.id and x.person_type = 'juridica'
  );

update public.islr_rates r
set
  rate = 3,
  subtract_ut = 0,
  base_percent = 100,
  minimum_ut = 83.3334
from public.islr_concepts c
where r.concept_id = c.id
  and c.code in ('001', '010')
  and r.person_type = 'natural';

update public.islr_rates r
set
  rate = 5,
  subtract_ut = 0,
  base_percent = 100,
  minimum_ut = 0
from public.islr_concepts c
where r.concept_id = c.id
  and c.code in ('001', '010')
  and r.person_type = 'juridica';
