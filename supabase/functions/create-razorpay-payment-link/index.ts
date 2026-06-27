// Supabase Edge Function: create-razorpay-payment-link
// Creates a Razorpay Payment Link using the selected restaurant's OWN Razorpay key ID + key secret.
// Spizy/Zalepro only provides the platform and never uses a shared Razorpay profile for restaurant customer payments.

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

    const gatewaySettings = normalizeObject(restaurant.payment_gateway_settings).razorpay || {}

    if (!gatewaySettings.enabled) {
      return jsonResponse({ success: false, message: 'Razorpay is not enabled for this restaurant.' }, 400)
    }

    const { data: credentials, error: credentialError } = await serviceClient
      .from('restaurant_gateway_credentials')
      .select('id, access_token, public_key, webhook_secret, merchant_label, test_mode, is_enabled')
      .eq('restaurant_id', restaurantId)
      .eq('gateway', 'razorpay')
      .maybeSingle()

    if (credentialError) {
      return jsonResponse({ success: false, message: credentialError.message }, 500)
    }

    if (!credentials?.is_enabled || !credentials?.public_key || !credentials?.access_token) {
      return jsonResponse(
        { success: false, message: 'This restaurant has not connected its own Razorpay key ID and key secret yet.' },
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
        { success: false, message: 'Order not found for Razorpay payment link.' },
        404,
      )
    }

    if (String(order.payment_status || '').toLowerCase() === 'paid') {
      return jsonResponse({ success: false, message: 'This order is already marked paid.' }, 400)
    }

    const currency = String(order.currency || restaurant.currency || 'INR').toUpperCase()
    const amountMinor = toMinorAmount(order.total_amount, currency)

    if (amountMinor <= 0) {
      return jsonResponse({ success: false, message: 'Order total must be greater than zero.' }, 400)
    }

    const paymentReference = makeRazorpayReference(
      cleanString(order.payment_reference),
      order.id,
    )

    const encodedSlug = encodeURIComponent(restaurant.slug || '')
    const encodedReference = encodeURIComponent(paymentReference)
    const callbackUrl = `${origin}/payment/success?gateway=razorpay&restaurant=${encodedSlug}&ref=${encodedReference}`

    const razorpayPayload = {
      amount: amountMinor,
      currency,
      accept_partial: false,
      reference_id: paymentReference,
      description: `${restaurant.name || 'Restaurant'} order ${order.order_code || order.public_order_number || ''}`.trim(),
      customer: {
        name: order.customer_name || 'Guest customer',
        contact: normalizeRazorpayPhone(order.customer_phone || ''),
      },
      notify: {
        sms: false,
        email: false,
      },
      reminder_enable: false,
      callback_url: callbackUrl,
      callback_method: 'get',
      notes: {
        restaurant_id: restaurant.id,
        restaurant_slug: restaurant.slug || '',
        order_id: order.id,
        order_code: order.order_code || '',
        payment_reference: paymentReference,
        source: 'spizy_menu',
      },
    }

    const razorpayResponse = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encodeBasicAuth(credentials.public_key, credentials.access_token)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(razorpayPayload),
    })

    const razorpayJson = await razorpayResponse.json().catch(() => ({}))

    if (!razorpayResponse.ok) {
      const message =
        razorpayJson?.error?.description ||
        razorpayJson?.error?.reason ||
        'Razorpay payment link could not be created.'

      await writeGatewayAuditLog({
        serviceClient,
        restaurantId: restaurant.id,
        gateway: 'razorpay',
        action: 'checkout_create',
        status: 'failed',
        message,
        metadata: { order_id: order.id, razorpay_error_code: razorpayJson?.error?.code || '' },
      })

      return jsonResponse({ success: false, message, details: sanitizeRazorpayError(razorpayJson) }, 502)
    }

    await serviceClient
      .from('restaurant_orders')
      .update({
        payment_gateway: 'razorpay',
        payment_method: 'online',
        payment_status: 'unpaid',
        online_payment_status: 'pending',
        payment_reference: paymentReference,
        gateway_order_id: razorpayJson.id || null,
        gateway_checkout_url: razorpayJson.short_url || null,
        payment_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    await writeGatewayAuditLog({
      serviceClient,
      restaurantId: restaurant.id,
      gateway: 'razorpay',
      action: 'checkout_create',
      status: 'success',
      message: 'Razorpay payment link created for this restaurant-owned Razorpay account.',
      metadata: {
        order_id: order.id,
        payment_reference: paymentReference,
        payment_link_id: razorpayJson.id || '',
      },
    })

    return jsonResponse({
      success: true,
      gateway: 'razorpay',
      message: 'Redirecting to Razorpay secure payment link.',
      payment_link_id: razorpayJson.id || '',
      gateway_order_id: razorpayJson.id || '',
      payment_reference: paymentReference,
      payment_link_url: razorpayJson.short_url || '',
      short_url: razorpayJson.short_url || '',
      redirect_url: razorpayJson.short_url || '',
    })
  } catch (error) {
    return jsonResponse(
      { success: false, message: error?.message || 'Unable to create Razorpay payment link.' },
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

function makeRazorpayReference(existingReference = '', orderId = '') {
  const cleanedExisting = cleanString(existingReference)

  if (cleanedExisting && cleanedExisting.length <= 40) {
    return cleanedExisting
  }

  const shortOrderId = String(orderId || '').replace(/-/g, '').slice(0, 10)
  const timestampPart = String(Date.now()).slice(-12)

  return `spzr-${timestampPart}-${shortOrderId}`.slice(0, 40)
}

function normalizeRazorpayPhone(value = '') {
  const cleaned = String(value || '').replace(/[^0-9+]/g, '')
  return cleaned || undefined
}

function toMinorAmount(value, currency) {
  const zeroDecimalCurrencies = new Set([
    'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
  ])

  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 0

  if (zeroDecimalCurrencies.has(String(currency || '').toUpperCase())) {
    return Math.round(amount)
  }

  return Math.round(amount * 100)
}

function encodeBasicAuth(username = '', password = '') {
  return btoa(`${username}:${password}`)
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sanitizeRazorpayError(value) {
  const incoming = value && typeof value === 'object' ? value : {}
  return incoming.error
    ? {
        code: incoming.error.code || '',
        reason: incoming.error.reason || '',
        description: incoming.error.description || '',
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
