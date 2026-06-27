// Supabase Edge Function: network-payment-webhook
// Receives Network International / N-Genius webhook events and updates Spizy orders.
// Webhook payload shapes can vary by merchant setup; this function stores the event and updates matched orders safely.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ngenius-signature, x-network-signature',
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
    const rawBody = await req.text()
    const payload = safeJsonParse(rawBody)

    const gatewayOrderId = extractGatewayOrderId(payload)
    const paymentReference = extractPaymentReference(payload)
    const eventId = extractEventId(payload) || `${gatewayOrderId || paymentReference || 'network'}_${Date.now()}`
    const eventType = cleanString(payload?.eventType || payload?.event_type || payload?.event || payload?.type || payload?.state || payload?.status || 'network_webhook')
    const status = normalizeNetworkPaymentStatus(payload)

    let order = null
    if (gatewayOrderId || paymentReference) {
      const { data } = await serviceClient
        .from('restaurant_orders')
        .select('*')
        .eq('payment_gateway', 'network')
        .or(`gateway_order_id.eq.${gatewayOrderId || '__none__'},payment_reference.eq.${paymentReference || '__none__'}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      order = data || null
    }

    await serviceClient.from('restaurant_payment_webhook_events').upsert({
      restaurant_id: order?.restaurant_id || null,
      gateway: 'network',
      event_id: eventId,
      event_type: eventType,
      order_id: order?.id || null,
      payment_reference: paymentReference || order?.payment_reference || null,
      gateway_order_id: gatewayOrderId || order?.gateway_order_id || null,
      payload,
      status: order ? 'matched' : 'unmatched',
      message: order ? `Network / N-Genius webhook matched order as ${status}.` : 'Network / N-Genius webhook received but no order matched yet.',
    }, { onConflict: 'gateway,event_id' })

    if (!order) {
      return jsonResponse({ success: true, received: true, matched: false })
    }

    const patch: Record<string, unknown> = {
      online_payment_status: status,
      gateway_response: payload,
      updated_at: new Date().toISOString(),
      payment_status_note: `Network / N-Genius webhook received: ${status}.`,
    }

    if (status === 'paid') {
      patch.payment_status = 'paid'
      patch.payment_method = 'online'
      patch.paid_at = new Date().toISOString()
    } else if (status === 'failed' || status === 'cancelled') {
      patch.payment_status = 'unpaid'
      patch.payment_failed_at = new Date().toISOString()
    } else if (status === 'refunded') {
      patch.payment_status = 'refunded'
    }

    const transactionId = extractTransactionId(payload)
    if (transactionId) patch.gateway_transaction_id = transactionId

    await serviceClient.from('restaurant_orders').update(patch).eq('id', order.id)

    await writeGatewayAuditLog({
      serviceClient,
      restaurantId: order.restaurant_id,
      gateway: 'network',
      action: 'webhook',
      status: 'success',
      message: `Network / N-Genius webhook updated order as ${status}.`,
      metadata: { event_id: eventId, event_type: eventType, order_id: order.id, gateway_order_id: gatewayOrderId },
    })

    return jsonResponse({ success: true, received: true, matched: true, order_id: order.id, payment_status: status })
  } catch (error) {
    return jsonResponse({ success: false, message: error?.message || 'Unable to process Network / N-Genius webhook.' }, 500)
  }
})

function normalizeNetworkPaymentStatus(payload) {
  const text = JSON.stringify(payload || {}).toLowerCase()
  const status = cleanString(payload?.status || payload?.state || payload?.event || payload?.eventType || payload?.event_type).toLowerCase()

  if (['captured', 'purchased', 'purchase', 'sale', 'paid', 'success', 'succeeded', 'authorised', 'authorized'].some((word) => status.includes(word) || text.includes(`"${word}"`))) return 'paid'
  if (['refunded', 'refund'].some((word) => status.includes(word) || text.includes(`"${word}"`))) return 'refunded'
  if (['failed', 'declined', 'rejected'].some((word) => status.includes(word) || text.includes(`"${word}"`))) return 'failed'
  if (['cancelled', 'canceled', 'void'].some((word) => status.includes(word) || text.includes(`"${word}"`))) return 'cancelled'
  return 'pending'
}

function extractGatewayOrderId(payload) {
  return cleanString(
    payload?.order?.reference ||
    payload?.orderReference ||
    payload?.order_ref ||
    payload?.reference ||
    payload?.ngenius_order_reference ||
    payload?.data?.order?.reference ||
    payload?.payload?.order?.reference ||
    '',
  )
}

function extractPaymentReference(payload) {
  return cleanString(
    payload?.merchantOrderReference ||
    payload?.merchant_order_reference ||
    payload?.payment_reference ||
    payload?.data?.merchantOrderReference ||
    payload?.order?.merchantOrderReference ||
    '',
  )
}

function extractTransactionId(payload) {
  return cleanString(
    payload?.transaction?.reference ||
    payload?.transactionReference ||
    payload?.transaction_id ||
    payload?.paymentId ||
    payload?.data?.transaction?.reference ||
    '',
  )
}

function extractEventId(payload) {
  return cleanString(payload?.id || payload?.eventId || payload?.event_id || payload?.data?.id || '')
}

async function writeGatewayAuditLog({ serviceClient, restaurantId, gateway, action, status, message, metadata = {} }) {
  try {
    await serviceClient.from('restaurant_gateway_audit_logs').insert({ restaurant_id: restaurantId, gateway, action, status, message, metadata })
  } catch {
    // Audit logging must not block webhook processing.
  }
}

function safeJsonParse(value) {
  try { return JSON.parse(value || '{}') } catch { return {} }
}

function cleanString(value) { return String(value || '').trim() }

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
