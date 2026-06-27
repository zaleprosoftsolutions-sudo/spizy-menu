// Supabase Edge Function: razorpay-payment-webhook
// Handles Razorpay webhooks for restaurant-owned Razorpay accounts.
// Verification uses that restaurant's own webhook secret when configured.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-razorpay-signature',
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

    const rawBody = await req.text()
    const signature = req.headers.get('x-razorpay-signature') || ''
    const payload = JSON.parse(rawBody || '{}')
    const eventName = cleanString(payload.event)
    const paymentLink = normalizeObject(payload?.payload?.payment_link?.entity)
    const payment = normalizeObject(payload?.payload?.payment?.entity)
    const gatewayOrderId = cleanString(paymentLink.id || payment.order_id || paymentLink.order_id)
    const paymentReference = cleanString(paymentLink.reference_id || payment.notes?.payment_reference || paymentLink.notes?.payment_reference)
    const gatewayTransactionId = cleanString(payment.id)

    const order = await findOrderForWebhook({
      serviceClient,
      gatewayOrderId,
      paymentReference,
      gatewayTransactionId,
    })

    if (!order?.id) {
      await writeGatewayAuditLog({
        serviceClient,
        restaurantId: null,
        gateway: 'razorpay',
        action: 'webhook_unmatched',
        status: 'ignored',
        message: 'Razorpay webhook received but no matching order was found.',
        metadata: {
          event: eventName,
          gateway_order_id: gatewayOrderId,
          payment_reference: paymentReference,
          gateway_transaction_id: gatewayTransactionId,
        },
      })

      return jsonResponse({ success: true, message: 'Webhook ignored. Order not found.' })
    }

    const { data: credentials } = await serviceClient
      .from('restaurant_gateway_credentials')
      .select('id, webhook_secret')
      .eq('restaurant_id', order.restaurant_id)
      .eq('gateway', 'razorpay')
      .maybeSingle()

    if (credentials?.webhook_secret) {
      const verified = await verifyRazorpaySignature({
        rawBody,
        signature,
        webhookSecret: credentials.webhook_secret,
      })

      if (!verified) {
        await writeGatewayAuditLog({
          serviceClient,
          restaurantId: order.restaurant_id,
          gateway: 'razorpay',
          action: 'webhook_signature_failed',
          status: 'failed',
          message: 'Razorpay webhook signature verification failed.',
          metadata: { order_id: order.id, event: eventName },
        })

        return jsonResponse({ success: false, message: 'Invalid Razorpay webhook signature.' }, 401)
      }
    } else {
      await writeGatewayAuditLog({
        serviceClient,
        restaurantId: order.restaurant_id,
        gateway: 'razorpay',
        action: 'webhook_signature_skipped',
        status: 'warning',
        message: 'Razorpay webhook secret is not configured for this restaurant. Configure it before production.',
        metadata: { order_id: order.id, event: eventName },
      })
    }

    const nextPaymentState = getNextPaymentState({ eventName, paymentLink, payment })

    const updatePayload: Record<string, unknown> = {
      payment_gateway: 'razorpay',
      payment_method: 'online',
      online_payment_status: nextPaymentState.onlinePaymentStatus,
      payment_webhook_payload: payload,
      gateway_transaction_id: gatewayTransactionId || order.gateway_transaction_id || null,
      updated_at: new Date().toISOString(),
    }

    if (gatewayOrderId && !order.gateway_order_id) updatePayload.gateway_order_id = gatewayOrderId
    if (paymentReference && !order.payment_reference) updatePayload.payment_reference = paymentReference

    if (nextPaymentState.isPaid) {
      updatePayload.payment_status = 'paid'
      updatePayload.payment_paid_at = new Date().toISOString()
    }

    if (nextPaymentState.isFailed) {
      updatePayload.payment_status = 'unpaid'
      updatePayload.payment_failed_at = new Date().toISOString()
    }

    await serviceClient
      .from('restaurant_orders')
      .update(updatePayload)
      .eq('id', order.id)

    await writeGatewayAuditLog({
      serviceClient,
      restaurantId: order.restaurant_id,
      gateway: 'razorpay',
      action: 'webhook_update',
      status: nextPaymentState.auditStatus,
      message: nextPaymentState.message,
      metadata: {
        order_id: order.id,
        event: eventName,
        gateway_order_id: gatewayOrderId,
        payment_reference: paymentReference,
        gateway_transaction_id: gatewayTransactionId,
      },
    })

    return jsonResponse({
      success: true,
      message: nextPaymentState.message,
      order_id: order.id,
      payment_status: nextPaymentState.onlinePaymentStatus,
    })
  } catch (error) {
    return jsonResponse(
      { success: false, message: error?.message || 'Unable to process Razorpay webhook.' },
      500,
    )
  }
})

async function findOrderForWebhook({
  serviceClient,
  gatewayOrderId,
  paymentReference,
  gatewayTransactionId,
}) {
  let query = serviceClient
    .from('restaurant_orders')
    .select('*')
    .eq('payment_gateway', 'razorpay')

  if (gatewayOrderId) query = query.eq('gateway_order_id', gatewayOrderId)
  else if (paymentReference) query = query.eq('payment_reference', paymentReference)
  else if (gatewayTransactionId) query = query.eq('gateway_transaction_id', gatewayTransactionId)
  else return null

  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (error) throw new Error(error.message)
  return data || null
}

function getNextPaymentState({ eventName, paymentLink, payment }) {
  const event = String(eventName || '').toLowerCase()
  const linkStatus = String(paymentLink.status || '').toLowerCase()
  const paymentStatus = String(payment.status || '').toLowerCase()

  if (
    event === 'payment_link.paid' ||
    event === 'payment.captured' ||
    linkStatus === 'paid' ||
    paymentStatus === 'captured'
  ) {
    return {
      isPaid: true,
      isFailed: false,
      onlinePaymentStatus: 'paid',
      auditStatus: 'success',
      message: 'Razorpay payment confirmed. Order marked paid.',
    }
  }

  if (
    event === 'payment.failed' ||
    event === 'payment_link.cancelled' ||
    event === 'payment_link.expired' ||
    ['cancelled', 'expired', 'failed'].includes(linkStatus) ||
    paymentStatus === 'failed'
  ) {
    return {
      isPaid: false,
      isFailed: true,
      onlinePaymentStatus: linkStatus || paymentStatus || 'failed',
      auditStatus: 'failed',
      message: 'Razorpay payment failed/cancelled/expired. Order remains unpaid.',
    }
  }

  return {
    isPaid: false,
    isFailed: false,
    onlinePaymentStatus: linkStatus || paymentStatus || 'pending',
    auditStatus: 'pending',
    message: 'Razorpay webhook received. Payment remains pending.',
  }
}

async function verifyRazorpaySignature({ rawBody, signature, webhookSecret }) {
  if (!signature || !webhookSecret) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
  const expectedSignature = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return timingSafeEqual(expectedSignature, signature)
}

function timingSafeEqual(a = '', b = '') {
  const first = String(a || '')
  const second = String(b || '')

  if (first.length !== second.length) return false

  let result = 0
  for (let index = 0; index < first.length; index += 1) {
    result |= first.charCodeAt(index) ^ second.charCodeAt(index)
  }

  return result === 0
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
    // Audit logging must not block webhook processing.
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
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}
