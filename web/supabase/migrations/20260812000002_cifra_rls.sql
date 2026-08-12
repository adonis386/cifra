-- Cifra: RLS + Storage policies

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.partners enable row level security;
alter table public.tax_rates enable row level security;
alter table public.islr_concepts enable row level security;
alter table public.islr_rates enable row level security;
alter table public.sequences enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.withholding_iva enable row level security;
alter table public.withholding_iva_lines enable row level security;
alter table public.withholding_islr enable row level security;
alter table public.withholding_islr_lines enable row level security;
alter table public.fiscal_books enable row level security;
alter table public.fiscal_book_lines enable row level security;
alter table public.export_files enable row level security;
alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Companies
-- ---------------------------------------------------------------------------
drop policy if exists "companies_select_member" on public.companies;
create policy "companies_select_member"
on public.companies for select
to authenticated
using (public.is_company_member(id));

drop policy if exists "companies_insert_authenticated" on public.companies;
create policy "companies_insert_authenticated"
on public.companies for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "companies_update_admin" on public.companies;
create policy "companies_update_admin"
on public.companies for update
to authenticated
using (public.can_admin_company(id))
with check (public.can_admin_company(id));

drop policy if exists "companies_delete_owner" on public.companies;
create policy "companies_delete_owner"
on public.companies for delete
to authenticated
using (public.company_role(id) = 'owner');

