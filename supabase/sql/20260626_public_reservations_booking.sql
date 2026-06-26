-- Spizy Menu - Public Reservation Booking
-- Run after: 20260626_reservations_foundation.sql

alter table public.restaurants
add column if not exists reservations_enabled boolean not null default true,
add column if not exists reservation_min_guests integer not null default 1 check (reservation_min_guests > 0),
add column if not exists reservation_max_guests integer not null default 30 check (reservation_max_guests >= reservation_min_guests),
add column if not exists reservation_default_duration_minutes integer not null default 90 check (reservation_default_duration_minutes > 0);

create or replace function public.create_public_reservation(
  p_restaurant_id uuid,
  p_customer_session_id text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_guest_count integer,
  p_reservation_date date,
  p_reservation_time time,
  p_expected_duration_minutes integer default 90,
  p_table_preference text default null,
  p_occasion text default null,
  p_notes text default null
)
returns table (
  reservation_id uuid,
  reservation_code text,
  reservation_date date,
  reservation_time time,
  guest_count integer,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant public.restaurants;
  v_reservation public.restaurant_reservations;
  v_customer_name text := trim(coalesce(p_customer_name, ''));
  v_customer_phone text := trim(coalesce(p_customer_phone, ''));
  v_guest_count integer := greatest(coalesce(p_guest_count, 0), 0);
  v_duration integer := greatest(coalesce(p_expected_duration_minutes, 90), 30);
  v_now_date date := (now() at time zone 'Asia/Dubai')::date;
begin
  select *
  into v_restaurant
  from public.restaurants r
  where r.id = p_restaurant_id
    and r.is_active = true
  limit 1;

  if v_restaurant.id is null then
    raise exception 'Restaurant is not available.';
  end if;

  if coalesce(v_restaurant.reservations_enabled, true) = false then
    raise exception 'Table booking is not active for this restaurant.';
  end if;

  if v_customer_name = '' then
    raise exception 'Customer name is required.';
  end if;

  if v_customer_phone = '' then
    raise exception 'Customer phone is required.';
  end if;

  if p_reservation_date is null or p_reservation_time is null then
    raise exception 'Reservation date and time are required.';
  end if;

  if p_reservation_date < v_now_date then
    raise exception 'Reservation date cannot be in the past.';
  end if;

  if v_guest_count < coalesce(v_restaurant.reservation_min_guests, 1)
     or v_guest_count > coalesce(v_restaurant.reservation_max_guests, 30) then
    raise exception 'Guest count is outside the allowed limit.';
  end if;

  insert into public.restaurant_reservations (
    restaurant_id,
    customer_name,
    customer_phone,
    customer_email,
    guest_count,
    reservation_date,
    reservation_time,
    expected_duration_minutes,
    table_preference,
    occasion,
    source,
    status,
    deposit_amount,
    notes
  ) values (
    p_restaurant_id,
    left(v_customer_name, 160),
    left(v_customer_phone, 40),
    nullif(left(trim(coalesce(p_customer_email, '')), 180), ''),
    v_guest_count,
    p_reservation_date,
    p_reservation_time,
    v_duration,
    nullif(left(trim(coalesce(p_table_preference, '')), 160), ''),
    nullif(left(trim(coalesce(p_occasion, '')), 120), ''),
    'public',
    'pending',
    0,
    nullif(
      left(
        trim(
          concat_ws(
            E'\n',
            nullif(trim(coalesce(p_notes, '')), ''),
            case
              when nullif(trim(coalesce(p_customer_session_id, '')), '') is not null
              then 'Customer session: ' || left(trim(coalesce(p_customer_session_id, '')), 80)
              else null
            end
          )
        ),
        700
      ),
      ''
    )
  )
  returning * into v_reservation;

  return query
  select
    v_reservation.id,
    v_reservation.reservation_code,
    v_reservation.reservation_date,
    v_reservation.reservation_time,
    v_reservation.guest_count,
    v_reservation.status;
end;
$$;

grant execute on function public.create_public_reservation(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  date,
  time,
  integer,
  text,
  text,
  text
) to anon, authenticated;
