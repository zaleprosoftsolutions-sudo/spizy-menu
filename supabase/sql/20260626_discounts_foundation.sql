create table if not exists public.restaurant_discounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title text not null,
  code text not null,
  discount_type text not null default 'fixed_amount'
    check (discount_type in ('fixed_amount', 'percentage')),
  discount_value numeric(10,2) not null default 0,
  min_order_amount numeric(10,2) not null default 0,
  max_discount_amount numeric(10,2),
  usage_limit integer,
  used_count integer not null default 0,
  per_customer_limit integer not null default 1,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_value >= 0),
  check (min_order_amount >= 0),
  check (max_discount_amount is null or max_discount_amount >= 0),
  check (usage_limit is null or usage_limit > 0),
  check (used_count >= 0),
  check (per_customer_limit > 0),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create unique index if not exists restaurant_discounts_code_unique
on public.restaurant_discounts (restaurant_id, lower(code))
where is_deleted = false;

create index if not exists restaurant_discounts_restaurant_idx
on public.restaurant_discounts (restaurant_id, is_deleted, is_active);

alter table public.restaurant_discounts enable row level security;

drop policy if exists "Restaurant discounts member select" on public.restaurant_discounts;
drop policy if exists "Restaurant discounts member insert" on public.restaurant_discounts;
drop policy if exists "Restaurant discounts member update" on public.restaurant_discounts;
drop policy if exists "Restaurant discounts public active select" on public.restaurant_discounts;

create policy "Restaurant discounts member select"
on public.restaurant_discounts
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant discounts member insert"
on public.restaurant_discounts
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant discounts member update"
on public.restaurant_discounts
for update
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
)
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant discounts public active select"
on public.restaurant_discounts
for select
to anon, authenticated
using (
  is_deleted = false
  and is_active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
  and exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_id
      and r.is_active = true
  )
);

create or replace function public.validate_public_discount_coupon(
  p_restaurant_id uuid,
  p_coupon_code text,
  p_order_subtotal numeric,
  p_customer_phone text default null,
  p_customer_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discount public.restaurant_discounts;
  v_subtotal numeric(10,2) := greatest(coalesce(p_order_subtotal, 0), 0);
  v_discount_amount numeric(10,2) := 0;
begin
  if p_restaurant_id is null then
    raise exception 'Restaurant is required.';
  end if;

  if coalesce(trim(p_coupon_code), '') = '' then
    raise exception 'Coupon code is required.';
  end if;

  select *
  into v_discount
  from public.restaurant_discounts rd
  where rd.restaurant_id = p_restaurant_id
    and lower(rd.code) = lower(trim(p_coupon_code))
    and rd.is_deleted = false
    and rd.is_active = true
    and (rd.starts_at is null or rd.starts_at <= now())
    and (rd.ends_at is null or rd.ends_at >= now())
  limit 1;

  if v_discount.id is null then
    raise exception 'Coupon is invalid or expired.';
  end if;

  if v_subtotal < coalesce(v_discount.min_order_amount, 0) then
    raise exception 'Minimum order amount not reached for this coupon.';
  end if;

  if v_discount.usage_limit is not null
     and coalesce(v_discount.used_count, 0) >= v_discount.usage_limit then
    raise exception 'Coupon usage limit reached.';
  end if;

  if v_discount.discount_type = 'percentage' then
    v_discount_amount := round(v_subtotal * (v_discount.discount_value / 100), 2);

    if v_discount.max_discount_amount is not null then
      v_discount_amount := least(v_discount_amount, v_discount.max_discount_amount);
    end if;
  else
    v_discount_amount := v_discount.discount_value;
  end if;

  v_discount_amount := least(v_discount_amount, v_subtotal);

  return jsonb_build_object(
    'discount_id', v_discount.id,
    'title', v_discount.title,
    'code', v_discount.code,
    'discount_type', v_discount.discount_type,
    'discount_value', v_discount.discount_value,
    'discount_amount', v_discount_amount,
    'subtotal', v_subtotal,
    'final_total', greatest(v_subtotal - v_discount_amount, 0),
    'message', 'Coupon applied successfully.'
  );
end;
$$;

grant execute on function public.validate_public_discount_coupon(
  uuid,
  text,
  numeric,
  text,
  text
) to anon, authenticated;
