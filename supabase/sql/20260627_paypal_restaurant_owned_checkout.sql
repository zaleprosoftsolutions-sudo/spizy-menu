-- Spizy Menu — PayPal restaurant-owned gateway foundation
-- Each restaurant connects its own PayPal Business/API credentials.
-- Spizy/Zalepro does not use a shared PayPal merchant account for restaurant customer payments.

create table if not exists public.restaurant_gateway_audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  gateway text not null,
  action text not null,
  actor_user_id uuid null,
  status text not null default 'info',
  message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists restaurant_gateway_audit_logs_restaurant_gateway_idx
  on public.restaurant_gateway_audit_logs (restaurant_id, gateway, created_at desc);

create table if not exists public.restaurant_gateway_credentials (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  gateway text not null,
  merchant_label text null,
  public_key text null,
  access_token text null,
  webhook_secret text null,
  test_mode boolean not null default true,
  is_enabled boolean not null default true,
  connected_by uuid null,
  connected_at timestamptz null,
  last_tested_at timestamptz null,
  last_test_status text null,
  last_test_message text null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, gateway)
);

alter table public.restaurant_gateway_credentials enable row level security;

alter table public.restaurant_gateway_credentials
  add column if not exists merchant_label text,
  add column if not exists public_key text,
  add column if not exists access_token text,
  add column if not exists webhook_secret text,
  add column if not exists test_mode boolean not null default true,
  add column if not exists is_enabled boolean not null default true,
  add column if not exists connected_by uuid null,
  add column if not exists connected_at timestamptz null,
  add column if not exists last_tested_at timestamptz null,
  add column if not exists last_test_status text null,
  add column if not exists last_test_message text null,
  add column if not exists last_error text null,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.restaurant_orders
  add column if not exists payment_gateway text,
  add column if not exists delivery_payment_type text,
  add column if not exists online_payment_status text,
  add column if not exists payment_reference text,
  add column if not exists gateway_order_id text,
  add column if not exists gateway_transaction_id text,
  add column if not exists gateway_checkout_url text,
  add column if not exists gateway_response jsonb not null default '{}'::jsonb,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_failed_at timestamptz,
  add column if not exists payment_status_note text;

create index if not exists restaurant_orders_payment_reference_idx
  on public.restaurant_orders (payment_reference);

create index if not exists restaurant_orders_gateway_order_id_idx
  on public.restaurant_orders (gateway_order_id);

create table if not exists public.restaurant_payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid null,
  gateway text not null,
  event_id text null,
  event_type text null,
  order_id uuid null,
  payment_reference text null,
  gateway_order_id text null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  message text null,
  created_at timestamptz not null default now(),
  unique (gateway, event_id)
);

alter table public.restaurant_payment_webhook_events
  add column if not exists restaurant_id uuid null,
  add column if not exists gateway text,
  add column if not exists event_id text null,
  add column if not exists event_type text null,
  add column if not exists order_id uuid null,
  add column if not exists payment_reference text null,
  add column if not exists gateway_order_id text null,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'received',
  add column if not exists message text null,
  add column if not exists created_at timestamptz not null default now();

create index if not exists restaurant_payment_webhook_events_gateway_order_idx
  on public.restaurant_payment_webhook_events (gateway, gateway_order_id, created_at desc);

create index if not exists restaurant_payment_webhook_events_payment_reference_idx
  on public.restaurant_payment_webhook_events (gateway, payment_reference, created_at desc);

comment on table public.restaurant_gateway_credentials is
  'Backend-only restaurant-owned gateway credentials. Do not expose access_token or webhook_secret to the browser.';

comment on column public.restaurant_gateway_credentials.public_key is
  'For PayPal this stores the restaurant PayPal Client ID. For Razorpay it stores Key ID; for Cashfree/PhonePe it stores Client ID; for Network it stores Outlet Reference.';

comment on column public.restaurant_gateway_credentials.access_token is
  'For PayPal this stores the restaurant PayPal Client Secret. For other gateways it stores that restaurant-owned secret credential.';

comment on column public.restaurant_gateway_credentials.webhook_secret is
  'For PayPal this stores the PayPal Webhook ID used by the verification API. For other gateways it stores webhook signing secret when applicable.';
