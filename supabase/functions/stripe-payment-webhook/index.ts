// Supabase Edge Function: stripe-payment-webhook
// Handles Stripe webhooks for restaurant-owned Stripe accounts.
// Each restaurant enters its own Stripe webhook signing secret in Settings.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ success: false, message: 'Method not allowed.' }, 405)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ success: false, message: 'Supabase service environment is missing.' }, 500)
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const rawBody = await req.text()
    const stripeSignature = req.headers.get('stripe-signature') || ''
    const event = JSON.parse(rawBody)
    const object = event?.data?.object || {}
    const metadata = object?.metadata || {}
    const restaurantId = cleanString(metadata.restaurant_id)
    const orderId = cleanString(metadata.order_id)
    const paymentReference = cleanString(metadata.payment_reference || object.client_reference_id)

    if (!restaurantId) {
      return jsonResponse({ success: false, message: 'Stripe webhook missing restaurant metadata.' }, 400)
    }

    const { data: credentials } = await serviceClient
      .from('restaurant_gateway_credentials')
      .select('id, webhook_secret, is_enabled')
      .eq('restaurant_id', restaurantId)
      .eq('gateway', 'stripe')
      .maybeSingle()

    if (credentials?.webhook_secret) {
      const verified = await verifyStripeSignature({
        rawBody,
        stripeSignature,
        webhookSecret: credentials.webhook_secret,
      })

      if (!verified) {
        await writeGatewayAuditLog({
          serviceClient,
          restaurantId,
          gateway: 'stripe',
          action: 'webhook',
          status: 'failed',
          message: 'Stripe webhook signature verification failed.',
          metadata: { event_id: event?.id || '', event_type: event?.type || '' },
        })

        return jsonResponse({ success: false, message: 'Invalid Stripe signature.' }, 401)
      }
    }

    const eventType = String(event?.type || '')
    const checkoutSessionId = cleanString(object?.id)
    const paymentIntentId = cleanString(object?.payment_intent)
    const order = await findOrderForStripeWebhook({
      serviceClient,
      restaurantId,
      orderId,
      paymentReference,
      checkoutSessionId,
    })

    if (!order?.id) {
      await writeGatewayAuditLog({
        serviceClient,
        restaurantId,
        gateway: 'stripe',
        action: 'webhook',
        status: 'failed',
        message: 'Stripe webhook received but no matching order was found.',
        metadata: { event_id: event?.id || '', event_type: eventType, checkout_session_id: checkoutSessionId },
      })

      return jsonResponse({ success: true, message: 'Webhook received; no matching order.' })
    }

    const updates = buildOrderUpdatesFromStripeEvent({
      eventType,
      object,
      paymentReference,
      checkoutSessionId,
      paymentIntentId,
    })

    if (Object.keys(updates).length > 0) {
      await serviceClient
        .from('restaurant_orders')
        .update({
          ...updates,
          payment_gateway: 'stripe',
          payment_method: 'online',
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
    }

    await writeGatewayAuditLog({
      serviceClient,
      restaurantId,
      gateway: 'stripe',
      action: 'webhook',
      status: 'success',
      message: `Stripe webhook processed: ${eventType}`,
      metadata: {
        event_id: event?.id || '',
        event_type: eventType,
        order_id: order.id,
        payment_reference: paymentReference,
        checkout_session_id: checkoutSessionId,
        payment_intent_id: paymentIntentId,
      },
    })

    return jsonResponse({ success: true, message: 'Stripe webhook processed.' })
  } catch (error) {
    return jsonResponse(
      { success: false, message: error?.message || 'Unable to process Stripe webhook.' },
      500,
    )
  }
})

function buildOrderUpdatesFromStripeEvent({
  eventType,
  object,
  paymentReference,
  checkoutSessionId,
  paymentIntentId,
}) {
  const now = new Date().toISOString()
  const updates: Record<string, unknown> = {
    gateway_order_id: checkoutSessionId || null,
    gateway_transaction_id: paymentIntentId || null,
    payment_reference: paymentReference || null,
    online_payment_status: eventType,
    payment_webhook_payload: {
      gateway: 'stripe',
      event_type: eventType,
      checkout_session_id: checkoutSessionId,
      payment_intent_id: paymentIntentId,
      payment_status: object?.payment_status || '',
      status: object?.status || '',
    },
  }

  if (eventType === 'checkout.session.completed' || object?.payment_status === 'paid') {
    updates.payment_status = 'paid'
    updates.online_payment_status = 'paid'
    updates.payment_paid_at = now
  } else if (
    eventType === 'checkout.session.expired' ||
    eventType === 'checkout.session.async_payment_failed' ||
    eventType === 'payment_intent.payment_failed'
  ) {
    updates.payment_status = 'unpaid'
    updates.online_payment_status = 'failed'
    updates.payment_failed_at = now
  }

  return updates
}

async function findOrderForStripeWebhook({
  serviceClient,
  restaurantId,
  orderId,
  paymentReference,
  checkoutSessionId,
}) {
  let query = serviceClient
    .from('restaurant_orders')
    .select('*')
    .eq('restaurant_id', restaurantId)

  if (orderId) query = query.eq('id', orderId)
  else if (paymentReference || checkoutSessionId) {
    const parts = []
    if (paymentReference) {
      parts.push(`payment_reference.eq.${escapePostgrestValue(paymentReference)}`)
    }
    if (checkoutSessionId) {
      parts.push(`gateway_order_id.eq.${escapePostgrestValue(checkoutSessionId)}`)
    }
    query = query.or(parts.join(','))
  } else return null

  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (error) throw new Error(error.message)
  return data || null
}

async function verifyStripeSignature({ rawBody, stripeSignature, webhookSecret }) {
  try {
    const parts = String(stripeSignature || '').split(',').reduce((acc, part) => {
      const [key, value] = part.split('=')
      if (!acc[key]) acc[key] = []
      acc[key].push(value)
      return acc
    }, {} as Record<string, string[]>)

    const timestamp = parts.t?.[0]
    const signatures = parts.v1 || []

    if (!timestamp || signatures.length === 0) return false

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${timestamp}.${rawBody}`),
    )
    const expected = bytesToHex(new Uint8Array(signature))

    return signatures.some((candidate) => timingSafeEqual(expected, candidate))
  } catch {
    return false
  }
}

function timingSafeEqual(a, b) {
  const left = String(a || '')
  const right = String(b || '')

  if (left.length !== right.length) return false

  let result = 0
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return result === 0
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function writeGatewayAuditLog({
  serviceClient,
  restaurantId,
  gateway,
  action,
  status,
  message,
  metadata = {},
}) {
  try {
    await serviceClient.from('restaurant_gateway_audit_logs').insert({
      restaurant_id: restaurantId,
      gateway,
      action,
      status,
      message,
      metadata,
    })
  } catch {
    // Audit logging must not block webhook processing.
  }
}

function escapePostgrestValue(value) {
  return String(value || '').replace(/,/g, '\\,').replace(/\)/g, '\\)')
}

function cleanString(value) {
  return String(value || '').trim()
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}
