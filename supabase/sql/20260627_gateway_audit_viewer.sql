-- Spizy Menu — Restaurant-owned gateway audit viewer support
-- Public-safe history only. Never store or expose access tokens, webhook secrets or authorization headers.

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

create index if not exists restaurant_gateway_audit_logs_action_idx
  on public.restaurant_gateway_audit_logs (restaurant_id, action, created_at desc);

alter table public.restaurant_gateway_audit_logs enable row level security;

drop policy if exists "Restaurant gateway audit logs are service role only" on public.restaurant_gateway_audit_logs;
create policy "Restaurant gateway audit logs are service role only"
  on public.restaurant_gateway_audit_logs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.restaurant_gateway_audit_logs
is 'Public-safe audit trail for restaurant-owned gateway connection, testing, rotation and disconnect actions. Never store secret tokens here.';

comment on column public.restaurant_gateway_audit_logs.metadata
is 'Public-safe audit metadata only. Do not store access tokens, webhook secrets, authorization headers, raw gateway payloads containing sensitive fields, or card/customer secrets.';
