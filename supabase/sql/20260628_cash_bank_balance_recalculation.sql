-- Spizy Menu - Cash & Bank Balance Recalculation / Integrity Audit
-- Purpose:
--   Rebuild restaurant finance account balances from non-voided ledger entries.
--   This is a safety/audit layer for Day Closing posting, reversals, manual corrections and future finance reporting.

create extension if not exists pgcrypto;

create table if not exists public.restaurant_cash_bank_balance_recalculations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  accounts_checked integer not null default 0,
  mismatched_accounts integer not null default 0,
  total_before numeric(14,2) not null default 0,
  total_after numeric(14,2) not null default 0,
  total_difference numeric(14,2) not null default 0,
  account_results jsonb not null default '[]'::jsonb,
  notes text,
  recalculated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.restaurant_cash_bank_balance_recalculations
  add column if not exists accounts_checked integer not null default 0,
  add column if not exists mismatched_accounts integer not null default 0,
  add column if not exists total_before numeric(14,2) not null default 0,
  add column if not exists total_after numeric(14,2) not null default 0,
  add column if not exists total_difference numeric(14,2) not null default 0,
  add column if not exists account_results jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists recalculated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_cash_bank_balance_recalculations_restaurant_created
  on public.restaurant_cash_bank_balance_recalculations (restaurant_id, created_at desc);

alter table public.restaurant_cash_bank_balance_recalculations enable row level security;

drop policy if exists "Restaurant members can view cash bank balance recalculations"
  on public.restaurant_cash_bank_balance_recalculations;
drop policy if exists "Restaurant managers can insert cash bank balance recalculations"
  on public.restaurant_cash_bank_balance_recalculations;

create policy "Restaurant members can view cash bank balance recalculations"
  on public.restaurant_cash_bank_balance_recalculations
  for select
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_cash_bank_balance_recalculations.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('super_admin', 'partner_admin')
    )
  );

create policy "Restaurant managers can insert cash bank balance recalculations"
  on public.restaurant_cash_bank_balance_recalculations
  for insert
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_cash_bank_balance_recalculations.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('super_admin', 'partner_admin')
    )
  );

-- Helper indexes for fast recalculation on larger ledgers.
create index if not exists idx_restaurant_account_transactions_balance_recalc
  on public.restaurant_account_transactions (restaurant_id, account_id, is_voided, transaction_type);

create index if not exists idx_restaurant_finance_accounts_restaurant_active
  on public.restaurant_finance_accounts (restaurant_id, is_active);
