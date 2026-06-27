-- Spizy Menu — Payment success/failed screen + webhook-ready order flow
-- Safe to run multiple times.

DO $$
BEGIN
  IF to_regclass('public.restaurant_orders') IS NOT NULL THEN
    ALTER TABLE public.restaurant_orders
      ADD COLUMN IF NOT EXISTS payment_gateway text,
      ADD COLUMN IF NOT EXISTS delivery_payment_type text,
      ADD COLUMN IF NOT EXISTS payment_reference text,
      ADD COLUMN IF NOT EXISTS gateway_order_id text,
      ADD COLUMN IF NOT EXISTS gateway_transaction_id text,
      ADD COLUMN IF NOT EXISTS payment_status_note text,
      ADD COLUMN IF NOT EXISTS online_payment_status text,
      ADD COLUMN IF NOT EXISTS online_payment_started_at timestamptz,
      ADD COLUMN IF NOT EXISTS online_payment_completed_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_webhook_payload jsonb DEFAULT '{}'::jsonb;

    CREATE INDEX IF NOT EXISTS idx_restaurant_orders_payment_reference
      ON public.restaurant_orders (payment_reference);

    CREATE INDEX IF NOT EXISTS idx_restaurant_orders_gateway_order_id
      ON public.restaurant_orders (gateway_order_id);

    CREATE INDEX IF NOT EXISTS idx_restaurant_orders_gateway_transaction_id
      ON public.restaurant_orders (gateway_transaction_id);

    CREATE INDEX IF NOT EXISTS idx_restaurant_orders_payment_gateway_status
      ON public.restaurant_orders (restaurant_id, payment_gateway, payment_status);

    UPDATE public.restaurant_orders
    SET payment_reference = COALESCE(payment_reference, order_code, public_order_number, id::text)
    WHERE payment_reference IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_public_payment_result(
  p_restaurant_slug text DEFAULT NULL,
  p_order_reference text DEFAULT NULL,
  p_customer_session_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF to_regclass('public.restaurant_orders') IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT jsonb_build_object(
    'order_id', o.id,
    'restaurant_id', o.restaurant_id,
    'restaurant_name', r.name,
    'restaurant_slug', r.slug,
    'order_code', o.order_code,
    'public_order_number', o.public_order_number,
    'order_reference', COALESCE(o.payment_reference, o.gateway_order_id, o.order_code, o.public_order_number, o.id::text),
    'payment_reference', o.payment_reference,
    'gateway_order_id', o.gateway_order_id,
    'gateway_transaction_id', o.gateway_transaction_id,
    'payment_gateway', o.payment_gateway,
    'delivery_payment_type', o.delivery_payment_type,
    'payment_status', COALESCE(o.payment_status, 'unpaid'),
    'online_payment_status', o.online_payment_status,
    'payment_status_note', o.payment_status_note,
    'order_status', o.status,
    'order_type', o.order_type,
    'customer_name', o.customer_name,
    'total_amount', o.total_amount,
    'currency', o.currency,
    'created_at', o.created_at,
    'updated_at', o.updated_at
  )
  INTO v_result
  FROM public.restaurant_orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE
    (p_restaurant_slug IS NULL OR r.slug = p_restaurant_slug)
    AND (
      p_order_reference IS NULL
      OR o.id::text = p_order_reference
      OR o.order_code = p_order_reference
      OR o.public_order_number = p_order_reference
      OR o.payment_reference = p_order_reference
      OR o.gateway_order_id = p_order_reference
      OR o.gateway_transaction_id = p_order_reference
    )
    AND (
      p_order_reference IS NOT NULL
      OR p_customer_session_id IS NULL
      OR o.customer_session_id = p_customer_session_id
    )
  ORDER BY o.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_payment_result(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_restaurant_gateway_payment_result(
  p_order_reference text,
  p_gateway text,
  p_gateway_transaction_id text,
  p_payment_status text,
  p_payment_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized_status text;
  v_order public.restaurant_orders%ROWTYPE;
BEGIN
  IF p_order_reference IS NULL OR length(trim(p_order_reference)) = 0 THEN
    RAISE EXCEPTION 'Order reference is required.';
  END IF;

  v_normalized_status := lower(trim(COALESCE(p_payment_status, '')));

  IF v_normalized_status NOT IN ('paid', 'failed', 'payment_failed', 'refunded', 'unpaid', 'pending') THEN
    RAISE EXCEPTION 'Unsupported payment status: %', p_payment_status;
  END IF;

  UPDATE public.restaurant_orders
  SET
    payment_status = CASE
      WHEN v_normalized_status = 'payment_failed' THEN 'unpaid'
      WHEN v_normalized_status = 'failed' THEN 'unpaid'
      WHEN v_normalized_status = 'pending' THEN COALESCE(payment_status, 'unpaid')
      ELSE v_normalized_status
    END,
    payment_method = CASE
      WHEN v_normalized_status = 'paid' THEN 'online'
      ELSE COALESCE(payment_method, 'online')
    END,
    payment_gateway = COALESCE(NULLIF(trim(p_gateway), ''), payment_gateway),
    gateway_transaction_id = COALESCE(NULLIF(trim(p_gateway_transaction_id), ''), gateway_transaction_id),
    online_payment_status = v_normalized_status,
    payment_status_note = CASE
      WHEN v_normalized_status = 'paid' THEN 'Payment confirmed by gateway webhook.'
      WHEN v_normalized_status IN ('failed', 'payment_failed') THEN 'Payment failed or was cancelled by gateway.'
      WHEN v_normalized_status = 'refunded' THEN 'Payment refund recorded by gateway webhook.'
      ELSE COALESCE(payment_status_note, 'Gateway payment is pending.')
    END,
    online_payment_completed_at = CASE
      WHEN v_normalized_status IN ('paid', 'refunded') THEN now()
      ELSE online_payment_completed_at
    END,
    payment_failed_at = CASE
      WHEN v_normalized_status IN ('failed', 'payment_failed') THEN now()
      ELSE payment_failed_at
    END,
    payment_webhook_payload = COALESCE(p_payment_payload, '{}'::jsonb),
    updated_at = now()
  WHERE
    id::text = p_order_reference
    OR order_code = p_order_reference
    OR public_order_number = p_order_reference
    OR payment_reference = p_order_reference
    OR gateway_order_id = p_order_reference
    OR gateway_transaction_id = p_order_reference
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found for payment reference.';
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_code', v_order.order_code,
    'payment_status', v_order.payment_status,
    'payment_gateway', v_order.payment_gateway,
    'gateway_transaction_id', v_order.gateway_transaction_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_restaurant_gateway_payment_result(text, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_restaurant_gateway_payment_result(text, text, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.record_restaurant_gateway_payment_result(text, text, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_restaurant_gateway_payment_result(text, text, text, text, jsonb) TO service_role;
