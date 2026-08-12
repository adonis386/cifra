-- Aceptar RIF con guiones/puntos; la app normaliza antes de guardar
alter table public.companies drop constraint if exists companies_rif_format;
alter table public.companies
  add constraint companies_rif_format
  check (upper(regexp_replace(rif, '[^a-zA-Z0-9]', '', 'g')) ~ '^[VEJPGC][0-9]{6,9}$');

alter table public.partners drop constraint if exists partners_rif_format;
alter table public.partners
  add constraint partners_rif_format
  check (upper(regexp_replace(rif, '[^a-zA-Z0-9]', '', 'g')) ~ '^[VEJPGC][0-9]{6,9}$');
