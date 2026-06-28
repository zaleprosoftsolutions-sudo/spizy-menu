-- Spizy Menu - Inventory -> Recipe Costing -> COGS foundation
-- Run this in Supabase SQL Editor after applying the ZIP.

create extension if not exists pgcrypto;

create table if not exists public.restaurant_recipe_cost_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  ingredient_name text not null,
  unit text not null default 'unit',
  quantity_per_item numeric(14, 4) not null default 0,
  cost_per_unit numeric(14, 4) not null default 0,
  wastage_percent numeric(8, 2) not null default 0,
  notes text,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_restaurant_recipe_cost_items_restaurant
  on public.restaurant_recipe_cost_items(restaurant_id);

create index if not exists idx_restaurant_recipe_cost_items_menu_item
  on public.restaurant_recipe_cost_items(menu_item_id)
  where is_deleted = false;

create table if not exists public.restaurant_cogs_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  period_key text not null,
  period_start date not null,
  period_end date not null,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  item_name text not null,
  category_name text,
  quantity_sold numeric(14, 3) not null default 0,
  net_sales numeric(14, 2) not null default 0,
  recipe_cost_per_item numeric(14, 4) not null default 0,
  estimated_cogs numeric(14, 2) not null default 0,
  gross_profit numeric(14, 2) not null default 0,
  gross_margin_percent numeric(8, 2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_cogs_snapshots_unique_item unique (restaurant_id, period_key, menu_item_id)
);

create index if not exists idx_restaurant_cogs_snapshots_restaurant_period
  on public.restaurant_cogs_snapshots(restaurant_id, period_key);

create or replace function public.set_restaurant_recipe_cost_items_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_restaurant_recipe_cost_items_updated_at on public.restaurant_recipe_cost_items;
create trigger trg_restaurant_recipe_cost_items_updated_at
before update on public.restaurant_recipe_cost_items
for each row execute function public.set_restaurant_recipe_cost_items_updated_at();

create or replace function public.set_restaurant_cogs_snapshots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_restaurant_cogs_snapshots_updated_at on public.restaurant_cogs_snapshots;
create trigger trg_restaurant_cogs_snapshots_updated_at
before update on public.restaurant_cogs_snapshots
for each row execute function public.set_restaurant_cogs_snapshots_updated_at();

alter table public.restaurant_recipe_cost_items enable row level security;
alter table public.restaurant_cogs_snapshots enable row level security;

-- Owners/admins/managers can manage recipe costing.
-- Cashier/waiter/staff can read COGS if their login email is active in restaurant_staffs.
drop policy if exists "restaurant members can read recipe cost items" on public.restaurant_recipe_cost_items;
create policy "restaurant members can read recipe cost items"
on public.restaurant_recipe_cost_items
for select
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_recipe_cost_items.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin', 'cashier', 'waiter', 'staff')
  )
  or exists (
    select 1
    from public.restaurant_staffs rs
    where rs.restaurant_id = restaurant_recipe_cost_items.restaurant_id
      and rs.is_deleted = false
      and rs.is_active = true
      and lower(rs.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "restaurant admins can insert recipe cost items" on public.restaurant_recipe_cost_items;
create policy "restaurant admins can insert recipe cost items"
on public.restaurant_recipe_cost_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_recipe_cost_items.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

drop policy if exists "restaurant admins can update recipe cost items" on public.restaurant_recipe_cost_items;
create policy "restaurant admins can update recipe cost items"
on public.restaurant_recipe_cost_items
for update
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_recipe_cost_items.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
)
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_recipe_cost_items.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

drop policy if exists "restaurant admins can delete recipe cost items" on public.restaurant_recipe_cost_items;
create policy "restaurant admins can delete recipe cost items"
on public.restaurant_recipe_cost_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_recipe_cost_items.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

-- COGS snapshot policies.
drop policy if exists "restaurant members can read cogs snapshots" on public.restaurant_cogs_snapshots;
create policy "restaurant members can read cogs snapshots"
on public.restaurant_cogs_snapshots
for select
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_cogs_snapshots.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin', 'cashier', 'waiter', 'staff')
  )
  or exists (
    select 1
    from public.restaurant_staffs rs
    where rs.restaurant_id = restaurant_cogs_snapshots.restaurant_id
      and rs.is_deleted = false
      and rs.is_active = true
      and lower(rs.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "restaurant admins can insert cogs snapshots" on public.restaurant_cogs_snapshots;
create policy "restaurant admins can insert cogs snapshots"
on public.restaurant_cogs_snapshots
for insert
to authenticated
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_cogs_snapshots.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

drop policy if exists "restaurant admins can update cogs snapshots" on public.restaurant_cogs_snapshots;
create policy "restaurant admins can update cogs snapshots"
on public.restaurant_cogs_snapshots
for update
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_cogs_snapshots.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
)
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_cogs_snapshots.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);
