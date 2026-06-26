create table if not exists public.restaurant_reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  customer_session_id text,
  customer_name text,
  customer_phone text,
  rating integer not null check (rating between 1 and 5),
  comment text,
  reply text,
  replied_at timestamptz,
  is_visible boolean not null default true,
  is_deleted boolean not null default false,
  source text not null default 'public_order' check (source in ('public_order', 'admin_manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists restaurant_reviews_restaurant_idx
on public.restaurant_reviews (restaurant_id, created_at desc);

create index if not exists restaurant_reviews_rating_idx
on public.restaurant_reviews (restaurant_id, rating);

alter table public.restaurant_reviews enable row level security;

drop policy if exists "Restaurant reviews public visible select" on public.restaurant_reviews;
drop policy if exists "Restaurant reviews member select" on public.restaurant_reviews;
drop policy if exists "Restaurant reviews member update" on public.restaurant_reviews;

create policy "Restaurant reviews public visible select"
on public.restaurant_reviews
for select
to anon, authenticated
using (
  is_visible = true
  and is_deleted = false
  and exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_id
      and r.is_active = true
  )
);

create policy "Restaurant reviews member select"
on public.restaurant_reviews
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant reviews member update"
on public.restaurant_reviews
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

create or replace function public.submit_public_restaurant_review(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_customer_session_id text,
  p_customer_phone text,
  p_customer_name text,
  p_rating integer,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.restaurant_orders;
  v_rating integer;
  v_review public.restaurant_reviews;
begin
  if p_restaurant_id is null then
    raise exception 'Restaurant is required.';
  end if;

  if p_order_id is null then
    raise exception 'Order is required.';
  end if;

  v_rating := least(5, greatest(1, coalesce(p_rating, 5)));

  select *
  into v_order
  from public.restaurant_orders ro
  where ro.id = p_order_id
    and ro.restaurant_id = p_restaurant_id
    and ro.status in ('completed', 'delivered')
    and (
      (
        coalesce(trim(p_customer_session_id), '') <> ''
        and ro.customer_session_id = p_customer_session_id
      )
      or
      (
        coalesce(trim(p_customer_phone), '') <> ''
        and ro.customer_phone = p_customer_phone
      )
    )
  limit 1;

  if v_order.id is null then
    raise exception 'Only completed orders from this device or phone can be reviewed.';
  end if;

  insert into public.restaurant_reviews (
    restaurant_id,
    order_id,
    customer_session_id,
    customer_name,
    customer_phone,
    rating,
    comment,
    is_visible,
    is_deleted,
    source,
    updated_at
  )
  values (
    p_restaurant_id,
    p_order_id,
    nullif(trim(p_customer_session_id), ''),
    coalesce(nullif(trim(p_customer_name), ''), v_order.customer_name),
    coalesce(nullif(trim(p_customer_phone), ''), v_order.customer_phone),
    v_rating,
    nullif(trim(coalesce(p_comment, '')), ''),
    true,
    false,
    'public_order',
    now()
  )
  on conflict (order_id)
  do update set
    customer_session_id = excluded.customer_session_id,
    customer_name = excluded.customer_name,
    customer_phone = excluded.customer_phone,
    rating = excluded.rating,
    comment = excluded.comment,
    is_visible = true,
    is_deleted = false,
    updated_at = now()
  returning *
  into v_review;

  return jsonb_build_object(
    'id', v_review.id,
    'rating', v_review.rating,
    'message', 'Review saved.'
  );
end;
$$;

grant execute on function public.submit_public_restaurant_review(
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  text
) to anon, authenticated;
