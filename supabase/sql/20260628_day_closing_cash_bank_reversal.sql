-- Spizy Menu - Day Closing Cash & Bank Posting Reversal
-- Purpose:
--   Add safe audited reversal fields for Day Closing postings already sent to Cash & Bank.
--   This does not delete ledger entries. Reversal voids the original ledger entries and marks the posting as reversed.

alter table if exists public.restaurant_account_transactions
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists reference_type text,
  add column if not exists reference_id uuid,
  add column if not exists external_reference text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists is_voided boolean not null default false,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;

alter table if exists public.restaurant_day_closing_cash_bank_postings
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users(id) on delete set null,
  add column if not exists reversal_reason text,
  add column if not exists reversed_ledger_entry_ids uuid[] not null default '{}'::uuid[];

alter table if exists public.restaurant_day_closings
  add column if not exists cash_bank_reversed_at timestamptz,
  add column if not exists cash_bank_reversed_by uuid references auth.users(id) on delete set null;

alter table if exists public.restaurant_day_closing_payment_snapshots
  add column if not exists posted_to_cash_bank boolean not null default false,
  add column if not exists posting_status text not null default 'not_posted',
  add column if not exists cash_bank_reversed_at timestamptz,
  add column if not exists cash_bank_reversed_by uuid references auth.users(id) on delete set null;

create index if not exists idx_restaurant_account_transactions_voided_source
  on public.restaurant_account_transactions (restaurant_id, is_voided, source_type, source_id);

create index if not exists idx_day_closing_cash_bank_postings_reversed
  on public.restaurant_day_closing_cash_bank_postings (restaurant_id, status, reversed_at desc);
