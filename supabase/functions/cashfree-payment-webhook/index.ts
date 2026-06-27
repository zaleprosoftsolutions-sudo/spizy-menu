
// Supabase Edge Function: cashfree-payment-webhook
// Handles Cashfree webhooks for restaurant-owned Cashfree accounts.
// Verification uses that restaurant's own Cashfree client secret when available.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature, x-webhook-timestamp, x-idempotency-header',
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
    const signature = req.headers.get('x-webhook-signature') || ''
    const timestamp = req.headers.get('x-webhook-timestamp') || ''
    const idempotencyHeader = req.headers.get('x-idempotency-header') || ''
    const payload = JSON.parse(rawBody || '{}')
    const data = normalizeObject(payload.data)
    const eventName = cleanString(payload.type || payload.event || data.type)
    const paymentLink = normalizeObject(data.payment_link || data.link || data)
    const orderData = normalizeObject(data.order || data.order_details)
    const paymentData = normalizeObject(data.payment || data.payment_details)
    const gatewayOrderId = cleanString(paymentLink.link_id || data.link_id || orderData.order_id || data.order_id)
    const paymentReference = cleanString(
      paymentLink.link_notes?.payment_reference ||
        data.link_notes?.payment_reference ||
        data.payment_reference ||
        gatewayOrderId,
    )
    const gatewayTransactionId = cleanString(paymentData.cf_payment_id || data.cf_payment_id || data.payment_id)

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
        gateway: 'cashfree',
        action: 'webhook_unmatched',
        status: 'ignored',
        message: 'Cashfree webhook received but no matching order was found.',
        metadata: {
          event: eventName,
          gateway_order_id: gatewayOrderId,
          payment_reference: paymentReference,
          gateway_transaction_id: gatewayTransactionId,
          idempotency_header: idempotencyHeader,
        },
      })

      return jsonResponse({ success: true, message: 'Webhook ignored. Order not found.' })
    }

    const { data: credentials } = await serviceClient
      .from('restaurant_gateway_credentials')
      .select('id, access_token, webhook_secret')
      .eq('restaurant_id', order.restaurant_id)
      .eq('gateway', 'cashfree')
      .maybeSingle()

    const signatureSecret = credentials?.webhook_secret || credentials?.access_token || ''

    if (signatureSecret) {
      const verified = await verifyCashfreeSignature({
        rawBody,
        signature,
        timestamp,
        secret: signatureSecret,
      })

      if (!verified) {
        await writeGatewayAuditLog({
          serviceClient,
          restaurantId: order.restaurant_id,
          gateway: 'cashfree',
          action: 'webhook_signature_failed',
          status: 'failed',
          message: 'Cashfree webhook signature verification failed.',
          metadata: { order_id: order.id, event: eventName, idempotency_header: idempotencyHeader },
        })

        return jsonResponse({ success: false, message: 'Invalid Cashfree webhook signature.' }, 401)
      }
    } else {
      await writeGatewayAuditLog({
        serviceClient,
        restaurantId: order.restaurant_id,
        gateway: 'cashfree',
        action: 'webhook_signature_skipped',
        status: 'warning',
        message: 'Cashfree webhook secret/client secret is not configured for this restaurant. Configure it before production.',
        metadata: { order_id: order.id, event: eventName },
      })
    }

    const nextPaymentState = getNextPaymentState({ eventName, paymentLink, paymentData, data })

    const updatePayload: Record<string, unknown> = {
      payment_gateway: 'cashfree',
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
      gateway: 'cashfree',
      action: 'webhook_update',
      status: nextPaymentState.auditStatus,
      message: nextPaymentState.message,
      metadata: {
        order_id: order.id,
        event: eventName,
        gateway_order_id: gatewayOrderId,
        payment_reference: paymentReference,
        gateway_transaction_id: gatewayTransactionId,
        idempotency_header: idempotencyHeader,
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
      { success: false, message: error?.message || 'Unable to process Cashfree webhook.' },
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
    .eq('payment_gateway', 'cashfree')

  if (gatewayOrderId) query = query.eq('gateway_order_id', gatewayOrderId)
  else if (paymentReference) query = query.eq('payment_reference', paymentReference)
  else if (gatewayTransactionId) query = query.eq('gateway_transaction_id', gatewayTransactionId)
  else return null

  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (error) throw new Error(error.message)
  return data || null
}

function getNextPaymentState({ eventName, paymentLink, paymentData, data }) {
  const event = String(eventName || '').toLowerCase()
  const linkStatus = String(paymentLink.link_status || paymentLink.status || data.link_status || '').toLowerCase()
  const paymentStatus = String(paymentData.payment_status || paymentData.status || data.payment_status || '').toLowerCase()

  if (
    event.includes('success') ||
    event.includes('paid') ||
    ['paid', 'partially_paid', 'success', 'captured'].includes(linkStatus) ||
    ['success', 'paid', 'captured'].includes(paymentStatus)
  ) {
    return {
      isPaid: true,
      isFailed: false,
      onlinePaymentStatus: 'paid',
      auditStatus: 'success',
      message: 'Cashfree payment confirmed. Order marked paid.',
    }
  }

  if (
    event.includes('failed') ||
    event.includes('expired') ||
    event.includes('cancelled') ||
    ['cancelled', 'expired', 'failed'].includes(linkStatus) ||
    ['failed', 'cancelled', 'expired'].includes(paymentStatus)
  ) {
    return {
      isPaid: false,
      isFailed: true,
      onlinePaymentStatus: linkStatus || paymentStatus || 'failed',
      auditStatus: 'failed',
      message: 'Cashfree payment failed/cancelled/expired. Order remains unpaid.',
    }
  }

  return {
    isPaid: false,
    isFailed: false,
    onlinePaymentStatus: linkStatus || paymentStatus || 'pending',
    auditStatus: 'pending',
    message: 'Cashfree webhook received. Payment remains pending.',
  }
}

async function verifyCashfreeSignature({ rawBody, signature, timestamp, secret }) {
  if (!signature || !timestamp || !secret) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signedPayload = `${timestamp}${rawBody}`
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload))
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(digest)))

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
