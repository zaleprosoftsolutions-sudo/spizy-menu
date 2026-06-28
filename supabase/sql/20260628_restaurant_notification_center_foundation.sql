-- Spizy Menu - Restaurant Notification & Reminder Center foundation
-- Creates in-app notification rules and event audit records.
-- Real email/WhatsApp/push delivery can be connected later through Edge Functions.

create table if not exists public.restaurant_notification_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  rule_key text not null,
  rule_title text not null,
  enabled boolean not null default true,
  channel text not null default 'in_app',
  trigger_timing text not null default 'real_time',
  priority text not null default 'medium',
  quiet_hours_start time,
  quiet_hours_end time,
  notes text,
  last_checked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_notification_rules_unique unique (restaurant_id, rule_key),
  constraint restaurant_notification_rules_channel_check check (channel in ('in_app', 'email', 'whatsapp', 'push')),
  constraint restaurant_notification_rules_priority_check check (priority in ('low', 'medium', 'high', 'critical'))
);

create table if not exists public.restaurant_notification_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  rule_key text,
  alert_key text,
  title text not null,
  message text,
  severity text not null default 'medium',
  channel text not null default 'in_app',
  status text not null default 'open',
  source_type text,
  source_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_notification_events_severity_check check (severity in ('low', 'medium', 'high', 'critical')),
  constraint restaurant_notification_events_channel_check check (channel in ('in_app', 'email', 'whatsapp', 'push')),
  constraint restaurant_notification_events_status_check check (status in ('open', 'sent', 'noted', 'resolved', 'failed', 'muted'))
);

create index if not exists idx_restaurant_notification_rules_restaurant
  on public.restaurant_notification_rules (restaurant_id, enabled, rule_key);

create index if not exists idx_restaurant_notification_events_restaurant_created
  on public.restaurant_notification_events (restaurant_id, created_at desc);

create index if not exists idx_restaurant_notification_events_status
  on public.restaurant_notification_events (restaurant_id, status, severity);

create or replace function public.set_restaurant_notification_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_restaurant_notification_rules_updated_at on public.restaurant_notification_rules;
create trigger trg_restaurant_notification_rules_updated_at
before update on public.restaurant_notification_rules
for each row execute function public.set_restaurant_notification_updated_at();

drop trigger if exists trg_restaurant_notification_events_updated_at on public.restaurant_notification_events;
create trigger trg_restaurant_notification_events_updated_at
before update on public.restaurant_notification_events
for each row execute function public.set_restaurant_notification_updated_at();

alter table public.restaurant_notification_rules enable row level security;
alter table public.restaurant_notification_events enable row level security;

drop policy if exists restaurant_notification_rules_select on public.restaurant_notification_rules;
create policy restaurant_notification_rules_select
on public.restaurant_notification_rules
for select
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_notification_rules.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
  or exists (
    select 1
    from public.restaurant_staffs rs
    where rs.restaurant_id = restaurant_notification_rules.restaurant_id
      and lower(coalesce(rs.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and coalesce(rs.is_active, true) = true
      and coalesce(rs.is_deleted, false) = false
  )
);

drop policy if exists restaurant_notification_rules_write on public.restaurant_notification_rules;
create policy restaurant_notification_rules_write
on public.restaurant_notification_rules
for all
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_notification_rules.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
)
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_notification_rules.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
);

drop policy if exists restaurant_notification_events_select on public.restaurant_notification_events;
create policy restaurant_notification_events_select
on public.restaurant_notification_events
for select
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_notification_events.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
  or exists (
    select 1
    from public.restaurant_staffs rs
    where rs.restaurant_id = restaurant_notification_events.restaurant_id
      and lower(coalesce(rs.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and coalesce(rs.is_active, true) = true
      and coalesce(rs.is_deleted, false) = false
  )
);

drop policy if exists restaurant_notification_events_write on public.restaurant_notification_events;
create policy restaurant_notification_events_write
on public.restaurant_notification_events
for all
using (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_notification_events.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
  or exists (
    select 1
    from public.restaurant_staffs rs
    where rs.restaurant_id = restaurant_notification_events.restaurant_id
      and lower(coalesce(rs.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and coalesce(rs.is_active, true) = true
      and coalesce(rs.is_deleted, false) = false
  )
)
with check (
  exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = restaurant_notification_events.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
  )
  or exists (
    select 1
    from public.restaurant_staffs rs
    where rs.restaurant_id = restaurant_notification_events.restaurant_id
      and lower(coalesce(rs.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and coalesce(rs.is_active, true) = true
      and coalesce(rs.is_deleted, false) = false
  )
);
