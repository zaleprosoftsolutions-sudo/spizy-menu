-- Spizy Menu staff shift closing foundation
-- Adds cashier/waiter shift open-close, cash drawer variance and handover notes.

create table if not exists public.restaurant_staff_shift_closings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_id uuid null references public.restaurant_staffs(id) on delete set null,
  staff_name text not null,
  staff_role text null,
  shift_name text not null default 'Main shift',
  shift_date date not null default current_date,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz null,
  opening_cash numeric(12,2) not null default 0,
  cash_sales_recorded numeric(12,2) not null default 0,
  card_collections numeric(12,2) not null default 0,
  online_collections numeric(12,2) not null default 0,
  expenses_paid numeric(12,2) not null default 0,
  counted_cash numeric(12,2) not null default 0,
  expected_cash numeric(12,2) not null default 0,
  cash_variance numeric(12,2) not null default 0,
  handover_notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  closed_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

create index if not exists idx_restaurant_staff_shift_closings_restaurant_date
  on public.restaurant_staff_shift_closings (restaurant_id, shift_date desc, status);

create index if not exists idx_restaurant_staff_shift_closings_staff
  on public.restaurant_staff_shift_closings (restaurant_id, staff_id, shift_date desc)
  where staff_id is not null;

create or replace function public.set_restaurant_staff_shift_closings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_restaurant_staff_shift_closings_updated_at on public.restaurant_staff_shift_closings;
create trigger trg_restaurant_staff_shift_closings_updated_at
before update on public.restaurant_staff_shift_closings
for each row execute function public.set_restaurant_staff_shift_closings_updated_at();

alter table public.restaurant_staff_shift_closings enable row level security;

-- Owner/admin/manager access through restaurant_members.
drop policy if exists "restaurant members can read staff shift closings" on public.restaurant_staff_shift_closings;
create policy "restaurant members can read staff shift closings"
on public.restaurant_staff_shift_closings
for select
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_staff_shift_closings.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin', 'cashier', 'waiter', 'staff')
  )
  or exists (
    select 1
    from public.restaurant_staffs rs
    where rs.restaurant_id = restaurant_staff_shift_closings.restaurant_id
      and rs.is_deleted = false
      and rs.is_active = true
      and lower(rs.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "restaurant members can insert staff shift closings" on public.restaurant_staff_shift_closings;
create policy "restaurant members can insert staff shift closings"
on public.restaurant_staff_shift_closings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_staff_shift_closings.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin', 'cashier', 'waiter', 'staff')
  )
  or exists (
    select 1
    from public.restaurant_staffs rs
    where rs.restaurant_id = restaurant_staff_shift_closings.restaurant_id
      and rs.is_deleted = false
      and rs.is_active = true
      and lower(rs.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "restaurant members can update staff shift closings" on public.restaurant_staff_shift_closings;
create policy "restaurant members can update staff shift closings"
on public.restaurant_staff_shift_closings
for update
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_staff_shift_closings.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin', 'cashier', 'waiter', 'staff')
  )
  or exists (
    select 1
    from public.restaurant_staffs rs
    where rs.restaurant_id = restaurant_staff_shift_closings.restaurant_id
      and rs.is_deleted = false
      and rs.is_active = true
      and lower(rs.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
)
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_staff_shift_closings.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin', 'cashier', 'waiter', 'staff')
  )
  or exists (
    select 1
    from public.restaurant_staffs rs
    where rs.restaurant_id = restaurant_staff_shift_closings.restaurant_id
      and rs.is_deleted = false
      and rs.is_active = true
      and lower(rs.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);
