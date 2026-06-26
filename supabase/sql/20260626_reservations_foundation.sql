-- Spizy Menu - Reservations / Table Booking foundation

create table if not exists public.restaurant_reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reservation_code text,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  guest_count integer not null default 2 check (guest_count > 0),
  reservation_date date not null,
  reservation_time time not null,
  expected_duration_minutes integer not null default 90 check (expected_duration_minutes > 0),
  table_preference text,
  occasion text,
  source text not null default 'phone' check (source in ('admin', 'public', 'phone', 'whatsapp', 'walk_in')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show')),
  deposit_amount numeric(12,2) not null default 0 check (deposit_amount >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists restaurant_reservations_restaurant_date_idx
on public.restaurant_reservations (restaurant_id, reservation_date, reservation_time);

create index if not exists restaurant_reservations_restaurant_status_idx
on public.restaurant_reservations (restaurant_id, status);

create or replace function public.assign_restaurant_reservation_code()
returns trigger
language plpgsql
as $$
declare
  day_count integer;
  prefix text;
begin
  if new.reservation_code is null or trim(new.reservation_code) = '' then
    prefix := to_char(coalesce(new.reservation_date, now()::date), 'DDMM');

    select count(*) + 1 into day_count
    from public.restaurant_reservations
    where restaurant_id = new.restaurant_id
      and reservation_date = new.reservation_date;

    new.reservation_code := 'RSV-' || prefix || '-' || lpad(day_count::text, 3, '0');
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_assign_restaurant_reservation_code on public.restaurant_reservations;

create trigger trg_assign_restaurant_reservation_code
before insert or update on public.restaurant_reservations
for each row
execute function public.assign_restaurant_reservation_code();

alter table public.restaurant_reservations enable row level security;

drop policy if exists "Restaurant reservations select access" on public.restaurant_reservations;
drop policy if exists "Restaurant reservations insert access" on public.restaurant_reservations;
drop policy if exists "Restaurant reservations update access" on public.restaurant_reservations;
drop policy if exists "Restaurant reservations delete access" on public.restaurant_reservations;

create policy "Restaurant reservations select access"
on public.restaurant_reservations
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant reservations insert access"
on public.restaurant_reservations
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant reservations update access"
on public.restaurant_reservations
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

create policy "Restaurant reservations delete access"
on public.restaurant_reservations
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);
