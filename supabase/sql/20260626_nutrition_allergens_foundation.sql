-- Spizy Menu - Nutrition & Allergens foundation

create table if not exists public.restaurant_menu_item_labels (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  dietary_tags text[] not null default '{}',
  allergen_tags text[] not null default '{}',
  spice_level text not null default 'none' check (spice_level in ('none', 'mild', 'medium', 'hot', 'extra_hot')),
  calories numeric(10,2),
  protein_grams numeric(10,2),
  carbs_grams numeric(10,2),
  fat_grams numeric(10,2),
  prep_time_minutes integer,
  serving_size text,
  nutrition_note text,
  is_visible boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, menu_item_id)
);

create index if not exists restaurant_menu_item_labels_restaurant_idx
on public.restaurant_menu_item_labels (restaurant_id);

create index if not exists restaurant_menu_item_labels_item_idx
on public.restaurant_menu_item_labels (menu_item_id);

create index if not exists restaurant_menu_item_labels_dietary_gin_idx
on public.restaurant_menu_item_labels using gin (dietary_tags);

create index if not exists restaurant_menu_item_labels_allergen_gin_idx
on public.restaurant_menu_item_labels using gin (allergen_tags);

create or replace function public.set_restaurant_menu_item_labels_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_restaurant_menu_item_labels_updated_at
on public.restaurant_menu_item_labels;

create trigger set_restaurant_menu_item_labels_updated_at
before update on public.restaurant_menu_item_labels
for each row
execute function public.set_restaurant_menu_item_labels_updated_at();

alter table public.restaurant_menu_item_labels enable row level security;

-- Public select is allowed only for visible labels belonging to active public menu items.
drop policy if exists "Public can view visible menu labels" on public.restaurant_menu_item_labels;
create policy "Public can view visible menu labels"
on public.restaurant_menu_item_labels
for select
to anon, authenticated
using (
  is_visible = true
  and exists (
    select 1
    from public.menu_items mi
    join public.restaurants r on r.id = mi.restaurant_id
    where mi.id = restaurant_menu_item_labels.menu_item_id
      and mi.restaurant_id = restaurant_menu_item_labels.restaurant_id
      and mi.is_deleted = false
      and mi.is_available = true
      and r.is_active = true
  )
);

-- Restaurant users can view all labels for their restaurant, including hidden labels.
drop policy if exists "Restaurant users can view menu labels" on public.restaurant_menu_item_labels;
create policy "Restaurant users can view menu labels"
on public.restaurant_menu_item_labels
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Restaurant users can insert menu labels" on public.restaurant_menu_item_labels;
create policy "Restaurant users can insert menu labels"
on public.restaurant_menu_item_labels
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Restaurant users can update menu labels" on public.restaurant_menu_item_labels;
create policy "Restaurant users can update menu labels"
on public.restaurant_menu_item_labels
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

drop policy if exists "Restaurant users can delete menu labels" on public.restaurant_menu_item_labels;
create policy "Restaurant users can delete menu labels"
on public.restaurant_menu_item_labels
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);
