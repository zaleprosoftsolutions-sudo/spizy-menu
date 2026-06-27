-- Spizy Customer CRM / Tags / Notes foundation

create table if not exists public.restaurant_customer_tags (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  tag_name text not null,
  tag_color text not null default '#f97316',
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, tag_name)
);

create table if not exists public.restaurant_customer_tag_links (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  tag_id uuid not null references public.restaurant_customer_tags(id) on delete cascade,
  customer_id uuid null,
  customer_phone text null,
  customer_name text null,
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_customer_notes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid null,
  customer_phone text null,
  customer_name text null,
  note_type text not null default 'general'
    check (note_type in ('general', 'preference', 'complaint', 'follow_up', 'catering')),
  note_text text not null,
  follow_up_at timestamptz null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists restaurant_customer_tag_links_unique_customer_tag
on public.restaurant_customer_tag_links (
  restaurant_id,
  tag_id,
  coalesce(customer_id::text, ''),
  coalesce(customer_phone, '')
);

create index if not exists restaurant_customer_tags_restaurant_idx
on public.restaurant_customer_tags (restaurant_id, is_deleted);

create index if not exists restaurant_customer_tag_links_restaurant_idx
on public.restaurant_customer_tag_links (restaurant_id, customer_id, customer_phone);

create index if not exists restaurant_customer_notes_restaurant_idx
on public.restaurant_customer_notes (restaurant_id, customer_id, customer_phone, is_deleted, created_at desc);

create index if not exists restaurant_customer_notes_follow_up_idx
on public.restaurant_customer_notes (restaurant_id, follow_up_at)
where follow_up_at is not null and is_deleted = false;

alter table public.restaurant_customer_tags enable row level security;
alter table public.restaurant_customer_tag_links enable row level security;
alter table public.restaurant_customer_notes enable row level security;

drop policy if exists "Customer CRM tags select" on public.restaurant_customer_tags;
drop policy if exists "Customer CRM tags insert" on public.restaurant_customer_tags;
drop policy if exists "Customer CRM tags update" on public.restaurant_customer_tags;
drop policy if exists "Customer CRM tags delete" on public.restaurant_customer_tags;

create policy "Customer CRM tags select"
on public.restaurant_customer_tags
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Customer CRM tags insert"
on public.restaurant_customer_tags
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Customer CRM tags update"
on public.restaurant_customer_tags
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

create policy "Customer CRM tags delete"
on public.restaurant_customer_tags
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Customer CRM tag links select" on public.restaurant_customer_tag_links;
drop policy if exists "Customer CRM tag links insert" on public.restaurant_customer_tag_links;
drop policy if exists "Customer CRM tag links update" on public.restaurant_customer_tag_links;
drop policy if exists "Customer CRM tag links delete" on public.restaurant_customer_tag_links;

create policy "Customer CRM tag links select"
on public.restaurant_customer_tag_links
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Customer CRM tag links insert"
on public.restaurant_customer_tag_links
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Customer CRM tag links update"
on public.restaurant_customer_tag_links
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

create policy "Customer CRM tag links delete"
on public.restaurant_customer_tag_links
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Customer CRM notes select" on public.restaurant_customer_notes;
drop policy if exists "Customer CRM notes insert" on public.restaurant_customer_notes;
drop policy if exists "Customer CRM notes update" on public.restaurant_customer_notes;
drop policy if exists "Customer CRM notes delete" on public.restaurant_customer_notes;

create policy "Customer CRM notes select"
on public.restaurant_customer_notes
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Customer CRM notes insert"
on public.restaurant_customer_notes
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Customer CRM notes update"
on public.restaurant_customer_notes
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

create policy "Customer CRM notes delete"
on public.restaurant_customer_notes
for delete
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);
