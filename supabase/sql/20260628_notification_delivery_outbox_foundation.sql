-- Spizy Menu - Notification Delivery Outbox Foundation
-- Run after: 20260628_restaurant_notification_center_foundation.sql
-- Optional but recommended after: 20260628_notification_event_generator_foundation.sql

alter table if exists public.restaurant_notification_events
  add column if not exists delivery_channels jsonb not null default '["in_app"]'::jsonb;

alter table if exists public.restaurant_notification_events
  add column if not exists delivery_status text not null default 'pending';

alter table if exists public.restaurant_notification_events
  add column if not exists delivery_attempt_count integer not null default 0;

alter table if exists public.restaurant_notification_events
  add column if not exists last_delivery_attempt_at timestamptz;

alter table if exists public.restaurant_notification_events
  add column if not exists last_delivery_error text;

alter table if exists public.restaurant_notification_events
  add column if not exists delivered_at timestamptz;

alter table if exists public.restaurant_notification_events
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'restaurant_notification_events'
  ) then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'restaurant_notification_events_delivery_status_check'
    ) then
      alter table public.restaurant_notification_events
        add constraint restaurant_notification_events_delivery_status_check
        check (delivery_status in ('pending', 'queued', 'delivered', 'failed', 'skipped'));
    end if;
  end if;
end $$;

create table if not exists public.restaurant_notification_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  notification_event_id uuid references public.restaurant_notification_events(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'whatsapp', 'push')),
  recipient_type text not null default 'restaurant_admin',
  recipient_label text,
  recipient_target text,
  delivery_status text not null default 'queued' check (
    delivery_status in (
      'queued',
      'delivered',
      'provider_pending',
      'provider_not_configured',
      'failed',
      'skipped'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  provider_reference text,
  error_message text,
  queued_at timestamptz not null default now(),
  attempted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists restaurant_notification_delivery_outbox_event_channel_idx
  on public.restaurant_notification_delivery_outbox (notification_event_id, channel)
  where notification_event_id is not null;

create index if not exists restaurant_notification_delivery_outbox_restaurant_idx
  on public.restaurant_notification_delivery_outbox (restaurant_id, delivery_status, queued_at desc);

alter table public.restaurant_notification_delivery_outbox enable row level security;

drop policy if exists "Restaurant members can read notification delivery outbox" on public.restaurant_notification_delivery_outbox;
create policy "Restaurant members can read notification delivery outbox"
  on public.restaurant_notification_delivery_outbox
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_notification_delivery_outbox.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
    or exists (
      select 1
      from public.restaurant_staffs rs
      where rs.restaurant_id = restaurant_notification_delivery_outbox.restaurant_id
        and rs.is_deleted = false
        and rs.is_active = true
        and lower(rs.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and coalesce((rs.permissions ->> 'settings')::boolean, false) = true
    )
  );

drop policy if exists "Restaurant admins can update notification delivery outbox" on public.restaurant_notification_delivery_outbox;
create policy "Restaurant admins can update notification delivery outbox"
  on public.restaurant_notification_delivery_outbox
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_notification_delivery_outbox.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_notification_delivery_outbox.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
  );

create or replace function public.touch_restaurant_notification_delivery_outbox_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_restaurant_notification_delivery_outbox_updated_at
  on public.restaurant_notification_delivery_outbox;

create trigger trg_touch_restaurant_notification_delivery_outbox_updated_at
  before update on public.restaurant_notification_delivery_outbox
  for each row
  execute function public.touch_restaurant_notification_delivery_outbox_updated_at();
