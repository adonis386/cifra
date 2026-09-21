-- Cobros ligados a factura (para volver a borrador) + chatter estilo Odoo.

alter table public.payments
  add column if not exists invoice_id uuid references public.invoices (id) on delete set null;

create index if not exists idx_payments_invoice
  on public.payments (invoice_id);

create table if not exists public.chatter_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  res_model text not null,
  res_id uuid not null,
  subtype text not null default 'comment',
  body text not null default '',
  payment_id uuid references public.payments (id) on delete set null,
  author_name text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (subtype in ('comment', 'notification')),
  check (res_model in ('invoice', 'payment'))
);

create index if not exists idx_chatter_messages_doc
  on public.chatter_messages (company_id, res_model, res_id, created_at desc);

create table if not exists public.chatter_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  message_id uuid not null references public.chatter_messages (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete set null,
  filename text not null,
  content_type text,
  storage_path text not null,
  file_size integer not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_chatter_files_message
  on public.chatter_files (message_id);
create index if not exists idx_chatter_files_doc
  on public.chatter_files (company_id, payment_id);

alter table public.chatter_messages enable row level security;
alter table public.chatter_files enable row level security;

drop policy if exists "chatter_messages_select" on public.chatter_messages;
create policy "chatter_messages_select" on public.chatter_messages
for select to authenticated
using (public.is_company_member(company_id));

drop policy if exists "chatter_messages_write" on public.chatter_messages;
create policy "chatter_messages_write" on public.chatter_messages
for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

drop policy if exists "chatter_files_select" on public.chatter_files;
create policy "chatter_files_select" on public.chatter_files
for select to authenticated
using (public.is_company_member(company_id));

drop policy if exists "chatter_files_write" on public.chatter_files;
create policy "chatter_files_write" on public.chatter_files
for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

insert into storage.buckets (id, name, public)
values ('chatter', 'chatter', false)
on conflict (id) do update set public = false;

drop policy if exists "chatter_select_member" on storage.objects;
create policy "chatter_select_member"
on storage.objects for select to authenticated
using (
  bucket_id = 'chatter'
  and public.is_company_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists "chatter_insert_writer" on storage.objects;
create policy "chatter_insert_writer"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chatter'
  and public.can_write_company((storage.foldername(name))[1]::uuid)
);

drop policy if exists "chatter_update_writer" on storage.objects;
create policy "chatter_update_writer"
on storage.objects for update to authenticated
using (
  bucket_id = 'chatter'
  and public.can_write_company((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'chatter'
  and public.can_write_company((storage.foldername(name))[1]::uuid)
);

drop policy if exists "chatter_delete_writer" on storage.objects;
create policy "chatter_delete_writer"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chatter'
  and public.can_write_company((storage.foldername(name))[1]::uuid)
);
