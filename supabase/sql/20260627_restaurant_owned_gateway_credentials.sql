-- Spizy Menu — Restaurant-owned payment gateway credentials
-- Important architecture rule:
--   Mamo Pay is for Spizy/Zalepro collecting restaurant subscription fees.
--   Ziina/Stripe/Razorpay/etc. are for each restaurant collecting from its own customers.
--   Spizy provides the software platform only; customer payments should use the restaurant's own merchant account.

alter table if exists public.restaurant_orders
  add column if not exists payment_reference text,
  add column if not exists gateway_order_id text,
  add column if not exists gateway_transaction_id text,
  add column if not exists online_payment_status text,
  add column if not exists gateway_payload jsonb default '{}'::jsonb,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_failed_at timestamptz,
  add column if not exists payment_failure_reason text;

create index if not exists restaurant_orders_payment_reference_idx
  on public.restaurant_orders (payment_reference);

create index if not exists restaurant_orders_gateway_order_id_idx
  on public.restaurant_orders (gateway_order_id);

create table if not exists public.restaurant_gateway_credentials (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  gateway text not null,
  merchant_label text,
  access_token text,
  public_key text,
  webhook_secret text,
  test_mode boolean not null default true,
  is_enabled boolean not null default true,
  connected_by uuid,
  connected_at timestamptz,
  last_used_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_gateway_credentials_gateway_check check (
    gateway in ('ziina', 'stripe', 'paypal', 'network', 'cashfree', 'razorpay', 'phonepe')
  ),
  constraint restaurant_gateway_credentials_unique unique (restaurant_id, gateway)
);

create index if not exists restaurant_gateway_credentials_restaurant_gateway_idx
  on public.restaurant_gateway_credentials (restaurant_id, gateway);

alter table if exists public.restaurant_gateway_credentials enable row level security;

-- Secrets must not be readable directly from the browser.
-- Edge Functions using the service role manage these rows after checking restaurant membership.
drop policy if exists "Service role manages restaurant gateway credentials" on public.restaurant_gateway_credentials;
create policy "Service role manages restaurant gateway credentials"
  on public.restaurant_gateway_credentials
  for all
  to service_role
  using (true)
  with check (true);

create table if not exists public.restaurant_payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid,
  order_id uuid,
  gateway text not null,
  event_type text,
  gateway_reference text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists restaurant_payment_webhook_events_gateway_reference_idx
  on public.restaurant_payment_webhook_events (gateway, gateway_reference);

alter table if exists public.restaurant_payment_webhook_events enable row level security;

drop policy if exists "Service role manages payment webhook events" on public.restaurant_payment_webhook_events;
create policy "Service role manages payment webhook events"
  on public.restaurant_payment_webhook_events
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.get_public_payment_result(
  p_restaurant_slug text default null,
  p_order_reference text default null,
  p_customer_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'order_id', o.id,
    'restaurant_id', o.restaurant_id,
    'restaurant_name', r.name,
    'restaurant_slug', r.slug,
    'order_code', o.order_code,
    'public_order_number', o.public_order_number,
    'order_reference', coalesce(o.payment_reference, o.gateway_order_id, o.id::text, o.order_code),
    'payment_reference', o.payment_reference,
    'gateway_order_id', o.gateway_order_id,
    'gateway_transaction_id', o.gateway_transaction_id,
    'payment_gateway', o.payment_gateway,
    'delivery_payment_type', o.delivery_payment_type,
    'payment_status', o.payment_status,
    'online_payment_status', o.online_payment_status,
    'payment_method', o.payment_method,
    'total_amount', o.total_amount,
    'currency', o.currency,
    'order_type', o.order_type,
    'status', o.status,
    'paid_at', o.paid_at,
    'payment_failed_at', o.payment_failed_at,
    'payment_failure_reason', o.payment_failure_reason,
    'created_at', o.created_at,
    'updated_at', o.updated_at
  )
  into v_result
  from public.restaurant_orders o
  join public.restaurants r on r.id = o.restaurant_id
  where
    (p_restaurant_slug is null or p_restaurant_slug = '' or r.slug = p_restaurant_slug)
    and (
      p_order_reference is null
      or p_order_reference = ''
      or o.id::text = p_order_reference
      or lower(coalesce(o.order_code, '')) = lower(p_order_reference)
      or lower(coalesce(o.public_order_number, '')) = lower(p_order_reference)
      or lower(coalesce(o.payment_reference, '')) = lower(p_order_reference)
      or lower(coalesce(o.gateway_order_id, '')) = lower(p_order_reference)
      or lower(coalesce(o.gateway_transaction_id, '')) = lower(p_order_reference)
    )
    and (
      p_customer_session_id is null
      or p_customer_session_id = ''
      or o.customer_session_id = p_customer_session_id
      or o.customer_phone is not null
    )
  order by o.created_at desc
  limit 1;

  return v_result;
end;
$$;

grant execute on function public.get_public_payment_result(text, text, text) to anon, authenticated;

comment on table public.restaurant_gateway_credentials
is 'Backend-only restaurant-owned payment gateway credentials. Do not expose access_token or webhook_secret to frontend. For stronger production hardening, migrate token storage to Supabase Vault or encrypted storage.';

comment on function public.get_public_payment_result(text, text, text)
is 'Public-safe payment result lookup for payment result pages. Supports order code, id, payment_reference, gateway_order_id, and gateway_transaction_id.';
