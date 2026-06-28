-- Spizy Menu - Cash & Bank statement reconciliation columns
-- Safe to run multiple times.

begin;

alter table if exists public.restaurant_account_transactions
  add column if not exists is_reconciled boolean not null default false,
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciled_by uuid,
  add column if not exists reconciliation_reference text,
  add column if not exists reconciliation_note text;

create index if not exists idx_restaurant_account_transactions_reconciliation
  on public.restaurant_account_transactions (restaurant_id, is_reconciled, transaction_date desc);

create index if not exists idx_restaurant_account_transactions_reconciled_at
  on public.restaurant_account_transactions (restaurant_id, reconciled_at desc)
  where is_reconciled = true;

-- Voided entries should remain visible for audit, but they should not stay marked as reconciled.
update public.restaurant_account_transactions
set
  is_reconciled = false,
  reconciled_at = null,
  reconciled_by = null,
  reconciliation_reference = null,
  reconciliation_note = null
where is_voided = true
  and is_reconciled = true;

commit;
