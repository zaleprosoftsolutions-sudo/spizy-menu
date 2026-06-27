-- Spizy Menu — Restaurant-owned gateway disconnect, rotation and audit logs
-- This keeps customer-payment gateways owned by each restaurant.
-- Spizy/Zalepro should not use its own Ziina/Stripe/etc. merchant profile for restaurant customer orders.

alter table if exists public.restaurant_gateway_credentials
  add column if not exists disconnected_at timestamptz,
  add column if not exists disconnected_by uuid,
  add column if not exists rotate_required boolean default false,
  add column if not exists connection_status text;

create table if not exists public.restaurant_gateway_audit_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  gateway text not null,
  action text not null,
  actor_user_id uuid,
  status text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists restaurant_gateway_audit_logs_restaurant_idx
  on public.restaurant_gateway_audit_logs (restaurant_id, gateway, created_at desc);

alter table public.restaurant_gateway_audit_logs enable row level security;

-- Owners/staff should not read raw secrets from restaurant_gateway_credentials.
-- Audit logs are intentionally public-safe and can be shown later in Activity Logs.
drop policy if exists "Restaurant gateway audit logs are service role only" on public.restaurant_gateway_audit_logs;
create policy "Restaurant gateway audit logs are service role only"
  on public.restaurant_gateway_audit_logs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.restaurant_gateway_audit_logs
is 'Public-safe audit trail for restaurant-owned gateway connection, testing, rotation and disconnect actions. Never store secret tokens here.';

comment on column public.restaurant_gateway_credentials.rotate_required
is 'Set true when a credential should be replaced before live use, for example after a suspected leak or failed handover.';

comment on column public.restaurant_gateway_credentials.connection_status
is 'Backend-only credential connection status such as connected, tested, test_failed or disconnected.';
