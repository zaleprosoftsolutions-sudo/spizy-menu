-- Spizy Menu: Secure COD + online payment status polish
-- Safe/idempotent helper migration.
-- Purpose:
-- 1) Ensure order tables have explicit payment tracking fields.
-- 2) Keep COD and foundation online gateway orders unpaid until real collection/webhook success.
-- 3) Avoid frontend secret keys. Secret gateway credentials must stay in Edge Function secrets.

DO $$
DECLARE
  target_table regclass;
  target_name text;
BEGIN
  FOREACH target_name IN ARRAY ARRAY['public.restaurant_orders', 'public.orders'] LOOP
    target_table := to_regclass(target_name);

    IF target_table IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS payment_gateway text', target_table);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS delivery_payment_type text', target_table);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS payment_status text DEFAULT ''unpaid''', target_table);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS online_payment_status text', target_table);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS is_online_payment boolean DEFAULT false', target_table);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS gateway_transaction_id text', target_table);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS gateway_reference text', target_table);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS payment_method_label text', target_table);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS payment_status_note text', target_table);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS payment_collected_at timestamptz', target_table);
      EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz', target_table);

      EXECUTE format(
        'UPDATE %s SET payment_status = ''unpaid'' WHERE payment_status IS NULL',
        target_table
      );

      EXECUTE format(
        'UPDATE %s SET is_online_payment = true WHERE payment_gateway IS NOT NULL AND payment_gateway <> ''cod''',
        target_table
      );

      EXECUTE format(
        'UPDATE %s SET online_payment_status = COALESCE(online_payment_status, ''pending'') WHERE is_online_payment = true AND payment_status <> ''paid''',
        target_table
      );
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  target_table regclass;
  target_name text;
BEGIN
  FOREACH target_name IN ARRAY ARRAY['public.restaurant_orders', 'public.orders'] LOOP
    target_table := to_regclass(target_name);

    IF target_table IS NOT NULL THEN
      EXECUTE format(
        'COMMENT ON COLUMN %s.payment_gateway IS %L',
        target_table,
        'Public payment gateway key such as cod, ziina, stripe, razorpay, cashfree, phonepe, paypal or network.'
      );
      EXECUTE format(
        'COMMENT ON COLUMN %s.delivery_payment_type IS %L',
        target_table,
        'COD collection mode: cash or card. Null for dine-in and online gateways.'
      );
      EXECUTE format(
        'COMMENT ON COLUMN %s.payment_status IS %L',
        target_table,
        'Payment lifecycle: unpaid, paid, refunded, failed, pending_online, collection_pending, etc.'
      );
      EXECUTE format(
        'COMMENT ON COLUMN %s.online_payment_status IS %L',
        target_table,
        'Gateway-specific online payment status. Keep pending until webhook verifies success.'
      );
    END IF;
  END LOOP;
END $$;
