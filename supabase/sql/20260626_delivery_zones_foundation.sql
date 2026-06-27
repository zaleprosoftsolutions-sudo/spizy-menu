-- Spizy Menu - Delivery Zones / Delivery Area Fees foundation
-- Run this once in Supabase SQL Editor.

create table if not exists public.restaurant_delivery_zones (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  zone_name text not null,
  city text,
  area_name text,
  delivery_fee numeric(12,2) not null default 0,
  minimum_order_amount numeric(12,2) not null default 0,
  packaging_fee numeric(12,2) not null default 0,
  free_delivery_above numeric(12,2),
  estimated_delivery_minutes integer not null default 30,
  radius_km numeric(10,2),
  latitude numeric(11,7),
  longitude numeric(11,7),
  maps_url text,
  notes text,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint restaurant_delivery_zones_fee_check check (delivery_fee >= 0),
  constraint restaurant_delivery_zones_minimum_check check (minimum_order_amount >= 0),
  constraint restaurant_delivery_zones_packaging_check check (packaging_fee >= 0),
  constraint restaurant_delivery_zones_minutes_check check (estimated_delivery_minutes > 0)
);

create index if not exists restaurant_delivery_zones_restaurant_idx
on public.restaurant_delivery_zones (restaurant_id, is_deleted, is_active);

create index if not exists restaurant_delivery_zones_search_idx
on public.restaurant_delivery_zones using gin (
  to_tsvector('simple', coalesce(zone_name, '') || ' ' || coalesce(city, '') || ' ' || coalesce(area_name, ''))
);

create or replace function public.set_restaurant_delivery_zones_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_restaurant_delivery_zones_updated_at on public.restaurant_delivery_zones;

create trigger set_restaurant_delivery_zones_updated_at
before update on public.restaurant_delivery_zones
for each row
execute function public.set_restaurant_delivery_zones_updated_at();

alter table public.restaurant_delivery_zones enable row level security;

drop policy if exists "Restaurant delivery zones member select" on public.restaurant_delivery_zones;
drop policy if exists "Restaurant delivery zones member insert" on public.restaurant_delivery_zones;
drop policy if exists "Restaurant delivery zones member update" on public.restaurant_delivery_zones;
drop policy if exists "Restaurant delivery zones member delete" on public.restaurant_delivery_zones;
drop policy if exists "Public can view active delivery zones" on public.restaurant_delivery_zones;

create policy "Restaurant delivery zones member select"
on public.restaurant_delivery_zones
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant delivery zones member insert"
on public.restaurant_delivery_zones
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant delivery zones member update"
on public.restaurant_delivery_zones
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

create policy "Restaurant delivery zones member delete"
on public.restaurant_delivery_zones
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Public can view active delivery zones"
on public.restaurant_delivery_zones
for select
to anon, authenticated
using (
  is_active = true
  and is_deleted = false
);
