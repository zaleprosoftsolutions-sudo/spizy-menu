-- Spizy Menu - Day Closing Payment Snapshot Foundation
-- Purpose:
--   Store one safe payment collection snapshot per restaurant/day.
--   This connects Orders payment reconciliation with future Day Closing / Z Report / Cash & Bank.
--   This migration does not move money and does not use Spizy-owned gateway credentials.

create extension if not exists pgcrypto;

create table if not exists public.restaurant_day_closing_payment_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  closing_date date not null,
  currency text not null default 'AED',

  order_count integer not null default 0,
  paid_order_count integer not null default 0,
  pending_order_count integer not null default 0,
  cancelled_order_count integer not null default 0,

  sales_total numeric(14,2) not null default 0,
  collected_total numeric(14,2) not null default 0,
  cash_collected numeric(14,2) not null default 0,
  card_collected numeric(14,2) not null default 0,
  cod_collected numeric(14,2) not null default 0,
  online_collected numeric(14,2) not null default 0,

  cod_pending numeric(14,2) not null default 0,
  online_pending numeric(14,2) not null default 0,
  unpaid_total numeric(14,2) not null default 0,
  cancelled_unpaid_total numeric(14,2) not null default 0,

  refund_total numeric(14,2) not null default 0,
  refund_count integer not null default 0,
  net_collected numeric(14,2) not null default 0,

  gateway_breakdown jsonb not null default '{}'::jsonb,
  issue_breakdown jsonb not null default '{}'::jsonb,
  raw_summary jsonb not null default '{}'::jsonb,

  posted_to_cash_bank boolean not null default false,
  posted_to_day_closing boolean not null default false,
  posting_status text not null default 'draft',
  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint restaurant_day_closing_payment_snapshots_unique_day
    unique (restaurant_id, closing_date)
);

alter table public.restaurant_day_closing_payment_snapshots
  add column if not exists currency text not null default 'AED',
  add column if not exists order_count integer not null default 0,
  add column if not exists paid_order_count integer not null default 0,
  add column if not exists pending_order_count integer not null default 0,
  add column if not exists cancelled_order_count integer not null default 0,
  add column if not exists sales_total numeric(14,2) not null default 0,
  add column if not exists collected_total numeric(14,2) not null default 0,
  add column if not exists cash_collected numeric(14,2) not null default 0,
  add column if not exists card_collected numeric(14,2) not null default 0,
  add column if not exists cod_collected numeric(14,2) not null default 0,
  add column if not exists online_collected numeric(14,2) not null default 0,
  add column if not exists cod_pending numeric(14,2) not null default 0,
  add column if not exists online_pending numeric(14,2) not null default 0,
  add column if not exists unpaid_total numeric(14,2) not null default 0,
  add column if not exists cancelled_unpaid_total numeric(14,2) not null default 0,
  add column if not exists refund_total numeric(14,2) not null default 0,
  add column if not exists refund_count integer not null default 0,
  add column if not exists net_collected numeric(14,2) not null default 0,
  add column if not exists gateway_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists issue_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists raw_summary jsonb not null default '{}'::jsonb,
  add column if not exists posted_to_cash_bank boolean not null default false,
  add column if not exists posted_to_day_closing boolean not null default false,
  add column if not exists posting_status text not null default 'draft',
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_day_closing_payment_snapshots_restaurant_date
  on public.restaurant_day_closing_payment_snapshots (restaurant_id, closing_date desc);

create index if not exists idx_day_closing_payment_snapshots_posting_status
  on public.restaurant_day_closing_payment_snapshots (restaurant_id, posting_status);

alter table public.restaurant_day_closing_payment_snapshots enable row level security;

-- Drop and recreate policies to keep this migration repeat-safe.
drop policy if exists "Restaurant members can view day closing payment snapshots"
  on public.restaurant_day_closing_payment_snapshots;
drop policy if exists "Restaurant members can insert day closing payment snapshots"
  on public.restaurant_day_closing_payment_snapshots;
drop policy if exists "Restaurant members can update day closing payment snapshots"
  on public.restaurant_day_closing_payment_snapshots;

create policy "Restaurant members can view day closing payment snapshots"
  on public.restaurant_day_closing_payment_snapshots
  for select
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_day_closing_payment_snapshots.restaurant_id
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

create policy "Restaurant members can insert day closing payment snapshots"
  on public.restaurant_day_closing_payment_snapshots
  for insert
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_day_closing_payment_snapshots.restaurant_id
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

create policy "Restaurant members can update day closing payment snapshots"
  on public.restaurant_day_closing_payment_snapshots
  for update
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_day_closing_payment_snapshots.restaurant_id
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
      where rm.restaurant_id = restaurant_day_closing_payment_snapshots.restaurant_id
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

-- Optional timestamp trigger, only if your project already has the helper.
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'set_updated_at'
  ) then
    drop trigger if exists set_restaurant_day_closing_payment_snapshots_updated_at
      on public.restaurant_day_closing_payment_snapshots;

    create trigger set_restaurant_day_closing_payment_snapshots_updated_at
      before update on public.restaurant_day_closing_payment_snapshots
      for each row
      execute function public.set_updated_at();
  end if;
end $$;
