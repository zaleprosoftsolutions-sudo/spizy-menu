-- Spizy Public Gift Voucher / Store Credit Checkout Connection
-- Run after Gift Vouchers foundation and public order charges SQL files.

alter table public.restaurant_orders
add column if not exists gift_voucher_id uuid references public.restaurant_gift_vouchers(id) on delete set null;

alter table public.restaurant_orders
add column if not exists gift_voucher_code text;

alter table public.restaurant_orders
add column if not exists gift_voucher_discount_amount numeric(12,2) not null default 0;

create or replace function public.validate_public_gift_voucher(
  p_restaurant_id uuid,
  p_voucher_code text,
  p_order_total numeric default 0,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_voucher_code, '')));
  v_customer_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\s+', '', 'g');
  v_voucher public.restaurant_gift_vouchers;
  v_order_total numeric(12,2) := greatest(coalesce(p_order_total, 0), 0);
  v_discount numeric(12,2) := 0;
  v_remaining numeric(12,2) := 0;
begin
  if v_code = '' then
    raise exception 'Enter gift voucher code.';
  end if;

  if v_order_total <= 0 then
    raise exception 'Gift voucher cannot be applied to zero total.';
  end if;

  select *
  into v_voucher
  from public.restaurant_gift_vouchers rgv
  where rgv.restaurant_id = p_restaurant_id
    and lower(rgv.voucher_code) = lower(v_code)
    and rgv.is_deleted = false
  limit 1;

  if v_voucher.id is null then
    raise exception 'Gift voucher is invalid.';
  end if;

  if v_voucher.status <> 'active' then
    raise exception 'Gift voucher is not active.';
  end if;

  if v_voucher.expires_at is not null and v_voucher.expires_at < now() then
    raise exception 'Gift voucher is expired.';
  end if;

  if coalesce(v_voucher.balance_amount, 0) <= 0 then
    raise exception 'Gift voucher balance is not available.';
  end if;

  if nullif(regexp_replace(coalesce(v_voucher.customer_phone, ''), '\s+', '', 'g'), '') is not null then
    if nullif(v_customer_phone, '') is null then
      raise exception 'Save your phone number to use this gift voucher.';
    end if;

    if regexp_replace(coalesce(v_voucher.customer_phone, ''), '\s+', '', 'g') <> v_customer_phone then
      raise exception 'This gift voucher is linked to another phone number.';
    end if;
  end if;

  v_discount := least(coalesce(v_voucher.balance_amount, 0), v_order_total);
  v_remaining := greatest(coalesce(v_voucher.balance_amount, 0) - v_discount, 0);

  return jsonb_build_object(
    'voucher_id', v_voucher.id,
    'voucher_code', v_voucher.voucher_code,
    'title', v_voucher.title,
    'currency', v_voucher.currency,
    'balance_amount', coalesce(v_voucher.balance_amount, 0),
    'discount_amount', v_discount,
    'remaining_after_use', v_remaining,
    'message', 'Gift voucher applied successfully.'
  );
end;
$$;

grant execute on function public.validate_public_gift_voucher(
  uuid,
  text,
  numeric,
  text
) to anon, authenticated;

