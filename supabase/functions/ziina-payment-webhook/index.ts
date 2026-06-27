// Supabase Edge Function: ziina-payment-webhook
// Receives Ziina webhook events and updates restaurant_orders payment status.
// Verification uses the RESTAURANT'S OWN saved webhook secret when configured.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const rawBody = await req.text()

  try {
    const payload = JSON.parse(rawBody || '{}')
    const eventType = payload?.event || ''
    const intent = payload?.data || payload?.payment_intent || {}
    const paymentIntentId =
      cleanString(intent.id) ||
      cleanString(intent.payment_intent_id) ||
      cleanString(intent.paymentIntentId) ||
      cleanString(payload?.payment_intent_id)

    if (!paymentIntentId) {
      return jsonResponse({ success: false, message: 'Missing Ziina payment intent id.' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { success: false, message: 'Supabase service environment is missing.' },
        500,
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: order, error: orderError } = await supabase
      .from('restaurant_orders')
      .select('id, restaurant_id, payment_status')
      .or(`payment_reference.eq.${paymentIntentId},gateway_order_id.eq.${paymentIntentId}`)
      .maybeSingle()

    if (orderError) throw new Error(orderError.message)

    if (!order) {
      return jsonResponse({
        success: true,
        message: 'Webhook received, but no matching Spizy order found.',
        payment_intent_id: paymentIntentId,
      })
    }

    const { data: credentials } = await supabase
      .from('restaurant_gateway_credentials')
      .select('id, webhook_secret, is_enabled')
      .eq('restaurant_id', order.restaurant_id)
      .eq('gateway', 'ziina')
      .maybeSingle()

    const signature =
      req.headers.get('x-hmac-signature') ||
      req.headers.get('X-Hmac-Signature') ||
      req.headers.get('x-ziina-signature') ||
      ''
    const webhookSecret = cleanString(credentials?.webhook_secret)
    let signatureVerified = false

    if (webhookSecret) {
      signatureVerified = await verifyHmacSignature({
        secret: webhookSecret,
        signature,
        body: rawBody,
      })

      if (!signatureVerified) {
        return jsonResponse({ success: false, message: 'Invalid Ziina webhook signature.' }, 401)
      }
    }

    const mapped = mapZiinaStatus(intent.status)

    const updatePayload = {
      payment_gateway: 'ziina',
      payment_method: 'online',
      payment_status: mapped.payment_status,
      online_payment_status: mapped.online_payment_status,
      gateway_order_id: paymentIntentId,
      payment_reference: paymentIntentId,
      gateway_transaction_id: cleanString(intent.operation_id) || cleanString(intent.transaction_id) || null,
      gateway_payload: payload,
      updated_at: new Date().toISOString(),
    }

    if (mapped.payment_status === 'paid') {
      updatePayload.paid_at = new Date().toISOString()
      updatePayload.payment_failed_at = null
      updatePayload.payment_failure_reason = null
    }

    if (mapped.payment_status === 'failed') {
      updatePayload.payment_failed_at = new Date().toISOString()
      updatePayload.payment_failure_reason =
        intent?.latest_error?.message ||
        intent?.latest_error?.code ||
        mapped.online_payment_status
    }

    const { error: updateError } = await supabase
      .from('restaurant_orders')
      .update(updatePayload)
      .eq('id', order.id)

    if (updateError) throw new Error(updateError.message)

    await supabase.from('restaurant_payment_webhook_events').insert({
      restaurant_id: order.restaurant_id,
      order_id: order.id,
      gateway: 'ziina',
      event_type: eventType,
      gateway_reference: paymentIntentId,
      status: intent.status || '',
      payload: {
        ...payload,
        spizy_signature_verified: signatureVerified,
        spizy_restaurant_webhook_secret_configured: Boolean(webhookSecret),
      },
    })

    return jsonResponse({
      success: true,
      message: webhookSecret
        ? 'Ziina webhook processed with restaurant webhook-secret verification.'
        : 'Ziina webhook processed. Add the restaurant webhook secret for signature verification before production.',
      order_id: order.id,
      payment_intent_id: paymentIntentId,
      status: intent.status || '',
      mapped_status: mapped.payment_status,
      signature_verified: signatureVerified,
    })
  } catch (error) {
    return jsonResponse(
      { success: false, message: error?.message || 'Unable to process Ziina webhook.' },
      500,
    )
  }
})

function mapZiinaStatus(status) {
  const normalized = cleanString(status).toLowerCase()

  if (normalized === 'completed') {
    return { payment_status: 'paid', online_payment_status: 'completed' }
  }

  if (['failed', 'canceled', 'cancelled'].includes(normalized)) {
    return { payment_status: 'failed', online_payment_status: normalized || 'failed' }
  }

  return { payment_status: 'unpaid', online_payment_status: normalized || 'pending' }
}

async function verifyHmacSignature({ secret, signature, body }) {
  if (!secret || !signature) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const expected = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return safeCompare(expected, signature.toLowerCase())
}

function safeCompare(a, b) {
  if (a.length !== b.length) return false

  let result = 0
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }

  return result === 0
}

function cleanString(value) {
  return String(value || '').trim()
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}
