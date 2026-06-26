-- Spizy Menu - Modifier Groups / Add-ons Foundation
-- Run this file in Supabase SQL Editor.

create table if not exists public.restaurant_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  selection_type text not null default 'single' check (selection_type in ('single', 'multiple')),
  is_required boolean not null default false,
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer not null default 1 check (max_select >= 1),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_modifier_options (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  group_id uuid not null references public.restaurant_modifier_groups(id) on delete cascade,
  name text not null,
  price_delta numeric(12, 2) not null default 0,
  is_default boolean not null default false,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_item_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id uuid not null references public.menu_items(id) on delete cascade,
  group_id uuid not null references public.restaurant_modifier_groups(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (restaurant_id, item_id, group_id)
);

create index if not exists restaurant_modifier_groups_restaurant_idx
on public.restaurant_modifier_groups (restaurant_id, is_active, is_deleted, sort_order);

create index if not exists restaurant_modifier_options_group_idx
on public.restaurant_modifier_options (group_id, is_available, is_deleted, sort_order);

create index if not exists restaurant_item_modifier_groups_item_idx
on public.restaurant_item_modifier_groups (restaurant_id, item_id);

create index if not exists restaurant_item_modifier_groups_group_idx
on public.restaurant_item_modifier_groups (restaurant_id, group_id);

create or replace function public.touch_restaurant_modifier_groups_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_restaurant_modifier_groups_updated_at on public.restaurant_modifier_groups;
create trigger trg_restaurant_modifier_groups_updated_at
before update on public.restaurant_modifier_groups
for each row execute function public.touch_restaurant_modifier_groups_updated_at();

drop trigger if exists trg_restaurant_modifier_options_updated_at on public.restaurant_modifier_options;
create trigger trg_restaurant_modifier_options_updated_at
before update on public.restaurant_modifier_options
for each row execute function public.touch_restaurant_modifier_groups_updated_at();

alter table public.restaurant_modifier_groups enable row level security;
alter table public.restaurant_modifier_options enable row level security;
alter table public.restaurant_item_modifier_groups enable row level security;

drop policy if exists "Modifier groups member read" on public.restaurant_modifier_groups;
create policy "Modifier groups member read"
on public.restaurant_modifier_groups
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Modifier groups public active read" on public.restaurant_modifier_groups;
create policy "Modifier groups public active read"
on public.restaurant_modifier_groups
for select
to anon, authenticated
using (is_active = true and is_deleted = false);

drop policy if exists "Modifier groups member insert" on public.restaurant_modifier_groups;
create policy "Modifier groups member insert"
on public.restaurant_modifier_groups
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Modifier groups member update" on public.restaurant_modifier_groups;
create policy "Modifier groups member update"
on public.restaurant_modifier_groups
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

drop policy if exists "Modifier groups member delete" on public.restaurant_modifier_groups;
create policy "Modifier groups member delete"
on public.restaurant_modifier_groups
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Modifier options member read" on public.restaurant_modifier_options;
create policy "Modifier options member read"
on public.restaurant_modifier_options
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Modifier options public active read" on public.restaurant_modifier_options;
create policy "Modifier options public active read"
on public.restaurant_modifier_options
for select
to anon, authenticated
using (
  is_available = true
  and is_deleted = false
  and exists (
    select 1
    from public.restaurant_modifier_groups g
    where g.id = group_id
      and g.is_active = true
      and g.is_deleted = false
  )
);

drop policy if exists "Modifier options member insert" on public.restaurant_modifier_options;
create policy "Modifier options member insert"
on public.restaurant_modifier_options
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Modifier options member update" on public.restaurant_modifier_options;
create policy "Modifier options member update"
on public.restaurant_modifier_options
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

drop policy if exists "Modifier options member delete" on public.restaurant_modifier_options;
create policy "Modifier options member delete"
on public.restaurant_modifier_options
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Item modifier links member read" on public.restaurant_item_modifier_groups;
create policy "Item modifier links member read"
on public.restaurant_item_modifier_groups
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Item modifier links public active read" on public.restaurant_item_modifier_groups;
create policy "Item modifier links public active read"
on public.restaurant_item_modifier_groups
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.restaurant_modifier_groups g
    where g.id = group_id
      and g.is_active = true
      and g.is_deleted = false
  )
);

drop policy if exists "Item modifier links member insert" on public.restaurant_item_modifier_groups;
create policy "Item modifier links member insert"
on public.restaurant_item_modifier_groups
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Item modifier links member update" on public.restaurant_item_modifier_groups;
create policy "Item modifier links member update"
on public.restaurant_item_modifier_groups
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

drop policy if exists "Item modifier links member delete" on public.restaurant_item_modifier_groups;
create policy "Item modifier links member delete"
on public.restaurant_item_modifier_groups
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);
