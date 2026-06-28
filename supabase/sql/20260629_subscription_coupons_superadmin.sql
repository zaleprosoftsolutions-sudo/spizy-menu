-- Spizy subscription coupons + yearly plan support
-- Mamo Pay remains for Spizy SaaS subscription payments only.

alter table public.restaurants
  add column if not exists subscription_trial_started_at date null,
  add column if not exists subscription_trial_ends_at date null;

update public.restaurants
set subscription_trial_started_at = coalesce(subscription_trial_started_at, created_at::date),
    subscription_trial_ends_at = coalesce(subscription_trial_ends_at, created_at::date + interval '14 days')
where subscription_status = 'trialing'
  and subscription_trial_ends_at is null;

alter table public.restaurant_subscription_payment_attempts
  add column if not exists original_amount numeric(12,2) null,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists coupon_id uuid null,
  add column if not exists coupon_code text null;

alter table public.restaurant_subscription_invoices
  add column if not exists original_amount numeric(12,2) null,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists coupon_id uuid null,
  add column if not exists coupon_code text null;

create table if not exists public.spizy_subscription_discount_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  coupon_name text not null,
  description text null,
  discount_type text not null default 'percentage' check (discount_type in ('percentage', 'fixed_amount')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  currency text not null default 'AED',
  applicable_plan_keys text[] not null default array['qr_menu_monthly','qr_menu_yearly'],
  max_redemptions integer null check (max_redemptions is null or max_redemptions > 0),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  starts_at timestamptz null,
  ends_at timestamptz null,
  is_active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_spizy_subscription_coupons_code
  on public.spizy_subscription_discount_coupons (lower(code));

create index if not exists idx_spizy_subscription_coupons_active
  on public.spizy_subscription_discount_coupons (is_active, starts_at, ends_at);

create table if not exists public.spizy_subscription_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.spizy_subscription_discount_coupons(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  attempt_id uuid null references public.restaurant_subscription_payment_attempts(id) on delete set null,
  invoice_id uuid null references public.restaurant_subscription_invoices(id) on delete set null,
  coupon_code text not null,
  plan_key text not null,
  original_amount numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  final_amount numeric(12,2) not null default 0,
  redeemed_by uuid null references auth.users(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_spizy_coupon_redemptions_coupon
  on public.spizy_subscription_coupon_redemptions (coupon_id, redeemed_at desc);

create index if not exists idx_spizy_coupon_redemptions_restaurant
  on public.spizy_subscription_coupon_redemptions (restaurant_id, redeemed_at desc);

create or replace function public.set_spizy_subscription_coupon_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.code = upper(regexp_replace(new.code, '\s+', '', 'g'));
  return new;
end;
$$;

drop trigger if exists trg_spizy_subscription_coupons_updated_at on public.spizy_subscription_discount_coupons;
create trigger trg_spizy_subscription_coupons_updated_at
before insert or update on public.spizy_subscription_discount_coupons
for each row execute function public.set_spizy_subscription_coupon_updated_at();

alter table public.spizy_subscription_discount_coupons enable row level security;
alter table public.spizy_subscription_coupon_redemptions enable row level security;

-- Public authenticated read is limited to active coupon metadata for validation UI; writes are through service-role Edge Function only.
drop policy if exists "authenticated can read active subscription coupons" on public.spizy_subscription_discount_coupons;
create policy "authenticated can read active subscription coupons"
on public.spizy_subscription_discount_coupons
for select
to authenticated
using (is_active = true);

drop policy if exists "super admin jwt can manage subscription coupons" on public.spizy_subscription_discount_coupons;
create policy "super admin jwt can manage subscription coupons"
on public.spizy_subscription_discount_coupons
for all
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') in ('super_admin', 'partner_admin')
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') in ('super_admin', 'partner_admin')
);

drop policy if exists "super admin jwt can read coupon redemptions" on public.spizy_subscription_coupon_redemptions;
create policy "super admin jwt can read coupon redemptions"
on public.spizy_subscription_coupon_redemptions
for select
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', '') in ('super_admin', 'partner_admin')
);

-- Seed a disabled sample coupon for super admin to copy/edit.
insert into public.spizy_subscription_discount_coupons (
  code,
  coupon_name,
  description,
  discount_type,
  discount_value,
  applicable_plan_keys,
  max_redemptions,
  is_active
)
values (
  'LAUNCH25',
  'Launch 25% discount',
  'Sample launch coupon. Enable only when ready.',
  'percentage',
  25,
  array['qr_menu_monthly','qr_menu_yearly'],
  100,
  false
)
on conflict (code) do nothing;

create or replace function public.increment_spizy_coupon_redeemed_count(p_coupon_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.spizy_subscription_discount_coupons
  set redeemed_count = redeemed_count + 1,
      updated_at = now()
  where id = p_coupon_id;
end;
$$;
