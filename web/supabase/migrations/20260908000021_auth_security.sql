-- Auth hardening: optional MFA (aal2) on sensitive tables, storage limits,
-- tighter grants on SECURITY DEFINER helpers, and safer profile names from OAuth.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(concat_ws(
        ' ',
        new.raw_user_meta_data->>'given_name',
        new.raw_user_meta_data->>'family_name'
      )), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      new.email
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- MFA is optional. If the user enrolled a verified factor, sensitive rows
-- require JWT claim aal = aal2. Matches Supabase "opt-in MFA" RLS pattern.
create or replace function public.mfa_aal_allowed()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when exists (
        select 1
        from auth.mfa_factors f
        where f.user_id = (select auth.uid())
          and f.status = 'verified'
      ) then array['aal2']::text[]
      else array['aal1', 'aal2']::text[]
    end;
$$;

revoke all on function public.mfa_aal_allowed() from public, anon;
grant execute on function public.mfa_aal_allowed() to authenticated;

-- Restrictive: all existing permissive policies still apply, AND this.
drop policy if exists "companies_aal2_if_mfa" on public.companies;
create policy "companies_aal2_if_mfa"
on public.companies
as restrictive
to authenticated
using (array[(select auth.jwt()->>'aal')] <@ public.mfa_aal_allowed());

drop policy if exists "company_members_aal2_if_mfa" on public.company_members;
create policy "company_members_aal2_if_mfa"
on public.company_members
as restrictive
to authenticated
using (array[(select auth.jwt()->>'aal')] <@ public.mfa_aal_allowed());

drop policy if exists "sequences_aal2_if_mfa" on public.sequences;
create policy "sequences_aal2_if_mfa"
on public.sequences
as restrictive
to authenticated
using (array[(select auth.jwt()->>'aal')] <@ public.mfa_aal_allowed());

drop policy if exists "accounting_periods_aal2_if_mfa" on public.accounting_periods;
create policy "accounting_periods_aal2_if_mfa"
on public.accounting_periods
as restrictive
to authenticated
using (array[(select auth.jwt()->>'aal')] <@ public.mfa_aal_allowed());

drop policy if exists "audit_logs_aal2_if_mfa" on public.audit_logs;
create policy "audit_logs_aal2_if_mfa"
on public.audit_logs
as restrictive
to authenticated
using (array[(select auth.jwt()->>'aal')] <@ public.mfa_aal_allowed());

drop policy if exists "storage_objects_aal2_if_mfa" on storage.objects;
create policy "storage_objects_aal2_if_mfa"
on storage.objects
as restrictive
to authenticated
using (array[(select auth.jwt()->>'aal')] <@ public.mfa_aal_allowed());

-- Bucket-level size + MIME allowlists (defense in depth with app validation).
update storage.buckets
set
  file_size_limit = 2097152,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
where id = 'logos';

update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'application/pdf',
    'text/plain',
    'application/xml',
    'text/xml',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
where id = 'exports';

-- Trigger-only definers must not be callable via PostgREST.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_new_company() from public, anon, authenticated;
revoke all on function public.handle_new_company_accounting() from public, anon, authenticated;
revoke all on function public.handle_new_company_before() from public, anon, authenticated;
revoke all on function public.handle_new_company_sequences() from public, anon, authenticated;

-- RLS helpers and RPCs used by the app: authenticated only, never anon.
revoke all on function public.can_admin_company(uuid) from public, anon;
grant execute on function public.can_admin_company(uuid) to authenticated;

revoke all on function public.can_write_company(uuid) from public, anon;
grant execute on function public.can_write_company(uuid) to authenticated;

revoke all on function public.company_role(uuid) from public, anon;
grant execute on function public.company_role(uuid) to authenticated;

revoke all on function public.is_company_member(uuid) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated;

revoke all on function public.get_exchange_rate(uuid, date, text) from public, anon;
grant execute on function public.get_exchange_rate(uuid, date, text) to authenticated;

revoke all on function public.next_sequence_value(uuid, text, text, integer) from public, anon;
grant execute on function public.next_sequence_value(uuid, text, text, integer) to authenticated;

revoke all on function public.seed_company_accounting(uuid) from public, anon;
grant execute on function public.seed_company_accounting(uuid) to authenticated;