create or replace function public.place_public_menu_order_with_rewards_coupon_charges_voucher(
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
  p_delivery_payment_type text default null,
  p_gift_voucher_code text default null,
  p_gift_voucher_amount numeric default 0
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
  delivery_payment_type text,
  gift_voucher_code text,
  gift_voucher_discount_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result record;
  v_order public.restaurant_orders;
  v_voucher public.restaurant_gift_vouchers;
  v_code text := upper(trim(coalesce(p_gift_voucher_code, '')));
  v_customer_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\s+', '', 'g');
  v_requested_amount numeric(12,2) := greatest(coalesce(p_gift_voucher_amount, 0), 0);
  v_redeem_amount numeric(12,2) := 0;
  v_balance_after numeric(12,2) := 0;
begin
  select *
  into v_result
  from public.place_public_menu_order_with_rewards_coupon_charges(
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
    p_coupon_code,
    p_shipping_fee,
    p_packaging_fee,
    p_tax_rate,
    p_tax_amount,
    p_payment_gateway,
    p_delivery_payment_type
  ) as base_order;

  select *
  into v_order
  from public.restaurant_orders ro
  where ro.id = v_result.order_id
  for update;

  if v_order.id is null then
    raise exception 'Order was not created.';
  end if;

  if v_code = '' then
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
      v_order.delivery_payment_type::text,
      v_order.gift_voucher_code::text,
      coalesce(v_order.gift_voucher_discount_amount, 0)::numeric;
    return;
  end if;

  if coalesce(v_order.gift_voucher_discount_amount, 0) > 0
     or v_order.gift_voucher_id is not null then
    raise exception 'A gift voucher is already applied to this bill.';
  end if;

  if coalesce(v_order.total_amount, 0) <= 0 then
    raise exception 'Gift voucher cannot be applied to zero total.';
  end if;

  select *
  into v_voucher
  from public.restaurant_gift_vouchers rgv
  where rgv.restaurant_id = p_restaurant_id
    and lower(rgv.voucher_code) = lower(v_code)
    and rgv.is_deleted = false
  limit 1
  for update;

  if v_voucher.id is null then
    raise exception 'Gift voucher is invalid.';
  end if;

  if v_voucher.status <> 'active' then
    raise exception 'Gift voucher is not active.';
  end if;

  if v_voucher.expires_at is not null and v_voucher.expires_at < now() then
    raise exception 'Gift voucher is expired.';
  end if;

  if coalesce(v_voucher.balance_amount, 0) <= 0 then
    raise exception 'Gift voucher balance is not available.';
  end if;

  if nullif(regexp_replace(coalesce(v_voucher.customer_phone, ''), '\s+', '', 'g'), '') is not null then
    if nullif(v_customer_phone, '') is null then
      raise exception 'Save your phone number to use this gift voucher.';
    end if;

    if regexp_replace(coalesce(v_voucher.customer_phone, ''), '\s+', '', 'g') <> v_customer_phone then
      raise exception 'This gift voucher is linked to another phone number.';
    end if;
  end if;

  v_redeem_amount := least(
    coalesce(v_voucher.balance_amount, 0),
    coalesce(v_order.total_amount, 0),
    case
      when v_requested_amount > 0 then v_requested_amount
      else coalesce(v_order.total_amount, 0)
    end
  );

  if v_redeem_amount <= 0 then
    raise exception 'Gift voucher amount cannot be applied.';
  end if;

  v_balance_after := greatest(coalesce(v_voucher.balance_amount, 0) - v_redeem_amount, 0);

  update public.restaurant_orders
  set
    gift_voucher_id = v_voucher.id,
    gift_voucher_code = v_voucher.voucher_code,
    gift_voucher_discount_amount = v_redeem_amount,
    discount_amount = coalesce(discount_amount, 0) + v_redeem_amount,
    total_amount = greatest(coalesce(total_amount, 0) - v_redeem_amount, 0),
    payment_status = case
      when greatest(coalesce(total_amount, 0) - v_redeem_amount, 0) = 0 then 'paid'
      else payment_status
    end,
    updated_at = now()
  where id = v_order.id
  returning *
  into v_order;

  update public.restaurant_gift_vouchers
  set
    balance_amount = v_balance_after,
    status = case when v_balance_after <= 0 then 'redeemed' else status end,
    updated_at = now()
  where id = v_voucher.id;

  insert into public.restaurant_gift_voucher_transactions (
    restaurant_id,
    voucher_id,
    action_type,
    amount,
    balance_after,
    reference_order_id,
    notes
  )
  values (
    p_restaurant_id,
    v_voucher.id,
    'redeem',
    v_redeem_amount,
    v_balance_after,
    v_order.id,
    'Redeemed from public QR menu checkout'
  );

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
    v_order.delivery_payment_type::text,
    v_order.gift_voucher_code::text,
    coalesce(v_order.gift_voucher_discount_amount, 0)::numeric;
end;
$$;

grant execute on function public.place_public_menu_order_with_rewards_coupon_charges_voucher(
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
  text,
  text,
  numeric
) to anon, authenticated;
