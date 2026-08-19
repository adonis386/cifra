-- Honorarios médicos: 3% + sustraendo (misma tarifa que honorarios profesionales 001).
-- La tabla completa de retenciones ISLR se cargará cuando el cliente la envíe.

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

insert into public.islr_rates (concept_id, person_type, rate, subtract_ut, code, base_percent, minimum_ut)
select c.id, 'juridica', 3, 0, '010', 100, 0.33
from public.islr_concepts c
where c.code = '010'
  and not exists (
    select 1 from public.islr_rates x
    where x.concept_id = c.id and x.person_type = 'juridica'
  );

insert into public.islr_rates (concept_id, person_type, rate, subtract_ut, code, base_percent, minimum_ut)
select c.id, 'natural', 3, 2.5, '110', 100, 83.3334
from public.islr_concepts c
where c.code = '010'
  and not exists (
    select 1 from public.islr_rates x
    where x.concept_id = c.id and x.person_type = 'natural'
  );
