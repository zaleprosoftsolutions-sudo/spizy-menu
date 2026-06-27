
// Supabase Edge Function: create-cashfree-payment-link
// Creates a Cashfree Payment Link using the selected restaurant's OWN Cashfree client ID + client secret.
// Spizy/Zalepro only provides the platform and never uses a shared Cashfree profile for restaurant customer payments.

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

    const gatewaySettings = normalizeObject(restaurant.payment_gateway_settings).cashfree || {}

    if (!gatewaySettings.enabled) {
      return jsonResponse({ success: false, message: 'Cashfree is not enabled for this restaurant.' }, 400)
    }

    const { data: credentials, error: credentialError } = await serviceClient
      .from('restaurant_gateway_credentials')
      .select('id, access_token, public_key, webhook_secret, merchant_label, test_mode, is_enabled')
      .eq('restaurant_id', restaurantId)
      .eq('gateway', 'cashfree')
      .maybeSingle()

    if (credentialError) {
      return jsonResponse({ success: false, message: credentialError.message }, 500)
    }

    if (!credentials?.is_enabled || !credentials?.public_key || !credentials?.access_token) {
      return jsonResponse(
        { success: false, message: 'This restaurant has not connected its own Cashfree client ID and client secret yet.' },
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
        { success: false, message: 'Order not found for Cashfree payment link.' },
        404,
      )
    }

    if (String(order.payment_status || '').toLowerCase() === 'paid') {
      return jsonResponse({ success: false, message: 'This order is already marked paid.' }, 400)
    }

    const currency = String(order.currency || restaurant.currency || 'INR').toUpperCase()
    const amount = roundAmount(order.total_amount)

    if (amount <= 0) {
      return jsonResponse({ success: false, message: 'Order total must be greater than zero.' }, 400)
    }

    const paymentReference = makeCashfreeReference(
      cleanString(order.payment_reference),
      order.id,
    )

    const encodedSlug = encodeURIComponent(restaurant.slug || '')
    const encodedReference = encodeURIComponent(paymentReference)
    const returnUrl = `${origin}/payment/success?gateway=cashfree&restaurant=${encodedSlug}&ref=${encodedReference}`
    const notifyUrl = `${origin}/functions/v1/cashfree-payment-webhook`
    const cashfreeBaseUrl = credentials.test_mode === false
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg'

    const cashfreePayload = {
      link_id: paymentReference,
      link_amount: amount,
      link_currency: currency,
      link_purpose: `${restaurant.name || 'Restaurant'} order ${order.order_code || order.public_order_number || ''}`.trim().slice(0, 500),
      customer_details: {
        customer_name: order.customer_name || 'Guest customer',
        customer_phone: normalizeCashfreePhone(order.customer_phone || ''),
      },
      link_notify: {
        send_sms: false,
        send_email: false,
      },
      link_auto_reminders: false,
      link_meta: {
        return_url: returnUrl,
        notify_url: notifyUrl,
      },
      link_notes: {
        restaurant_id: restaurant.id,
        restaurant_slug: restaurant.slug || '',
        order_id: order.id,
        order_code: order.order_code || '',
        payment_reference: paymentReference,
        source: 'spizy_menu',
      },
    }

    const cashfreeResponse = await fetch(`${cashfreeBaseUrl}/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': '2025-01-01',
        'x-client-id': credentials.public_key,
        'x-client-secret': credentials.access_token,
      },
      body: JSON.stringify(cashfreePayload),
    })

    const cashfreeJson = await cashfreeResponse.json().catch(() => ({}))

    if (!cashfreeResponse.ok) {
      const message =
        cashfreeJson?.message ||
        cashfreeJson?.error_description ||
        cashfreeJson?.error ||
        'Cashfree payment link could not be created.'

      await writeGatewayAuditLog({
        serviceClient,
        restaurantId: restaurant.id,
        gateway: 'cashfree',
        action: 'checkout_create',
        status: 'failed',
        message,
        metadata: { order_id: order.id, cashfree_error_code: cashfreeJson?.code || '' },
      })

      return jsonResponse({ success: false, message, details: sanitizeCashfreeError(cashfreeJson) }, 502)
    }

    await serviceClient
      .from('restaurant_orders')
      .update({
        payment_gateway: 'cashfree',
        payment_method: 'online',
        payment_status: 'unpaid',
        online_payment_status: 'pending',
        payment_reference: paymentReference,
        gateway_order_id: cashfreeJson.link_id || paymentReference,
        gateway_checkout_url: cashfreeJson.link_url || null,
        payment_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    await writeGatewayAuditLog({
      serviceClient,
      restaurantId: restaurant.id,
      gateway: 'cashfree',
      action: 'checkout_create',
      status: 'success',
      message: 'Cashfree payment link created for this restaurant-owned Cashfree account.',
      metadata: {
        order_id: order.id,
        payment_reference: paymentReference,
        cashfree_link_id: cashfreeJson.link_id || '',
        cf_link_id: cashfreeJson.cf_link_id || '',
      },
    })

    return jsonResponse({
      success: true,
      gateway: 'cashfree',
      message: 'Redirecting to Cashfree secure payment link.',
      payment_link_id: cashfreeJson.link_id || paymentReference,
      gateway_order_id: cashfreeJson.link_id || paymentReference,
      payment_reference: paymentReference,
      payment_link_url: cashfreeJson.link_url || '',
      link_url: cashfreeJson.link_url || '',
      redirect_url: cashfreeJson.link_url || '',
      cf_link_id: cashfreeJson.cf_link_id || '',
    })
  } catch (error) {
    return jsonResponse(
      { success: false, message: error?.message || 'Unable to create Cashfree payment link.' },
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

function makeCashfreeReference(existingReference = '', orderId = '') {
  const cleanedExisting = cleanString(existingReference).replace(/[^a-zA-Z0-9_-]/g, '_')

  if (cleanedExisting && cleanedExisting.length >= 3 && cleanedExisting.length <= 45) {
    return cleanedExisting
  }

  const shortOrderId = String(orderId || '').replace(/-/g, '').slice(0, 10)
  const timestampPart = String(Date.now()).slice(-12)

  return `spzc_${timestampPart}_${shortOrderId}`.slice(0, 45)
}

function normalizeCashfreePhone(value = '') {
  const digits = String(value || '').replace(/[^0-9]/g, '')
  return digits.slice(-10) || '9999999999'
}

function roundAmount(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.round(amount * 100) / 100
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sanitizeCashfreeError(value) {
  const incoming = value && typeof value === 'object' ? value : {}
  return {
    code: incoming.code || '',
    type: incoming.type || '',
    message: incoming.message || incoming.error_description || incoming.error || '',
  }
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
