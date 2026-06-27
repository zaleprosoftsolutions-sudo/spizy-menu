-- Spizy Menu - Payment reconciliation summary foundation
-- Safe/idempotent migration. This does not delete existing data.

alter table if exists public.restaurant_orders
  add column if not exists reconciliation_status text default 'open',
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconciled_by uuid,
  add column if not exists reconciliation_note text;

create index if not exists idx_restaurant_orders_reconciliation_status
  on public.restaurant_orders (restaurant_id, reconciliation_status);

create index if not exists idx_restaurant_orders_payment_reconciliation
  on public.restaurant_orders (restaurant_id, payment_status, payment_method, payment_gateway);

create table if not exists public.restaurant_payment_reconciliation_snapshots (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  snapshot_date date not null default current_date,
  currency text default 'AED',
  total_collected numeric(12, 2) default 0,
  total_pending numeric(12, 2) default 0,
  cod_pending numeric(12, 2) default 0,
  online_pending numeric(12, 2) default 0,
  total_refunded numeric(12, 2) default 0,
  cancelled_unpaid numeric(12, 2) default 0,
  net_collected numeric(12, 2) default 0,
  gateway_breakdown jsonb default '[]'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

create index if not exists idx_payment_reconciliation_snapshots_restaurant_date
  on public.restaurant_payment_reconciliation_snapshots (restaurant_id, snapshot_date desc);

alter table public.restaurant_payment_reconciliation_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_payment_reconciliation_snapshots'
      and policyname = 'Restaurant members can read payment reconciliation snapshots'
  ) then
    create policy "Restaurant members can read payment reconciliation snapshots"
      on public.restaurant_payment_reconciliation_snapshots
      for select
      using (
        exists (
          select 1
          from public.restaurant_members rm
          where rm.restaurant_id = restaurant_payment_reconciliation_snapshots.restaurant_id
            and rm.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurant_payment_reconciliation_snapshots'
      and policyname = 'Restaurant owners can insert payment reconciliation snapshots'
  ) then
    create policy "Restaurant owners can insert payment reconciliation snapshots"
      on public.restaurant_payment_reconciliation_snapshots
      for insert
      with check (
        exists (
          select 1
          from public.restaurant_members rm
          where rm.restaurant_id = restaurant_payment_reconciliation_snapshots.restaurant_id
            and rm.user_id = auth.uid()
            and coalesce(rm.role, '') in ('owner', 'restaurant_owner', 'admin', 'manager')
        )
      );
  end if;
end $$;

create or replace function public.get_restaurant_payment_reconciliation_summary(
  p_restaurant_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = p_restaurant_id
      and rm.user_id = auth.uid()
  ) then
    raise exception 'Not allowed to view payment reconciliation for this restaurant.';
  end if;

  with scoped_orders as (
    select *
    from public.restaurant_orders ro
    where ro.restaurant_id = p_restaurant_id
      and (p_from is null or ro.created_at >= p_from)
      and (p_to is null or ro.created_at <= p_to)
  ), totals as (
    select
      coalesce(sum(case when payment_status = 'paid' then total_amount else 0 end), 0) as total_collected,
      coalesce(sum(case when payment_status <> 'paid' and payment_status <> 'refunded' and status <> 'cancelled' then total_amount else 0 end), 0) as total_pending,
      coalesce(sum(case when payment_status <> 'paid' and status <> 'cancelled' and (payment_method = 'cod' or delivery_payment_type ilike 'cod%') then total_amount else 0 end), 0) as cod_pending,
      coalesce(sum(case when payment_status <> 'paid' and status <> 'cancelled' and payment_gateway is not null and payment_gateway <> '' then total_amount else 0 end), 0) as online_pending,
      coalesce(sum(coalesce(refunded_amount, 0)), 0) as total_refunded,
      coalesce(sum(case when status = 'cancelled' and payment_status <> 'paid' then total_amount else 0 end), 0) as cancelled_unpaid
    from scoped_orders
  ), gateway_rows as (
    select
      coalesce(nullif(payment_gateway, ''), nullif(payment_method, ''), 'unknown') as gateway_key,
      count(*) as order_count,
      coalesce(sum(case when payment_status = 'paid' then total_amount else 0 end), 0) as collected,
      coalesce(sum(case when payment_status <> 'paid' and status <> 'cancelled' then total_amount else 0 end), 0) as pending,
      coalesce(sum(coalesce(refunded_amount, 0)), 0) as refunded
    from scoped_orders
    group by coalesce(nullif(payment_gateway, ''), nullif(payment_method, ''), 'unknown')
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'total_collected', totals.total_collected,
      'total_pending', totals.total_pending,
      'cod_pending', totals.cod_pending,
      'online_pending', totals.online_pending,
      'total_refunded', totals.total_refunded,
      'cancelled_unpaid', totals.cancelled_unpaid,
      'net_collected', greatest(totals.total_collected - totals.total_refunded, 0)
    ),
    'gateway_breakdown', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'gateway_key', gateway_key,
            'order_count', order_count,
            'collected', collected,
            'pending', pending,
            'refunded', refunded
          ) order by collected desc, pending desc
        )
        from gateway_rows
      ),
      '[]'::jsonb
    )
  ) into v_result
  from totals;

  return v_result;
end;
$$;

grant execute on function public.get_restaurant_payment_reconciliation_summary(uuid, timestamptz, timestamptz) to authenticated;
