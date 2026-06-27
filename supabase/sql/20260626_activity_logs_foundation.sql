create table if not exists public.restaurant_activity_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action_type text not null default 'update',
  entity_type text not null default 'activity',
  entity_id uuid,
  title text not null default 'Activity recorded',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint restaurant_activity_logs_action_check
    check (action_type in ('insert', 'update', 'delete', 'system'))
);

create index if not exists restaurant_activity_logs_restaurant_created_idx
on public.restaurant_activity_logs (restaurant_id, created_at desc);

create index if not exists restaurant_activity_logs_restaurant_entity_idx
on public.restaurant_activity_logs (restaurant_id, entity_type, action_type, created_at desc);

alter table public.restaurant_activity_logs enable row level security;

drop policy if exists "Activity logs restaurant member select" on public.restaurant_activity_logs;
drop policy if exists "Activity logs restaurant member insert" on public.restaurant_activity_logs;

create policy "Activity logs restaurant member select"
on public.restaurant_activity_logs
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create policy "Activity logs restaurant member insert"
on public.restaurant_activity_logs
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurant_id)
  or public.get_my_role() = 'super_admin'
);

create or replace function public.safe_uuid_from_text(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if value is null or trim(value) = '' then
    return null;
  end if;

  return value::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.spizy_activity_label(source_row jsonb, fallback text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(source_row ->> 'order_code', ''),
    nullif(source_row ->> 'reservation_code', ''),
    nullif(source_row ->> 'name', ''),
    nullif(source_row ->> 'title', ''),
    nullif(source_row ->> 'staff_name', ''),
    nullif(source_row ->> 'supplier_name', ''),
    nullif(source_row ->> 'customer_name', ''),
    nullif(source_row ->> 'expense_title', ''),
    nullif(source_row ->> 'table_name', ''),
    nullif(source_row ->> 'phone', ''),
    fallback
  );
$$;

create or replace function public.log_restaurant_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row jsonb;
  old_row jsonb;
  restaurant_uuid uuid;
  restaurant_text text;
  entity_uuid uuid;
  entity_label text;
  entity_name text;
  action_name text;
  title_text text;
  description_text text;
begin
  if tg_op = 'DELETE' then
    source_row := to_jsonb(old);
    old_row := to_jsonb(old);
  else
    source_row := to_jsonb(new);
    old_row := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  end if;

  restaurant_text := coalesce(
    source_row ->> 'restaurant_id',
    case when tg_table_name = 'restaurants' then source_row ->> 'id' else null end
  );

  restaurant_uuid := public.safe_uuid_from_text(restaurant_text);

  if restaurant_uuid is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  entity_name := coalesce(nullif(tg_argv[0], ''), tg_table_name);
  entity_uuid := public.safe_uuid_from_text(source_row ->> 'id');
  entity_label := public.spizy_activity_label(source_row, entity_name);

  action_name := lower(tg_op);

  title_text := initcap(replace(entity_name, '_', ' ')) || ' ' ||
    case action_name
      when 'insert' then 'created'
      when 'update' then 'updated'
      when 'delete' then 'deleted'
      else 'changed'
    end;

  description_text := case action_name
    when 'insert' then entity_label || ' was created.'
    when 'update' then entity_label || ' was updated.'
    when 'delete' then entity_label || ' was deleted.'
    else entity_label || ' activity recorded.'
  end;

  insert into public.restaurant_activity_logs (
    restaurant_id,
    actor_id,
    action_type,
    entity_type,
    entity_id,
    title,
    description,
    metadata
  ) values (
    restaurant_uuid,
    auth.uid(),
    action_name,
    entity_name,
    entity_uuid,
    title_text,
    description_text,
    jsonb_build_object(
      'table', tg_table_name,
      'label', entity_label,
      'new', source_row,
      'old', old_row
    )
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

do $$
declare
  tracked_table record;
  trigger_name text;
begin
  for tracked_table in
    select * from (values
      ('restaurants', 'restaurant_settings'),
      ('restaurant_orders', 'order'),
      ('restaurant_order_items', 'order_item'),
      ('restaurant_tables', 'table_qr'),
      ('restaurant_service_requests', 'service_request'),
      ('restaurant_reservations', 'reservation'),
      ('menu_categories', 'menu_category'),
      ('menu_items', 'menu_item'),
      ('menu_item_variations', 'menu_variation'),
      ('restaurant_discounts', 'discount'),
      ('restaurant_campaigns', 'campaign'),
      ('restaurant_reviews', 'review'),
      ('restaurant_staffs', 'staff'),
      ('restaurant_staff_attendance', 'attendance'),
      ('restaurant_payroll', 'payroll'),
      ('restaurant_inventory_movements', 'inventory_movement'),
      ('restaurant_inventory_stock_movements', 'inventory_movement'),
      ('restaurant_suppliers', 'supplier'),
      ('restaurant_purchases', 'purchase'),
      ('restaurant_purchase_items', 'purchase_item'),
      ('restaurant_supplier_payments', 'supplier_payment'),
      ('restaurant_customer_payments', 'customer_payment'),
      ('restaurant_expenses', 'expense'),
      ('restaurant_expense_categories', 'expense_category'),
      ('restaurant_cash_accounts', 'cash_bank_account'),
      ('restaurant_cash_bank_ledger', 'cash_bank_ledger'),
      ('restaurant_day_closings', 'day_closing'),
      ('restaurant_modifier_groups', 'modifier_group'),
      ('restaurant_modifier_options', 'modifier_option'),
      ('restaurant_recipe_cards', 'recipe'),
      ('restaurant_recipe_ingredients', 'recipe_ingredient'),
      ('restaurant_print_settings', 'print_settings')
    ) as t(table_name, entity_type)
  loop
    if to_regclass('public.' || tracked_table.table_name) is not null then
      trigger_name := 'trg_spizy_activity_' || tracked_table.table_name;

      execute format(
        'drop trigger if exists %I on public.%I',
        trigger_name,
        tracked_table.table_name
      );

      execute format(
        'create trigger %I after insert or update or delete on public.%I for each row execute function public.log_restaurant_activity(%L)',
        trigger_name,
        tracked_table.table_name,
        tracked_table.entity_type
      );
    end if;
  end loop;
end $$;
