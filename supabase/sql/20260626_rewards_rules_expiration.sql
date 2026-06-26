-- Spizy Rewards Rules + Points Expiration
-- Run this after the Customers + Rewards foundation SQL.

alter table public.restaurants
add column if not exists reward_redeem_points numeric(10,2) not null default 100;

alter table public.restaurants
add column if not exists reward_redeem_discount_amount numeric(10,2) not null default 10;

alter table public.restaurants
add column if not exists reward_expiration_enabled boolean not null default false;

alter table public.restaurants
add column if not exists reward_expiry_value integer not null default 0;

alter table public.restaurants
add column if not exists reward_expiry_unit text not null default 'lifetime';

alter table public.restaurants
drop constraint if exists restaurants_reward_expiry_unit_check;

alter table public.restaurants
add constraint restaurants_reward_expiry_unit_check
check (reward_expiry_unit in ('lifetime', 'days', 'weeks', 'months', 'years'));

alter table public.restaurant_customer_reward_transactions
add column if not exists expires_at timestamptz;

create index if not exists reward_transactions_expiry_idx
on public.restaurant_customer_reward_transactions (customer_id, expires_at);

create or replace function public.get_reward_expiry_at(
  p_base_time timestamptz,
  p_expiration_enabled boolean,
  p_expiry_value integer,
  p_expiry_unit text
)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if coalesce(p_expiration_enabled, false) = false then
    return null;
  end if;

  if coalesce(p_expiry_value, 0) <= 0 then
    return null;
  end if;

  if p_expiry_unit = 'days' then
    return p_base_time + make_interval(days => p_expiry_value);
  elsif p_expiry_unit = 'weeks' then
    return p_base_time + make_interval(weeks => p_expiry_value);
  elsif p_expiry_unit = 'months' then
    return p_base_time + make_interval(months => p_expiry_value);
  elsif p_expiry_unit = 'years' then
    return p_base_time + make_interval(years => p_expiry_value);
  end if;

  return null;
end;
$$;

create or replace function public.refresh_restaurant_customers(
  p_restaurant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rewards_enabled boolean := false;
  v_reward_amount_unit numeric(10,2) := 10;
  v_reward_points_per_amount numeric(10,2) := 1;
  v_reward_expiration_enabled boolean := false;
  v_reward_expiry_value integer := 0;
  v_reward_expiry_unit text := 'lifetime';
begin
  if p_restaurant_id is null then
    return;
  end if;

  if auth.uid() is not null
     and not (
       public.is_restaurant_member(p_restaurant_id)
       or public.get_my_role() = 'super_admin'
     ) then
    raise exception 'Not allowed to refresh customers for this restaurant.';
  end if;

  select
    coalesce(r.rewards_enabled, false),
    greatest(coalesce(r.reward_amount_unit, 10), 1),
    greatest(coalesce(r.reward_points_per_amount, 1), 0),
    coalesce(r.reward_expiration_enabled, false),
    greatest(coalesce(r.reward_expiry_value, 0), 0),
    coalesce(nullif(r.reward_expiry_unit, ''), 'lifetime')
  into
    v_rewards_enabled,
    v_reward_amount_unit,
    v_reward_points_per_amount,
    v_reward_expiration_enabled,
    v_reward_expiry_value,
    v_reward_expiry_unit
  from public.restaurants r
  where r.id = p_restaurant_id;

  insert into public.restaurant_customers (
    restaurant_id,
    customer_name,
    customer_phone,
    first_order_at,
    last_order_at,
    total_orders,
    total_spend,
    updated_at
  )
  select
    ro.restaurant_id,
    (
      array_remove(array_agg(nullif(trim(ro.customer_name), '') order by ro.created_at desc), null)
    )[1] as customer_name,
    trim(ro.customer_phone) as customer_phone,
    min(ro.created_at) as first_order_at,
    max(ro.created_at) as last_order_at,
    count(*)::integer as total_orders,
    coalesce(sum(ro.total_amount), 0)::numeric(12,2) as total_spend,
    now() as updated_at
  from public.restaurant_orders ro
  where ro.restaurant_id = p_restaurant_id
    and ro.status = 'completed'
    and ro.payment_status = 'paid'
    and coalesce(trim(ro.customer_phone), '') <> ''
  group by ro.restaurant_id, trim(ro.customer_phone)
  on conflict (restaurant_id, customer_phone)
  do update set
    customer_name = coalesce(excluded.customer_name, public.restaurant_customers.customer_name),
    first_order_at = excluded.first_order_at,
    last_order_at = excluded.last_order_at,
    total_orders = excluded.total_orders,
    total_spend = excluded.total_spend,
    updated_at = now();

  if v_rewards_enabled then
    insert into public.restaurant_customer_reward_transactions (
      restaurant_id,
      customer_id,
      order_id,
      transaction_type,
      points,
      description,
      expires_at,
      created_at
    )
    select
      ro.restaurant_id,
      rc.id,
      ro.id,
      'earn',
      greatest(
        floor((coalesce(ro.total_amount, 0) / v_reward_amount_unit) * v_reward_points_per_amount),
        0
      ),
      'Points earned from order ' || coalesce(ro.order_code, ro.public_order_number, ro.id::text),
      public.get_reward_expiry_at(
        ro.updated_at,
        v_reward_expiration_enabled,
        v_reward_expiry_value,
        v_reward_expiry_unit
      ),
      ro.updated_at
    from public.restaurant_orders ro
    join public.restaurant_customers rc
      on rc.restaurant_id = ro.restaurant_id
     and rc.customer_phone = trim(ro.customer_phone)
    where ro.restaurant_id = p_restaurant_id
      and ro.status = 'completed'
      and ro.payment_status = 'paid'
      and coalesce(trim(ro.customer_phone), '') <> ''
    on conflict (order_id, transaction_type)
    where transaction_type = 'earn' and order_id is not null
    do update set
      points = excluded.points,
      description = excluded.description,
      expires_at = excluded.expires_at;
  end if;

  update public.restaurant_customers rc
  set
    reward_points = greatest(
      coalesce(
        (
          select sum(rcrt.points)
          from public.restaurant_customer_reward_transactions rcrt
          where rcrt.customer_id = rc.id
            and (
              rcrt.expires_at is null
              or rcrt.expires_at > now()
              or rcrt.points < 0
            )
        ),
        0
      ),
      0
    ),
    updated_at = now()
  where rc.restaurant_id = p_restaurant_id;
end;
$$;

grant execute on function public.refresh_restaurant_customers(uuid) to authenticated;

do $$
declare
  v_restaurant record;
begin
  for v_restaurant in
    select distinct restaurant_id
    from public.restaurant_orders
    where status = 'completed'
      and payment_status = 'paid'
      and coalesce(trim(customer_phone), '') <> ''
  loop
    perform public.refresh_restaurant_customers(v_restaurant.restaurant_id);
  end loop;
end $$;
