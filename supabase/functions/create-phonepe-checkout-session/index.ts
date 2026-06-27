// Supabase Edge Function: create-phonepe-checkout-session
// Creates a PhonePe Standard Checkout order using the selected restaurant's OWN PhonePe credentials.
// Spizy/Zalepro does not use a shared PhonePe merchant account for restaurant customer payments.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') {
      return jsonResponse({ success: false, message: 'Method not allowed.' }, 405)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ success: false, message: 'Supabase service environment is missing.' }, 500)
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const body = await req.json().catch(() => ({}))

    const restaurantId = cleanString(body.restaurant_id)
    const restaurantSlug = cleanString(body.restaurant_slug)
    const orderId = cleanString(body.order_id)
    const orderCode = cleanString(body.order_code)
    const orderReference = cleanString(body.order_reference)
    const customerSessionId = cleanString(body.customer_session_id)
    const origin = getSafeOrigin(body.origin) || Deno.env.get('PUBLIC_SITE_URL') || 'https://spizy.site'

    if (!restaurantId || !orderId) {
      return jsonResponse({ success: false, message: 'Restaurant and order are required.' }, 400)
    }

    const { data: restaurant, error: restaurantError } = await serviceClient
      .from('restaurants')
      .select('id, name, slug, currency, payment_gateway_settings')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant) {
      return jsonResponse({ success: false, message: restaurantError?.message || 'Restaurant not found.' }, 404)
    }

    const gatewaySettings = normalizeObject(restaurant.payment_gateway_settings).phonepe || {}

    if (!gatewaySettings.enabled) {
      return jsonResponse({ success: false, message: 'PhonePe is not enabled for this restaurant.' }, 400)
    }

    if (!['connected', 'tested'].includes(String(gatewaySettings.connection_status || '').toLowerCase())) {
      return jsonResponse({ success: false, message: 'PhonePe credentials are not connected/tested for this restaurant yet.' }, 400)
    }

    const { data: credentials, error: credentialsError } = await serviceClient
      .from('restaurant_gateway_credentials')
      .select('id, public_key, access_token, webhook_secret, test_mode, is_enabled, metadata')
      .eq('restaurant_id', restaurantId)
      .eq('gateway', 'phonepe')
      .eq('is_enabled', true)
      .maybeSingle()

    if (credentialsError || !credentials?.access_token || !credentials.public_key) {
      return jsonResponse({ success: false, message: 'Restaurant PhonePe credentials are missing. Ask the restaurant to connect PhonePe in Settings.' }, 400)
    }

    const metadata = normalizeObject(credentials.metadata)
    const clientVersion = cleanString(metadata.client_version)

    if (!clientVersion) {
      return jsonResponse({ success: false, message: 'PhonePe Client Version is missing. Update PhonePe credentials in Settings.' }, 400)
    }

    const { data: order, error: orderError } = await serviceClient
      .from('restaurant_orders')
      .select('id, restaurant_id, order_code, public_order_number, customer_name, customer_phone, customer_session_id, total_amount, currency, payment_status, payment_gateway, payment_reference')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle()

    if (orderError || !order) {
      return jsonResponse({ success: false, message: orderError?.message || 'Order not found.' }, 404)
    }

    if (customerSessionId && order.customer_session_id && customerSessionId !== order.customer_session_id) {
      return jsonResponse({ success: false, message: 'Order session mismatch.' }, 403)
    }

    if (String(order.payment_status || '').toLowerCase() === 'paid') {
      return jsonResponse({ success: false, message: 'This order is already paid.' }, 400)
    }

    const amountPaisa = Math.max(100, Math.round(Number(order.total_amount || 0) * 100))
    const slug = restaurant.slug || restaurantSlug || ''
    const paymentReference = order.payment_reference || createPaymentReference(order.order_code || orderCode || order.id)
    const merchantOrderId = createPhonePeMerchantOrderId(paymentReference)
    const encodedSlug = encodeURIComponent(slug)
    const encodedReference = encodeURIComponent(paymentReference)
    const redirectUrl = `${origin}/payment/success?gateway=phonepe&restaurant=${encodedSlug}&ref=${encodedReference}`
    const phonepeBase = getPhonePeBaseUrls(credentials.test_mode !== false)

    const tokenResult = await fetchPhonePeAccessToken({
      authBaseUrl: phonepeBase.authBaseUrl,
      clientId: credentials.public_key,
      clientSecret: credentials.access_token,
      clientVersion,
    })

    if (!tokenResult.success) {
      await writeGatewayAuditLog({
        serviceClient,
        restaurantId,
        gateway: 'phonepe',
        action: 'checkout_create_failed',
        status: 'failed',
        message: tokenResult.message,
        metadata: { order_id: order.id, payment_reference: paymentReference },
      })

      return jsonResponse({ success: false, message: tokenResult.message, details: tokenResult.details || {} }, 502)
    }

    const phonepePayload = {
      merchantOrderId,
      amount: amountPaisa,
      expireAfter: 1200,
      disablePaymentRetry: false,
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: {
          redirectUrl,
        },
      },
      metaInfo: {
        udf1: String(order.id),
        udf2: String(restaurant.id),
        udf3: paymentReference,
        udf4: String(order.order_code || order.public_order_number || ''),
      },
      ...(order.customer_phone
        ? { prefillUserLoginDetails: { phoneNumber: String(order.customer_phone).replace(/\s+/g, '') } }
        : {}),
    }

    const phonepeResponse = await fetch(`${phonepeBase.checkoutBaseUrl}/checkout/v2/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `${tokenResult.token_type || 'O-Bearer'} ${tokenResult.access_token}`,
      },
      body: JSON.stringify(phonepePayload),
    })

    const phonepeJson = await phonepeResponse.json().catch(() => ({}))

    if (!phonepeResponse.ok || !phonepeJson?.redirectUrl) {
      const message = phonepeJson?.message || phonepeJson?.error || 'PhonePe checkout could not be created.'

      await writeGatewayAuditLog({
        serviceClient,
        restaurantId,
        gateway: 'phonepe',
        action: 'checkout_create_failed',
        status: 'failed',
        message,
        metadata: { order_id: order.id, payment_reference: paymentReference, response_code: phonepeJson?.code || '' },
      })

      return jsonResponse({ success: false, message, details: sanitizePhonePeResponse(phonepeJson) }, 502)
    }

    await serviceClient
      .from('restaurant_orders')
      .update({
        payment_gateway: 'phonepe',
        payment_method: 'online',
        delivery_payment_type: 'online',
        payment_status: 'unpaid',
        online_payment_status: 'pending',
        payment_reference: paymentReference,
        gateway_order_id: phonepeJson.orderId || merchantOrderId,
        gateway_checkout_url: phonepeJson.redirectUrl || null,
        payment_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .eq('restaurant_id', restaurant.id)

    await writeGatewayAuditLog({
      serviceClient,
      restaurantId,
      gateway: 'phonepe',
      action: 'checkout_created',
      status: 'success',
      message: 'PhonePe checkout created for this restaurant-owned account.',
      metadata: {
        order_id: order.id,
        payment_reference: paymentReference,
        merchant_order_id: merchantOrderId,
        phonepe_order_id: phonepeJson.orderId || '',
        test_mode: credentials.test_mode !== false,
      },
    })

    return jsonResponse({
      success: true,
      gateway: 'phonepe',
      payment_reference: paymentReference,
      merchant_order_id: merchantOrderId,
      gateway_order_id: phonepeJson.orderId || merchantOrderId,
      redirect_url: phonepeJson.redirectUrl || '',
      payment_link_url: phonepeJson.redirectUrl || '',
      message: 'PhonePe checkout opened. Complete payment to confirm your order payment status.',
    })
  } catch (error) {
    return jsonResponse({ success: false, message: error?.message || 'Unable to create PhonePe checkout.' }, 500)
  }
})

function getPhonePeBaseUrls(testMode = true) {
  if (testMode) {
    return {
      authBaseUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
      checkoutBaseUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    }
  }

  return {
    authBaseUrl: 'https://api.phonepe.com/apis/identity-manager',
    checkoutBaseUrl: 'https://api.phonepe.com/apis/pg',
  }
}

async function fetchPhonePeAccessToken({ authBaseUrl, clientId, clientSecret, clientVersion }) {
  const formData = new URLSearchParams()
  formData.set('client_id', clientId)
  formData.set('client_version', clientVersion)
  formData.set('client_secret', clientSecret)
  formData.set('grant_type', 'client_credentials')

  const response = await fetch(`${authBaseUrl}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  })
  const json = await response.json().catch(() => ({}))

  if (!response.ok || !json?.access_token) {
    return {
      success: false,
      message: json?.message || json?.error_description || json?.error || 'PhonePe authorization failed.',
      details: sanitizePhonePeResponse(json),
    }
  }

  return {
    success: true,
    access_token: json.access_token,
    token_type: json.token_type || 'O-Bearer',
    expires_at: json.expires_at || '',
  }
}

function createPaymentReference(seed = '') {
  const safeSeed = String(seed || 'order').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 26)
  return `spizy_phonepe_${safeSeed}_${Date.now()}`.slice(0, 63)
}

function createPhonePeMerchantOrderId(reference = '') {
  return String(reference || `spizy_phonepe_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 63)
}

async function writeGatewayAuditLog({ serviceClient, restaurantId, gateway, action, status, message, metadata = {} }) {
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

function sanitizePhonePeResponse(value) {
  const incoming = value && typeof value === 'object' ? value : {}
  return {
    code: incoming.code || incoming.error || '',
    message: incoming.message || incoming.error_description || '',
    state: incoming.state || '',
  }
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getSafeOrigin(value) {
  try {
    const url = new URL(String(value || ''))
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
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
