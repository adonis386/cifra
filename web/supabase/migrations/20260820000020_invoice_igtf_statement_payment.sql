-- IGTF en factura (impuesto al lado del documento, no suma al total)
-- y vínculo extracto bancario ↔ pago para conciliar.

alter table public.invoices
  add column if not exists igtf_rate numeric(7,4) not null default 0,
  add column if not exists amount_igtf numeric(18,2) not null default 0;

alter table public.bank_statement_lines
  add column if not exists payment_id uuid references public.payments (id) on delete set null;

create index if not exists idx_bank_statement_lines_payment
  on public.bank_statement_lines (payment_id)
  where payment_id is not null;
