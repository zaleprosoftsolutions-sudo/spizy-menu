-- Spizy Rewards Coupon Checkout
-- Run after the customers/rewards foundation and public rewards tab SQL files.

alter table public.restaurant_orders
add column if not exists reward_discount_amount numeric(10,2) not null default 0;

alter table public.restaurant_orders
add column if not exists reward_points_redeemed numeric(12,2) not null default 0;

alter table public.restaurant_orders
add column if not exists reward_coupon_code text;

create unique index if not exists reward_transactions_order_redeem_unique
on public.restaurant_customer_reward_transactions (order_id, transaction_type)
where transaction_type = 'redeem' and order_id is not null;

create or replace function public.place_public_menu_order_with_rewards(
  p_restaurant_id uuid,
  p_order_type text,
  p_customer_session_id text,
  p_table_id uuid,
  p_table_name text,
  p_customer_name text,
  p_customer_phone text,
  p_currency text,
  p_notes text,
  p_items jsonb,
  p_reward_points_to_redeem numeric default 0,
  p_reward_discount_amount numeric default 0
)
returns table (
  order_id uuid,
  order_code text,
  is_existing_bill boolean,
  reward_discount_amount numeric,
  reward_points_redeemed numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_code text;
  v_is_existing boolean := false;
  v_order public.restaurant_orders;
  v_restaurant record;
  v_customer public.restaurant_customers;
  v_phone text;
  v_points_to_redeem numeric(12,2) := 0;
  v_reward_discount numeric(10,2) := 0;
  v_existing_reward_points numeric(12,2) := 0;
  v_existing_reward_discount numeric(10,2) := 0;
begin
  select base_order.order_id,
         base_order.order_code,
         base_order.is_existing_bill
  into v_order_id,
       v_order_code,
       v_is_existing
  from public.place_public_menu_order(
    p_restaurant_id,
    p_order_type,
    p_customer_session_id,
    p_table_id,
    p_table_name,
    p_customer_name,
    p_customer_phone,
    p_currency,
    p_notes,
    p_items
  ) as base_order;

  select *
  into v_order
  from public.restaurant_orders ro
  where ro.id = v_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order was not created.';
  end if;

  v_points_to_redeem := greatest(coalesce(p_reward_points_to_redeem, 0), 0);
  v_reward_discount := greatest(coalesce(p_reward_discount_amount, 0), 0);

  if v_points_to_redeem <= 0 or v_reward_discount <= 0 then
    return query
    select
      v_order.id,
      v_order.order_code,
      v_is_existing,
      coalesce(v_order.reward_discount_amount, 0),
      coalesce(v_order.reward_points_redeemed, 0);
    return;
  end if;

  select
    r.id,
    coalesce(r.rewards_enabled, false) as rewards_enabled,
    greatest(coalesce(r.reward_redeem_points, 100), 1) as reward_redeem_points,
    greatest(coalesce(r.reward_redeem_discount_amount, 10), 0) as reward_redeem_discount_amount
  into v_restaurant
  from public.restaurants r
  where r.id = p_restaurant_id
    and r.is_active = true
  limit 1;

  if v_restaurant.id is null then
    raise exception 'Restaurant is not active.';
  end if;

  if coalesce(v_restaurant.rewards_enabled, false) = false then
    raise exception 'Rewards are not active for this restaurant.';
  end if;

  if v_points_to_redeem < v_restaurant.reward_redeem_points then
    raise exception 'Not enough reward points selected for redemption.';
  end if;

  v_points_to_redeem := v_restaurant.reward_redeem_points;
  v_reward_discount := least(
    v_reward_discount,
    v_restaurant.reward_redeem_discount_amount,
    greatest(coalesce(v_order.total_amount, 0), 0)
  );

  if v_reward_discount <= 0 then
    raise exception 'Reward discount cannot be applied to this order.';
  end if;

  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '\s+', '', 'g');

  if coalesce(v_phone, '') = '' and coalesce(trim(p_customer_session_id), '') <> '' then
    select regexp_replace(coalesce(ro.customer_phone, ''), '\s+', '', 'g')
    into v_phone
    from public.restaurant_orders ro
    where ro.restaurant_id = p_restaurant_id
      and ro.customer_session_id = p_customer_session_id
      and coalesce(trim(ro.customer_phone), '') <> ''
    order by ro.updated_at desc nulls last, ro.created_at desc
    limit 1;
  end if;

  if coalesce(v_phone, '') = '' then
    raise exception 'Phone number is required to redeem rewards.';
  end if;

  select *
  into v_customer
  from public.restaurant_customers rc
  where rc.restaurant_id = p_restaurant_id
    and regexp_replace(coalesce(rc.customer_phone, ''), '\s+', '', 'g') = v_phone
  limit 1
  for update;

  if v_customer.id is null then
    raise exception 'No reward account found for this phone number yet.';
  end if;

  if coalesce(v_customer.reward_points, 0) < v_points_to_redeem then
    raise exception 'You do not have enough points to redeem this coupon.';
  end if;

  v_existing_reward_points := coalesce(v_order.reward_points_redeemed, 0);
  v_existing_reward_discount := coalesce(v_order.reward_discount_amount, 0);

  if v_existing_reward_points > 0 or v_existing_reward_discount > 0 then
    raise exception 'A reward coupon is already applied to this bill.';
  end if;

  update public.restaurant_orders
  set
    reward_discount_amount = v_reward_discount,
    reward_points_redeemed = v_points_to_redeem,
    reward_coupon_code = 'RW-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
    discount_amount = coalesce(discount_amount, 0) + v_reward_discount,
    total_amount = greatest(coalesce(total_amount, 0) - v_reward_discount, 0),
    updated_at = now()
  where id = v_order.id
  returning *
  into v_order;

  insert into public.restaurant_customer_reward_transactions (
    restaurant_id,
    customer_id,
    order_id,
    transaction_type,
    points,
    description,
    created_at
  )
  values (
    p_restaurant_id,
    v_customer.id,
    v_order.id,
    'redeem',
    -v_points_to_redeem,
    'Redeemed reward coupon for order ' || coalesce(v_order.order_code, v_order.public_order_number, v_order.id::text),
    now()
  );

  update public.restaurant_customers
  set
    reward_points = greatest(coalesce(reward_points, 0) - v_points_to_redeem, 0),
    updated_at = now()
  where id = v_customer.id;

  return query
  select
    v_order.id,
    v_order.order_code,
    v_is_existing,
    coalesce(v_order.reward_discount_amount, 0),
    coalesce(v_order.reward_points_redeemed, 0);
end;
$$;

grant execute on function public.place_public_menu_order_with_rewards(
  uuid,
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  numeric,
  numeric
) to anon, authenticated;
