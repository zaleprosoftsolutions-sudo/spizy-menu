// Supabase Edge Function: capture-paypal-checkout-order
// Captures an approved PayPal order using the restaurant's OWN PayPal credentials.

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
    if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ success: false, message: 'Supabase function environment is missing.' }, 500)

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const body = await req.json().catch(() => ({}))
    const restaurantSlug = cleanString(body.restaurant_slug)
    const orderReference = cleanString(body.order_reference)
    const paypalOrderId = cleanString(body.paypal_order_id)
    const customerSessionId = cleanString(body.customer_session_id)

    let restaurantId = cleanString(body.restaurant_id)
    if (!restaurantId && restaurantSlug) {
      const { data: restaurant } = await serviceClient.from('restaurants').select('id').eq('slug', restaurantSlug).maybeSingle()
      restaurantId = restaurant?.id || ''
    }

    if (!restaurantId) return jsonResponse({ success: false, message: 'Restaurant reference is required for PayPal capture.' }, 400)

    const order = await findOrder({ serviceClient, restaurantId, orderReference, paypalOrderId, customerSessionId })
    if (!order) return jsonResponse({ success: false, message: 'Order not found for PayPal capture.' }, 404)

    if (String(order.payment_status || '').toLowerCase() === 'paid') {
      return jsonResponse({ success: true, message: 'PayPal payment is already marked paid.', order_id: order.id })
    }

    const { data: credentials, error: credentialError } = await serviceClient
      .from('restaurant_gateway_credentials')
      .select('id, public_key, access_token, webhook_secret, test_mode, is_enabled')
      .eq('restaurant_id', restaurantId)
      .eq('gateway', 'paypal')
      .maybeSingle()

    if (credentialError) return jsonResponse({ success: false, message: credentialError.message }, 500)
    if (!credentials?.is_enabled || !credentials?.access_token || !credentials?.public_key) {
      return jsonResponse({ success: false, message: 'This restaurant PayPal credential is not connected.' }, 400)
    }

    const gatewayOrderId = paypalOrderId || order.gateway_order_id
    if (!gatewayOrderId) return jsonResponse({ success: false, message: 'PayPal order ID is missing.' }, 400)

    const paypalBaseUrl = getPayPalBaseUrl(credentials.test_mode !== false)
    const tokenResult = await fetchPayPalAccessToken({ baseUrl: paypalBaseUrl, clientId: credentials.public_key, clientSecret: credentials.access_token })
    if (!tokenResult.success) return jsonResponse({ success: false, message: tokenResult.message }, 502)

    const captureResponse = await fetch(`${paypalBaseUrl}/v2/checkout/orders/${encodeURIComponent(gatewayOrderId)}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResult.access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'PayPal-Request-Id': `capture_${order.id}`,
        Prefer: 'return=representation',
      },
      body: '{}',
    })

    const captureJson = await captureResponse.json().catch(() => ({}))
    const captureStatus = String(captureJson?.status || '').toUpperCase()
    const capture = captureJson?.purchase_units?.[0]?.payments?.captures?.[0]
    const captureId = capture?.id || captureJson?.id || ''
    const captureFinalStatus = String(capture?.status || captureStatus || '').toUpperCase()

    if (!captureResponse.ok && captureJson?.details?.[0]?.issue !== 'ORDER_ALREADY_CAPTURED') {
      const failureMessage = captureJson?.details?.[0]?.description || captureJson?.message || captureJson?.name || 'PayPal capture failed.'
      await serviceClient.from('restaurant_orders').update({
        payment_gateway: 'paypal',
        payment_method: 'online',
        payment_status: 'unpaid',
        online_payment_status: 'capture_failed',
        payment_status_note: failureMessage,
        gateway_response: sanitizeGatewayResponse(captureJson),
        updated_at: new Date().toISOString(),
      }).eq('id', order.id)
      await writeGatewayAuditLog({ serviceClient, restaurantId, gateway: 'paypal', action: 'capture', status: 'failed', message: failureMessage, metadata: sanitizeGatewayResponse(captureJson) })
      return jsonResponse({ success: false, message: failureMessage, details: sanitizeGatewayResponse(captureJson) }, 502)
    }

    if (captureFinalStatus === 'COMPLETED' || captureStatus === 'COMPLETED' || captureJson?.details?.[0]?.issue === 'ORDER_ALREADY_CAPTURED') {
      await serviceClient.from('restaurant_orders').update({
        payment_gateway: 'paypal',
        payment_method: 'online',
        payment_status: 'paid',
        online_payment_status: 'paid',
        gateway_order_id: gatewayOrderId,
        gateway_transaction_id: captureId || order.gateway_transaction_id,
        paid_at: order.paid_at || new Date().toISOString(),
        payment_status_note: 'PayPal payment captured using this restaurant-owned account.',
        gateway_response: sanitizeGatewayResponse(captureJson),
        updated_at: new Date().toISOString(),
      }).eq('id', order.id)

      await writeGatewayAuditLog({ serviceClient, restaurantId, gateway: 'paypal', action: 'capture', status: 'success', message: 'PayPal order captured successfully.', metadata: { order_id: order.id, gateway_order_id: gatewayOrderId, capture_id: captureId } })
      return jsonResponse({ success: true, message: 'PayPal payment captured successfully.', payment_status: 'paid', gateway_transaction_id: captureId })
    }

    await serviceClient.from('restaurant_orders').update({
      payment_gateway: 'paypal',
      payment_method: 'online',
      payment_status: 'unpaid',
      online_payment_status: String(captureFinalStatus || captureStatus || 'pending').toLowerCase(),
      gateway_order_id: gatewayOrderId,
      gateway_response: sanitizeGatewayResponse(captureJson),
      payment_status_note: 'PayPal payment is not completed yet. Refresh after PayPal confirms payment.',
      updated_at: new Date().toISOString(),
    }).eq('id', order.id)

    return jsonResponse({ success: false, message: 'PayPal payment is not completed yet.', payment_status: captureFinalStatus || captureStatus || 'pending' })
  } catch (error) {
    return jsonResponse({ success: false, message: error?.message || 'Unable to capture PayPal payment.' }, 500)
  }
})

async function findOrder({ serviceClient, restaurantId, orderReference, paypalOrderId, customerSessionId }) {
  let query = serviceClient.from('restaurant_orders').select('*').eq('restaurant_id', restaurantId)

  if (orderReference && paypalOrderId) query = query.or(`payment_reference.eq.${orderReference},gateway_order_id.eq.${orderReference},gateway_order_id.eq.${paypalOrderId},order_code.eq.${orderReference},public_order_number.eq.${orderReference}`)
  else if (orderReference) query = query.or(`payment_reference.eq.${orderReference},gateway_order_id.eq.${orderReference},order_code.eq.${orderReference},public_order_number.eq.${orderReference}`)
  else if (paypalOrderId) query = query.eq('gateway_order_id', paypalOrderId)
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
    headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: formData.toString(),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok || !json?.access_token) return { success: false, message: json?.error_description || json?.error || 'PayPal access token request failed.' }
  return { success: true, access_token: json.access_token }
}

async function writeGatewayAuditLog({ serviceClient, restaurantId, gateway, action, status, message, metadata = {} }) {
  try { await serviceClient.from('restaurant_gateway_audit_logs').insert({ restaurant_id: restaurantId, gateway, action, status, message, metadata }) } catch {}
}

function sanitizeGatewayResponse(value) {
  const incoming = value && typeof value === 'object' ? value : {}
  return { id: incoming.id || '', status: incoming.status || '', name: incoming.name || '', message: incoming.message || incoming.error_description || incoming.error || '', details: Array.isArray(incoming.details) ? incoming.details.slice(0, 3).map((item: any) => ({ issue: item?.issue || '', description: item?.description || '' })) : undefined }
}

function cleanString(value: unknown) { return String(value || '').trim() }
function jsonResponse(payload: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
