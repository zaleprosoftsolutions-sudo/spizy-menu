-- Spizy Menu - Day Closing / Z Report foundation
-- Run this file in Supabase SQL Editor.

create table if not exists public.restaurant_day_closings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  closing_date date not null,
  status text not null default 'draft' check (status in ('draft', 'closed', 'reopened')),
  opening_cash numeric(12, 2) not null default 0,
  cash_sales numeric(12, 2) not null default 0,
  cash_collections numeric(12, 2) not null default 0,
  cash_expenses numeric(12, 2) not null default 0,
  expected_cash numeric(12, 2) not null default 0,
  counted_cash numeric(12, 2) not null default 0,
  cash_difference numeric(12, 2) not null default 0,
  card_total numeric(12, 2) not null default 0,
  online_total numeric(12, 2) not null default 0,
  upi_total numeric(12, 2) not null default 0,
  cod_total numeric(12, 2) not null default 0,
  card_settlement numeric(12, 2) not null default 0,
  online_settlement numeric(12, 2) not null default 0,
  total_sales numeric(12, 2) not null default 0,
  total_collections numeric(12, 2) not null default 0,
  total_expenses numeric(12, 2) not null default 0,
  total_orders integer not null default 0,
  notes text,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, closing_date)
);

create index if not exists restaurant_day_closings_restaurant_date_idx
on public.restaurant_day_closings (restaurant_id, closing_date desc);

alter table public.restaurant_day_closings enable row level security;

drop policy if exists "Restaurant day closings select access" on public.restaurant_day_closings;
drop policy if exists "Restaurant day closings insert access" on public.restaurant_day_closings;
drop policy if exists "Restaurant day closings update access" on public.restaurant_day_closings;
drop policy if exists "Restaurant day closings delete access" on public.restaurant_day_closings;

create policy "Restaurant day closings select access"
on public.restaurant_day_closings
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant day closings insert access"
on public.restaurant_day_closings
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant day closings update access"
on public.restaurant_day_closings
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

create policy "Restaurant day closings delete access"
on public.restaurant_day_closings
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create or replace function public.set_restaurant_day_closings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_restaurant_day_closings_updated_at on public.restaurant_day_closings;

create trigger set_restaurant_day_closings_updated_at
before update on public.restaurant_day_closings
for each row execute function public.set_restaurant_day_closings_updated_at();
