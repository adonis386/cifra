-- =============================================================================
-- Sifra: WIPE datos de negocio — conservar auth.users
-- =============================================================================
-- Qué hace:
--   • Borra TODAS las empresas, facturas, retenciones, libros, asientos, etc.
--   • Conserva auth.users (login)
--   • Recrea profiles desde auth.users
--   • Vuelve a cargar catálogos globales (IVA, UT) para que la app arranque limpia
--   • Intenta limpiar archivos del bucket logos (si existe)
--
-- Qué NO hace:
--   • No borra usuarios de Authentication
--   • No cambia migraciones / schema / RLS
--
-- Cómo ejecutar:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Pega este archivo completo → Run
--   3. En la app: crea de nuevo la empresa y carga datos
-- =============================================================================

begin;

-- Desactivar triggers de auto-seed momentáneamente no es necesario:
-- al truncar companies no se insertan filas nuevas.

-- Orden: tablas hijas primero (TRUNCATE … CASCADE cubre FKs)
truncate table
  public.bank_statement_lines,
  public.bank_statements,
  public.payment_allocations,
  public.payments,
  public.account_move_lines,
  public.account_moves,
  public.account_journals,
  public.account_accounts,
  public.accounting_periods,
  public.fiscal_book_lines,
  public.fiscal_books,
  public.withholding_municipal,
  public.withholding_islr_lines,
  public.withholding_islr,
  public.withholding_iva_lines,
  public.withholding_iva,
  public.invoice_lines,
  public.invoices,
  public.export_files,
  public.audit_logs,
  public.exchange_rates,
  public.sequences,
  public.products,
  public.partners,
  public.company_members,
  public.companies,
  public.islr_rates,
  public.islr_concepts,
  public.tax_rates,
  public.tax_units,
  public.profiles
restart identity cascade;

-- Profiles desde usuarios Auth existentes
insert into public.profiles (id, full_name, email)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', u.email),
  u.email
from auth.users u
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(public.profiles.full_name, excluded.full_name);

-- Catálogos globales mínimos (sin empresa)
insert into public.tax_rates (company_id, code, name, rate, withholding_rate, is_exempt)
values
  (null, 'IVA16', 'IVA General 16%', 16, 75, false),
  (null, 'IVA8', 'IVA Reducido 8%', 8, 75, false),
  (null, 'EXENTO', 'Exento', 0, 0, true),
  (null, 'SDCF', 'Sin derecho a crédito fiscal', 0, 0, true);

insert into public.tax_units (company_id, name, amount, date_from)
values (null, 'UT SENIAT 2025', 43, date '2025-01-01');

commit;

-- Storage: logos por empresa (best-effort; ignora si no hay permisos)
do $$
begin
  delete from storage.objects where bucket_id = 'logos';
exception
  when others then
    raise notice 'No se pudieron borrar objetos de storage.logos: %', SQLERRM;
end $$;

-- Verificación rápida
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.companies) as companies,
  (select count(*) from public.invoices) as invoices,
  (select count(*) from public.withholding_iva) as wh_iva;
