// Supabase Edge Function: create-paypal-checkout-order
// Creates a PayPal checkout order using the restaurant's OWN PayPal credentials.
// Spizy/Zalepro does not use a shared PayPal merchant account for restaurant customer payments.

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

    const gatewaySettings = normalizeObject(restaurant.payment_gateway_settings).paypal || {}
    if (!gatewaySettings.enabled) {
      return jsonResponse({ success: false, message: 'PayPal is not enabled for this restaurant.' }, 400)
    }

    const { data: credentials, error: credentialError } = await serviceClient
      .from('restaurant_gateway_credentials')
      .select('id, public_key, access_token, webhook_secret, test_mode, is_enabled, merchant_label, metadata')
      .eq('restaurant_id', restaurantId)
      .eq('gateway', 'paypal')
      .maybeSingle()

    if (credentialError) return jsonResponse({ success: false, message: credentialError.message }, 500)
    if (!credentials?.is_enabled || !credentials?.access_token || !credentials?.public_key) {
      return jsonResponse({ success: false, message: 'This restaurant has not connected its own PayPal credentials yet.' }, 400)
    }

    const order = await findOrder({ serviceClient, restaurantId, orderId, orderCode, orderReference, customerSessionId })
    if (!order) return jsonResponse({ success: false, message: 'Order not found for PayPal checkout.' }, 404)

    const amountValue = toMajorAmount(order.total_amount)
    if (Number(amountValue) <= 0) return jsonResponse({ success: false, message: 'Order amount must be greater than zero.' }, 400)

    const paymentReference = order.payment_reference || `spizy_paypal_${order.id}`
    const encodedRestaurant = encodeURIComponent(restaurant.slug || restaurantSlug || '')
    const encodedReference = encodeURIComponent(paymentReference)
    const successUrl = `${origin}/payment/success?gateway=paypal&restaurant=${encodedRestaurant}&ref=${encodedReference}`
    const cancelUrl = `${origin}/payment/failed?gateway=paypal&restaurant=${encodedRestaurant}&ref=${encodedReference}&reason=cancelled`
    const paypalBaseUrl = getPayPalBaseUrl(credentials.test_mode !== false)
    const tokenResult = await fetchPayPalAccessToken({
      baseUrl: paypalBaseUrl,
      clientId: credentials.public_key,
      clientSecret: credentials.access_token,
    })

    if (!tokenResult.success) {
      await writeGatewayAuditLog({ serviceClient, restaurantId, gateway: 'paypal', action: 'create_checkout', status: 'failed', message: tokenResult.message })
      return jsonResponse({ success: false, message: tokenResult.message, details: tokenResult.details || {} }, 502)
    }

    const paypalPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: paymentReference.slice(0, 127),
          custom_id: String(order.id).slice(0, 127),
          invoice_id: String(order.order_code || order.public_order_number || paymentReference).slice(0, 127),
          description: `Spizy Menu order ${order.order_code || order.public_order_number || ''}`.slice(0, 127),
          amount: {
            currency_code: order.currency || restaurant.currency || 'AED',
            value: amountValue,
          },
        },
      ],
      application_context: {
        brand_name: String(credentials.merchant_label || restaurant.name || 'Restaurant').slice(0, 127),
        landing_page: 'BILLING',
        user_action: 'PAY_NOW',
        return_url: successUrl,
        cancel_url: cancelUrl,
      },
    }

    const createResponse = await fetch(`${paypalBaseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResult.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'PayPal-Request-Id': paymentReference,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(paypalPayload),
    })

    const createJson = await createResponse.json().catch(() => ({}))

    if (!createResponse.ok || !createJson?.id) {
      const failureMessage =
        createJson?.details?.[0]?.description ||
        createJson?.message ||
        createJson?.name ||
        'PayPal order creation failed. Check this restaurant’s PayPal credentials, currency and mode.'

      await serviceClient.from('restaurant_orders').update({
        payment_gateway: 'paypal',
        payment_method: 'online',
        payment_status: 'unpaid',
        online_payment_status: 'failed_to_create_checkout',
        payment_reference: paymentReference,
        payment_status_note: failureMessage,
        gateway_response: sanitizeGatewayResponse(createJson),
        updated_at: new Date().toISOString(),
      }).eq('id', order.id)

      await writeGatewayAuditLog({ serviceClient, restaurantId, gateway: 'paypal', action: 'create_checkout', status: 'failed', message: failureMessage, metadata: sanitizeGatewayResponse(createJson) })
      return jsonResponse({ success: false, message: failureMessage, details: sanitizeGatewayResponse(createJson) }, 502)
    }

    const approvalUrl = Array.isArray(createJson.links)
      ? createJson.links.find((link: any) => link?.rel === 'approve')?.href || ''
      : ''

    await serviceClient.from('restaurant_orders').update({
      payment_gateway: 'paypal',
      payment_method: 'online',
      payment_status: 'unpaid',
      online_payment_status: 'pending_approval',
      payment_reference: paymentReference,
      gateway_order_id: createJson.id,
      gateway_checkout_url: approvalUrl,
      payment_status_note: 'PayPal checkout order created with this restaurant-owned account. Waiting for customer approval and capture.',
      gateway_response: sanitizeGatewayResponse(createJson),
      updated_at: new Date().toISOString(),
    }).eq('id', order.id)

    await writeGatewayAuditLog({
      serviceClient,
      restaurantId,
      gateway: 'paypal',
      action: 'create_checkout',
      status: 'success',
      message: 'PayPal checkout order created using this restaurant-owned account.',
      metadata: { order_id: order.id, payment_reference: paymentReference, gateway_order_id: createJson.id, test_mode: credentials.test_mode !== false },
    })

    return jsonResponse({
      success: true,
      message: 'Redirecting to PayPal secure checkout.',
      gateway: 'paypal',
      payment_reference: paymentReference,
      gateway_order_id: createJson.id,
      paypal_order_id: createJson.id,
      approval_url: approvalUrl,
      redirect_url: approvalUrl,
      mode: credentials.test_mode === false ? 'live' : 'test',
    })
  } catch (error) {
    return jsonResponse({ success: false, message: error?.message || 'Unable to create PayPal checkout order.' }, 500)
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

function getPayPalBaseUrl(testMode = true) {
  return testMode ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
}

async function fetchPayPalAccessToken({ baseUrl, clientId, clientSecret }) {
  const formData = new URLSearchParams()
  formData.set('grant_type', 'client_credentials')

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: formData.toString(),
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok || !json?.access_token) {
    return {
      success: false,
      message: json?.error_description || json?.error || 'PayPal access token request failed. Check this restaurant’s Client ID, Client Secret and mode.',
      details: sanitizeGatewayResponse(json),
    }
  }

  return { success: true, access_token: json.access_token, expires_in: json.expires_in || '' }
}

async function writeGatewayAuditLog({ serviceClient, restaurantId, gateway, action, status, message, metadata = {} }) {
  try {
    await serviceClient.from('restaurant_gateway_audit_logs').insert({ restaurant_id: restaurantId, gateway, action, status, message, metadata })
  } catch {
    // Audit logging must not block checkout.
  }
}

function toMajorAmount(value) {
  return Number(value || 0).toFixed(2)
}

function normalizeOrigin(value = '') {
  const cleanValue = String(value || '').trim()
  if (!cleanValue) return ''
  try {
    const url = new URL(cleanValue)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return url.origin
  } catch {
    return ''
  }
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sanitizeGatewayResponse(value) {
  const incoming = normalizeObject(value)
  return {
    id: incoming.id || '',
    status: incoming.status || '',
    name: incoming.name || '',
    message: incoming.message || incoming.error_description || incoming.error || '',
    details: Array.isArray(incoming.details)
      ? incoming.details.slice(0, 3).map((item: any) => ({ issue: item?.issue || '', description: item?.description || '' }))
      : undefined,
  }
}

function cleanString(value: unknown) {
  return String(value || '').trim()
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
