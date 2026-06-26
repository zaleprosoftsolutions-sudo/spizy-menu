-- Spizy Recipes & Costing foundation
-- Standard recipe cards, ingredients and food-cost snapshots per menu item.

create table if not exists public.restaurant_recipes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  recipe_name text not null,
  yield_quantity numeric(12,3) not null default 1,
  yield_unit text not null default 'portion',
  prep_time_minutes integer not null default 0,
  cook_time_minutes integer not null default 0,
  total_food_cost numeric(12,2) not null default 0,
  food_cost_percent numeric(8,2) not null default 0,
  suggested_price numeric(12,2) not null default 0,
  instructions text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_recipes_unique_menu_item unique (restaurant_id, menu_item_id),
  constraint restaurant_recipes_yield_quantity_check check (yield_quantity > 0),
  constraint restaurant_recipes_time_check check (prep_time_minutes >= 0 and cook_time_minutes >= 0)
);

create table if not exists public.restaurant_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.restaurant_recipes(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  ingredient_item_id uuid not null references public.menu_items(id) on delete restrict,
  ingredient_name text not null,
  quantity numeric(12,3) not null default 0,
  unit text not null default 'pcs',
  wastage_percent numeric(8,2) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  total_cost numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  constraint restaurant_recipe_ingredients_quantity_check check (quantity > 0),
  constraint restaurant_recipe_ingredients_wastage_check check (wastage_percent >= 0 and wastage_percent <= 100),
  constraint restaurant_recipe_ingredients_unit_cost_check check (unit_cost >= 0)
);

create index if not exists restaurant_recipes_restaurant_idx
on public.restaurant_recipes (restaurant_id, updated_at desc);

create index if not exists restaurant_recipes_menu_item_idx
on public.restaurant_recipes (menu_item_id);

create index if not exists restaurant_recipe_ingredients_recipe_idx
on public.restaurant_recipe_ingredients (recipe_id, created_at);

create index if not exists restaurant_recipe_ingredients_item_idx
on public.restaurant_recipe_ingredients (ingredient_item_id, created_at desc);

alter table public.restaurant_recipes enable row level security;
alter table public.restaurant_recipe_ingredients enable row level security;

drop policy if exists "Restaurant recipes select access" on public.restaurant_recipes;
drop policy if exists "Restaurant recipes insert access" on public.restaurant_recipes;
drop policy if exists "Restaurant recipes update access" on public.restaurant_recipes;
drop policy if exists "Restaurant recipes delete access" on public.restaurant_recipes;

create policy "Restaurant recipes select access"
on public.restaurant_recipes
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant recipes insert access"
on public.restaurant_recipes
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant recipes update access"
on public.restaurant_recipes
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

create policy "Restaurant recipes delete access"
on public.restaurant_recipes
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Recipe ingredients select access" on public.restaurant_recipe_ingredients;
drop policy if exists "Recipe ingredients insert access" on public.restaurant_recipe_ingredients;
drop policy if exists "Recipe ingredients update access" on public.restaurant_recipe_ingredients;
drop policy if exists "Recipe ingredients delete access" on public.restaurant_recipe_ingredients;

create policy "Recipe ingredients select access"
on public.restaurant_recipe_ingredients
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Recipe ingredients insert access"
on public.restaurant_recipe_ingredients
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Recipe ingredients update access"
on public.restaurant_recipe_ingredients
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

create policy "Recipe ingredients delete access"
on public.restaurant_recipe_ingredients
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create or replace function public.touch_restaurant_recipe_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_restaurant_recipe_updated_at on public.restaurant_recipes;
create trigger touch_restaurant_recipe_updated_at
before update on public.restaurant_recipes
for each row
execute function public.touch_restaurant_recipe_updated_at();

-- Public menu does not expose recipes yet. This is internal restaurant costing foundation.
