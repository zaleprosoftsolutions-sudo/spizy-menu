// Supabase Edge Function: create-stripe-checkout-session
// Creates a Stripe Checkout Session using the selected restaurant's OWN Stripe secret key.
// Spizy/Zalepro only provides the platform and never uses a shared Stripe profile for restaurant customer payments.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      return jsonResponse(
        { success: false, message: 'Supabase service environment is missing.' },
        500,
      )
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const body = await req.json().catch(() => ({}))
    const restaurantId = cleanString(body.restaurant_id)
    const orderId = cleanString(body.order_id)
    const orderCode = cleanString(body.order_code)
    const orderReference = cleanString(body.order_reference)
    const customerSessionId = cleanString(body.customer_session_id)
    const origin = normalizeOrigin(
      body.origin || Deno.env.get('PUBLIC_SITE_URL') || Deno.env.get('APP_URL') || '',
    )

    if (!restaurantId) {
      return jsonResponse({ success: false, message: 'Restaurant ID is required.' }, 400)
    }

    if (!origin) {
      return jsonResponse({ success: false, message: 'PUBLIC_SITE_URL or request origin is required.' }, 500)
    }

    const { data: restaurant, error: restaurantError } = await serviceClient
      .from('restaurants')
      .select('id, name, slug, currency, payment_gateway_settings')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant) {
      return jsonResponse(
        { success: false, message: restaurantError?.message || 'Restaurant not found.' },
        404,
      )
    }

    const gatewaySettings = normalizeObject(restaurant.payment_gateway_settings).stripe || {}

    if (!gatewaySettings.enabled) {
      return jsonResponse({ success: false, message: 'Stripe is not enabled for this restaurant.' }, 400)
    }

    const { data: credentials, error: credentialError } = await serviceClient
      .from('restaurant_gateway_credentials')
      .select('id, access_token, webhook_secret, merchant_label, test_mode, is_enabled')
      .eq('restaurant_id', restaurantId)
      .eq('gateway', 'stripe')
      .maybeSingle()

    if (credentialError) {
      return jsonResponse({ success: false, message: credentialError.message }, 500)
    }

    if (!credentials?.is_enabled || !credentials?.access_token) {
      return jsonResponse(
        { success: false, message: 'This restaurant has not connected its own Stripe secret key yet.' },
        400,
      )
    }

    const order = await findRestaurantOrder({
      serviceClient,
      restaurantId,
      orderId,
      orderCode,
      orderReference,
      customerSessionId,
    })

    if (!order?.id) {
      return jsonResponse(
        { success: false, message: 'Order not found for Stripe checkout.' },
        404,
      )
    }

    if (String(order.payment_status || '').toLowerCase() === 'paid') {
      return jsonResponse({ success: false, message: 'This order is already marked paid.' }, 400)
    }

    const currency = String(order.currency || restaurant.currency || 'AED').toLowerCase()
    const amountMinor = toStripeMinorAmount(order.total_amount, currency)

    if (amountMinor <= 0) {
      return jsonResponse({ success: false, message: 'Order total must be greater than zero.' }, 400)
    }

    const paymentReference =
      cleanString(order.payment_reference) ||
      `spizy-stripe-${order.id}-${Date.now()}`

    const encodedSlug = encodeURIComponent(restaurant.slug || '')
    const encodedReference = encodeURIComponent(paymentReference)
    const successUrl = `${origin}/payment/success?gateway=stripe&restaurant=${encodedSlug}&ref=${encodedReference}&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${origin}/payment/failed?gateway=stripe&restaurant=${encodedSlug}&ref=${encodedReference}&reason=cancelled`

    const params = new URLSearchParams()
    params.set('mode', 'payment')
    params.set('success_url', successUrl)
    params.set('cancel_url', cancelUrl)
    params.set('client_reference_id', paymentReference)
    params.set('line_items[0][quantity]', '1')
    params.set('line_items[0][price_data][currency]', currency)
    params.set('line_items[0][price_data][unit_amount]', String(amountMinor))
    params.set('line_items[0][price_data][product_data][name]', `${restaurant.name || 'Restaurant'} order ${order.order_code || order.public_order_number || ''}`.trim())
    params.set('metadata[restaurant_id]', restaurant.id)
    params.set('metadata[restaurant_slug]', restaurant.slug || '')
    params.set('metadata[order_id]', order.id)
    params.set('metadata[order_code]', order.order_code || '')
    params.set('metadata[payment_reference]', paymentReference)
    params.set('payment_intent_data[metadata][restaurant_id]', restaurant.id)
    params.set('payment_intent_data[metadata][order_id]', order.id)
    params.set('payment_intent_data[metadata][payment_reference]', paymentReference)

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    const stripeJson = await stripeResponse.json().catch(() => ({}))

    if (!stripeResponse.ok) {
      const message = stripeJson?.error?.message || 'Stripe checkout session could not be created.'

      await writeGatewayAuditLog({
        serviceClient,
        restaurantId: restaurant.id,
        gateway: 'stripe',
        action: 'checkout_create',
        status: 'failed',
        message,
        metadata: { order_id: order.id, stripe_error_type: stripeJson?.error?.type || '' },
      })

      return jsonResponse({ success: false, message, details: sanitizeStripeError(stripeJson) }, 502)
    }

    await serviceClient
      .from('restaurant_orders')
      .update({
        payment_gateway: 'stripe',
        payment_method: 'online',
        payment_status: 'unpaid',
        online_payment_status: 'pending',
        payment_reference: paymentReference,
        gateway_order_id: stripeJson.id || null,
        gateway_checkout_url: stripeJson.url || null,
        payment_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    await writeGatewayAuditLog({
      serviceClient,
      restaurantId: restaurant.id,
      gateway: 'stripe',
      action: 'checkout_create',
      status: 'success',
      message: 'Stripe checkout session created for this restaurant-owned Stripe account.',
      metadata: {
        order_id: order.id,
        payment_reference: paymentReference,
        checkout_session_id: stripeJson.id || '',
      },
    })

    return jsonResponse({
      success: true,
      gateway: 'stripe',
      message: 'Redirecting to Stripe secure checkout.',
      checkout_session_id: stripeJson.id || '',
      gateway_order_id: stripeJson.id || '',
      payment_reference: paymentReference,
      checkout_url: stripeJson.url || '',
      redirect_url: stripeJson.url || '',
    })
  } catch (error) {
    return jsonResponse(
      { success: false, message: error?.message || 'Unable to create Stripe checkout session.' },
      500,
    )
  }
})

