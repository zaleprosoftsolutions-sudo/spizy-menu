-- Spizy Menu - Combo Deals / Meal Bundles foundation
-- Run in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.restaurant_combo_deals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  combo_name text not null,
  combo_code text not null,
  description text,
  bundle_price numeric(12,2) not null default 0,
  discount_percentage numeric(6,2),
  discount_amount numeric(12,2),
  start_at timestamptz,
  end_at timestamptz,
  is_active boolean not null default true,
  is_public boolean not null default true,
  is_deleted boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_combo_deals_price_check check (bundle_price >= 0),
  constraint restaurant_combo_deals_discount_percentage_check check (discount_percentage is null or discount_percentage >= 0),
  constraint restaurant_combo_deals_discount_amount_check check (discount_amount is null or discount_amount >= 0),
  constraint restaurant_combo_deals_unique_code unique (restaurant_id, combo_code)
);

create table if not exists public.restaurant_combo_deal_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  combo_id uuid not null references public.restaurant_combo_deals(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  variation_id uuid references public.menu_item_variations(id) on delete set null,
  quantity numeric(12,3) not null default 1,
  group_name text,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint restaurant_combo_deal_items_quantity_check check (quantity > 0)
);

create index if not exists restaurant_combo_deals_restaurant_idx
on public.restaurant_combo_deals (restaurant_id, is_deleted, is_active, is_public);

create index if not exists restaurant_combo_deals_dates_idx
on public.restaurant_combo_deals (start_at, end_at);

create index if not exists restaurant_combo_deal_items_combo_idx
on public.restaurant_combo_deal_items (combo_id, sort_order);

alter table public.restaurant_combo_deals enable row level security;
alter table public.restaurant_combo_deal_items enable row level security;

-- Owner / staff / super admin access

drop policy if exists "Combo deals member select" on public.restaurant_combo_deals;
create policy "Combo deals member select"
on public.restaurant_combo_deals
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Combo deals public select" on public.restaurant_combo_deals;
create policy "Combo deals public select"
on public.restaurant_combo_deals
for select
to anon, authenticated
using (
  is_deleted = false
  and is_active = true
  and is_public = true
  and (start_at is null or start_at <= now())
  and (end_at is null or end_at >= now())
);

drop policy if exists "Combo deals insert" on public.restaurant_combo_deals;
create policy "Combo deals insert"
on public.restaurant_combo_deals
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Combo deals update" on public.restaurant_combo_deals;
create policy "Combo deals update"
on public.restaurant_combo_deals
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

drop policy if exists "Combo deals delete" on public.restaurant_combo_deals;
create policy "Combo deals delete"
on public.restaurant_combo_deals
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

-- Combo item policies

drop policy if exists "Combo deal items member select" on public.restaurant_combo_deal_items;
create policy "Combo deal items member select"
on public.restaurant_combo_deal_items
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Combo deal items public select" on public.restaurant_combo_deal_items;
create policy "Combo deal items public select"
on public.restaurant_combo_deal_items
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.restaurant_combo_deals combo
    where combo.id = combo_id
      and combo.restaurant_id = restaurant_combo_deal_items.restaurant_id
      and combo.is_deleted = false
      and combo.is_active = true
      and combo.is_public = true
      and (combo.start_at is null or combo.start_at <= now())
      and (combo.end_at is null or combo.end_at >= now())
  )
);

drop policy if exists "Combo deal items insert" on public.restaurant_combo_deal_items;
create policy "Combo deal items insert"
on public.restaurant_combo_deal_items
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Combo deal items update" on public.restaurant_combo_deal_items;
create policy "Combo deal items update"
on public.restaurant_combo_deal_items
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

drop policy if exists "Combo deal items delete" on public.restaurant_combo_deal_items;
create policy "Combo deal items delete"
on public.restaurant_combo_deal_items
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create or replace function public.set_restaurant_combo_deals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restaurant_combo_deals_updated_at_trigger on public.restaurant_combo_deals;
create trigger restaurant_combo_deals_updated_at_trigger
before update on public.restaurant_combo_deals
for each row
execute function public.set_restaurant_combo_deals_updated_at();
