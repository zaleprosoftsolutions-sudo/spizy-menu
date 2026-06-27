-- Spizy POS Gift Voucher / Store Credit Checkout Connection
-- Run after Gift Vouchers foundation.

alter table public.restaurant_orders
add column if not exists gift_voucher_id uuid references public.restaurant_gift_vouchers(id) on delete set null;

alter table public.restaurant_orders
add column if not exists gift_voucher_code text;

alter table public.restaurant_orders
add column if not exists gift_voucher_discount_amount numeric(12,2) not null default 0;

create or replace function public.validate_pos_gift_voucher(
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
  if not (public.is_restaurant_member(p_restaurant_id) or public.get_my_role() = 'super_admin') then
    raise exception 'You do not have access to this restaurant.';
  end if;

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
      raise exception 'Customer phone is required for this gift voucher.';
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

grant execute on function public.validate_pos_gift_voucher(
  uuid,
  text,
  numeric,
  text
) to authenticated;

create or replace function public.create_pos_order_with_gift_voucher(
  p_restaurant_id uuid,
  p_order_type text,
  p_payment_method text,
  p_customer_name text,
  p_customer_phone text,
  p_table_name text,
  p_currency text,
  p_notes text,
  p_subtotal numeric,
  p_discount_amount numeric,
  p_extra_amount numeric,
  p_total_before_voucher numeric,
  p_gift_voucher_code text,
  p_items jsonb
)
returns table (
  order_id uuid,
  order_code text,
  payment_status text,
  total_amount numeric,
  gift_voucher_code text,
  gift_voucher_discount_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_gift_voucher_code, '')));
  v_customer_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\s+', '', 'g');
  v_voucher public.restaurant_gift_vouchers;
  v_gift_discount numeric(12,2) := 0;
  v_balance_after numeric(12,2) := 0;
  v_total_before numeric(12,2) := greatest(coalesce(p_total_before_voucher, 0), 0);
  v_final_total numeric(12,2) := 0;
  v_order_id uuid;
  v_order_code text;
  v_payment_status text;
begin
  if not (public.is_restaurant_member(p_restaurant_id) or public.get_my_role() = 'super_admin') then
    raise exception 'You do not have access to this restaurant.';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'Order items are required.';
  end if;

  if v_total_before <= 0 and v_code <> '' then
    raise exception 'Gift voucher cannot be applied to zero total.';
  end if;

  if v_code <> '' then
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
        raise exception 'Customer phone is required for this gift voucher.';
      end if;

      if regexp_replace(coalesce(v_voucher.customer_phone, ''), '\s+', '', 'g') <> v_customer_phone then
        raise exception 'This gift voucher is linked to another phone number.';
      end if;
    end if;

    v_gift_discount := least(coalesce(v_voucher.balance_amount, 0), v_total_before);
    v_balance_after := greatest(coalesce(v_voucher.balance_amount, 0) - v_gift_discount, 0);
  end if;

  v_final_total := greatest(v_total_before - v_gift_discount, 0);
  v_payment_status := case
    when p_payment_method = 'cod' and v_final_total > 0 then 'unpaid'
    else 'paid'
  end;

  insert into public.restaurant_orders (
    restaurant_id,
    order_type,
    status,
    payment_method,
    payment_status,
    customer_name,
    customer_phone,
    table_name,
    subtotal,
    discount_amount,
    extra_amount,
    total_amount,
    currency,
    notes,
    created_by,
    gift_voucher_id,
    gift_voucher_code,
    gift_voucher_discount_amount
  )
  values (
    p_restaurant_id,
    coalesce(nullif(p_order_type, ''), 'counter'),
    'completed',
    coalesce(nullif(p_payment_method, ''), 'cash'),
    v_payment_status,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    nullif(trim(coalesce(p_table_name, '')), ''),
    greatest(coalesce(p_subtotal, 0), 0),
    greatest(coalesce(p_discount_amount, 0), 0) + v_gift_discount,
    greatest(coalesce(p_extra_amount, 0), 0),
    v_final_total,
    coalesce(nullif(p_currency, ''), 'AED'),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(),
    case when v_gift_discount > 0 then v_voucher.id else null end,
    case when v_gift_discount > 0 then v_voucher.voucher_code else null end,
    v_gift_discount
  )
  returning id, restaurant_orders.order_code
  into v_order_id, v_order_code;

  insert into public.restaurant_order_items (
    order_id,
    restaurant_id,
    item_id,
    variation_id,
    item_name,
    variation_name,
    quantity,
    unit_price,
    total_price
  )
  select
    v_order_id,
    p_restaurant_id,
    nullif(item ->> 'itemId', '')::uuid,
    nullif(item ->> 'variationId', '')::uuid,
    coalesce(nullif(item ->> 'name', ''), 'Item'),
    nullif(item ->> 'variationName', ''),
    greatest(coalesce((item ->> 'quantity')::numeric, 1), 1),
    greatest(coalesce((item ->> 'unitPrice')::numeric, 0), 0),
    greatest(coalesce((item ->> 'totalPrice')::numeric, 0), 0)
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item;

  if v_gift_discount > 0 then
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
      notes,
      created_by
    )
    values (
      p_restaurant_id,
      v_voucher.id,
      'redeem',
      v_gift_discount,
      v_balance_after,
      v_order_id,
      'Redeemed from POS checkout',
      auth.uid()
    );
  end if;

  return query
  select
    v_order_id,
    v_order_code,
    v_payment_status,
    v_final_total,
    case when v_gift_discount > 0 then v_voucher.voucher_code else null end,
    v_gift_discount;
end;
$$;

grant execute on function public.create_pos_order_with_gift_voucher(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  text,
  jsonb
) to authenticated;
