create table if not exists public.restaurant_staffs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_name text not null,
  email text,
  phone text,
  staff_role text not null default 'staff',
  pin_code text,
  permissions jsonb not null default '{"pos": true, "orders": true, "menu": false, "customers": false, "reports": false, "settings": false}'::jsonb,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists restaurant_staffs_restaurant_idx
on public.restaurant_staffs (restaurant_id, is_deleted, is_active);

alter table public.restaurant_staffs enable row level security;

drop policy if exists "Restaurant staffs member select" on public.restaurant_staffs;
drop policy if exists "Restaurant staffs member insert" on public.restaurant_staffs;
drop policy if exists "Restaurant staffs member update" on public.restaurant_staffs;
drop policy if exists "Restaurant staffs member delete" on public.restaurant_staffs;

create policy "Restaurant staffs member select"
on public.restaurant_staffs
for select
to authenticated
using (
  is_deleted = false
  and (
    public.is_restaurant_member(restaurant_id)
    or public.get_my_role() = 'super_admin'
  )
);

create policy "Restaurant staffs member insert"
on public.restaurant_staffs
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant staffs member update"
on public.restaurant_staffs
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

create policy "Restaurant staffs member delete"
on public.restaurant_staffs
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);
