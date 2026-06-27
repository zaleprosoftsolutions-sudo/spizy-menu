// Supabase Edge Function: phonepe-payment-webhook
// Handles PhonePe webhooks for restaurant-owned PhonePe credentials.
// PhonePe webhook auth uses Authorization: SHA256(username:password) as configured per restaurant.

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
      return jsonResponse({ success: false, message: 'Supabase service environment is missing.' }, 500)
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const authorizationHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
    const payload = await req.json().catch(() => ({}))
    const eventName = cleanString(payload.event || payload.type)
    const eventPayload = normalizeObject(payload.payload)
    const merchantOrderId = cleanString(eventPayload.merchantOrderId || eventPayload.originalMerchantOrderId)
    const gatewayOrderId = cleanString(eventPayload.orderId)
    const state = cleanString(eventPayload.state).toUpperCase()
    const paymentDetails = Array.isArray(eventPayload.paymentDetails) ? eventPayload.paymentDetails : []
    const transactionId = cleanString(paymentDetails[0]?.transactionId || '')

    if (!merchantOrderId && !gatewayOrderId) {
      await writeGatewayAuditLog({
        serviceClient,
        restaurantId: null,
        gateway: 'phonepe',
        action: 'webhook_missing_reference',
        status: 'ignored',
        message: 'PhonePe webhook missing merchantOrderId/orderId.',
        metadata: { event: eventName },
      })
      return jsonResponse({ success: true, ignored: true })
    }

    const { data: orders } = await serviceClient
      .from('restaurant_orders')
      .select('id, restaurant_id, payment_reference, gateway_order_id, payment_status, total_amount')
      .eq('payment_gateway', 'phonepe')
      .or(`payment_reference.eq.${merchantOrderId},gateway_order_id.eq.${gatewayOrderId},gateway_order_id.eq.${merchantOrderId}`)
      .limit(1)

    const order = Array.isArray(orders) ? orders[0] : null

    if (!order?.id) {
      return jsonResponse({ success: true, ignored: true, message: 'Order not found for PhonePe webhook.' })
    }

    const { data: credentials } = await serviceClient
      .from('restaurant_gateway_credentials')
      .select('id, metadata')
      .eq('restaurant_id', order.restaurant_id)
      .eq('gateway', 'phonepe')
      .maybeSingle()

    const metadata = normalizeObject(credentials?.metadata)
    const webhookUsername = cleanString(metadata.webhook_username)
    const webhookPassword = cleanString(metadata.webhook_password)

    if (webhookUsername && webhookPassword) {
      const expectedAuthorization = await sha256Text(`${webhookUsername}:${webhookPassword}`)

      if (authorizationHeader !== expectedAuthorization && authorizationHeader !== `SHA256 ${expectedAuthorization}`) {
        await writeGatewayAuditLog({
          serviceClient,
          restaurantId: order.restaurant_id,
          gateway: 'phonepe',
          action: 'webhook_signature_failed',
          status: 'failed',
          message: 'PhonePe webhook authorization did not match restaurant configured credentials.',
          metadata: { event: eventName, merchant_order_id: merchantOrderId, gateway_order_id: gatewayOrderId },
        })

        return jsonResponse({ success: false, message: 'Invalid PhonePe webhook authorization.' }, 401)
      }
    }

    const isCompleted = eventName === 'checkout.order.completed' || state === 'COMPLETED'
    const isFailed = eventName === 'checkout.order.failed' || ['FAILED', 'CANCELLED'].includes(state)

    const updatePayload: Record<string, unknown> = {
      gateway_order_id: gatewayOrderId || order.gateway_order_id || merchantOrderId,
      gateway_transaction_id: transactionId || null,
      payment_webhook_payload: payload,
      updated_at: new Date().toISOString(),
    }

    if (isCompleted) {
      updatePayload.payment_status = 'paid'
      updatePayload.online_payment_status = 'paid'
      updatePayload.payment_paid_at = new Date().toISOString()
    } else if (isFailed) {
      updatePayload.payment_status = 'unpaid'
      updatePayload.online_payment_status = 'failed'
      updatePayload.payment_failed_at = new Date().toISOString()
    } else {
      updatePayload.online_payment_status = state.toLowerCase() || 'pending'
    }

    await serviceClient.from('restaurant_orders').update(updatePayload).eq('id', order.id)

    await writeGatewayAuditLog({
      serviceClient,
      restaurantId: order.restaurant_id,
      gateway: 'phonepe',
      action: 'webhook_received',
      status: isCompleted ? 'paid' : isFailed ? 'failed' : 'pending',
      message: `PhonePe webhook received: ${eventName || state || 'unknown'}`,
      metadata: {
        order_id: order.id,
        merchant_order_id: merchantOrderId,
        gateway_order_id: gatewayOrderId,
        transaction_id: transactionId,
        state,
      },
    })

    return jsonResponse({ success: true, status: updatePayload.online_payment_status || 'received' })
  } catch (error) {
    return jsonResponse({ success: false, message: error?.message || 'PhonePe webhook failed.' }, 500)
  }
})

async function sha256Text(text) {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function writeGatewayAuditLog({ serviceClient, restaurantId, gateway, action, status, message, metadata = {} }) {
  try {
    if (!restaurantId) return
    await serviceClient.from('restaurant_gateway_audit_logs').insert({
      restaurant_id: restaurantId,
      gateway,
      action,
      status,
      message,
      metadata,
    })
  } catch {
    // Audit logging must not block webhook response.
  }
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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
