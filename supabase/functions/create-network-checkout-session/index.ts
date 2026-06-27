// Supabase Edge Function: create-network-checkout-session
// Creates a Network International / N-Genius hosted checkout using the restaurant's OWN credentials.
// Spizy/Zalepro never uses a shared Network merchant account for restaurant customer payments.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') return jsonResponse({ success: false, message: 'Method not allowed.' }, 405)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ success: false, message: 'Supabase function environment is missing.' }, 500)
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const body = await req.json().catch(() => ({}))
    const restaurantId = cleanString(body.restaurant_id)
    const restaurantSlug = cleanString(body.restaurant_slug)
    const orderId = cleanString(body.order_id)
    const orderCode = cleanString(body.order_code)
    const orderReference = cleanString(body.order_reference)
    const customerSessionId = cleanString(body.customer_session_id)
    const origin = normalizeOrigin(body.origin || Deno.env.get('PUBLIC_SITE_URL') || Deno.env.get('APP_URL') || '')

    if (!restaurantId) return jsonResponse({ success: false, message: 'Restaurant ID is required.' }, 400)
    if (!origin) return jsonResponse({ success: false, message: 'PUBLIC_SITE_URL or request origin is required.' }, 500)

    const { data: restaurant, error: restaurantError } = await serviceClient
      .from('restaurants')
      .select('id, name, slug, currency, payment_gateway_settings')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurant) {
      return jsonResponse({ success: false, message: restaurantError?.message || 'Restaurant not found.' }, 404)
    }

    const gatewaySettings = normalizeObject(restaurant.payment_gateway_settings).network || {}
    if (!gatewaySettings.enabled) {
      return jsonResponse({ success: false, message: 'Network / N-Genius is not enabled for this restaurant.' }, 400)
    }

    const { data: credentials, error: credentialError } = await serviceClient
      .from('restaurant_gateway_credentials')
      .select('id, public_key, access_token, webhook_secret, test_mode, is_enabled, merchant_label, metadata')
      .eq('restaurant_id', restaurantId)
      .eq('gateway', 'network')
      .maybeSingle()

    if (credentialError) return jsonResponse({ success: false, message: credentialError.message }, 500)
    if (!credentials?.is_enabled || !credentials?.access_token || !credentials?.public_key) {
      return jsonResponse({ success: false, message: 'This restaurant has not connected its own Network / N-Genius credentials yet.' }, 400)
    }

    const order = await findOrder({ serviceClient, restaurantId, orderId, orderCode, orderReference, customerSessionId })
    if (!order) return jsonResponse({ success: false, message: 'Order not found for Network / N-Genius checkout.' }, 404)

    const amountValue = toMinorUnits(order.total_amount, order.currency || restaurant.currency || 'AED')
    if (amountValue <= 0) return jsonResponse({ success: false, message: 'Order amount must be greater than zero.' }, 400)

    const paymentReference = order.payment_reference || `spizy_network_${order.id}`
    const encodedRestaurant = encodeURIComponent(restaurant.slug || restaurantSlug || '')
    const encodedReference = encodeURIComponent(paymentReference)
    const successUrl = `${origin}/payment/success?gateway=network&restaurant=${encodedRestaurant}&ref=${encodedReference}`
    const cancelUrl = `${origin}/payment/failed?gateway=network&restaurant=${encodedRestaurant}&ref=${encodedReference}&reason=cancelled`

    const networkBase = getNetworkBaseUrls(credentials.test_mode !== false)
    const tokenResult = await fetchNetworkAccessToken({
      identityBaseUrl: networkBase.identityBaseUrl,
      apiKey: credentials.access_token,
    })

    if (!tokenResult.success) {
      await writeGatewayAuditLog({ serviceClient, restaurantId, gateway: 'network', action: 'create_checkout', status: 'failed', message: tokenResult.message })
      return jsonResponse({ success: false, message: tokenResult.message, details: tokenResult.details || {} }, 502)
    }

    const orderPayload = {
      action: 'SALE',
      amount: {
        currencyCode: order.currency || restaurant.currency || 'AED',
        value: amountValue,
      },
      merchantAttributes: {
        redirectUrl: successUrl,
        cancelUrl,
        cancelText: 'Cancel payment',
        skipConfirmationPage: true,
      },
      merchantOrderReference: order.order_code || order.public_order_number || paymentReference,
      emailAddress: order.customer_email || undefined,
    }

    const createResponse = await fetch(`${networkBase.paymentBaseUrl}/transactions/outlets/${encodeURIComponent(credentials.public_key)}/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResult.access_token}`,
        'Content-Type': 'application/vnd.ni-payment.v2+json',
        Accept: 'application/vnd.ni-payment.v2+json',
      },
      body: JSON.stringify(orderPayload),
    })

    const createJson = await createResponse.json().catch(() => ({}))

    if (!createResponse.ok) {
      const failureMessage =
        createJson?.message ||
        createJson?.errors?.[0]?.message ||
        'Network / N-Genius order creation failed. Check this restaurant’s outlet, API key, currency and mode.'

      await serviceClient.from('restaurant_orders').update({
        payment_gateway: 'network',
        payment_method: 'online',
        payment_status: 'unpaid',
        online_payment_status: 'failed_to_create_checkout',
        payment_reference: paymentReference,
        payment_status_note: failureMessage,
        gateway_response: sanitizeGatewayResponse(createJson),
        updated_at: new Date().toISOString(),
      }).eq('id', order.id)

      await writeGatewayAuditLog({ serviceClient, restaurantId, gateway: 'network', action: 'create_checkout', status: 'failed', message: failureMessage, metadata: sanitizeGatewayResponse(createJson) })
      return jsonResponse({ success: false, message: failureMessage, details: sanitizeGatewayResponse(createJson) }, 502)
    }

    const networkOrderReference = createJson?.reference || createJson?.orderReference || paymentReference
    const paymentUrl = createJson?._links?.payment?.href || createJson?.paymentUrl || createJson?.redirect_url || ''

    await serviceClient.from('restaurant_orders').update({
      payment_gateway: 'network',
      payment_method: 'online',
      payment_status: 'unpaid',
      online_payment_status: 'pending',
      payment_reference: paymentReference,
      gateway_order_id: networkOrderReference,
      gateway_checkout_url: paymentUrl,
      payment_status_note: 'Network / N-Genius checkout created with this restaurant-owned account. Waiting for payment confirmation.',
      gateway_response: sanitizeGatewayResponse(createJson),
      updated_at: new Date().toISOString(),
    }).eq('id', order.id)

    await writeGatewayAuditLog({
      serviceClient,
      restaurantId,
      gateway: 'network',
      action: 'create_checkout',
      status: 'success',
      message: 'Network / N-Genius checkout created using this restaurant-owned account.',
      metadata: { order_id: order.id, payment_reference: paymentReference, gateway_order_id: networkOrderReference, test_mode: credentials.test_mode !== false },
    })

    return jsonResponse({
      success: true,
      message: 'Redirecting to Network / N-Genius secure checkout.',
      gateway: 'network',
      payment_reference: paymentReference,
      gateway_order_id: networkOrderReference,
      ngenius_order_reference: networkOrderReference,
      redirect_url: paymentUrl,
      payment_url: paymentUrl,
      mode: credentials.test_mode === false ? 'live' : 'test',
    })
  } catch (error) {
    return jsonResponse({ success: false, message: error?.message || 'Unable to create Network / N-Genius checkout.' }, 500)
  }
})

