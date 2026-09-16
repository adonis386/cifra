-- Ficha de contacto tipo Odoo VE: identidad SENIAT, dirección y datos de contacto.

alter table public.partners
  add column if not exists seniat_person_type text,
  add column if not exists id_type text,
  add column if not exists id_number text,
  add column if not exists street text,
  add column if not exists street2 text,
  add column if not exists city text,
  add column if not exists state_name text,
  add column if not exists zip text,
  add column if not exists municipality text,
  add column if not exists parish text,
  add column if not exists country text,
  add column if not exists job_title text,
  add column if not exists mobile text,
  add column if not exists website text,
  add column if not exists honorific text,
  add column if not exists lang text,
  add column if not exists timezone text,
  add column if not exists tags text;

update public.partners
set seniat_person_type = case
  when person_type = 'natural' then 'PNRE'
  else 'PJDO'
end
where seniat_person_type is null;

update public.partners
set country = coalesce(nullif(trim(country), ''), 'Venezuela')
where country is null or trim(country) = '';

update public.partners
set lang = coalesce(nullif(trim(lang), ''), 'es_VE')
where lang is null or trim(lang) = '';

update public.partners
set timezone = coalesce(nullif(trim(timezone), ''), 'America/Caracas')
where timezone is null or trim(timezone) = '';
