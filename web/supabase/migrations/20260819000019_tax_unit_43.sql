-- Permite que contador/admin guarde UT. Actualiza la UT global a 43 Bs (SNAT/2025/000048).

drop policy if exists "tax_units_write" on public.tax_units;
create policy "tax_units_write" on public.tax_units for all to authenticated
using (company_id is not null and public.can_write_company(company_id))
with check (company_id is not null and public.can_write_company(company_id));

update public.tax_units
set amount = 43, name = 'UT SENIAT 2025'
where company_id is null;

insert into public.tax_units (company_id, name, amount, date_from)
select null, 'UT SENIAT 2025', 43, date '2025-01-01'
where not exists (select 1 from public.tax_units where company_id is null);
