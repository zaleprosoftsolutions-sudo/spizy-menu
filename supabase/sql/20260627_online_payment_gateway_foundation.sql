-- Spizy Online Payment Gateway Foundation
-- Run after the previous settings/payment/public-order SQL packages.
-- This keeps COD working and prepares unpaid online orders for future gateway redirects/webhooks.

alter table public.restaurant_orders
add column if not exists online_payment_status text not null default 'not_required',
add column if not exists online_payment_reference text,
add column if not exists online_payment_checkout_url text;

alter table public.restaurant_orders
drop constraint if exists restaurant_orders_online_payment_status_check;

alter table public.restaurant_orders
add constraint restaurant_orders_online_payment_status_check
check (
  online_payment_status in (
    'not_required',
    'pending',
    'paid',
    'failed',
    'cancelled',
    'refunded'
  )
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

alter table public.restaurant_orders
drop constraint if exists restaurant_orders_delivery_payment_type_check;

alter table public.restaurant_orders
add constraint restaurant_orders_delivery_payment_type_check
check (
  delivery_payment_type is null
  or delivery_payment_type in ('cash', 'card')
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
  v_gateway_settings jsonb := '{}'::jsonb;
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

  v_gateway_settings := coalesce(v_restaurant.payment_gateway_settings, '{}'::jsonb);

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

    if v_payment_gateway not in ('cod', 'ziina', 'stripe', 'paypal', 'network', 'cashfree', 'razorpay', 'phonepe') then
      raise exception 'Selected payment gateway is not supported yet.';
    end if;

    if v_payment_gateway = 'cod' then
      if coalesce(v_restaurant.accepts_cod, true) = false
        or coalesce((v_gateway_settings -> 'cod' ->> 'enabled')::boolean, true) = false then
        raise exception 'COD is not active for this restaurant.';
      end if;

      if v_delivery_payment_type not in ('cash', 'card') then
        raise exception 'Choose cash or card payment for COD delivery.';
      end if;

      if v_delivery_payment_type = 'cash'
        and coalesce((v_gateway_settings -> 'cod' ->> 'cash_enabled')::boolean, true) = false then
        raise exception 'Cash on delivery is not active for this restaurant.';
      end if;

      if v_delivery_payment_type = 'card'
        and coalesce((v_gateway_settings -> 'cod' ->> 'card_enabled')::boolean, true) = false then
        raise exception 'Card on delivery is not active for this restaurant.';
      end if;
    else
      if coalesce((v_gateway_settings -> v_payment_gateway ->> 'enabled')::boolean, false) = false then
        raise exception 'Selected online payment gateway is not active for this restaurant.';
      end if;

      v_delivery_payment_type := null;
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
      when v_payment_gateway is not null then 'online'
      else payment_method
    end,
    payment_status = case
      when v_payment_gateway is not null then 'unpaid'
      else payment_status
    end,
    online_payment_status = case
      when v_payment_gateway is not null and v_payment_gateway <> 'cod' then 'pending'
      else 'not_required'
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
