-- Medio de cobro/pago (divisas, zelle, transferencia, pago móvil, débito, crédito).
alter table public.payments
  add column if not exists payment_method text;

create index if not exists idx_payments_method
  on public.payments (company_id, payment_method);
