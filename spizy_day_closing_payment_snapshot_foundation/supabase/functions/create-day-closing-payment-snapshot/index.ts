import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function toMoney(value: unknown) {
  const numberValue = Number(value || 0)
  if (!Number.isFinite(numberValue)) return 0
  return Math.round(numberValue * 100) / 100
}

function addToBreakdown(
  breakdown: Record<string, { count: number; amount: number }>,
  key: string,
  amount: number,
) {
  const safeKey = key || 'unknown'
  if (!breakdown[safeKey]) {
    breakdown[safeKey] = { count: 0, amount: 0 }
  }

  breakdown[safeKey].count += 1
  breakdown[safeKey].amount = toMoney(breakdown[safeKey].amount + amount)
}

function isPaidOrder(order: Record<string, unknown>) {
  return String(order.payment_status || '').toLowerCase() === 'paid'
}

function isCancelledOrder(order: Record<string, unknown>) {
  return ['cancelled', 'canceled'].includes(String(order.status || '').toLowerCase())
}

function isCodOrder(order: Record<string, unknown>) {
  const paymentMethod = String(order.payment_method || '').toLowerCase()
  const gateway = String(order.payment_gateway || '').toLowerCase()
  const deliveryPaymentType = String(order.delivery_payment_type || '').toLowerCase()

  return (
    paymentMethod === 'cod' ||
    gateway === 'cod' ||
    deliveryPaymentType.includes('cod') ||
    deliveryPaymentType.includes('cash_on_delivery') ||
    deliveryPaymentType.includes('card_machine')
  )
}

function getCollectionBucket(order: Record<string, unknown>) {
  const paymentMethod = String(order.payment_method || '').toLowerCase()
  const gateway = String(order.payment_gateway || '').toLowerCase()
  const deliveryPaymentType = String(order.delivery_payment_type || '').toLowerCase()

  if (paymentMethod === 'cash' || deliveryPaymentType.includes('cash')) return 'cash'
  if (paymentMethod === 'card' || deliveryPaymentType.includes('card')) return 'card'
  if (isCodOrder(order)) return 'cod'
  if (gateway && gateway !== 'cod') return 'online'
  if (paymentMethod === 'online') return 'online'

  return paymentMethod || gateway || 'unknown'
}

