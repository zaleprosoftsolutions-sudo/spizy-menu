-- Spizy Rewards Ledger + Manual Adjustments
-- Run after previous rewards SQL files.
-- Adds admin/customer reward activity history and safe manual point adjustments.

alter table public.restaurant_customer_reward_transactions
add column if not exists expires_at timestamptz;

alter table public.restaurant_customer_reward_transactions
add column if not exists earning_rule_amount_unit numeric(10,2);

alter table public.restaurant_customer_reward_transactions
add column if not exists earning_rule_points_per_amount numeric(10,2);

alter table public.restaurant_customer_reward_transactions
add column if not exists order_total_amount_snapshot numeric(12,2);

alter table public.restaurant_customer_reward_transactions
add column if not exists rule_snapshot jsonb;

create index if not exists reward_transactions_restaurant_customer_idx
on public.restaurant_customer_reward_transactions (
  restaurant_id,
  customer_id,
  created_at desc
);

create or replace function public.recalculate_customer_reward_balance(
  p_customer_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(12,2) := 0;
begin
  if p_customer_id is null then
    return 0;
  end if;

  select greatest(
    coalesce(
      sum(rcrt.points) filter (
        where rcrt.expires_at is null
           or rcrt.expires_at > now()
           or rcrt.points < 0
      ),
      0
    ),
    0
  )
  into v_balance
  from public.restaurant_customer_reward_transactions rcrt
  where rcrt.customer_id = p_customer_id;

  update public.restaurant_customers
  set
    reward_points = coalesce(v_balance, 0),
    updated_at = now()
  where id = p_customer_id;

  return coalesce(v_balance, 0);
end;
$$;

create or replace function public.get_restaurant_customer_reward_ledger(
  p_restaurant_id uuid,
  p_customer_id uuid
)
returns table (
  id uuid,
  transaction_type text,
  points numeric,
  description text,
  expires_at timestamptz,
  created_at timestamptz,
  order_id uuid,
  order_code text,
  public_order_number text,
  order_total_amount_snapshot numeric,
  earning_rule_amount_unit numeric,
  earning_rule_points_per_amount numeric,
  is_expired boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_restaurant_id is null or p_customer_id is null then
    return;
  end if;

  if auth.uid() is not null
     and not (
       public.is_restaurant_member(p_restaurant_id)
       or public.get_my_role() = 'super_admin'
     ) then
    raise exception 'Not allowed to view this customer ledger.';
  end if;

  return query
  select
    rcrt.id,
    rcrt.transaction_type,
    rcrt.points,
    rcrt.description,
    rcrt.expires_at,
    rcrt.created_at,
    rcrt.order_id,
    ro.order_code,
    ro.public_order_number,
    rcrt.order_total_amount_snapshot,
    rcrt.earning_rule_amount_unit,
    rcrt.earning_rule_points_per_amount,
    (rcrt.expires_at is not null and rcrt.expires_at <= now() and rcrt.points > 0) as is_expired
  from public.restaurant_customer_reward_transactions rcrt
  left join public.restaurant_orders ro
    on ro.id = rcrt.order_id
  where rcrt.restaurant_id = p_restaurant_id
    and rcrt.customer_id = p_customer_id
  order by rcrt.created_at desc
  limit 80;
end;
$$;

grant execute on function public.get_restaurant_customer_reward_ledger(uuid, uuid)
to authenticated;

create or replace function public.adjust_customer_reward_points(
  p_restaurant_id uuid,
  p_customer_id uuid,
  p_points numeric,
  p_description text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer public.restaurant_customers;
  v_points numeric(12,2) := coalesce(p_points, 0);
  v_balance numeric(12,2) := 0;
begin
  if p_restaurant_id is null or p_customer_id is null then
    raise exception 'Restaurant and customer are required.';
  end if;

  if auth.uid() is not null
     and not (
       public.is_restaurant_member(p_restaurant_id)
       or public.get_my_role() = 'super_admin'
     ) then
    raise exception 'Not allowed to adjust points for this customer.';
  end if;

  if v_points = 0 then
    raise exception 'Adjustment points cannot be zero.';
  end if;

  select *
  into v_customer
  from public.restaurant_customers rc
  where rc.restaurant_id = p_restaurant_id
    and rc.id = p_customer_id
  for update;

  if v_customer.id is null then
    raise exception 'Customer not found.';
  end if;

  if v_points < 0 and coalesce(v_customer.reward_points, 0) < abs(v_points) then
    raise exception 'Cannot deduct more points than the customer balance.';
  end if;

  insert into public.restaurant_customer_reward_transactions (
    restaurant_id,
    customer_id,
    transaction_type,
    points,
    description,
    rule_snapshot,
    created_at
  )
  values (
    p_restaurant_id,
    p_customer_id,
    'adjust',
    v_points,
    coalesce(nullif(trim(p_description), ''), 'Manual reward point adjustment'),
    jsonb_build_object(
      'adjusted_by', auth.uid(),
      'adjusted_at', now(),
      'source', 'restaurant_dashboard'
    ),
    now()
  );

  v_balance := public.recalculate_customer_reward_balance(p_customer_id);

  return v_balance;
end;
$$;

grant execute on function public.adjust_customer_reward_points(uuid, uuid, numeric, text)
to authenticated;

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
      'phone_required', coalesce(v_phone, '') = '',
      'transactions', '[]'::jsonb
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
    perform public.recalculate_customer_reward_balance(v_customer.id);

    select *
    into v_customer
    from public.restaurant_customers rc
    where rc.id = v_customer.id;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', rt.id,
          'transaction_type', rt.transaction_type,
          'points', rt.points,
          'description', rt.description,
          'expires_at', rt.expires_at,
          'created_at', rt.created_at,
          'order_id', rt.order_id,
          'order_code', rt.order_code,
          'public_order_number', rt.public_order_number,
          'order_total_amount_snapshot', rt.order_total_amount_snapshot,
          'earning_rule_amount_unit', rt.earning_rule_amount_unit,
          'earning_rule_points_per_amount', rt.earning_rule_points_per_amount,
          'is_expired', rt.is_expired
        )
        order by rt.created_at desc
      ),
      '[]'::jsonb
    )
    into v_transactions
    from (
      select
        rcrt.*,
        ro.order_code,
        ro.public_order_number,
        (rcrt.expires_at is not null and rcrt.expires_at <= now() and rcrt.points > 0) as is_expired
      from public.restaurant_customer_reward_transactions rcrt
      left join public.restaurant_orders ro
        on ro.id = rcrt.order_id
      where rcrt.customer_id = v_customer.id
      order by rcrt.created_at desc
      limit 20
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
