-- Spizy Discount Coupon Checkout Connection
-- Run after discounts foundation and rewards coupon checkout SQL files.

alter table public.restaurant_orders
add column if not exists coupon_discount_id uuid references public.restaurant_discounts(id) on delete set null;

alter table public.restaurant_orders
add column if not exists coupon_code text;

alter table public.restaurant_orders
add column if not exists coupon_discount_amount numeric(10,2) not null default 0;

create table if not exists public.restaurant_discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  discount_id uuid not null references public.restaurant_discounts(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  customer_phone text,
  customer_session_id text,
  coupon_code text not null,
  discount_amount numeric(10,2) not null default 0,
  order_subtotal_snapshot numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists restaurant_discount_redemptions_discount_idx
on public.restaurant_discount_redemptions (discount_id, created_at desc);

create index if not exists restaurant_discount_redemptions_customer_idx
on public.restaurant_discount_redemptions (
  restaurant_id,
  discount_id,
  customer_phone,
  customer_session_id
);

alter table public.restaurant_discount_redemptions enable row level security;

drop policy if exists "Restaurant discount redemptions member select" on public.restaurant_discount_redemptions;
drop policy if exists "Restaurant discount redemptions member insert" on public.restaurant_discount_redemptions;

create policy "Restaurant discount redemptions member select"
on public.restaurant_discount_redemptions
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant discount redemptions member insert"
on public.restaurant_discount_redemptions
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create or replace function public.place_public_menu_order_with_rewards_and_coupon(
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
  p_coupon_code text default null
)
returns table (
  order_id uuid,
  order_code text,
  is_existing_bill boolean,
  reward_discount_amount numeric,
  reward_points_redeemed numeric,
  coupon_discount_amount numeric,
  coupon_code text
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
  v_discount public.restaurant_discounts;
  v_coupon_code text := upper(trim(coalesce(p_coupon_code, '')));
  v_customer_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\s+', '', 'g');
  v_customer_session_id text := nullif(trim(coalesce(p_customer_session_id, '')), '');
  v_discountable_subtotal numeric(10,2) := 0;
  v_discount_amount numeric(10,2) := 0;
  v_customer_used_count integer := 0;
begin
  select reward_order.order_id,
         reward_order.order_code,
         reward_order.is_existing_bill,
         reward_order.reward_discount_amount,
         reward_order.reward_points_redeemed
  into v_order_id,
       v_order_code,
       v_is_existing,
       reward_discount_amount,
       reward_points_redeemed
  from public.place_public_menu_order_with_rewards(
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
    p_reward_discount_amount
  ) as reward_order;

  select *
  into v_order
  from public.restaurant_orders ro
  where ro.id = v_order_id
  for update;

  if v_order.id is null then
    raise exception 'Order was not created.';
  end if;

  if v_coupon_code = '' then
    return query
    select
      v_order.id,
      v_order.order_code,
      v_is_existing,
      coalesce(v_order.reward_discount_amount, 0),
      coalesce(v_order.reward_points_redeemed, 0),
      coalesce(v_order.coupon_discount_amount, 0),
      v_order.coupon_code;
    return;
  end if;

  if coalesce(v_order.coupon_discount_amount, 0) > 0
     or v_order.coupon_discount_id is not null then
    raise exception 'A coupon is already applied to this bill.';
  end if;

  select *
  into v_discount
  from public.restaurant_discounts rd
  where rd.restaurant_id = p_restaurant_id
    and lower(rd.code) = lower(v_coupon_code)
    and rd.is_deleted = false
    and rd.is_active = true
    and (rd.starts_at is null or rd.starts_at <= now())
    and (rd.ends_at is null or rd.ends_at >= now())
  limit 1
  for update;

  if v_discount.id is null then
    raise exception 'Coupon is invalid or expired.';
  end if;

  if v_discount.usage_limit is not null
     and coalesce(v_discount.used_count, 0) >= v_discount.usage_limit then
    raise exception 'Coupon usage limit reached.';
  end if;

  if coalesce(v_customer_phone, '') <> '' or v_customer_session_id is not null then
    select count(*)::integer
    into v_customer_used_count
    from public.restaurant_discount_redemptions rdr
    where rdr.restaurant_id = p_restaurant_id
      and rdr.discount_id = v_discount.id
      and (
        (coalesce(v_customer_phone, '') <> '' and rdr.customer_phone = v_customer_phone)
        or
        (v_customer_session_id is not null and rdr.customer_session_id = v_customer_session_id)
      );

    if v_customer_used_count >= coalesce(v_discount.per_customer_limit, 1) then
      raise exception 'This coupon was already used for this customer.';
    end if;
  end if;

  v_discountable_subtotal := greatest(
    coalesce(v_order.subtotal, 0) - coalesce(v_order.reward_discount_amount, 0),
    0
  );

  if v_discountable_subtotal < coalesce(v_discount.min_order_amount, 0) then
    raise exception 'Minimum order amount not reached for this coupon.';
  end if;

  if v_discount.discount_type = 'percentage' then
    v_discount_amount := round(
      v_discountable_subtotal * (coalesce(v_discount.discount_value, 0) / 100),
      2
    );

    if v_discount.max_discount_amount is not null then
      v_discount_amount := least(v_discount_amount, v_discount.max_discount_amount);
    end if;
  else
    v_discount_amount := coalesce(v_discount.discount_value, 0);
  end if;

  v_discount_amount := least(
    greatest(v_discount_amount, 0),
    greatest(coalesce(v_order.total_amount, 0), 0)
  );

  if v_discount_amount <= 0 then
    raise exception 'Coupon discount cannot be applied to this order.';
  end if;

  update public.restaurant_orders
  set
    coupon_discount_id = v_discount.id,
    coupon_code = v_discount.code,
    coupon_discount_amount = v_discount_amount,
    discount_amount = coalesce(discount_amount, 0) + v_discount_amount,
    total_amount = greatest(coalesce(total_amount, 0) - v_discount_amount, 0),
    updated_at = now()
  where id = v_order.id
  returning *
  into v_order;

  insert into public.restaurant_discount_redemptions (
    restaurant_id,
    discount_id,
    order_id,
    customer_phone,
    customer_session_id,
    coupon_code,
    discount_amount,
    order_subtotal_snapshot
  )
  values (
    p_restaurant_id,
    v_discount.id,
    v_order.id,
    nullif(v_customer_phone, ''),
    v_customer_session_id,
    v_discount.code,
    v_discount_amount,
    v_discountable_subtotal
  );

  update public.restaurant_discounts
  set
    used_count = coalesce(used_count, 0) + 1,
    updated_at = now()
  where id = v_discount.id;

  return query
  select
    v_order.id,
    v_order.order_code,
    v_is_existing,
    coalesce(v_order.reward_discount_amount, 0),
    coalesce(v_order.reward_points_redeemed, 0),
    coalesce(v_order.coupon_discount_amount, 0),
    v_order.coupon_code;
end;
$$;

grant execute on function public.place_public_menu_order_with_rewards_and_coupon(
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
  text
) to anon, authenticated;