function getDubaiDateRange(closingDate: string) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(closingDate)
    ? closingDate
    : new Date().toISOString().slice(0, 10)

  const start = new Date(`${safeDate}T00:00:00+04:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  return {
    safeDate,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: 'Supabase environment is not configured.' }, 500)
    }

    const authHeader = req.headers.get('Authorization') || ''

    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header.' }, 401)
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const { data: userData, error: userError } = await userClient.auth.getUser()

    if (userError || !userData?.user?.id) {
      return jsonResponse({ error: 'Invalid user session.' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const restaurantId = String(body.restaurant_id || body.restaurantId || '')
    const closingDateInput = String(body.closing_date || body.closingDate || new Date().toISOString().slice(0, 10))

    if (!restaurantId) {
      return jsonResponse({ error: 'restaurant_id is required.' }, 400)
    }

    const { data: memberRows } = await serviceClient
      .from('restaurant_members')
      .select('id, role')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userData.user.id)
      .limit(1)

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()

    const memberRole = String(memberRows?.[0]?.role || '')
    const profileRole = String(profile?.role || '')
    const allowedRoles = new Set(['owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin', 'super_admin'])

    if (!allowedRoles.has(memberRole) && !allowedRoles.has(profileRole)) {
      return jsonResponse({ error: 'You do not have permission to close this restaurant day.' }, 403)
    }

    const { data: restaurant } = await serviceClient
      .from('restaurants')
      .select('id, name, currency')
      .eq('id', restaurantId)
      .maybeSingle()

    if (!restaurant?.id) {
      return jsonResponse({ error: 'Restaurant not found.' }, 404)
    }

    const { safeDate, startIso, endIso } = getDubaiDateRange(closingDateInput)

    const { data: orders, error: ordersError } = await serviceClient
      .from('restaurant_orders')
      .select('id, total_amount, payment_status, payment_method, payment_gateway, delivery_payment_type, status, currency, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', startIso)
      .lt('created_at', endIso)

    if (ordersError) {
      return jsonResponse({ error: ordersError.message }, 400)
    }

    let refunds: Array<Record<string, unknown>> = []
    const refundsResult = await serviceClient
      .from('restaurant_payment_refunds')
      .select('id, refund_amount, refund_status, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', startIso)
      .lt('created_at', endIso)

    if (!refundsResult.error) {
      refunds = refundsResult.data || []
    }

    const summary = {
      order_count: 0,
      paid_order_count: 0,
      pending_order_count: 0,
      cancelled_order_count: 0,
      sales_total: 0,
      collected_total: 0,
      cash_collected: 0,
      card_collected: 0,
      cod_collected: 0,
      online_collected: 0,
      cod_pending: 0,
      online_pending: 0,
      unpaid_total: 0,
      cancelled_unpaid_total: 0,
      refund_total: 0,
      refund_count: 0,
      net_collected: 0,
      gateway_breakdown: {} as Record<string, { count: number; amount: number }>,
      issue_breakdown: {} as Record<string, { count: number; amount: number }>,
    }

    for (const order of orders || []) {
      const amount = toMoney(order.total_amount)
      const gateway = String(order.payment_gateway || order.payment_method || 'unknown').toLowerCase()
      const paid = isPaidOrder(order)
      const cancelled = isCancelledOrder(order)
      const bucket = getCollectionBucket(order)

      summary.order_count += 1
      summary.sales_total = toMoney(summary.sales_total + amount)

      if (cancelled) {
        summary.cancelled_order_count += 1
      }

      if (paid) {
        summary.paid_order_count += 1
        summary.collected_total = toMoney(summary.collected_total + amount)
        addToBreakdown(summary.gateway_breakdown, gateway, amount)

        if (bucket === 'cash') summary.cash_collected = toMoney(summary.cash_collected + amount)
        else if (bucket === 'card') summary.card_collected = toMoney(summary.card_collected + amount)
        else if (bucket === 'cod') summary.cod_collected = toMoney(summary.cod_collected + amount)
        else summary.online_collected = toMoney(summary.online_collected + amount)
      } else {
        summary.pending_order_count += 1
        summary.unpaid_total = toMoney(summary.unpaid_total + amount)

        if (cancelled) {
          summary.cancelled_unpaid_total = toMoney(summary.cancelled_unpaid_total + amount)
          addToBreakdown(summary.issue_breakdown, 'cancelled_unpaid', amount)
        } else if (isCodOrder(order)) {
          summary.cod_pending = toMoney(summary.cod_pending + amount)
          addToBreakdown(summary.issue_breakdown, 'cod_pending', amount)
        } else if (gateway && gateway !== 'cash' && gateway !== 'card') {
          summary.online_pending = toMoney(summary.online_pending + amount)
          addToBreakdown(summary.issue_breakdown, 'online_pending', amount)
        } else {
          addToBreakdown(summary.issue_breakdown, 'unpaid', amount)
        }
      }
    }

    for (const refund of refunds) {
      const status = String(refund.refund_status || '').toLowerCase()
      if (status === 'cancelled' || status === 'failed') continue

      summary.refund_count += 1
      summary.refund_total = toMoney(summary.refund_total + toMoney(refund.refund_amount))
    }

    summary.net_collected = toMoney(summary.collected_total - summary.refund_total)

    const payload = {
      restaurant_id: restaurantId,
      closing_date: safeDate,
      currency: String(restaurant.currency || orders?.[0]?.currency || 'AED'),
      ...summary,
      raw_summary: {
        source: 'create-day-closing-payment-snapshot',
        timezone: 'Asia/Dubai',
        period_start: startIso,
        period_end: endIso,
        restaurant_name: restaurant.name || '',
      },
      created_by: userData.user.id,
      updated_at: new Date().toISOString(),
    }

    const { data: savedSnapshot, error: upsertError } = await serviceClient
      .from('restaurant_day_closing_payment_snapshots')
      .upsert(payload, {
        onConflict: 'restaurant_id,closing_date',
      })
      .select('*')
      .single()

    if (upsertError) {
      return jsonResponse({ error: upsertError.message }, 400)
    }

    return jsonResponse({
      ok: true,
      snapshot: savedSnapshot,
      message: `Payment closing snapshot created for ${safeDate}.`,
    })
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : 'Unable to create day closing payment snapshot.',
      },
      500,
    )
  }
})
