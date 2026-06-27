// Supabase Edge Function: record-payment-refund
// Records a restaurant-side refund/payment adjustment in Spizy.
// This foundation does NOT automatically call gateway refund APIs yet.
// Restaurants must process the actual money movement in their own gateway dashboard.

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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse(
        { success: false, message: 'Supabase function environment is missing.' },
        500,
      )
    }

    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: userData, error: userError } = await userClient.auth.getUser()
    const user = userData?.user

    if (userError || !user?.id) {
      return jsonResponse({ success: false, message: 'Login is required.' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const orderId = cleanString(body.order_id)
    const refundAmount = roundMoney(Number(body.refund_amount || 0))
    const reason = cleanString(body.reason)
    const mode = cleanString(body.mode) || 'manual_record'

    if (!orderId) {
      return jsonResponse({ success: false, message: 'Order ID is required.' }, 400)
    }

    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return jsonResponse({ success: false, message: 'Valid refund amount is required.' }, 400)
    }

    if (!['manual_record', 'gateway_pending'].includes(mode)) {
      return jsonResponse({ success: false, message: 'Unsupported refund mode.' }, 400)
    }

    const { data: order, error: orderError } = await serviceClient
      .from('restaurant_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle()

    if (orderError || !order?.id) {
      return jsonResponse(
        { success: false, message: orderError?.message || 'Order not found.' },
        404,
      )
    }

    const restaurantId = cleanString(order.restaurant_id)

    if (!restaurantId) {
      return jsonResponse({ success: false, message: 'Order restaurant is missing.' }, 400)
    }

    const hasAccess = await userCanManageRestaurant({
      serviceClient,
      restaurantId,
      userId: user.id,
    })

    if (!hasAccess) {
      return jsonResponse(
        { success: false, message: 'You do not have permission to record refunds for this restaurant.' },
        403,
      )
    }

    if (String(order.payment_status || '').toLowerCase() !== 'paid') {
      return jsonResponse(
        { success: false, message: 'Only paid orders can be refunded from this action.' },
        400,
      )
    }

    const totalAmount = roundMoney(Number(order.total_amount || 0))
    const alreadyRefunded = roundMoney(Number(order.refunded_amount || 0))
    const remainingRefundable = roundMoney(totalAmount - alreadyRefunded)

    if (totalAmount <= 0 || refundAmount > remainingRefundable) {
      return jsonResponse(
        {
          success: false,
          message: `Refund amount cannot exceed remaining refundable amount (${order.currency || 'AED'} ${remainingRefundable.toFixed(2)}).`,
        },
        400,
      )
    }

    const now = new Date().toISOString()
    const newRefundedAmount = roundMoney(alreadyRefunded + refundAmount)
    const isFullRefund = newRefundedAmount >= totalAmount
    const refundStatus = isFullRefund ? 'refunded_recorded' : 'partial_refund_recorded'
    const refundReference = `RF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    const gateway = cleanString(order.payment_gateway || order.gateway).toLowerCase() || null

    const { data: refund, error: refundError } = await serviceClient
      .from('restaurant_payment_refunds')
      .insert({
        restaurant_id: restaurantId,
        order_id: order.id,
        gateway,
        payment_reference: cleanString(order.payment_reference) || null,
        gateway_order_id: cleanString(order.gateway_order_id) || null,
        gateway_transaction_id: cleanString(order.gateway_transaction_id) || null,
        refund_reference: refundReference,
        refund_amount: refundAmount,
        currency: order.currency || 'AED',
        refund_status: mode === 'gateway_pending' ? 'gateway_refund_pending' : 'manual_recorded',
        refund_mode: mode,
        reason: reason || null,
        requested_by: user.id,
        requested_at: now,
        processed_at: mode === 'manual_record' ? now : null,
        metadata: {
          source: 'orders_screen',
          automatic_gateway_refund: false,
          note: 'Money movement must be processed in the restaurant owned gateway account until gateway refund automation is added.',
        },
        updated_at: now,
      })
      .select('*')
      .single()

    if (refundError) throw new Error(refundError.message)

    const orderPatch = {
      payment_status: isFullRefund ? 'refunded' : 'paid',
      refund_status: mode === 'gateway_pending' ? 'gateway_refund_pending' : refundStatus,
      refunded_amount: newRefundedAmount,
      refunded_at: now,
      refund_reason: reason || null,
      last_refund_id: refund.id,
      updated_at: now,
    }

    const { data: updatedOrder, error: updateError } = await serviceClient
      .from('restaurant_orders')
      .update(orderPatch)
      .eq('id', order.id)
      .select('*')
      .single()

    if (updateError) throw new Error(updateError.message)

    await writeGatewayAuditLog({
      serviceClient,
      restaurantId,
      gateway: gateway || 'manual',
      actorUserId: user.id,
      action: 'refund_recorded',
      status: 'success',
      message: `${isFullRefund ? 'Full' : 'Partial'} refund recorded for ${order.order_code || order.public_order_number || 'order'}.`,
      metadata: {
        order_id: order.id,
        refund_id: refund.id,
        refund_reference: refundReference,
        refund_amount: refundAmount,
        currency: order.currency || 'AED',
        refund_mode: mode,
        automatic_gateway_refund: false,
      },
    })

    return jsonResponse({
      success: true,
      message: isFullRefund
        ? 'Full refund recorded. Process the money movement in the restaurant gateway if not already done.'
        : 'Partial refund recorded. Process the money movement in the restaurant gateway if not already done.',
      refund,
      updated_order: updatedOrder,
    })
  } catch (error) {
    return jsonResponse(
      { success: false, message: error?.message || 'Unable to record refund.' },
      500,
    )
  }
})

async function userCanManageRestaurant({ serviceClient, restaurantId, userId }) {
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.role === 'super_admin') return true

  const { data: ownerRestaurant } = await serviceClient
    .from('restaurants')
    .select('id')
    .eq('id', restaurantId)
    .eq('owner_id', userId)
    .maybeSingle()

  if (ownerRestaurant?.id) return true

  const { data: member } = await serviceClient
    .from('restaurant_members')
    .select('id, role')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', userId)
    .maybeSingle()

  return Boolean(member?.id)
}

async function writeGatewayAuditLog({
  serviceClient,
  restaurantId,
  gateway,
  actorUserId,
  action,
  status,
  message,
  metadata = {},
}) {
  try {
    await serviceClient.from('restaurant_gateway_audit_logs').insert({
      restaurant_id: restaurantId,
      gateway: gateway || 'manual',
      actor_user_id: actorUserId || null,
      action,
      status,
      message,
      metadata,
      created_at: new Date().toISOString(),
    })
  } catch {
    // Audit logging should never block refund recording.
  }
}

function cleanString(value) {
  return String(value || '').trim()
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100
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
