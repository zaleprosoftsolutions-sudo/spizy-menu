-- Spizy Customer Loyalty Tiers / Membership foundation
-- Run this once in Supabase SQL Editor.

create table if not exists public.restaurant_loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  tier_name text not null,
  tier_label text,
  tier_rank integer not null default 1,
  tier_color text not null default '#f97316',
  required_spend numeric(12,2) not null default 0,
  required_orders integer not null default 0,
  required_points numeric(12,2) not null default 0,
  reward_multiplier numeric(10,2) not null default 1,
  discount_percent numeric(6,2) not null default 0,
  perks text,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists restaurant_loyalty_tiers_restaurant_idx
on public.restaurant_loyalty_tiers (restaurant_id, is_deleted, is_active, tier_rank);

create unique index if not exists restaurant_loyalty_tiers_unique_active_name
on public.restaurant_loyalty_tiers (restaurant_id, lower(trim(tier_name)))
where is_deleted = false;

alter table public.restaurant_loyalty_tiers enable row level security;

drop policy if exists "Loyalty tiers member select" on public.restaurant_loyalty_tiers;
drop policy if exists "Loyalty tiers member insert" on public.restaurant_loyalty_tiers;
drop policy if exists "Loyalty tiers member update" on public.restaurant_loyalty_tiers;
drop policy if exists "Loyalty tiers member delete" on public.restaurant_loyalty_tiers;

create policy "Loyalty tiers member select"
on public.restaurant_loyalty_tiers
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Loyalty tiers member insert"
on public.restaurant_loyalty_tiers
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Loyalty tiers member update"
on public.restaurant_loyalty_tiers
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

create policy "Loyalty tiers member delete"
on public.restaurant_loyalty_tiers
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create or replace function public.get_customer_loyalty_tier(
  p_restaurant_id uuid,
  p_customer_phone text
)
returns table (
  tier_id uuid,
  tier_name text,
  tier_label text,
  tier_color text,
  tier_rank integer,
  discount_percent numeric,
  reward_multiplier numeric,
  perks text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.restaurant_customers%rowtype;
begin
  if p_restaurant_id is null or coalesce(trim(p_customer_phone), '') = '' then
    return;
  end if;

  select *
  into v_customer
  from public.restaurant_customers
  where restaurant_id = p_restaurant_id
    and customer_phone = trim(p_customer_phone)
  limit 1;

  if not found then
    return;
  end if;

  return query
  select
    rlt.id,
    rlt.tier_name,
    rlt.tier_label,
    rlt.tier_color,
    rlt.tier_rank,
    rlt.discount_percent,
    rlt.reward_multiplier,
    rlt.perks
  from public.restaurant_loyalty_tiers rlt
  where rlt.restaurant_id = p_restaurant_id
    and rlt.is_active = true
    and rlt.is_deleted = false
    and coalesce(v_customer.total_spend, 0) >= coalesce(rlt.required_spend, 0)
    and coalesce(v_customer.total_orders, 0) >= coalesce(rlt.required_orders, 0)
    and coalesce(v_customer.reward_points, 0) >= coalesce(rlt.required_points, 0)
  order by rlt.tier_rank desc, rlt.required_spend desc, rlt.required_orders desc, rlt.required_points desc
  limit 1;
end;
$$;
