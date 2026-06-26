-- Spizy Settings + Payment Gateway Foundation + Public Order Charges
-- Run after the previous restaurant settings / rewards / coupon SQL packages.

alter table public.restaurants
add column if not exists facebook_url text,
add column if not exists tiktok_url text,
add column if not exists youtube_url text,
add column if not exists x_url text,
add column if not exists custom_social_links jsonb not null default '[]'::jsonb,
add column if not exists map_latitude numeric(10,7),
add column if not exists map_longitude numeric(10,7),
add column if not exists map_url text,
add column if not exists accept_outside_orders boolean not null default true,
add column if not exists shipping_fee numeric(10,2) not null default 0,
add column if not exists packaging_fee numeric(10,2) not null default 0,
add column if not exists payment_gateway_settings jsonb not null default '{
  "cod": {"enabled": true, "cash_enabled": true, "card_enabled": true},
  "ziina": {"enabled": false, "test_mode": true},
  "stripe": {"enabled": false, "test_mode": true},
  "paypal": {"enabled": false, "test_mode": true},
  "network": {"enabled": false, "test_mode": true},
  "cashfree": {"enabled": false, "test_mode": true},
  "razorpay": {"enabled": false, "test_mode": true},
  "phonepe": {"enabled": false, "test_mode": true}
}'::jsonb;

update public.restaurants
set shipping_fee = coalesce(shipping_fee, delivery_fee, 0)
where shipping_fee = 0 and coalesce(delivery_fee, 0) > 0;

alter table public.restaurant_orders
add column if not exists delivery_fee numeric(10,2) not null default 0,
add column if not exists shipping_fee numeric(10,2) not null default 0,
add column if not exists packaging_fee numeric(10,2) not null default 0,
add column if not exists tax_rate_snapshot numeric(6,2) not null default 0,
add column if not exists tax_amount numeric(10,2) not null default 0,
add column if not exists payment_gateway text,
add column if not exists delivery_payment_type text;

alter table public.restaurant_orders
drop constraint if exists restaurant_orders_payment_method_check;

alter table public.restaurant_orders
add constraint restaurant_orders_payment_method_check
check (
  payment_method in ('cash', 'card', 'cod', 'online', 'upi')
);

alter table public.restaurant_orders
drop constraint if exists restaurant_orders_delivery_payment_type_check;

alter table public.restaurant_orders
add constraint restaurant_orders_delivery_payment_type_check
check (
  delivery_payment_type is null
  or delivery_payment_type in ('cash', 'card')
);

alter table public.restaurant_orders
drop constraint if exists restaurant_orders_payment_gateway_check;

alter table public.restaurant_orders
add constraint restaurant_orders_payment_gateway_check
check (
  payment_gateway is null
  or payment_gateway in (
    'cod',
    'ziina',
    'stripe',
    'paypal',
    'network',
    'cashfree',
    'razorpay',
    'phonepe'
  )
);

