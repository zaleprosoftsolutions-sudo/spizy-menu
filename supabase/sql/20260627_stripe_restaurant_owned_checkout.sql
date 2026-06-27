-- Spizy Menu - Stripe restaurant-owned checkout foundation
-- Each restaurant connects and uses its OWN Stripe account. Spizy/Zalepro does not process restaurant customer payments through a shared Stripe account.

alter table if exists public.restaurants
  add column if not exists payment_gateway_settings jsonb default '{}'::jsonb;

alter table if exists public.restaurant_orders
  add column if not exists payment_gateway text,
  add column if not exists delivery_payment_type text,
  add column if not exists online_payment_status text,
  add column if not exists payment_reference text,
  add column if not exists gateway_order_id text,
  add column if not exists gateway_transaction_id text,
  add column if not exists gateway_checkout_url text,
  add column if not exists payment_started_at timestamptz,
  add column if not exists payment_paid_at timestamptz,
  add column if not exists payment_failed_at timestamptz,
  add column if not exists payment_webhook_payload jsonb default '{}'::jsonb;

create table if not exists public.restaurant_gateway_credentials (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  gateway text not null,
  merchant_label text,
  public_key text,
  access_token text,
  webhook_secret text,
  test_mode boolean not null default true,
  is_enabled boolean not null default true,
  connected_by uuid,
  connected_at timestamptz,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_message text,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, gateway)
);

create table if not exists public.restaurant_gateway_audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  gateway text not null,
  action text not null,
  actor_user_id uuid,
  status text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_restaurant_gateway_credentials_restaurant_gateway
  on public.restaurant_gateway_credentials (restaurant_id, gateway);

create index if not exists idx_restaurant_gateway_audit_logs_restaurant_gateway
  on public.restaurant_gateway_audit_logs (restaurant_id, gateway, created_at desc);

create index if not exists idx_restaurant_orders_payment_reference
  on public.restaurant_orders (payment_reference);

create index if not exists idx_restaurant_orders_gateway_order_id
  on public.restaurant_orders (gateway_order_id);

alter table if exists public.restaurant_gateway_credentials enable row level security;
alter table if exists public.restaurant_gateway_audit_logs enable row level security;

-- Secret credentials are backend-only. Do not add browser SELECT policies for restaurant_gateway_credentials.

do $$
begin
  update public.restaurants
  set payment_gateway_settings = jsonb_set(
    coalesce(payment_gateway_settings, '{}'::jsonb),
    '{stripe}',
    coalesce(payment_gateway_settings->'stripe', '{}'::jsonb) || jsonb_build_object(
      'enabled', coalesce((payment_gateway_settings->'stripe'->>'enabled')::boolean, false),
      'test_mode', coalesce((payment_gateway_settings->'stripe'->>'test_mode')::boolean, true),
      'connection_status', coalesce(payment_gateway_settings->'stripe'->>'connection_status', 'not_connected'),
      'credential_status', coalesce(payment_gateway_settings->'stripe'->>'credential_status', 'missing'),
      'checkout_mode', coalesce(payment_gateway_settings->'stripe'->>'checkout_mode', 'redirect')
    ),
    true
  )
  where payment_gateway_settings is not null;
exception
  when others then
    raise notice 'Stripe payment_gateway_settings backfill skipped: %', sqlerrm;
end $$;