async function findRestaurantOrder({
  serviceClient,
  restaurantId,
  orderId,
  orderCode,
  orderReference,
  customerSessionId,
}) {
  let query = serviceClient
    .from('restaurant_orders')
    .select('*')
    .eq('restaurant_id', restaurantId)

  if (orderId) query = query.eq('id', orderId)
  else if (orderReference) {
    query = query.or(
      `payment_reference.eq.${escapePostgrestValue(orderReference)},gateway_order_id.eq.${escapePostgrestValue(orderReference)},order_code.eq.${escapePostgrestValue(orderReference)},public_order_number.eq.${escapePostgrestValue(orderReference)}`,
    )
  } else if (orderCode) query = query.eq('order_code', orderCode)
  else if (customerSessionId) query = query.eq('customer_session_id', customerSessionId)
  else return null

  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (error) throw new Error(error.message)
  return data || null
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
    // Audit logging must not block checkout.
  }
}

function toStripeMinorAmount(value, currency) {
  const zeroDecimalCurrencies = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
  ])

  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 0

  if (zeroDecimalCurrencies.has(String(currency || '').toLowerCase())) {
    return Math.round(amount)
  }

  return Math.round(amount * 100)
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sanitizeStripeError(value) {
  const incoming = value && typeof value === 'object' ? value : {}
  return incoming.error
    ? {
        type: incoming.error.type || '',
        code: incoming.error.code || '',
        message: incoming.error.message || '',
      }
    : {}
}

function normalizeOrigin(value) {
  const cleanValue = cleanString(value).replace(/\/+$/, '')

  if (!cleanValue) return ''

  try {
    const url = new URL(cleanValue)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return url.origin
  } catch {
    return ''
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
