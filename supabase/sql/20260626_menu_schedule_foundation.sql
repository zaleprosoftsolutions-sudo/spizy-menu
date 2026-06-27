-- Spizy Menu Schedule / Happy Hours foundation

create table if not exists public.restaurant_menu_schedules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  schedule_name text not null,
  schedule_type text not null default 'availability'
    check (schedule_type in ('availability', 'happy_hour', 'special_price', 'hide_item')),
  applies_to text not null default 'item'
    check (applies_to in ('item', 'category', 'all_menu')),
  item_id uuid references public.menu_items(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete cascade,
  days_of_week integer[] not null default array[0,1,2,3,4,5,6],
  start_time time not null default '09:00',
  end_time time not null default '23:00',
  start_date date,
  end_date date,
  special_price numeric(12,2),
  discount_percent numeric(6,2),
  banner_note text,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_menu_schedules_target_check check (
    (applies_to = 'all_menu' and item_id is null and category_id is null)
    or (applies_to = 'item' and item_id is not null and category_id is null)
    or (applies_to = 'category' and category_id is not null and item_id is null)
  ),
  constraint restaurant_menu_schedules_discount_check check (
    discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)
  ),
  constraint restaurant_menu_schedules_price_check check (
    special_price is null or special_price >= 0
  )
);

create index if not exists restaurant_menu_schedules_restaurant_idx
on public.restaurant_menu_schedules (restaurant_id, is_active, is_deleted);

create index if not exists restaurant_menu_schedules_item_idx
on public.restaurant_menu_schedules (item_id)
where item_id is not null;

create index if not exists restaurant_menu_schedules_category_idx
on public.restaurant_menu_schedules (category_id)
where category_id is not null;

create or replace function public.touch_restaurant_menu_schedule_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_restaurant_menu_schedule_updated_at on public.restaurant_menu_schedules;

create trigger touch_restaurant_menu_schedule_updated_at
before update on public.restaurant_menu_schedules
for each row
execute function public.touch_restaurant_menu_schedule_updated_at();

alter table public.restaurant_menu_schedules enable row level security;

drop policy if exists "Restaurant menu schedules member read" on public.restaurant_menu_schedules;
drop policy if exists "Restaurant menu schedules member insert" on public.restaurant_menu_schedules;
drop policy if exists "Restaurant menu schedules member update" on public.restaurant_menu_schedules;
drop policy if exists "Restaurant menu schedules member delete" on public.restaurant_menu_schedules;
drop policy if exists "Restaurant menu schedules public active read" on public.restaurant_menu_schedules;

create policy "Restaurant menu schedules member read"
on public.restaurant_menu_schedules
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant menu schedules member insert"
on public.restaurant_menu_schedules
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant menu schedules member update"
on public.restaurant_menu_schedules
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

create policy "Restaurant menu schedules member delete"
on public.restaurant_menu_schedules
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant menu schedules public active read"
on public.restaurant_menu_schedules
for select
to anon, authenticated
using (
  is_active = true
  and is_deleted = false
  and exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_id
      and r.is_active = true
  )
);

comment on table public.restaurant_menu_schedules is 'Timed menu availability, happy hour, hidden item and special price rules for Spizy restaurants.';