async function findOrder({ serviceClient, restaurantId, orderId, orderCode, orderReference, customerSessionId }) {
  let query = serviceClient.from('restaurant_orders').select('*').eq('restaurant_id', restaurantId)

  if (orderId) query = query.eq('id', orderId)
  else if (orderReference) query = query.or(`payment_reference.eq.${orderReference},gateway_order_id.eq.${orderReference},order_code.eq.${orderReference},public_order_number.eq.${orderReference}`)
  else if (orderCode) query = query.eq('order_code', orderCode)
  else return null

  const { data } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!data) return null

  if (customerSessionId && data.customer_session_id && data.customer_session_id !== customerSessionId) return null
  return data
}

function getNetworkBaseUrls(testMode = true) {
  if (testMode) {
    return {
      identityBaseUrl: 'https://api-gateway.sandbox.ngenius-payments.com',
      paymentBaseUrl: 'https://api-gateway.sandbox.ngenius-payments.com',
    }
  }

  return {
    identityBaseUrl: 'https://api-gateway.ngenius-payments.com',
    paymentBaseUrl: 'https://api-gateway.ngenius-payments.com',
  }
}

async function fetchNetworkAccessToken({ identityBaseUrl, apiKey }) {
  const response = await fetch(`${identityBaseUrl}/identity/auth/access-token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/vnd.ni-identity.v1+json',
      Accept: 'application/vnd.ni-identity.v1+json',
    },
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok || !json?.access_token) {
    return {
      success: false,
      message: json?.message || json?.error_description || json?.error || 'Network / N-Genius access token request failed.',
      details: sanitizeGatewayResponse(json),
    }
  }

  return { success: true, access_token: json.access_token, expires_in: json.expires_in || '' }
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

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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

function toMinorUnits(amount, currency = 'AED') {
  const zeroDecimal = ['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']
  const multiplier = zeroDecimal.includes(String(currency || '').toUpperCase()) ? 1 : 100
  return Math.max(0, Math.round(Number(amount || 0) * multiplier))
}

function sanitizeGatewayResponse(value) {
  const incoming = normalizeObject(value)
  const safe = { ...incoming }
  delete safe.access_token
  delete safe.token
  delete safe.apiKey
  delete safe.api_key
  return safe
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
