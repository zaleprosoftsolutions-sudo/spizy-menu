-- Spizy Customers + Rewards foundation
-- Run this once in Supabase SQL Editor.

alter table public.restaurants
add column if not exists rewards_enabled boolean not null default false;

alter table public.restaurants
add column if not exists reward_amount_unit numeric(10,2) not null default 10;

alter table public.restaurants
add column if not exists reward_points_per_amount numeric(10,2) not null default 1;

create table if not exists public.restaurant_customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_name text,
  customer_phone text not null,
  first_order_at timestamptz,
  last_order_at timestamptz,
  total_orders integer not null default 0,
  total_spend numeric(12,2) not null default 0,
  reward_points numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, customer_phone)
);

create table if not exists public.restaurant_customer_reward_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.restaurant_customers(id) on delete cascade,
  order_id uuid references public.restaurant_orders(id) on delete set null,
  transaction_type text not null check (transaction_type in ('earn', 'redeem', 'adjust')),
  points numeric(12,2) not null default 0,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists restaurant_customers_restaurant_idx
on public.restaurant_customers (restaurant_id, last_order_at desc);

create index if not exists restaurant_customers_phone_idx
on public.restaurant_customers (restaurant_id, customer_phone);

create index if not exists reward_transactions_customer_idx
on public.restaurant_customer_reward_transactions (customer_id, created_at desc);

create unique index if not exists reward_transactions_order_earn_unique
on public.restaurant_customer_reward_transactions (order_id, transaction_type)
where transaction_type = 'earn' and order_id is not null;

alter table public.restaurant_customers enable row level security;
alter table public.restaurant_customer_reward_transactions enable row level security;

drop policy if exists "Restaurant customers member select" on public.restaurant_customers;
drop policy if exists "Restaurant customers member insert" on public.restaurant_customers;
drop policy if exists "Restaurant customers member update" on public.restaurant_customers;

create policy "Restaurant customers member select"
on public.restaurant_customers
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant customers member insert"
on public.restaurant_customers
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant customers member update"
on public.restaurant_customers
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

drop policy if exists "Reward transactions member select" on public.restaurant_customer_reward_transactions;
drop policy if exists "Reward transactions member insert" on public.restaurant_customer_reward_transactions;
drop policy if exists "Reward transactions member update" on public.restaurant_customer_reward_transactions;

create policy "Reward transactions member select"
on public.restaurant_customer_reward_transactions
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Reward transactions member insert"
on public.restaurant_customer_reward_transactions
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Reward transactions member update"
on public.restaurant_customer_reward_transactions
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

create or replace function public.refresh_restaurant_customers(
  p_restaurant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rewards_enabled boolean := false;
  v_reward_amount_unit numeric(10,2) := 10;
  v_reward_points_per_amount numeric(10,2) := 1;
begin
  if p_restaurant_id is null then
    return;
  end if;

  if auth.uid() is not null
     and not (
       public.is_restaurant_member(p_restaurant_id)
       or public.get_my_role() = 'super_admin'
     ) then
    raise exception 'Not allowed to refresh customers for this restaurant.';
  end if;

  select
    coalesce(r.rewards_enabled, false),
    greatest(coalesce(r.reward_amount_unit, 10), 1),
    greatest(coalesce(r.reward_points_per_amount, 1), 0)
  into
    v_rewards_enabled,
    v_reward_amount_unit,
    v_reward_points_per_amount
  from public.restaurants r
  where r.id = p_restaurant_id;

  insert into public.restaurant_customers (
    restaurant_id,
    customer_name,
    customer_phone,
    first_order_at,
    last_order_at,
    total_orders,
    total_spend,
    updated_at
  )
  select
    ro.restaurant_id,
    (
      array_remove(array_agg(nullif(trim(ro.customer_name), '') order by ro.created_at desc), null)
    )[1] as customer_name,
    trim(ro.customer_phone) as customer_phone,
    min(ro.created_at) as first_order_at,
    max(ro.created_at) as last_order_at,
    count(*)::integer as total_orders,
    coalesce(sum(ro.total_amount), 0)::numeric(12,2) as total_spend,
    now() as updated_at
  from public.restaurant_orders ro
  where ro.restaurant_id = p_restaurant_id
    and ro.status = 'completed'
    and ro.payment_status = 'paid'
    and coalesce(trim(ro.customer_phone), '') <> ''
  group by ro.restaurant_id, trim(ro.customer_phone)
  on conflict (restaurant_id, customer_phone)
  do update set
    customer_name = coalesce(excluded.customer_name, public.restaurant_customers.customer_name),
    first_order_at = excluded.first_order_at,
    last_order_at = excluded.last_order_at,
    total_orders = excluded.total_orders,
    total_spend = excluded.total_spend,
    updated_at = now();

  if v_rewards_enabled then
    insert into public.restaurant_customer_reward_transactions (
      restaurant_id,
      customer_id,
      order_id,
      transaction_type,
      points,
      description,
      created_at
    )
    select
      ro.restaurant_id,
      rc.id,
      ro.id,
      'earn',
      greatest(
        floor((coalesce(ro.total_amount, 0) / v_reward_amount_unit) * v_reward_points_per_amount),
        0
      ),
      'Points earned from order ' || coalesce(ro.order_code, ro.public_order_number, ro.id::text),
      ro.updated_at
    from public.restaurant_orders ro
    join public.restaurant_customers rc
      on rc.restaurant_id = ro.restaurant_id
     and rc.customer_phone = trim(ro.customer_phone)
    where ro.restaurant_id = p_restaurant_id
      and ro.status = 'completed'
      and ro.payment_status = 'paid'
      and coalesce(trim(ro.customer_phone), '') <> ''
    on conflict (order_id, transaction_type)
    where transaction_type = 'earn' and order_id is not null
    do update set
      points = excluded.points,
      description = excluded.description;
  end if;

  update public.restaurant_customers rc
  set
    reward_points = coalesce(
      (
        select sum(rcrt.points)
        from public.restaurant_customer_reward_transactions rcrt
        where rcrt.customer_id = rc.id
      ),
      0
    ),
    updated_at = now()
  where rc.restaurant_id = p_restaurant_id;
end;
$$;

grant execute on function public.refresh_restaurant_customers(uuid) to authenticated;

create or replace function public.sync_restaurant_customer_after_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.restaurant_id is not null
     and coalesce(trim(new.customer_phone), '') <> ''
     and new.status = 'completed'
     and new.payment_status = 'paid' then
    perform public.refresh_restaurant_customers(new.restaurant_id);
  end if;

  return new;
end;
$$;

drop trigger if exists sync_restaurant_customer_after_order_trigger
on public.restaurant_orders;

create trigger sync_restaurant_customer_after_order_trigger
after insert or update of status, payment_status, total_amount, customer_phone, customer_name
on public.restaurant_orders
for each row
execute function public.sync_restaurant_customer_after_order();

-- Backfill existing completed + paid orders into customer records.
do $$
declare
  v_restaurant record;
begin
  for v_restaurant in
    select distinct restaurant_id
    from public.restaurant_orders
    where status = 'completed'
      and payment_status = 'paid'
      and coalesce(trim(customer_phone), '') <> ''
  loop
    perform public.refresh_restaurant_customers(v_restaurant.restaurant_id);
  end loop;
end $$;
