-- Spizy Menu: Admin Orders Payment Controls
-- Safe/idempotent helper migration for COD + online payment status visibility.
-- Run this after the public payment status polish SQL if you have not already added these columns.

alter table if exists public.restaurant_orders
  add column if not exists payment_gateway text,
  add column if not exists delivery_payment_type text,
  add column if not exists gateway_transaction_id text,
  add column if not exists gateway_order_id text,
  add column if not exists payment_failure_reason text,
  add column if not exists payment_completed_at timestamptz,
  add column if not exists payment_failed_at timestamptz;

create index if not exists restaurant_orders_restaurant_payment_status_idx
  on public.restaurant_orders (restaurant_id, payment_status);

create index if not exists restaurant_orders_restaurant_payment_gateway_idx
  on public.restaurant_orders (restaurant_id, payment_gateway);

create index if not exists restaurant_orders_restaurant_delivery_payment_type_idx
  on public.restaurant_orders (restaurant_id, delivery_payment_type);

comment on column public.restaurant_orders.payment_gateway is
  'Public checkout gateway key such as cod, ziina, stripe, network, razorpay, cashfree, phonepe or paypal.';

comment on column public.restaurant_orders.delivery_payment_type is
  'Delivery/COD collection choice such as cash or card_machine. UI derives COD Cash/Card Machine labels from this value.';

comment on column public.restaurant_orders.gateway_transaction_id is
  'Real gateway transaction/payment ID. Filled later by secure checkout/webhook integrations.';

comment on column public.restaurant_orders.gateway_order_id is
  'Gateway session/order/reference ID. Filled later by secure checkout/webhook integrations.';

comment on column public.restaurant_orders.payment_failure_reason is
  'Optional failure/cancel reason from gateway or admin flow.';

comment on column public.restaurant_orders.payment_completed_at is
  'Timestamp for later webhook/admin paid confirmation audit.';

comment on column public.restaurant_orders.payment_failed_at is
  'Timestamp for later webhook/admin payment failure audit.';
