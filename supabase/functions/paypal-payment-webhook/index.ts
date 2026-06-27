// Supabase Edge Function: paypal-payment-webhook
// Receives PayPal webhook events for restaurant-owned PayPal accounts.
// Store the restaurant's PayPal Webhook ID in the webhook secret field for signature verification.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, paypal-auth-algo, paypal-cert-url, paypal-transmission-id, paypal-transmission-sig, paypal-transmission-time',
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
    const rawPayload = await req.text()
    const payload = JSON.parse(rawPayload || '{}')
    const eventId = cleanString(payload.id)
    const eventType = cleanString(payload.event_type)
    const resource = payload.resource || {}
    const relatedIds = resource.supplementary_data?.related_ids || {}
    const gatewayOrderId = cleanString(relatedIds.order_id || resource.id || '')
    const captureId = cleanString(resource.id || '')
    const paymentReference = cleanString(resource.invoice_id || resource.custom_id || resource.purchase_units?.[0]?.reference_id || '')

    const order = await findOrderForWebhook({ serviceClient, gatewayOrderId, paymentReference })
    const restaurantId = order?.restaurant_id || null

    let verificationStatus = 'not_verified'
    let credentials = null

    if (restaurantId) {
      const { data } = await serviceClient
        .from('restaurant_gateway_credentials')
        .select('id, public_key, access_token, webhook_secret, test_mode, is_enabled')
        .eq('restaurant_id', restaurantId)
        .eq('gateway', 'paypal')
        .maybeSingle()
      credentials = data

      if (credentials?.webhook_secret && credentials?.public_key && credentials?.access_token) {
        verificationStatus = await verifyPayPalWebhook({ req, payload, credentials })
      } else {
        verificationStatus = 'webhook_id_not_configured'
      }
    }

    await serviceClient.from('restaurant_payment_webhook_events').upsert({
      restaurant_id: restaurantId,
      gateway: 'paypal',
      event_id: eventId || null,
      event_type: eventType || null,
      order_id: order?.id || null,
      payment_reference: paymentReference || order?.payment_reference || null,
      gateway_order_id: gatewayOrderId || order?.gateway_order_id || null,
      payload,
      status: verificationStatus === 'SUCCESS' || verificationStatus === 'webhook_id_not_configured' ? 'received' : 'verification_warning',
      message: `PayPal webhook ${eventType || 'event'} received. Verification: ${verificationStatus}`,
    }, { onConflict: 'gateway,event_id' })

    if (!order) {
      return jsonResponse({ success: true, message: 'PayPal webhook received, but no matching order was found yet.' })
    }

    const update: Record<string, unknown> = {
      payment_gateway: 'paypal',
      payment_method: 'online',
      gateway_order_id: gatewayOrderId || order.gateway_order_id,
      gateway_response: sanitizeGatewayResponse(payload),
      updated_at: new Date().toISOString(),
    }

    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      update.payment_status = 'paid'
      update.online_payment_status = 'paid'
      update.gateway_transaction_id = captureId || order.gateway_transaction_id
      update.paid_at = order.paid_at || new Date().toISOString()
      update.payment_status_note = 'PayPal webhook confirmed payment capture completed.'
    } else if (['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED'].includes(eventType)) {
      update.payment_status = 'unpaid'
      update.online_payment_status = 'failed'
      update.payment_failed_at = new Date().toISOString()
      update.payment_status_note = 'PayPal webhook reported payment capture failed/denied.'
    } else if (eventType === 'PAYMENT.CAPTURE.REFUNDED') {
      update.payment_status = 'refunded'
      update.online_payment_status = 'refunded'
      update.payment_status_note = 'PayPal webhook reported payment refunded.'
    } else if (eventType === 'CHECKOUT.ORDER.APPROVED') {
      update.payment_status = order.payment_status || 'unpaid'
      update.online_payment_status = 'approved_pending_capture'
      update.payment_status_note = 'PayPal order approved. Waiting for capture confirmation.'
    } else {
      update.online_payment_status = order.online_payment_status || 'webhook_received'
      update.payment_status_note = `PayPal webhook received: ${eventType || 'event'}.`
    }

    await serviceClient.from('restaurant_orders').update(update).eq('id', order.id)
    await writeGatewayAuditLog({ serviceClient, restaurantId: order.restaurant_id, gateway: 'paypal', action: 'webhook', status: 'success', message: `PayPal webhook processed: ${eventType || 'event'}.`, metadata: { event_id: eventId, gateway_order_id: gatewayOrderId, verification_status: verificationStatus } })

    return jsonResponse({ success: true, message: 'PayPal webhook processed.' })
  } catch (error) {
    return jsonResponse({ success: false, message: error?.message || 'Unable to process PayPal webhook.' }, 500)
  }
})

