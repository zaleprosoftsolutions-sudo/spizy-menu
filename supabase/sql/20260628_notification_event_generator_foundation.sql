-- Spizy Menu - Notification Event Generator support
-- Run this after 20260628_restaurant_notification_center_foundation.sql.
-- Adds an optional dedupe key so scheduled/manual alert generation does not create duplicate open events.

do $$
begin
  if to_regclass('public.restaurant_notification_events') is null then
    raise notice 'restaurant_notification_events table not found. Run 20260628_restaurant_notification_center_foundation.sql first.';
    return;
  end if;

  alter table public.restaurant_notification_events
    add column if not exists dedupe_key text;

  create index if not exists idx_restaurant_notification_events_dedupe_key
    on public.restaurant_notification_events (restaurant_id, dedupe_key);

  create unique index if not exists idx_restaurant_notification_events_open_dedupe
    on public.restaurant_notification_events (restaurant_id, dedupe_key)
    where dedupe_key is not null and status in ('open', 'sent');
end $$;

-- Optional: seed default rules for every current restaurant.
insert into public.restaurant_notification_rules (
  restaurant_id,
  rule_key,
  rule_title,
  enabled,
  channel,
  trigger_timing,
  priority,
  notes
)
select
  r.id,
  template.rule_key,
  template.rule_title,
  true,
  'in_app',
  'scheduled',
  template.priority,
  'Auto-created by Spizy notification event generator foundation.'
from public.restaurants r
cross join (
  values
    ('payment_failed', 'Payment failed', 'high'),
    ('customer_completed_bill', 'Customer completed / requested bill', 'high'),
    ('cod_pending', 'COD pending reminder', 'medium'),
    ('day_closing_due', 'Day closing reminder', 'high'),
    ('month_close_due', 'Month close reminder', 'medium'),
    ('vat_period_due', 'VAT period close reminder', 'high'),
    ('low_stock', 'Low stock alert', 'medium'),
    ('staff_task', 'Staff task / shift alert', 'medium')
) as template(rule_key, rule_title, priority)
on conflict (restaurant_id, rule_key) do nothing;
