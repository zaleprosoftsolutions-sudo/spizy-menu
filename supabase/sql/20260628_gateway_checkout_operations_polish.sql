-- Spizy Menu - Gateway Checkout Operations Polish
-- This migration is intentionally safe/idempotent.
-- New gateway display controls are stored inside restaurants.payment_gateway_settings JSON.
-- No secret keys are stored in this JSON column; restaurant gateway secrets remain in restaurant_gateway_credentials.

DO $$
BEGIN
  RAISE NOTICE 'Gateway checkout operations polish loaded. No destructive schema changes required.';
END $$;

-- Make sure the shared webhook event table has all payment reference columns used by gateway packages.
DO $$
BEGIN
  IF to_regclass('public.restaurant_payment_webhook_events') IS NOT NULL THEN
    ALTER TABLE public.restaurant_payment_webhook_events
      ADD COLUMN IF NOT EXISTS restaurant_id uuid,
      ADD COLUMN IF NOT EXISTS order_id uuid,
      ADD COLUMN IF NOT EXISTS gateway text,
      ADD COLUMN IF NOT EXISTS event_type text,
      ADD COLUMN IF NOT EXISTS event_id text,
      ADD COLUMN IF NOT EXISTS payment_reference text,
      ADD COLUMN IF NOT EXISTS gateway_order_id text,
      ADD COLUMN IF NOT EXISTS gateway_transaction_id text,
      ADD COLUMN IF NOT EXISTS status text,
      ADD COLUMN IF NOT EXISTS raw_payload jsonb,
      ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

    CREATE INDEX IF NOT EXISTS restaurant_payment_webhook_events_gateway_reference_idx
      ON public.restaurant_payment_webhook_events (gateway, payment_reference);

    CREATE INDEX IF NOT EXISTS restaurant_payment_webhook_events_gateway_order_id_idx
      ON public.restaurant_payment_webhook_events (gateway, gateway_order_id);
  END IF;
END $$;
