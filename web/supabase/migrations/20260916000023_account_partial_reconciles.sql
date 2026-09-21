-- Conciliación de líneas de asiento (account.partial.reconcile) y residual real en CxC/CxP.

create table if not exists public.account_partial_reconciles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  debit_move_line_id uuid not null references public.account_move_lines (id) on delete cascade,
  credit_move_line_id uuid not null references public.account_move_lines (id) on delete cascade,
  amount numeric(18,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  check (debit_move_line_id <> credit_move_line_id)
);

create index if not exists idx_partial_reconciles_company
  on public.account_partial_reconciles (company_id);
create index if not exists idx_partial_reconciles_debit
  on public.account_partial_reconciles (debit_move_line_id);
create index if not exists idx_partial_reconciles_credit
  on public.account_partial_reconciles (credit_move_line_id);

alter table public.account_move_lines
  add column if not exists reconciled boolean not null default false,
  add column if not exists full_reconcile_id uuid;

create index if not exists idx_bank_statement_lines_open
  on public.bank_statement_lines (company_id)
  where is_reconciled = false;

create index if not exists idx_bank_statement_lines_move_line
  on public.bank_statement_lines (move_line_id)
  where move_line_id is not null;

alter table public.account_partial_reconciles enable row level security;

drop policy if exists "partial_reconciles_select" on public.account_partial_reconciles;
create policy "partial_reconciles_select" on public.account_partial_reconciles
for select to authenticated
using (public.is_company_member(company_id));

drop policy if exists "partial_reconciles_write" on public.account_partial_reconciles;
create policy "partial_reconciles_write" on public.account_partial_reconciles
for all to authenticated
using (public.can_write_company(company_id))
with check (public.can_write_company(company_id));

-- Residual de líneas de factura = saldo actual de la factura (antes no bajaba al pagar).
-- El alias del UPDATE no puede usarse en un JOIN del FROM (PostgreSQL 42P01).
update public.account_move_lines l
set
  amount_residual = greatest(i.amount_residual, 0),
  reconciled = i.amount_residual <= 0.009
from public.invoices i,
     public.account_accounts a
where l.invoice_id = i.id
  and l.company_id = i.company_id
  and a.id = l.account_id
  and a.reconcile = true
  and i.state <> 'cancelled';

-- Líneas de cobro/pago ya aplicadas: residual 0. No se inventan partials históricos.
update public.account_move_lines l
set
  amount_residual = 0,
  reconciled = true
from public.account_moves m,
     public.account_accounts a
where l.move_id = m.id
  and l.company_id = m.company_id
  and a.id = l.account_id
  and m.payment_id is not null
  and l.invoice_id is null
  and a.reconcile = true;

-- Reconstruct 1:1 when a single allocation matches a single invoice line of the same amount.
insert into public.account_partial_reconciles (
  company_id, debit_move_line_id, credit_move_line_id, amount
)
select distinct on (a.id)
  a.company_id,
  case when inv.debit > inv.credit then inv.id else pay.id end,
  case when inv.debit > inv.credit then pay.id else inv.id end,
  a.amount
from public.payment_allocations a
join public.payments p on p.id = a.payment_id
join public.account_moves pm on pm.payment_id = p.id
join public.account_move_lines pay
  on pay.move_id = pm.id
 and pay.company_id = a.company_id
 and pay.invoice_id is null
join public.account_accounts pa on pa.id = pay.account_id and pa.reconcile = true
join public.account_move_lines inv
  on inv.invoice_id = a.invoice_id
 and inv.company_id = a.company_id
 and inv.account_id = pay.account_id
where a.amount > 0.009
  and abs(a.amount - greatest(pay.debit, pay.credit)) < 0.02
  and abs(a.amount - greatest(inv.debit, inv.credit)) < 0.02
  and (pay.debit > pay.credit) <> (inv.debit > inv.credit)
  and not exists (
    select 1 from public.payment_allocations a2
    where a2.payment_id = a.payment_id and a2.id <> a.id
  )
  and not exists (
    select 1 from public.account_partial_reconciles pr
    where pr.debit_move_line_id in (pay.id, inv.id)
       or pr.credit_move_line_id in (pay.id, inv.id)
  )
order by a.id;
