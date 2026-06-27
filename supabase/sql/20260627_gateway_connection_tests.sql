-- Spizy Menu — Gateway connection test and activation safety
-- Keeps restaurant customer-payment gateways restaurant-owned.
-- Spizy/Zalepro does not use its own Ziina/Stripe/etc. merchant profile for restaurant customer orders.

alter table if exists public.restaurant_gateway_credentials
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_test_status text,
  add column if not exists last_test_message text;

create index if not exists restaurant_gateway_credentials_test_status_idx
  on public.restaurant_gateway_credentials (restaurant_id, gateway, last_test_status);

comment on column public.restaurant_gateway_credentials.last_tested_at
is 'Latest backend gateway connection test timestamp.';

comment on column public.restaurant_gateway_credentials.last_test_status
is 'Latest backend gateway connection test result: success or failed.';

comment on column public.restaurant_gateway_credentials.last_test_message
is 'Public-safe latest test message shown to the restaurant owner; never store secrets here.';

-- Public-safe connection flags are stored inside restaurants.payment_gateway_settings JSONB.
-- Example for Ziina:
-- payment_gateway_settings->'ziina' = {
--   "enabled": true,
--   "connection_status": "connected" | "tested" | "test_failed" | "not_connected",
--   "credential_status": "saved" | "missing",
--   "last_test_status": "success" | "failed",
--   "last_test_message": "..."
-- }
-- Public menu can use these flags to avoid showing Ziina checkout before credentials exist.
