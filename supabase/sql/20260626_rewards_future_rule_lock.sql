-- Spizy Rewards Future Rule Lock
-- Purpose:
-- 1) Reward rule changes must apply only to future completed + paid orders.
-- 2) Already-earned points must stay fixed and should not be recalculated when the restaurant changes earning rules.
-- 3) Redemption rule changes must not change already-redeemed coupons.
-- Run this after the previous rewards SQL files.

alter table public.restaurants
add column if not exists rewards_activated_at timestamptz;

alter table public.restaurants
add column if not exists rewards_rule_updated_at timestamptz;

alter table public.restaurant_customer_reward_transactions
add column if not exists earning_rule_amount_unit numeric(10,2);

alter table public.restaurant_customer_reward_transactions
add column if not exists earning_rule_points_per_amount numeric(10,2);

alter table public.restaurant_customer_reward_transactions
add column if not exists order_total_amount_snapshot numeric(12,2);

alter table public.restaurant_customer_reward_transactions
add column if not exists rule_snapshot jsonb;

-- For restaurants that already have rewards enabled from the previous build,
-- lock the activation time now. Existing reward transactions stay untouched.
update public.restaurants
set
  rewards_activated_at = coalesce(rewards_activated_at, now()),
  rewards_rule_updated_at = coalesce(rewards_rule_updated_at, now())
where coalesce(rewards_enabled, false) = true;

create or replace function public.set_restaurant_reward_rule_timestamps()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.rewards_enabled, false) = true
     and coalesce(old.rewards_enabled, false) = false then
    new.rewards_activated_at := coalesce(new.rewards_activated_at, now());
    new.rewards_rule_updated_at := now();
  end if;

  if coalesce(new.rewards_enabled, false) = true
     and (
       coalesce(new.reward_amount_unit, 10) is distinct from coalesce(old.reward_amount_unit, 10)
       or coalesce(new.reward_points_per_amount, 1) is distinct from coalesce(old.reward_points_per_amount, 1)
       or coalesce(new.reward_redeem_points, 100) is distinct from coalesce(old.reward_redeem_points, 100)
       or coalesce(new.reward_redeem_discount_amount, 10) is distinct from coalesce(old.reward_redeem_discount_amount, 10)
       or coalesce(new.reward_expiration_enabled, false) is distinct from coalesce(old.reward_expiration_enabled, false)
       or coalesce(new.reward_expiry_value, 0) is distinct from coalesce(old.reward_expiry_value, 0)
       or coalesce(new.reward_expiry_unit, 'lifetime') is distinct from coalesce(old.reward_expiry_unit, 'lifetime')
     ) then
    new.rewards_rule_updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists set_restaurant_reward_rule_timestamps_trigger
on public.restaurants;

create trigger set_restaurant_reward_rule_timestamps_trigger
before update of
  rewards_enabled,
  reward_amount_unit,
  reward_points_per_amount,
  reward_redeem_points,
  reward_redeem_discount_amount,
  reward_expiration_enabled,
  reward_expiry_value,
  reward_expiry_unit
on public.restaurants
for each row
execute function public.set_restaurant_reward_rule_timestamps();

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
  v_rewards_activated_at timestamptz;
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
    coalesce(nullif(r.reward_expiry_unit, ''), 'lifetime'),
    r.rewards_activated_at
  into
    v_rewards_enabled,
    v_reward_amount_unit,
    v_reward_points_per_amount,
    v_reward_expiration_enabled,
    v_reward_expiry_value,
    v_reward_expiry_unit,
    v_rewards_activated_at
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
      earning_rule_amount_unit,
      earning_rule_points_per_amount,
      order_total_amount_snapshot,
      rule_snapshot,
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
      v_reward_amount_unit,
      v_reward_points_per_amount,
      coalesce(ro.total_amount, 0)::numeric(12,2),
      jsonb_build_object(
        'reward_amount_unit', v_reward_amount_unit,
        'reward_points_per_amount', v_reward_points_per_amount,
        'reward_expiration_enabled', v_reward_expiration_enabled,
        'reward_expiry_value', v_reward_expiry_value,
        'reward_expiry_unit', v_reward_expiry_unit,
        'locked_at', now()
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
      and (
        v_rewards_activated_at is null
        or coalesce(ro.updated_at, ro.created_at) >= v_rewards_activated_at
      )
    on conflict (order_id, transaction_type)
    where transaction_type = 'earn' and order_id is not null
    do nothing;

    -- Very important:
    -- We never update existing 'earn' transactions here.
    -- This locks old earned points to the rule that was active when the order earned points.
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

create or replace function public.sync_restaurant_customer_after_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.restaurant_id is not null
     and coalesce(trim(new.customer_phone), '') <> ''
     and new.status = 'completed'
     and new.payment_status = 'paid' then
    perform public.refresh_restaurant_customers(new.restaurant_id);
  end if;

  return new;
end;
$$;

drop trigger if exists sync_restaurant_customer_after_order_trigger
on public.restaurant_orders;

create trigger sync_restaurant_customer_after_order_trigger
after insert or update of status, payment_status, total_amount, customer_phone, customer_name
on public.restaurant_orders
for each row
execute function public.sync_restaurant_customer_after_order();

-- Recalculate customer order/spend totals and reward balance from locked transactions.
-- Existing earned points are not changed by this refresh.
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
