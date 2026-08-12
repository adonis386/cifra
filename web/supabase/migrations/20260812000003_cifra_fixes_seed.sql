-- Soften RIF validation (allow dashes; normalize later in app)
alter table public.companies drop constraint if exists companies_rif_format;
alter table public.companies
  add constraint companies_rif_format
  check (upper(replace(rif, '-', '')) ~ '^[VEJPGC][0-9]{6,9}$');

alter table public.partners drop constraint if exists partners_rif_format;
alter table public.partners
  add constraint partners_rif_format
  check (upper(replace(rif, '-', '')) ~ '^[VEJPGC][0-9]{6,9}$');

-- Safer seed for global tax rates (company_id is null)
insert into public.tax_rates (company_id, code, name, rate, withholding_rate, is_exempt)
select null, v.code, v.name, v.rate, v.withholding_rate, v.is_exempt
from (values
  ('IVA16', 'IVA General 16%', 16::numeric, 75::numeric, false),
  ('IVA8', 'IVA Reducido 8%', 8::numeric, 75::numeric, false),
  ('EXENTO', 'Exento', 0::numeric, 0::numeric, true),
  ('SDCF', 'Sin derecho a crédito fiscal', 0::numeric, 0::numeric, true)
) as v(code, name, rate, withholding_rate, is_exempt)
where not exists (
  select 1 from public.tax_rates t
  where t.company_id is null and t.code = v.code
);