create or replace function public.place_public_menu_order_with_rewards_coupon_charges(
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
  p_reward_discount_amount numeric default 0,
  p_coupon_code text default null,
  p_shipping_fee numeric default 0,
  p_packaging_fee numeric default 0,
  p_tax_rate numeric default 0,
  p_tax_amount numeric default 0,
  p_payment_gateway text default null,
  p_delivery_payment_type text default null
)
returns table (
  order_id uuid,
  order_code text,
  is_existing_bill boolean,
  reward_discount_amount numeric,
  reward_points_redeemed numeric,
  coupon_discount_amount numeric,
  coupon_code text,
  shipping_fee numeric,
  packaging_fee numeric,
  tax_amount numeric,
  payment_gateway text,
  delivery_payment_type text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result record;
  v_order public.restaurant_orders;
  v_restaurant public.restaurants;
  v_shipping_fee numeric(10,2) := greatest(coalesce(p_shipping_fee, 0), 0);
  v_packaging_fee numeric(10,2) := greatest(coalesce(p_packaging_fee, 0), 0);
  v_tax_amount numeric(10,2) := greatest(coalesce(p_tax_amount, 0), 0);
  v_tax_rate numeric(6,2) := greatest(coalesce(p_tax_rate, 0), 0);
  v_payment_gateway text := nullif(lower(trim(coalesce(p_payment_gateway, ''))), '');
  v_delivery_payment_type text := nullif(lower(trim(coalesce(p_delivery_payment_type, ''))), '');
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

  if coalesce(v_restaurant.accept_outside_orders, true) = false then
    raise exception 'This restaurant is currently showing a view-only menu.';
  end if;

  if p_order_type = 'delivery' and coalesce(v_restaurant.delivery_enabled, true) = false then
    raise exception 'Delivery orders are not active for this restaurant.';
  end if;

  if p_order_type = 'takeaway' and coalesce(v_restaurant.takeaway_enabled, true) = false then
    raise exception 'Takeaway orders are not active for this restaurant.';
  end if;

  if p_order_type = 'dine_in' and coalesce(v_restaurant.dine_in_enabled, true) = false then
    raise exception 'Dine-in orders are not active for this restaurant.';
  end if;

  if p_order_type <> 'delivery' then
    v_shipping_fee := 0;
    v_packaging_fee := 0;
    v_payment_gateway := null;
    v_delivery_payment_type := null;
  end if;

  if p_order_type = 'delivery' then
    if v_payment_gateway is null then
      v_payment_gateway := 'cod';
    end if;

    if v_payment_gateway = 'cod' then
      if coalesce(v_restaurant.accepts_cod, true) = false then
        raise exception 'COD is not active for this restaurant.';
      end if;

      if v_delivery_payment_type not in ('cash', 'card') then
        raise exception 'Choose cash or card payment for COD delivery.';
      end if;
    end if;
  end if;

  select *
  into v_result
  from public.place_public_menu_order_with_rewards_and_coupon(
    p_restaurant_id,
    p_order_type,
    p_customer_session_id,
    p_table_id,
    p_table_name,
    p_customer_name,
    p_customer_phone,
    p_currency,
    p_notes,
    p_items,
    p_reward_points_to_redeem,
    p_reward_discount_amount,
    p_coupon_code
  ) as base_order;

  select *
  into v_order
  from public.restaurant_orders ro
  where ro.id = v_result.order_id
  for update;

  if v_order.id is null then
    raise exception 'Order was not created.';
  end if;

  update public.restaurant_orders
  set
    shipping_fee = v_shipping_fee,
    delivery_fee = v_shipping_fee,
    packaging_fee = v_packaging_fee,
    tax_rate_snapshot = v_tax_rate,
    tax_amount = v_tax_amount,
    payment_gateway = v_payment_gateway,
    delivery_payment_type = v_delivery_payment_type,
    payment_method = case
      when v_payment_gateway = 'cod' then 'cod'
      else payment_method
    end,
    total_amount = greatest(coalesce(total_amount, 0), 0)
      + v_shipping_fee
      + v_packaging_fee
      + v_tax_amount,
    updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return query
  select
    v_order.id,
    v_order.order_code,
    coalesce(v_result.is_existing_bill, false)::boolean,
    coalesce(v_result.reward_discount_amount, 0)::numeric,
    coalesce(v_result.reward_points_redeemed, 0)::numeric,
    coalesce(v_result.coupon_discount_amount, 0)::numeric,
    v_result.coupon_code::text,
    coalesce(v_order.shipping_fee, 0)::numeric,
    coalesce(v_order.packaging_fee, 0)::numeric,
    coalesce(v_order.tax_amount, 0)::numeric,
    v_order.payment_gateway::text,
    v_order.delivery_payment_type::text;
end;
$$;

grant execute on function public.place_public_menu_order_with_rewards_coupon_charges(
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
  numeric,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  text
) to anon, authenticated;
