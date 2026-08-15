-- Impide facturas activas duplicadas: misma empresa + tercero + tipo + número
-- (las anuladas / cancelled quedan fuera del índice)

-- Limpia duplicados previos dejando la más antigua
with ranked as (
  select
    id,
    row_number() over (
      partition by company_id, partner_id, move_type, lower(trim(invoice_number))
      order by created_at asc nulls last, id asc
    ) as rn
  from public.invoices
  where state is distinct from 'cancelled'
)
update public.invoices i
set state = 'cancelled'
from ranked r
where i.id = r.id
  and r.rn > 1;

create unique index if not exists uq_invoices_active_partner_number
  on public.invoices (
    company_id,
    partner_id,
    move_type,
    (lower(trim(invoice_number)))
  )
  where state is distinct from 'cancelled';