-- Auto-add creator as owner
create or replace function public.handle_new_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.company_members (company_id, user_id, role)
  values (new.id, auth.uid(), 'owner')
  on conflict (company_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_company_created on public.companies;
create trigger on_company_created
after insert on public.companies
for each row execute function public.handle_new_company();

-- ---------------------------------------------------------------------------
-- Company members
-- ---------------------------------------------------------------------------
drop policy if exists "members_select_same_company" on public.company_members;
create policy "members_select_same_company"
on public.company_members for select
to authenticated
using (public.is_company_member(company_id));

drop policy if exists "members_insert_admin" on public.company_members;
create policy "members_insert_admin"
on public.company_members for insert
to authenticated
with check (public.can_admin_company(company_id));

drop policy if exists "members_update_admin" on public.company_members;
create policy "members_update_admin"
on public.company_members for update
to authenticated
using (public.can_admin_company(company_id))
with check (public.can_admin_company(company_id));

drop policy if exists "members_delete_admin" on public.company_members;
create policy "members_delete_admin"
on public.company_members for delete
to authenticated
using (public.can_admin_company(company_id));

-- ---------------------------------------------------------------------------
-- Generic company-scoped policies (read member / write accountant+)
-- ---------------------------------------------------------------------------
-- partners
drop policy if exists "partners_select" on public.partners;
create policy "partners_select" on public.partners for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "partners_insert" on public.partners;
create policy "partners_insert" on public.partners for insert to authenticated
with check (public.can_write_company(company_id));
drop policy if exists "partners_update" on public.partners;
create policy "partners_update" on public.partners for update to authenticated
using (public.can_write_company(company_id)) with check (public.can_write_company(company_id));
drop policy if exists "partners_delete" on public.partners;
create policy "partners_delete" on public.partners for delete to authenticated
using (public.can_write_company(company_id));

-- tax_rates
drop policy if exists "tax_rates_select" on public.tax_rates;
create policy "tax_rates_select" on public.tax_rates for select to authenticated
using (company_id is null or public.is_company_member(company_id));
drop policy if exists "tax_rates_write" on public.tax_rates;
create policy "tax_rates_write" on public.tax_rates for all to authenticated
using (company_id is not null and public.can_admin_company(company_id))
with check (company_id is not null and public.can_admin_company(company_id));

-- islr_concepts
drop policy if exists "islr_concepts_select" on public.islr_concepts;
create policy "islr_concepts_select" on public.islr_concepts for select to authenticated
using (company_id is null or public.is_company_member(company_id));
drop policy if exists "islr_concepts_write" on public.islr_concepts;
create policy "islr_concepts_write" on public.islr_concepts for all to authenticated
using (company_id is not null and public.can_admin_company(company_id))
with check (company_id is not null and public.can_admin_company(company_id));

-- islr_rates (via concept membership)
drop policy if exists "islr_rates_select" on public.islr_rates;
create policy "islr_rates_select" on public.islr_rates for select to authenticated
using (
  exists (
    select 1 from public.islr_concepts c
    where c.id = concept_id
      and (c.company_id is null or public.is_company_member(c.company_id))
  )
);
drop policy if exists "islr_rates_write" on public.islr_rates;
create policy "islr_rates_write" on public.islr_rates for all to authenticated
using (
  exists (
    select 1 from public.islr_concepts c
    where c.id = concept_id
      and c.company_id is not null
      and public.can_admin_company(c.company_id)
  )
)
with check (
  exists (
    select 1 from public.islr_concepts c
    where c.id = concept_id
      and c.company_id is not null
      and public.can_admin_company(c.company_id)
  )
);

-- sequences
drop policy if exists "sequences_select" on public.sequences;
create policy "sequences_select" on public.sequences for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "sequences_write" on public.sequences;
create policy "sequences_write" on public.sequences for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

-- invoices
drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select" on public.invoices for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "invoices_insert" on public.invoices;
create policy "invoices_insert" on public.invoices for insert to authenticated
with check (public.can_write_company(company_id));
drop policy if exists "invoices_update" on public.invoices;
create policy "invoices_update" on public.invoices for update to authenticated
using (public.can_write_company(company_id)) with check (public.can_write_company(company_id));
drop policy if exists "invoices_delete" on public.invoices;
create policy "invoices_delete" on public.invoices for delete to authenticated
using (public.can_write_company(company_id));

-- invoice_lines
drop policy if exists "invoice_lines_select" on public.invoice_lines;
create policy "invoice_lines_select" on public.invoice_lines for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "invoice_lines_write" on public.invoice_lines;
create policy "invoice_lines_write" on public.invoice_lines for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

-- withholding_iva
drop policy if exists "wh_iva_select" on public.withholding_iva;
create policy "wh_iva_select" on public.withholding_iva for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "wh_iva_write" on public.withholding_iva;
create policy "wh_iva_write" on public.withholding_iva for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

drop policy if exists "wh_iva_lines_select" on public.withholding_iva_lines;
create policy "wh_iva_lines_select" on public.withholding_iva_lines for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "wh_iva_lines_write" on public.withholding_iva_lines;
create policy "wh_iva_lines_write" on public.withholding_iva_lines for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

-- withholding_islr
drop policy if exists "wh_islr_select" on public.withholding_islr;
create policy "wh_islr_select" on public.withholding_islr for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "wh_islr_write" on public.withholding_islr;
create policy "wh_islr_write" on public.withholding_islr for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

drop policy if exists "wh_islr_lines_select" on public.withholding_islr_lines;
create policy "wh_islr_lines_select" on public.withholding_islr_lines for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "wh_islr_lines_write" on public.withholding_islr_lines;
create policy "wh_islr_lines_write" on public.withholding_islr_lines for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

-- fiscal books
drop policy if exists "fiscal_books_select" on public.fiscal_books;
create policy "fiscal_books_select" on public.fiscal_books for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "fiscal_books_write" on public.fiscal_books;
create policy "fiscal_books_write" on public.fiscal_books for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

drop policy if exists "fiscal_book_lines_select" on public.fiscal_book_lines;
create policy "fiscal_book_lines_select" on public.fiscal_book_lines for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "fiscal_book_lines_write" on public.fiscal_book_lines;
create policy "fiscal_book_lines_write" on public.fiscal_book_lines for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

-- export_files
drop policy if exists "export_files_select" on public.export_files;
create policy "export_files_select" on public.export_files for select to authenticated
using (public.is_company_member(company_id));
drop policy if exists "export_files_write" on public.export_files;
create policy "export_files_write" on public.export_files for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

-- audit_logs (insert by writers, read by admins)
drop policy if exists "audit_select_admin" on public.audit_logs;
create policy "audit_select_admin" on public.audit_logs for select to authenticated
using (company_id is not null and public.can_admin_company(company_id));
drop policy if exists "audit_insert_member" on public.audit_logs;
create policy "audit_insert_member" on public.audit_logs for insert to authenticated
with check (company_id is not null and public.is_company_member(company_id));

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('exports', 'exports', false),
  ('logos', 'logos', false)
on conflict (id) do nothing;

-- Path convention: {company_id}/...
drop policy if exists "exports_select_member" on storage.objects;
create policy "exports_select_member"
on storage.objects for select to authenticated
using (
  bucket_id = 'exports'
  and public.is_company_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists "exports_insert_writer" on storage.objects;
create policy "exports_insert_writer"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'exports'
  and public.can_write_company((storage.foldername(name))[1]::uuid)
);

drop policy if exists "exports_update_writer" on storage.objects;
create policy "exports_update_writer"
on storage.objects for update to authenticated
using (
  bucket_id = 'exports'
  and public.can_write_company((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'exports'
  and public.can_write_company((storage.foldername(name))[1]::uuid)
);

drop policy if exists "exports_delete_admin" on storage.objects;
create policy "exports_delete_admin"
on storage.objects for delete to authenticated
using (
  bucket_id = 'exports'
  and public.can_admin_company((storage.foldername(name))[1]::uuid)
);

drop policy if exists "logos_select_member" on storage.objects;
create policy "logos_select_member"
on storage.objects for select to authenticated
using (
  bucket_id = 'logos'
  and public.is_company_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists "logos_write_admin" on storage.objects;
create policy "logos_write_admin"
on storage.objects for all to authenticated
using (
  bucket_id = 'logos'
  and public.can_admin_company((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'logos'
  and public.can_admin_company((storage.foldername(name))[1]::uuid)
);

-- Seed moved to 20260812000003_cifra_fixes_seed.sql
