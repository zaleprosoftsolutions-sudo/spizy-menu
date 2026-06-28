-- Spizy Menu - Notification Provider Settings Foundation
-- Stores safe, non-secret delivery provider settings per restaurant.
-- Provider API keys/tokens must stay in Supabase secrets / Edge Functions only.

create table if not exists public.restaurant_notification_provider_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'whatsapp', 'push')),
  provider text not null,
  is_enabled boolean not null default false,
  status text not null default 'not_configured' check (status in ('not_configured', 'configured', 'testing', 'ready', 'failed')),
  sender_label text,
  sender_identity text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  last_test_status text,
  last_test_message text,
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  unique (restaurant_id, channel, provider)
);

create index if not exists restaurant_notification_provider_settings_restaurant_idx
  on public.restaurant_notification_provider_settings (restaurant_id, channel, provider);

alter table public.restaurant_notification_provider_settings enable row level security;

drop policy if exists "Restaurant members can read notification provider settings"
  on public.restaurant_notification_provider_settings;

create policy "Restaurant members can read notification provider settings"
  on public.restaurant_notification_provider_settings
  for select
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_notification_provider_settings.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin', 'accountant')
    )
    or exists (
      select 1
      from public.restaurant_staffs rs
      where rs.restaurant_id = restaurant_notification_provider_settings.restaurant_id
        and rs.is_deleted = false
        and rs.is_active = true
        and lower(rs.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and coalesce((rs.permissions ->> 'settings')::boolean, false) = true
    )
  );

drop policy if exists "Restaurant admins can manage notification provider settings"
  on public.restaurant_notification_provider_settings;

create policy "Restaurant admins can manage notification provider settings"
  on public.restaurant_notification_provider_settings
  for all
  using (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_notification_provider_settings.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
    or exists (
      select 1
      from public.restaurant_staffs rs
      where rs.restaurant_id = restaurant_notification_provider_settings.restaurant_id
        and rs.is_deleted = false
        and rs.is_active = true
        and lower(rs.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and coalesce((rs.permissions ->> 'settings')::boolean, false) = true
    )
  )
  with check (
    exists (
      select 1
      from public.restaurant_members rm
      where rm.restaurant_id = restaurant_notification_provider_settings.restaurant_id
        and rm.user_id = auth.uid()
        and rm.role::text in ('owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin')
    )
    or exists (
      select 1
      from public.restaurant_staffs rs
      where rs.restaurant_id = restaurant_notification_provider_settings.restaurant_id
        and rs.is_deleted = false
        and rs.is_active = true
        and lower(rs.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and coalesce((rs.permissions ->> 'settings')::boolean, false) = true
    )
  );

comment on table public.restaurant_notification_provider_settings is
  'Safe non-secret notification delivery provider settings. API keys/tokens are stored only in Supabase secrets.';
