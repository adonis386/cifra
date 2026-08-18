-- Amplía líneas de libro fiscal al layout SENIAT Art. 75 (compras/ventas)

alter table public.fiscal_book_lines
  add column if not exists registration_date date,
  add column if not exists move_type text,
  add column if not exists debit_note text,
  add column if not exists credit_note text,
  add column if not exists affected_document text,
  add column if not exists is_import boolean not null default false,
  add column if not exists import_planilla text,
  add column if not exists import_file_number text,
  add column if not exists base_general numeric(18,2) not null default 0,
  add column if not exists tax_general numeric(18,2) not null default 0,
  add column if not exists rate_general numeric(7,4) not null default 16,
  add column if not exists base_reduced numeric(18,2) not null default 0,
  add column if not exists tax_reduced numeric(18,2) not null default 0,
  add column if not exists rate_reduced numeric(7,4) not null default 8,
  add column if not exists base_additional numeric(18,2) not null default 0,
  add column if not exists tax_additional numeric(18,2) not null default 0,
  add column if not exists rate_additional numeric(7,4) not null default 31,
  add column if not exists base_import numeric(18,2) not null default 0,
  add column if not exists tax_import numeric(18,2) not null default 0,
  add column if not exists rate_import numeric(7,4) not null default 16,
  add column if not exists igtf_amount numeric(18,2) not null default 0,
  add column if not exists igtf_rate numeric(7,4) not null default 0,
  add column if not exists voucher_number text,
  add column if not exists voucher_date date;

comment on table public.fiscal_book_lines is
  'Líneas libro IVA Art. 75: alícuotas general/reducida/adicional, importación, retención.';
