-- Fix logos: bucket público + upload por writers + lectura pública para PDF/img

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;

-- Lectura pública (membrete PDF / <img> sin sesión en algunos contextos)
drop policy if exists "logos_public_read" on storage.objects;
create policy "logos_public_read"
on storage.objects for select
to public
using (bucket_id = 'logos');

drop policy if exists "logos_select_member" on storage.objects;
create policy "logos_select_member"
on storage.objects for select to authenticated
using (bucket_id = 'logos');

-- Escritura: owner/admin/accountant (can_write), no solo admin
drop policy if exists "logos_write_admin" on storage.objects;
drop policy if exists "logos_insert_writer" on storage.objects;
drop policy if exists "logos_update_writer" on storage.objects;
drop policy if exists "logos_delete_admin" on storage.objects;
drop policy if exists "logos_delete_writer" on storage.objects;

create policy "logos_insert_writer"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'logos'
  and public.can_write_company((storage.foldername(name))[1]::uuid)
);

create policy "logos_update_writer"
on storage.objects for update to authenticated
using (
  bucket_id = 'logos'
  and public.can_write_company((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'logos'
  and public.can_write_company((storage.foldername(name))[1]::uuid)
);

create policy "logos_delete_writer"
on storage.objects for delete to authenticated
using (
  bucket_id = 'logos'
  and public.can_write_company((storage.foldername(name))[1]::uuid)
);
