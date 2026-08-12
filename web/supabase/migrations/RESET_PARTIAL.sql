-- Optional: clean partial objects from a failed first run, then run ALL.sql
-- Safe to run if tables/functions were only partially created.

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_company_created on public.companies;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.handle_new_company() cascade;
drop function if exists public.is_company_member(uuid) cascade;
drop function if exists public.company_role(uuid) cascade;
drop function if exists public.can_write_company(uuid) cascade;
drop function if exists public.can_admin_company(uuid) cascade;
drop function if exists public.set_updated_at() cascade;

drop table if exists public.audit_logs cascade;
drop table if exists public.export_files cascade;
drop table if exists public.fiscal_book_lines cascade;
drop table if exists public.fiscal_books cascade;
drop table if exists public.withholding_islr_lines cascade;
drop table if exists public.withholding_islr cascade;
drop table if exists public.withholding_iva_lines cascade;
drop table if exists public.withholding_iva cascade;
drop table if exists public.invoice_lines cascade;
drop table if exists public.invoices cascade;
drop table if exists public.sequences cascade;
drop table if exists public.islr_rates cascade;
drop table if exists public.islr_concepts cascade;
drop table if exists public.tax_rates cascade;
drop table if exists public.partners cascade;
drop table if exists public.company_members cascade;
drop table if exists public.companies cascade;
drop table if exists public.profiles cascade;

drop type if exists public.export_kind cascade;
drop type if exists public.book_type cascade;
drop type if exists public.doc_state cascade;
drop type if exists public.operation_type cascade;
drop type if exists public.fiscal_doc_type cascade;
drop type if exists public.invoice_move_type cascade;
drop type if exists public.person_type cascade;
drop type if exists public.partner_kind cascade;
drop type if exists public.member_role cascade;
