-- Spizy Menu - Branches / Locations foundation
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.restaurant_branches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_name text not null,
  branch_code text,
  phone text,
  whatsapp text,
  email text,
  address text,
  city text,
  country text,
  currency text not null default 'AED',
  latitude numeric,
  longitude numeric,
  google_maps_url text,
  minimum_order numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  packaging_fee numeric(12,2) not null default 0,
  tax_percentage numeric(8,3) not null default 0,
  dine_in_enabled boolean not null default true,
  takeaway_enabled boolean not null default true,
  delivery_enabled boolean not null default true,
  accepts_orders boolean not null default true,
  is_default boolean not null default false,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  sort_order integer not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_branches_currency_check check (
    currency in ('AED', 'SAR', 'QAR', 'BHD', 'KWD', 'OMR', 'INR')
  ),
  constraint restaurant_branches_amounts_check check (
    minimum_order >= 0
    and delivery_fee >= 0
    and packaging_fee >= 0
    and tax_percentage >= 0
  )
);

create index if not exists restaurant_branches_restaurant_idx
on public.restaurant_branches (restaurant_id, is_deleted, is_active);

create index if not exists restaurant_branches_default_idx
on public.restaurant_branches (restaurant_id, is_default)
where is_default = true and is_deleted = false;

alter table public.restaurant_branches enable row level security;

create or replace function public.set_restaurant_branch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_restaurant_branch_updated_at on public.restaurant_branches;
create trigger trg_set_restaurant_branch_updated_at
before update on public.restaurant_branches
for each row
execute function public.set_restaurant_branch_updated_at();

create or replace function public.keep_single_default_restaurant_branch()
returns trigger
language plpgsql
as $$
begin
  if new.is_default = true and new.is_deleted = false then
    update public.restaurant_branches
    set is_default = false,
        updated_at = now()
    where restaurant_id = new.restaurant_id
      and id <> new.id
      and is_default = true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_keep_single_default_restaurant_branch on public.restaurant_branches;
create trigger trg_keep_single_default_restaurant_branch
after insert or update of is_default, is_deleted on public.restaurant_branches
for each row
execute function public.keep_single_default_restaurant_branch();

-- RLS policies

drop policy if exists "Restaurant branches member select" on public.restaurant_branches;
create policy "Restaurant branches member select"
on public.restaurant_branches
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Restaurant branches member insert" on public.restaurant_branches;
create policy "Restaurant branches member insert"
on public.restaurant_branches
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Restaurant branches member update" on public.restaurant_branches;
create policy "Restaurant branches member update"
on public.restaurant_branches
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

drop policy if exists "Restaurant branches member delete" on public.restaurant_branches;
create policy "Restaurant branches member delete"
on public.restaurant_branches
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

-- Optional public read foundation for later public branch selector / directions.
drop policy if exists "Public active restaurant branches select" on public.restaurant_branches;
create policy "Public active restaurant branches select"
on public.restaurant_branches
for select
to anon, authenticated
using (
  is_active = true
  and is_deleted = false
);
