alter table public.restaurants
add column if not exists whatsapp_phone text,
add column if not exists website_url text,
add column if not exists instagram_url text,
add column if not exists dine_in_enabled boolean not null default true,
add column if not exists takeaway_enabled boolean not null default true,
add column if not exists delivery_enabled boolean not null default true,
add column if not exists auto_accept_orders boolean not null default false,
add column if not exists accepts_cash boolean not null default true,
add column if not exists accepts_card boolean not null default true,
add column if not exists accepts_upi boolean not null default false,
add column if not exists accepts_online boolean not null default false,
add column if not exists accepts_cod boolean not null default true,
add column if not exists minimum_order_amount numeric(10,2) not null default 0,
add column if not exists delivery_fee numeric(10,2) not null default 0,
add column if not exists estimated_delivery_minutes integer not null default 30,
add column if not exists tax_rate numeric(6,2) not null default 0,
add column if not exists service_charge numeric(6,2) not null default 0,
add column if not exists opening_hours jsonb not null default '{
  "monday": {"enabled": true, "open": "09:00", "close": "23:00"},
  "tuesday": {"enabled": true, "open": "09:00", "close": "23:00"},
  "wednesday": {"enabled": true, "open": "09:00", "close": "23:00"},
  "thursday": {"enabled": true, "open": "09:00", "close": "23:00"},
  "friday": {"enabled": true, "open": "09:00", "close": "23:00"},
  "saturday": {"enabled": true, "open": "09:00", "close": "23:00"},
  "sunday": {"enabled": true, "open": "09:00", "close": "23:00"}
}'::jsonb;

update public.restaurants
set opening_hours = '{
  "monday": {"enabled": true, "open": "09:00", "close": "23:00"},
  "tuesday": {"enabled": true, "open": "09:00", "close": "23:00"},
  "wednesday": {"enabled": true, "open": "09:00", "close": "23:00"},
  "thursday": {"enabled": true, "open": "09:00", "close": "23:00"},
  "friday": {"enabled": true, "open": "09:00", "close": "23:00"},
  "saturday": {"enabled": true, "open": "09:00", "close": "23:00"},
  "sunday": {"enabled": true, "open": "09:00", "close": "23:00"}
}'::jsonb
where opening_hours is null;
