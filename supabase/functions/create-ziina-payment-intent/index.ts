// Supabase Edge Function: create-ziina-payment-intent
// Creates a Ziina hosted checkout Payment Intent using the RESTAURANT'S OWN Ziina access token.
// Spizy/Zalepro only provides the platform. Do not use a global Spizy Ziina token for restaurant customer payments.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ZIINA_API_BASE_URL = 'https://api-v2.ziina.com/api'

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

    const body = await req.json().catch(() => ({}))
    const restaurantId = cleanString(body.restaurant_id)
    const restaurantSlug = cleanString(body.restaurant_slug)
    const orderId = cleanString(body.order_id)
    const orderCode = cleanString(body.order_code)
    const orderReference = cleanString(body.order_reference)
    const customerSessionId = cleanString(body.customer_session_id)

    if (!restaurantId) {
      return jsonResponse({ success: false, message: 'Restaurant ID is required.' }, 400)
    }

    if (!orderId && !orderCode && !orderReference) {
      return jsonResponse(
        { success: false, message: 'Order reference is required.' },
        400,
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const order = await fetchOrder({
      supabase,
      restaurantId,
      orderId,
      orderCode,
      orderReference,
    })

    if (!order) {
      return jsonResponse({ success: false, message: 'Order not found.' }, 404)
    }

    if (
      customerSessionId &&
      order.customer_session_id &&
      order.customer_session_id !== customerSessionId
    ) {
      return jsonResponse(
        { success: false, message: 'This order does not belong to this customer session.' },
        403,
      )
    }

    if (String(order.payment_status || '').toLowerCase() === 'paid') {
      return jsonResponse({
        success: true,
        message: 'Order is already marked as paid.',
        order_id: order.id,
        order_code: order.order_code,
        payment_reference: order.payment_reference || order.gateway_order_id || '',
        gateway_order_id: order.gateway_order_id || '',
      })
    }

    const { data: restaurant, error: restaurantError } = await supabase
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

    const gatewaySettings = normalizeGatewaySettings(restaurant.payment_gateway_settings)
    const ziinaSettings = gatewaySettings.ziina || {}

    if (!ziinaSettings.enabled) {
      return jsonResponse(
        { success: false, message: 'Ziina is not active for this restaurant.' },
        400,
      )
    }

    const { data: credentials, error: credentialError } = await supabase
      .from('restaurant_gateway_credentials')
      .select('id, access_token, merchant_label, test_mode, is_enabled')
      .eq('restaurant_id', restaurantId)
      .eq('gateway', 'ziina')
      .maybeSingle()

    if (credentialError) {
      return jsonResponse(
        { success: false, message: credentialError.message || 'Unable to read restaurant Ziina credentials.' },
        500,
      )
    }

    if (!credentials?.is_enabled || !credentials?.access_token) {
      return jsonResponse(
        {
          success: false,
          message:
            'This restaurant has not connected its own Ziina account yet. Open Settings → Payment gateways and save the restaurant Ziina access token.',
        },
        400,
      )
    }

    const currency = cleanString(order.currency || restaurant.currency || 'AED').toUpperCase()
    const amount = Math.round(Number(order.total_amount || 0) * 100)

    if (!Number.isFinite(amount) || amount < 200) {
      return jsonResponse(
        { success: false, message: 'Ziina minimum payment amount is AED 2.00.' },
        400,
      )
    }

    const publicOrigin = normalizeOrigin(
      body.origin || Deno.env.get('PUBLIC_SITE_URL') || Deno.env.get('APP_URL') || '',
    )

    if (!publicOrigin) {
      return jsonResponse(
        { success: false, message: 'PUBLIC_SITE_URL or request origin is required.' },
        500,
      )
    }

    const orderNumber = order.order_code || order.public_order_number || order.id
    const slug = restaurant.slug || restaurantSlug
    const operationId = crypto.randomUUID()
    const encodedSlug = encodeURIComponent(slug || '')
    const encodedOrder = encodeURIComponent(orderNumber || order.id)

    const successUrl =
      `${publicOrigin}/payment/success?gateway=ziina&restaurant=${encodedSlug}` +
      `&order=${encodedOrder}&payment_reference={PAYMENT_INTENT_ID}`
    const cancelUrl =
      `${publicOrigin}/payment/failed?gateway=ziina&restaurant=${encodedSlug}` +
      `&order=${encodedOrder}&payment_reference={PAYMENT_INTENT_ID}&reason=cancelled`
    const failureUrl =
      `${publicOrigin}/payment/failed?gateway=ziina&restaurant=${encodedSlug}` +
      `&order=${encodedOrder}&payment_reference={PAYMENT_INTENT_ID}&reason=failed`

    const paymentIntentPayload = {
      amount,
      currency_code: currency,
      message: `${restaurant.name || 'Restaurant'} order ${orderNumber}`,
      success_url: successUrl,
      cancel_url: cancelUrl,
      failure_url: failureUrl,
      test: credentials.test_mode !== false && ziinaSettings.test_mode !== false,
      expiry: String(Date.now() + 30 * 60 * 1000),
      allow_tips: false,
    }

    const ziinaResponse = await fetch(`${ZIINA_API_BASE_URL}/payment_intent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paymentIntentPayload),
    })

    const ziinaJson = await ziinaResponse.json().catch(() => ({}))

    if (!ziinaResponse.ok) {
      const failureMessage =
        ziinaJson?.message ||
        ziinaJson?.error ||
        ziinaJson?.latest_error?.message ||
        'Ziina checkout creation failed.'

      await supabase
        .from('restaurant_orders')
        .update({
          payment_gateway: 'ziina',
          payment_method: 'online',
          online_payment_status: 'failed_to_create',
          payment_failure_reason: failureMessage,
          gateway_payload: ziinaJson,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)

      await supabase
        .from('restaurant_gateway_credentials')
        .update({
          last_error: failureMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', credentials.id)

      return jsonResponse(
        { success: false, message: failureMessage, details: ziinaJson },
        502,
      )
    }

    const paymentIntentId = ziinaJson?.id || ''

    await supabase
      .from('restaurant_orders')
      .update({
        payment_gateway: 'ziina',
        payment_method: 'online',
        payment_status: 'unpaid',
        online_payment_status: ziinaJson?.status || 'pending',
        payment_reference: paymentIntentId,
        gateway_order_id: paymentIntentId,
        gateway_transaction_id: ziinaJson?.operation_id || operationId,
        gateway_payload: ziinaJson,
        payment_failure_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    await supabase
      .from('restaurant_gateway_credentials')
      .update({
        last_used_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', credentials.id)

    return jsonResponse({
      success: true,
      message: 'Restaurant Ziina checkout created. Redirecting customer to secure payment.',
      order_id: order.id,
      order_code: order.order_code,
      payment_reference: paymentIntentId,
      payment_intent_id: paymentIntentId,
      gateway_order_id: paymentIntentId,
      gateway_transaction_id: ziinaJson?.operation_id || operationId,
      redirect_url: ziinaJson?.redirect_url || '',
      embedded_url: ziinaJson?.embedded_url || '',
      status: ziinaJson?.status || '',
      test: credentials.test_mode !== false && ziinaSettings.test_mode !== false,
    })
  } catch (error) {
    return jsonResponse(
      { success: false, message: error?.message || 'Unable to create Ziina checkout.' },
      500,
    )
  }
})

async function fetchOrder({
  supabase,
  restaurantId,
  orderId,
  orderCode,
  orderReference,
}) {
  let query = supabase
    .from('restaurant_orders')
    .select(
      'id, restaurant_id, order_code, public_order_number, customer_session_id, customer_name, customer_phone, currency, total_amount, payment_status, payment_gateway, payment_reference, gateway_order_id',
    )
    .eq('restaurant_id', restaurantId)
    .limit(1)

  if (orderId) {
    query = query.eq('id', orderId)
  } else if (orderCode) {
    query = query.eq('order_code', orderCode)
  } else {
    query = query.or(
      `payment_reference.eq.${orderReference},gateway_order_id.eq.${orderReference},order_code.eq.${orderReference},id.eq.${orderReference}`,
    )
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data || null
}

function normalizeGatewaySettings(value) {
  if (!value || typeof value !== 'object') return {}
  return value
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
