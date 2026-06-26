create table if not exists public.restaurant_service_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_id uuid references public.restaurant_tables(id) on delete set null,
  table_name text,
  customer_session_id text,
  customer_name text,
  customer_phone text,
  request_code text,
  request_type text not null default 'waiter',
  request_title text not null default 'Call waiter',
  message text,
  status text not null default 'new',
  priority text not null default 'normal',
  source text not null default 'public_qr',
  acknowledged_at timestamptz,
  completed_at timestamptz,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_service_requests_request_type_check check (
    request_type in ('waiter', 'water', 'tissue', 'cutlery', 'cleaning', 'bill', 'custom')
  ),
  constraint restaurant_service_requests_status_check check (
    status in ('new', 'acknowledged', 'completed', 'cancelled')
  ),
  constraint restaurant_service_requests_priority_check check (
    priority in ('normal', 'urgent')
  )
);

create index if not exists restaurant_service_requests_restaurant_status_idx
on public.restaurant_service_requests (restaurant_id, status, created_at desc);

create index if not exists restaurant_service_requests_table_idx
on public.restaurant_service_requests (restaurant_id, table_id, created_at desc);

alter table public.restaurant_service_requests enable row level security;

drop policy if exists "Restaurant members can view service requests" on public.restaurant_service_requests;
create policy "Restaurant members can view service requests"
on public.restaurant_service_requests
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

drop policy if exists "Restaurant members can update service requests" on public.restaurant_service_requests;
create policy "Restaurant members can update service requests"
on public.restaurant_service_requests
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

drop policy if exists "Restaurant members can insert service requests" on public.restaurant_service_requests;
create policy "Restaurant members can insert service requests"
on public.restaurant_service_requests
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create or replace function public.get_service_request_title(p_request_type text)
returns text
language sql
immutable
as $$
  select case coalesce(p_request_type, 'waiter')
    when 'water' then 'Water request'
    when 'tissue' then 'Tissue request'
    when 'cutlery' then 'Cutlery request'
    when 'cleaning' then 'Clean table request'
    when 'bill' then 'Bill help request'
    when 'custom' then 'Other request'
    else 'Call waiter'
  end;
$$;

create or replace function public.create_public_service_request(
  p_restaurant_id uuid,
  p_table_id uuid,
  p_table_name text,
  p_customer_session_id text,
  p_customer_name text,
  p_customer_phone text,
  p_request_type text,
  p_message text
)
returns table (
  id uuid,
  request_code text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_active boolean;
  v_table_name text;
  v_request_type text;
  v_request_title text;
  v_inserted_id uuid;
  v_request_code text;
begin
  select is_active
  into v_restaurant_active
  from public.restaurants
  where restaurants.id = p_restaurant_id;

  if coalesce(v_restaurant_active, false) is not true then
    raise exception 'Restaurant is not active right now.';
  end if;

  select coalesce(rt.table_name, p_table_name)
  into v_table_name
  from public.restaurant_tables rt
  where rt.id = p_table_id
    and rt.restaurant_id = p_restaurant_id
    and rt.is_active = true;

  if p_table_id is null or v_table_name is null then
    raise exception 'Please scan a valid table QR code to send service request.';
  end if;

  v_request_type := coalesce(nullif(trim(p_request_type), ''), 'waiter');

  if v_request_type not in ('waiter', 'water', 'tissue', 'cutlery', 'cleaning', 'bill', 'custom') then
    v_request_type := 'waiter';
  end if;

  v_request_title := public.get_service_request_title(v_request_type);
  v_request_code := 'SR-' || to_char(now() at time zone 'Asia/Dubai', 'DDMM') || '-' || lpad(floor(random() * 10000)::text, 4, '0');

  insert into public.restaurant_service_requests (
    restaurant_id,
    table_id,
    table_name,
    customer_session_id,
    customer_name,
    customer_phone,
    request_code,
    request_type,
    request_title,
    message,
    status,
    priority,
    source
  ) values (
    p_restaurant_id,
    p_table_id,
    v_table_name,
    nullif(trim(coalesce(p_customer_session_id, '')), ''),
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    v_request_code,
    v_request_type,
    v_request_title,
    nullif(trim(coalesce(p_message, '')), ''),
    'new',
    case when v_request_type in ('bill', 'cleaning') then 'urgent' else 'normal' end,
    'public_qr'
  )
  returning restaurant_service_requests.id into v_inserted_id;

  return query
  select
    rsr.id,
    rsr.request_code,
    rsr.status,
    rsr.created_at
  from public.restaurant_service_requests rsr
  where rsr.id = v_inserted_id;
end;
$$;

grant execute on function public.create_public_service_request(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'restaurant_service_requests'
  ) then
    alter publication supabase_realtime add table public.restaurant_service_requests;
  end if;
end $$;
