-- Branding de impresión / membrete por empresa (producto por licencia)

alter table public.companies
  add column if not exists website text,
  add column if not exists print_subtitle text,
  add column if not exists print_footer text,
  add column if not exists print_show_logo boolean not null default true;

comment on column public.companies.logo_path is 'Path en bucket logos: {company_id}/logo.ext';
comment on column public.companies.print_subtitle is 'Línea bajo el nombre en membrete (ej. Contabilidad · Caracas)';
comment on column public.companies.print_footer is 'Pie de página en PDF/impresión';

-- Logos públicos de lectura para embeber en PDF/impresión (sigue escribiendo solo admin)
update storage.buckets
set public = true
where id = 'logos';
