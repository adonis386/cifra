-- Campos extra libro de ventas Art. 76

alter table public.fiscal_book_lines
  add column if not exists machine_serial text,
  add column if not exists z_number text,
  add column if not exists export_file text,
  add column if not exists amount_exonerated numeric(18,2) not null default 0,
  add column if not exists amount_export numeric(18,2) not null default 0,
  add column if not exists partner_person_type text,
  add column if not exists base_natural numeric(18,2) not null default 0,
  add column if not exists tax_natural numeric(18,2) not null default 0,
  add column if not exists rate_natural numeric(7,4) not null default 16,
  add column if not exists base_natural_reduced numeric(18,2) not null default 0,
  add column if not exists tax_natural_reduced numeric(18,2) not null default 0,
  add column if not exists base_natural_additional numeric(18,2) not null default 0,
  add column if not exists tax_natural_additional numeric(18,2) not null default 0;

comment on column public.fiscal_book_lines.partner_person_type is
  'natural|juridica — CO (ordinario) vs NO (natural) en libro ventas Art. 76';
