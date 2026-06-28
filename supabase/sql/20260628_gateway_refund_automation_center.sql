-- Spizy Menu - Gateway Refund Automation Center foundation
-- Safe foundation only: tracks restaurant-owned gateway refund tasks.
-- Actual money refund should stay in the restaurant's own gateway dashboard until each API refund flow is enabled and tested gateway-by-gateway.

create extension if not exists pgcrypto;

create table if not exists public.restaurant_gateway_refund_attempts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid null references public.restaurant_orders(id) on delete set null,
  refund_id uuid null references public.restaurant_payment_refunds(id) on delete set null,
  gateway text not null default 'manual',
  refund_mode text not null default 'manual_record' check (refund_mode in ('manual_record', 'api_readiness', 'api_attempt', 'api_success', 'api_failed')),
  amount numeric(12, 2) not null default 0,
  currency text not null default 'AED',
  status text not null default 'needs_manual_action' check (status in ('draft', 'needs_manual_action', 'queued', 'processing', 'succeeded', 'failed', 'cancelled')),
  gateway_refund_id text null,
  gateway_order_id text null,
  gateway_transaction_id text null,
  reason text null,
  notes text null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  attempted_by uuid null references auth.users(id) on delete set null,
  attempted_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

create index if not exists idx_restaurant_gateway_refund_attempts_restaurant_created
  on public.restaurant_gateway_refund_attempts (restaurant_id, created_at desc)
  where is_deleted = false;

create index if not exists idx_restaurant_gateway_refund_attempts_order
  on public.restaurant_gateway_refund_attempts (restaurant_id, order_id)
  where order_id is not null and is_deleted = false;

create index if not exists idx_restaurant_gateway_refund_attempts_status
  on public.restaurant_gateway_refund_attempts (restaurant_id, status, gateway)
  where is_deleted = false;

create or replace function public.set_restaurant_gateway_refund_attempts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_restaurant_gateway_refund_attempts_updated_at on public.restaurant_gateway_refund_attempts;
create trigger trg_restaurant_gateway_refund_attempts_updated_at
before update on public.restaurant_gateway_refund_attempts
for each row execute function public.set_restaurant_gateway_refund_attempts_updated_at();

alter table public.restaurant_gateway_refund_attempts enable row level security;

-- Owner/admin/manager can manage refund automation records.
-- Cashier/waiter/staff can read records if their login email is active in restaurant_staffs.
drop policy if exists "restaurant members can read gateway refund attempts" on public.restaurant_gateway_refund_attempts;
create policy "restaurant members can read gateway refund attempts"
on public.restaurant_gateway_refund_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_gateway_refund_attempts.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin', 'cashier', 'waiter', 'staff')
  )
  or exists (
    select 1
    from public.restaurant_staffs rs
    where rs.restaurant_id = restaurant_gateway_refund_attempts.restaurant_id
      and rs.is_deleted = false
      and rs.is_active = true
      and lower(rs.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "restaurant admins can insert gateway refund attempts" on public.restaurant_gateway_refund_attempts;
create policy "restaurant admins can insert gateway refund attempts"
on public.restaurant_gateway_refund_attempts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_gateway_refund_attempts.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

drop policy if exists "restaurant admins can update gateway refund attempts" on public.restaurant_gateway_refund_attempts;
create policy "restaurant admins can update gateway refund attempts"
on public.restaurant_gateway_refund_attempts
for update
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_gateway_refund_attempts.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
)
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_gateway_refund_attempts.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

drop policy if exists "restaurant admins can delete gateway refund attempts" on public.restaurant_gateway_refund_attempts;
create policy "restaurant admins can delete gateway refund attempts"
on public.restaurant_gateway_refund_attempts
for delete
to authenticated
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_gateway_refund_attempts.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);
