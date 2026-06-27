-- Spizy Gift Vouchers / Store Credit foundation
-- Run in Supabase SQL Editor.

create table if not exists public.restaurant_gift_vouchers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title text not null default 'Gift Voucher',
  voucher_code text not null,
  customer_name text,
  customer_phone text,
  amount numeric(12,2) not null default 0,
  balance_amount numeric(12,2) not null default 0,
  currency text not null default 'AED',
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired', 'cancelled')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  notes text,
  is_deleted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists restaurant_gift_vouchers_code_unique_idx
on public.restaurant_gift_vouchers (restaurant_id, lower(voucher_code))
where is_deleted = false;

create index if not exists restaurant_gift_vouchers_restaurant_status_idx
on public.restaurant_gift_vouchers (restaurant_id, status, is_deleted);

create table if not exists public.restaurant_gift_voucher_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  voucher_id uuid not null references public.restaurant_gift_vouchers(id) on delete cascade,
  action_type text not null check (action_type in ('issue', 'redeem', 'top_up', 'cancel', 'adjust')),
  amount numeric(12,2) not null default 0,
  balance_after numeric(12,2) not null default 0,
  reference_order_id uuid references public.restaurant_orders(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists restaurant_gift_voucher_transactions_restaurant_idx
on public.restaurant_gift_voucher_transactions (restaurant_id, created_at desc);

create index if not exists restaurant_gift_voucher_transactions_voucher_idx
on public.restaurant_gift_voucher_transactions (voucher_id, created_at desc);

alter table public.restaurant_gift_vouchers enable row level security;
alter table public.restaurant_gift_voucher_transactions enable row level security;

drop policy if exists "Gift vouchers member select" on public.restaurant_gift_vouchers;
drop policy if exists "Gift vouchers member insert" on public.restaurant_gift_vouchers;
drop policy if exists "Gift vouchers member update" on public.restaurant_gift_vouchers;
drop policy if exists "Gift voucher transactions member select" on public.restaurant_gift_voucher_transactions;
drop policy if exists "Gift voucher transactions member insert" on public.restaurant_gift_voucher_transactions;

create policy "Gift vouchers member select"
on public.restaurant_gift_vouchers
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Gift vouchers member insert"
on public.restaurant_gift_vouchers
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Gift vouchers member update"
on public.restaurant_gift_vouchers
for update
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
)
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Gift voucher transactions member select"
on public.restaurant_gift_voucher_transactions
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Gift voucher transactions member insert"
on public.restaurant_gift_voucher_transactions
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

-- Optional helper columns for future order-level gift voucher redemption.
alter table public.restaurant_orders
add column if not exists gift_voucher_id uuid references public.restaurant_gift_vouchers(id) on delete set null;

alter table public.restaurant_orders
add column if not exists gift_voucher_code text;

alter table public.restaurant_orders
add column if not exists gift_voucher_discount_amount numeric(12,2) not null default 0;
