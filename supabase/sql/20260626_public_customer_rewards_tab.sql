-- Spizy Public Customer Rewards Tab
-- Run this after:
-- 1) 20260626_customers_rewards_foundation.sql
-- 2) 20260626_rewards_rules_expiration.sql

alter table public.restaurants
add column if not exists rewards_enabled boolean not null default false;

alter table public.restaurants
add column if not exists reward_amount_unit numeric(10,2) not null default 10;

alter table public.restaurants
add column if not exists reward_points_per_amount numeric(10,2) not null default 1;

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

create or replace function public.get_public_customer_rewards(
  p_restaurant_id uuid,
  p_customer_session_id text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant record;
  v_customer record;
  v_phone text;
  v_transactions jsonb := '[]'::jsonb;
begin
  if p_restaurant_id is null then
    return jsonb_build_object(
      'rewards_enabled', false,
      'message', 'Restaurant is required.'
    );
  end if;

  select
    r.id,
    r.name,
    r.currency,
    coalesce(r.rewards_enabled, false) as rewards_enabled,
    greatest(coalesce(r.reward_amount_unit, 10), 1) as reward_amount_unit,
    greatest(coalesce(r.reward_points_per_amount, 1), 0) as reward_points_per_amount,
    greatest(coalesce(r.reward_redeem_points, 100), 1) as reward_redeem_points,
    greatest(coalesce(r.reward_redeem_discount_amount, 10), 0) as reward_redeem_discount_amount,
    coalesce(r.reward_expiration_enabled, false) as reward_expiration_enabled,
    greatest(coalesce(r.reward_expiry_value, 0), 0) as reward_expiry_value,
    coalesce(nullif(r.reward_expiry_unit, ''), 'lifetime') as reward_expiry_unit
  into v_restaurant
  from public.restaurants r
  where r.id = p_restaurant_id
    and r.is_active = true
  limit 1;

  if v_restaurant.id is null then
    return jsonb_build_object(
      'rewards_enabled', false,
      'message', 'Restaurant not active.'
    );
  end if;

  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '\\s+', '', 'g');

  if coalesce(v_phone, '') = '' and coalesce(trim(p_customer_session_id), '') <> '' then
    select regexp_replace(coalesce(ro.customer_phone, ''), '\\s+', '', 'g')
    into v_phone
    from public.restaurant_orders ro
    where ro.restaurant_id = p_restaurant_id
      and ro.customer_session_id = p_customer_session_id
      and coalesce(trim(ro.customer_phone), '') <> ''
    order by ro.updated_at desc nulls last, ro.created_at desc
    limit 1;
  end if;

  if v_restaurant.rewards_enabled = false then
    return jsonb_build_object(
      'restaurant_id', v_restaurant.id,
      'restaurant_name', v_restaurant.name,
      'currency', coalesce(v_restaurant.currency, 'AED'),
      'rewards_enabled', false,
      'reward_amount_unit', v_restaurant.reward_amount_unit,
      'reward_points_per_amount', v_restaurant.reward_points_per_amount,
      'reward_redeem_points', v_restaurant.reward_redeem_points,
      'reward_redeem_discount_amount', v_restaurant.reward_redeem_discount_amount,
      'reward_expiration_enabled', v_restaurant.reward_expiration_enabled,
      'reward_expiry_value', v_restaurant.reward_expiry_value,
      'reward_expiry_unit', v_restaurant.reward_expiry_unit,
      'customer_found', false,
      'phone_required', coalesce(v_phone, '') = ''
    );
  end if;

  if coalesce(v_phone, '') = '' then
    return jsonb_build_object(
      'restaurant_id', v_restaurant.id,
      'restaurant_name', v_restaurant.name,
      'currency', coalesce(v_restaurant.currency, 'AED'),
      'rewards_enabled', true,
      'reward_amount_unit', v_restaurant.reward_amount_unit,
      'reward_points_per_amount', v_restaurant.reward_points_per_amount,
      'reward_redeem_points', v_restaurant.reward_redeem_points,
      'reward_redeem_discount_amount', v_restaurant.reward_redeem_discount_amount,
      'reward_expiration_enabled', v_restaurant.reward_expiration_enabled,
      'reward_expiry_value', v_restaurant.reward_expiry_value,
      'reward_expiry_unit', v_restaurant.reward_expiry_unit,
      'customer_found', false,
      'phone_required', true,
      'transactions', '[]'::jsonb
    );
  end if;

  select *
  into v_customer
  from public.restaurant_customers rc
  where rc.restaurant_id = p_restaurant_id
    and regexp_replace(coalesce(rc.customer_phone, ''), '\\s+', '', 'g') = v_phone
  limit 1;

  if v_customer.id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', rt.id,
          'transaction_type', rt.transaction_type,
          'points', rt.points,
          'description', rt.description,
          'expires_at', rt.expires_at,
          'created_at', rt.created_at
        )
        order by rt.created_at desc
      ),
      '[]'::jsonb
    )
    into v_transactions
    from (
      select *
      from public.restaurant_customer_reward_transactions rcrt
      where rcrt.customer_id = v_customer.id
      order by rcrt.created_at desc
      limit 12
    ) rt;
  end if;

  return jsonb_build_object(
    'restaurant_id', v_restaurant.id,
    'restaurant_name', v_restaurant.name,
    'currency', coalesce(v_restaurant.currency, 'AED'),
    'rewards_enabled', true,
    'reward_amount_unit', v_restaurant.reward_amount_unit,
    'reward_points_per_amount', v_restaurant.reward_points_per_amount,
    'reward_redeem_points', v_restaurant.reward_redeem_points,
    'reward_redeem_discount_amount', v_restaurant.reward_redeem_discount_amount,
    'reward_expiration_enabled', v_restaurant.reward_expiration_enabled,
    'reward_expiry_value', v_restaurant.reward_expiry_value,
    'reward_expiry_unit', v_restaurant.reward_expiry_unit,
    'phone_required', false,
    'customer_found', v_customer.id is not null,
    'customer_id', v_customer.id,
    'customer_name', v_customer.customer_name,
    'customer_phone', coalesce(v_customer.customer_phone, v_phone),
    'first_order_at', v_customer.first_order_at,
    'last_order_at', v_customer.last_order_at,
    'total_orders', coalesce(v_customer.total_orders, 0),
    'total_spend', coalesce(v_customer.total_spend, 0),
    'reward_points', coalesce(v_customer.reward_points, 0),
    'transactions', v_transactions
  );
end;
$$;

grant execute on function public.get_public_customer_rewards(uuid, text, text)
to anon, authenticated;
