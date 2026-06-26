create table if not exists public.restaurant_campaigns (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title text not null,
  subtitle text,
  banner_image_url text,
  button_text text,
  button_target text not null default 'coupon'
    check (button_target in ('coupon', 'cart', 'link', 'none')),
  coupon_code text,
  link_url text,
  start_at timestamptz,
  end_at timestamptz,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists restaurant_campaigns_restaurant_idx
on public.restaurant_campaigns (restaurant_id, is_deleted, is_active, sort_order, created_at desc);

create index if not exists restaurant_campaigns_public_live_idx
on public.restaurant_campaigns (restaurant_id, is_active, is_deleted, start_at, end_at);

alter table public.restaurant_campaigns enable row level security;

drop policy if exists "Restaurant campaigns public active select" on public.restaurant_campaigns;
drop policy if exists "Restaurant campaigns member select" on public.restaurant_campaigns;
drop policy if exists "Restaurant campaigns member insert" on public.restaurant_campaigns;
drop policy if exists "Restaurant campaigns member update" on public.restaurant_campaigns;
drop policy if exists "Restaurant campaigns member delete" on public.restaurant_campaigns;

create policy "Restaurant campaigns public active select"
on public.restaurant_campaigns
for select
to anon, authenticated
using (
  is_deleted = false
  and is_active = true
  and exists (
    select 1
    from public.restaurants r
    where r.id = restaurant_id
      and r.is_active = true
  )
);

create policy "Restaurant campaigns member select"
on public.restaurant_campaigns
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant campaigns member insert"
on public.restaurant_campaigns
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant campaigns member update"
on public.restaurant_campaigns
for update
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
)
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Restaurant campaigns member delete"
on public.restaurant_campaigns
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);