async function findOrderForWebhook({ serviceClient, gatewayOrderId, paymentReference }) {
  let query = serviceClient.from('restaurant_orders').select('*').eq('payment_gateway', 'paypal')
  if (gatewayOrderId && paymentReference) query = query.or(`gateway_order_id.eq.${gatewayOrderId},payment_reference.eq.${paymentReference},order_code.eq.${paymentReference},public_order_number.eq.${paymentReference}`)
  else if (gatewayOrderId) query = query.eq('gateway_order_id', gatewayOrderId)
  else if (paymentReference) query = query.or(`payment_reference.eq.${paymentReference},order_code.eq.${paymentReference},public_order_number.eq.${paymentReference}`)
  else return null
  const { data } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data || null
}

async function verifyPayPalWebhook({ req, payload, credentials }) {
  try {
    const baseUrl = getPayPalBaseUrl(credentials.test_mode !== false)
    const tokenResult = await fetchPayPalAccessToken({ baseUrl, clientId: credentials.public_key, clientSecret: credentials.access_token })
    if (!tokenResult.success) return 'token_failed'

    const verifyPayload = {
      auth_algo: req.headers.get('paypal-auth-algo') || '',
      cert_url: req.headers.get('paypal-cert-url') || '',
      transmission_id: req.headers.get('paypal-transmission-id') || '',
      transmission_sig: req.headers.get('paypal-transmission-sig') || '',
      transmission_time: req.headers.get('paypal-transmission-time') || '',
      webhook_id: credentials.webhook_secret,
      webhook_event: payload,
    }

    const response = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenResult.access_token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(verifyPayload),
    })
    const json = await response.json().catch(() => ({}))
    return json?.verification_status || (response.ok ? 'UNKNOWN' : 'FAILED')
  } catch {
    return 'verification_error'
  }
}

function getPayPalBaseUrl(testMode = true) { return testMode ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com' }
async function fetchPayPalAccessToken({ baseUrl, clientId, clientSecret }) {
  const formData = new URLSearchParams(); formData.set('grant_type', 'client_credentials')
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: formData.toString() })
  const json = await response.json().catch(() => ({}))
  if (!response.ok || !json?.access_token) return { success: false, message: json?.error_description || json?.error || 'PayPal token failed.' }
  return { success: true, access_token: json.access_token }
}
async function writeGatewayAuditLog({ serviceClient, restaurantId, gateway, action, status, message, metadata = {} }) { try { await serviceClient.from('restaurant_gateway_audit_logs').insert({ restaurant_id: restaurantId, gateway, action, status, message, metadata }) } catch {} }
function sanitizeGatewayResponse(value) { const incoming = value && typeof value === 'object' ? value : {}; return { id: incoming.id || '', event_type: incoming.event_type || '', resource_type: incoming.resource_type || '', summary: incoming.summary || '', status: incoming.resource?.status || incoming.status || '' } }
function cleanString(value: unknown) { return String(value || '').trim() }
function jsonResponse(payload: Record<string, unknown>, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }
