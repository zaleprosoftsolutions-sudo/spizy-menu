-- Spizy Menu - Refund / Payment Adjustment Foundation
-- Safe/idempotent migration. This records restaurant-side refunds without moving money automatically.
-- Actual gateway refund API calls can be added gateway-by-gateway later.

alter table if exists public.restaurant_orders
  add column if not exists refund_status text,
  add column if not exists refunded_amount numeric(12,2) not null default 0,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reason text,
  add column if not exists last_refund_id uuid;

-- Repair older payment/webhook tables that may have been created by earlier packages.
alter table if exists public.restaurant_payment_webhook_events
  add column if not exists gateway_order_id text,
  add column if not exists payment_reference text,
  add column if not exists gateway_transaction_id text,
  add column if not exists restaurant_id uuid,
  add column if not exists order_id uuid,
  add column if not exists event_type text,
  add column if not exists event_status text,
  add column if not exists raw_payload jsonb default '{}'::jsonb,
  add column if not exists processed_at timestamptz;


create table if not exists public.restaurant_gateway_audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  gateway text not null,
  actor_user_id uuid,
  action text not null,
  status text not null default 'info',
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists restaurant_gateway_audit_logs_restaurant_id_idx
  on public.restaurant_gateway_audit_logs (restaurant_id);

create index if not exists restaurant_gateway_audit_logs_gateway_idx
  on public.restaurant_gateway_audit_logs (gateway);

alter table public.restaurant_gateway_audit_logs enable row level security;

create table if not exists public.restaurant_payment_refunds (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.restaurant_orders(id) on delete cascade,
  gateway text,
  payment_reference text,
  gateway_order_id text,
  gateway_transaction_id text,
  refund_reference text,
  refund_amount numeric(12,2) not null default 0,
  currency text not null default 'AED',
  refund_status text not null default 'manual_recorded',
  refund_mode text not null default 'manual_record',
  reason text,
  requested_by uuid,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restaurant_payment_refunds enable row level security;

create index if not exists restaurant_payment_refunds_restaurant_id_idx
  on public.restaurant_payment_refunds (restaurant_id);

create index if not exists restaurant_payment_refunds_order_id_idx
  on public.restaurant_payment_refunds (order_id);

create index if not exists restaurant_payment_refunds_gateway_idx
  on public.restaurant_payment_refunds (gateway);

create index if not exists restaurant_orders_refund_status_idx
  on public.restaurant_orders (refund_status);

create index if not exists restaurant_orders_last_refund_id_idx
  on public.restaurant_orders (last_refund_id);

-- Owner/staff can view refund records for restaurants they belong to.
drop policy if exists restaurant_payment_refunds_select_for_members on public.restaurant_payment_refunds;
create policy restaurant_payment_refunds_select_for_members
  on public.restaurant_payment_refunds
  for select
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_payment_refunds.restaurant_id
        and rm.user_id = auth.uid()
    )
  );

-- Direct inserts/updates are intentionally not opened to browser clients.
-- Refund records should be written through the record-payment-refund Edge Function.
