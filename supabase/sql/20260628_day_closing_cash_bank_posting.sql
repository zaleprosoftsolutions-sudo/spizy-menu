-- Spizy Menu - Day Closing to Cash & Bank Posting Foundation
-- Purpose:
--   Connect Day Closing payment snapshots to Cash & Bank ledger entries.
--   This records restaurant-owned collections only. It does not move money and does not use any Spizy-owned gateway account.

create extension if not exists pgcrypto;

alter table if exists public.restaurant_account_transactions
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists reference_type text,
  add column if not exists reference_id uuid,
  add column if not exists external_reference text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_restaurant_account_transactions_source
  on public.restaurant_account_transactions (restaurant_id, source_type, source_id);

create index if not exists idx_restaurant_account_transactions_reference
  on public.restaurant_account_transactions (restaurant_id, reference_type, reference_id);

alter table if exists public.restaurant_day_closings
  add column if not exists cash_bank_posting_id uuid,
  add column if not exists cash_bank_posting_status text not null default 'not_posted',
  add column if not exists cash_bank_posted_at timestamptz,
  add column if not exists cash_bank_posted_by uuid references auth.users(id) on delete set null;

alter table if exists public.restaurant_day_closing_payment_snapshots
  add column if not exists cash_bank_posting_id uuid,
  add column if not exists cash_bank_posted_at timestamptz,
  add column if not exists cash_bank_posted_by uuid references auth.users(id) on delete set null;

create table if not exists public.restaurant_day_closing_cash_bank_postings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  closing_date date not null,
  day_closing_id uuid,
  payment_snapshot_id uuid,
  currency text not null default 'AED',

  cash_amount numeric(14,2) not null default 0,
  card_amount numeric(14,2) not null default 0,
  online_amount numeric(14,2) not null default 0,
  refund_amount numeric(14,2) not null default 0,
  cash_difference_amount numeric(14,2) not null default 0,

  total_posted_in numeric(14,2) not null default 0,
  total_posted_out numeric(14,2) not null default 0,
  net_posted numeric(14,2) not null default 0,

  cash_account_id uuid,
  card_account_id uuid,
  online_gateway_account_id uuid,
  ledger_entry_ids uuid[] not null default '{}'::uuid[],

  status text not null default 'posted',
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,

  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint restaurant_day_closing_cash_bank_postings_unique_day
    unique (restaurant_id, closing_date)
);

alter table public.restaurant_day_closing_cash_bank_postings
  add column if not exists day_closing_id uuid,
  add column if not exists payment_snapshot_id uuid,
  add column if not exists currency text not null default 'AED',
  add column if not exists cash_amount numeric(14,2) not null default 0,
  add column if not exists card_amount numeric(14,2) not null default 0,
  add column if not exists online_amount numeric(14,2) not null default 0,
  add column if not exists refund_amount numeric(14,2) not null default 0,
  add column if not exists cash_difference_amount numeric(14,2) not null default 0,
  add column if not exists total_posted_in numeric(14,2) not null default 0,
  add column if not exists total_posted_out numeric(14,2) not null default 0,
  add column if not exists net_posted numeric(14,2) not null default 0,
  add column if not exists cash_account_id uuid,
  add column if not exists card_account_id uuid,
  add column if not exists online_gateway_account_id uuid,
  add column if not exists ledger_entry_ids uuid[] not null default '{}'::uuid[],
  add column if not exists status text not null default 'posted',
  add column if not exists notes text,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb,
  add column if not exists posted_by uuid references auth.users(id) on delete set null,
  add column if not exists posted_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_day_closing_cash_bank_postings_restaurant_date
  on public.restaurant_day_closing_cash_bank_postings (restaurant_id, closing_date desc);

create index if not exists idx_day_closing_cash_bank_postings_status
  on public.restaurant_day_closing_cash_bank_postings (restaurant_id, status);

alter table public.restaurant_day_closing_cash_bank_postings enable row level security;

drop policy if exists "Restaurant members can view day closing cash bank postings"
  on public.restaurant_day_closing_cash_bank_postings;
drop policy if exists "Restaurant members can insert day closing cash bank postings"
  on public.restaurant_day_closing_cash_bank_postings;
drop policy if exists "Restaurant members can update day closing cash bank postings"
  on public.restaurant_day_closing_cash_bank_postings;

create policy "Restaurant members can view day closing cash bank postings"
  on public.restaurant_day_closing_cash_bank_postings
  for select
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_day_closing_cash_bank_postings.restaurant_id
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

create policy "Restaurant members can insert day closing cash bank postings"
  on public.restaurant_day_closing_cash_bank_postings
  for insert
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_day_closing_cash_bank_postings.restaurant_id
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

create policy "Restaurant members can update day closing cash bank postings"
  on public.restaurant_day_closing_cash_bank_postings
  for update
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_day_closing_cash_bank_postings.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role::text in ('super_admin', 'partner_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_day_closing_cash_bank_postings.restaurant_id
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

do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists set_day_closing_cash_bank_postings_updated_at
      on public.restaurant_day_closing_cash_bank_postings;

    create trigger set_day_closing_cash_bank_postings_updated_at
      before update on public.restaurant_day_closing_cash_bank_postings
      for each row
      execute function public.set_updated_at();
  end if;
end $$;
