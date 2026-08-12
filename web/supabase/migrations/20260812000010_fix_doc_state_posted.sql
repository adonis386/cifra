-- Fix doc_state misuse: payments defaulted to invalid 'posted'
-- Valid: draft | confirmed | done | cancelled

alter table public.payments
  alter column state set default 'confirmed';
