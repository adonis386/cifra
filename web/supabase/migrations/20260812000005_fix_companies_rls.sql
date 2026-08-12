-- Fix: crear empresa fallaba por RLS en RETURNING
-- (SELECT exige membership, pero el trigger owner corre AFTER INSERT)

-- Permitir ver empresas propias recién creadas (created_by) o como miembro
drop policy if exists "companies_select_member" on public.companies;
create policy "companies_select_member"
on public.companies for select
to authenticated
using (
  public.is_company_member(id)
  or created_by = auth.uid()
);

-- Insert: cualquier autenticado puede crear si se marca como creador
drop policy if exists "companies_insert_authenticated" on public.companies;
create policy "companies_insert_authenticated"
on public.companies for insert
to authenticated
with check (
  auth.uid() is not null
  and (created_by is null or created_by = auth.uid())
);

-- Trigger: usar created_by como fallback si auth.uid() viene vacío
create or replace function public.handle_new_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := coalesce(auth.uid(), new.created_by);
  if v_uid is null then
    raise exception 'No hay usuario autenticado para asignar owner';
  end if;

  insert into public.company_members (company_id, user_id, role)
  values (new.id, v_uid, 'owner')
  on conflict (company_id, user_id) do nothing;

  -- Asegura created_by
  if new.created_by is null then
    new.created_by := v_uid;
  end if;

  return new;
end;
$$;

-- BEFORE INSERT no puede devolver NEW modificado en AFTER; split:
-- membership en AFTER, y created_by default en BEFORE
create or replace function public.handle_new_company_before()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists on_company_created_before on public.companies;
create trigger on_company_created_before
before insert on public.companies
for each row execute function public.handle_new_company_before();

create or replace function public.handle_new_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := coalesce(auth.uid(), new.created_by);
  if v_uid is null then
    raise exception 'No hay usuario autenticado para asignar owner';
  end if;

  insert into public.company_members (company_id, user_id, role)
  values (new.id, v_uid, 'owner')
  on conflict (company_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_company_created on public.companies;
create trigger on_company_created
after insert on public.companies
for each row execute function public.handle_new_company();

-- Permitir que el trigger (security definer) y el creador inserten membership
-- sin exigir ser admin previo (imposible en empresa nueva)
drop policy if exists "members_insert_admin" on public.company_members;
create policy "members_insert_admin"
on public.company_members for insert
to authenticated
with check (
  public.can_admin_company(company_id)
  or (
    user_id = auth.uid()
    and role = 'owner'
    and exists (
      select 1 from public.companies c
      where c.id = company_id
        and c.created_by = auth.uid()
    )
  )
);
