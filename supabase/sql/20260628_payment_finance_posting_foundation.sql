-- Spizy Menu - Payment collections to finance posting foundation
-- Safe/idempotent. This records finance posting snapshots without moving money automatically.

create extension if not exists pgcrypto;

create table if not exists public.restaurant_payment_finance_postings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  business_date date not null default ((timezone('Asia/Dubai', now()))::date),
  currency text not null default 'AED',
  source text not null default 'orders_reconciliation',
  status text not null default 'posted',
  collected_amount numeric(12,2) not null default 0,
  pending_amount numeric(12,2) not null default 0,
  cod_pending_amount numeric(12,2) not null default 0,
  online_pending_amount numeric(12,2) not null default 0,
  refunded_amount numeric(12,2) not null default 0,
  cancelled_unpaid_amount numeric(12,2) not null default 0,
  net_collected_amount numeric(12,2) not null default 0,
  totals jsonb not null default '{}'::jsonb,
  gateway_breakdown jsonb not null default '[]'::jsonb,
  warning_items jsonb not null default '[]'::jsonb,
  notes text,
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restaurant_payment_finance_postings
  add column if not exists business_date date not null default ((timezone('Asia/Dubai', now()))::date),
  add column if not exists currency text not null default 'AED',
  add column if not exists source text not null default 'orders_reconciliation',
  add column if not exists status text not null default 'posted',
  add column if not exists collected_amount numeric(12,2) not null default 0,
  add column if not exists pending_amount numeric(12,2) not null default 0,
  add column if not exists cod_pending_amount numeric(12,2) not null default 0,
  add column if not exists online_pending_amount numeric(12,2) not null default 0,
  add column if not exists refunded_amount numeric(12,2) not null default 0,
  add column if not exists cancelled_unpaid_amount numeric(12,2) not null default 0,
  add column if not exists net_collected_amount numeric(12,2) not null default 0,
  add column if not exists totals jsonb not null default '{}'::jsonb,
  add column if not exists gateway_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists warning_items jsonb not null default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists posted_by uuid references auth.users(id) on delete set null,
  add column if not exists posted_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists restaurant_payment_finance_postings_restaurant_date_idx
  on public.restaurant_payment_finance_postings (restaurant_id, business_date desc, created_at desc);

create index if not exists restaurant_payment_finance_postings_status_idx
  on public.restaurant_payment_finance_postings (restaurant_id, status);

alter table public.restaurant_payment_finance_postings enable row level security;

drop policy if exists "Restaurant members can view finance posting snapshots"
  on public.restaurant_payment_finance_postings;

create policy "Restaurant members can view finance posting snapshots"
  on public.restaurant_payment_finance_postings
  for select
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_payment_finance_postings.restaurant_id
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

drop policy if exists "Restaurant members can insert finance posting snapshots"
  on public.restaurant_payment_finance_postings;

create policy "Restaurant members can insert finance posting snapshots"
  on public.restaurant_payment_finance_postings
  for insert
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_payment_finance_postings.restaurant_id
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

-- Optional helper view for future Finance / Day Closing screens.
create or replace view public.restaurant_payment_finance_posting_latest as
select distinct on (restaurant_id)
  *
from public.restaurant_payment_finance_postings
order by restaurant_id, created_at desc;
