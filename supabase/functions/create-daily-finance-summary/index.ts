import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const money = (value: unknown) => Number(value || 0)

function dayRange(summaryDate: string) {
  const start = new Date(`${summaryDate}T00:00:00`)
  const end = new Date(start)
  end.setDate(start.getDate() + 1)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: 'Missing Supabase environment variables.' }, 500)
    }

    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user?.id) {
      return json({ error: 'Authentication required.' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const restaurantId = String(body?.restaurant_id || '')
    const summaryDate = String(body?.summary_date || new Date().toISOString().slice(0, 10))

    if (!restaurantId) {
      return json({ error: 'restaurant_id is required.' }, 400)
    }

    const { data: member, error: memberError } = await admin
      .from('restaurant_members')
      .select('id, role')
      .eq('restaurant_id', restaurantId)
      .eq('user_id', userData.user.id)
      .maybeSingle()

    if (memberError) {
      return json({ error: memberError.message }, 400)
    }

    const allowedRoles = new Set(['owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin'])
    if (!member || !allowedRoles.has(String(member.role || ''))) {
      return json({ error: 'You do not have permission to create finance summaries.' }, 403)
    }

    const { data: restaurant } = await admin
      .from('restaurants')
      .select('id, currency')
      .eq('id', restaurantId)
      .maybeSingle()

    const { startIso, endIso } = dayRange(summaryDate)

    const [ordersResult, expensesResult, closingResult, snapshotResult, ledgerResult, refundsResult] = await Promise.all([
      admin
        .from('restaurant_orders')
        .select('id, status, payment_status, payment_method, total_amount, paid_amount, created_at')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', startIso)
        .lt('created_at', endIso),
      admin
        .from('restaurant_expenses')
        .select('id, total_amount, payment_method, expense_date, is_deleted')
        .eq('restaurant_id', restaurantId)
        .eq('expense_date', summaryDate)
        .eq('is_deleted', false),
      admin
        .from('restaurant_day_closings')
        .select('id, status, cash_difference')
        .eq('restaurant_id', restaurantId)
        .eq('closing_date', summaryDate)
        .maybeSingle(),
      admin
        .from('restaurant_day_closing_payment_snapshots')
        .select('id, collected_total, cod_pending, online_pending, refund_total, net_collected, gateway_breakdown, issue_breakdown')
        .eq('restaurant_id', restaurantId)
        .eq('closing_date', summaryDate)
        .maybeSingle(),
      admin
        .from('restaurant_account_transactions')
        .select('id, transaction_type, amount, is_voided, transaction_date, source_type')
        .eq('restaurant_id', restaurantId)
        .eq('transaction_date', summaryDate),
      admin
        .from('restaurant_payment_refunds')
        .select('id, refund_amount, created_at')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', startIso)
        .lt('created_at', endIso),
    ])

    for (const result of [ordersResult, closingResult, snapshotResult, ledgerResult]) {
      if (result.error && !['42P01', 'PGRST116'].includes(result.error.code)) {
        return json({ error: result.error.message }, 400)
      }
    }

    if (expensesResult.error && expensesResult.error.code !== '42P01') {
      return json({ error: expensesResult.error.message }, 400)
    }

    const activeOrders = (ordersResult.data || []).filter(
      (order) => !['cancelled'].includes(String(order.status || '').toLowerCase()),
    )
    const totalSales = activeOrders.reduce((total, order) => total + money(order.total_amount), 0)
    const paidFromOrders = activeOrders.reduce((total, order) => {
      if (String(order.payment_status || '').toLowerCase() !== 'paid') return total
      return total + money(order.paid_amount || order.total_amount)
    }, 0)
    const pendingFromOrders = activeOrders.reduce((total, order) => {
      if (String(order.payment_status || '').toLowerCase() === 'paid') return total
      return total + money(order.total_amount)
    }, 0)
    const expenseTotal = (expensesResult.data || []).reduce(
      (total, expense) => total + money(expense.total_amount),
      0,
    )
    const refundFromRecords = refundsResult.error
      ? 0
      : (refundsResult.data || []).reduce((total, refund) => total + money(refund.refund_amount), 0)

    const snapshot = snapshotResult.data || null
    const closing = closingResult.data || null
    const ledgerRows = (ledgerResult.data || []).filter((row) => !row.is_voided)
    const cashBankMoneyIn = ledgerRows
      .filter((row) => ['opening', 'income', 'transfer_in', 'adjustment_in'].includes(String(row.transaction_type || '')))
      .reduce((total, row) => total + money(row.amount), 0)
    const cashBankMoneyOut = ledgerRows
      .filter((row) => ['expense', 'transfer_out', 'adjustment_out'].includes(String(row.transaction_type || '')))
      .reduce((total, row) => total + money(row.amount), 0)

    const codPending = money(snapshot?.cod_pending)
    const onlinePending = money(snapshot?.online_pending)
    const refundTotal = Math.max(money(snapshot?.refund_total), refundFromRecords)
    const collectedTotal = snapshot ? money(snapshot.collected_total) : paidFromOrders
    const pendingTotal = snapshot ? codPending + onlinePending : pendingFromOrders
    const netCollection = snapshot ? money(snapshot.net_collected) : collectedTotal - refundTotal
    const netAfterExpenses = netCollection - expenseTotal

    const payload = {
      restaurant_id: restaurantId,
      summary_date: summaryDate,
      currency: restaurant?.currency || 'AED',
      total_sales: totalSales,
      collected_total: collectedTotal,
      pending_total: pendingTotal,
      cod_pending: codPending,
      online_pending: onlinePending,
      refund_total: refundTotal,
      expense_total: expenseTotal,
      cash_bank_money_in: cashBankMoneyIn,
      cash_bank_money_out: cashBankMoneyOut,
      net_collection: netCollection,
      net_after_expenses: netAfterExpenses,
      cash_difference: money(closing?.cash_difference),
      day_closing_status: String(closing?.status || 'open'),
      day_closing_id: closing?.id || null,
      payment_snapshot_id: snapshot?.id || null,
      summary_breakdown: {
        order_count: activeOrders.length,
        paid_order_collection: paidFromOrders,
        pending_from_orders: pendingFromOrders,
        gateway_breakdown: snapshot?.gateway_breakdown || {},
        issue_breakdown: snapshot?.issue_breakdown || {},
        ledger_entry_count: ledgerRows.length,
        generated_from: {
          orders: !ordersResult.error,
          expenses: !expensesResult.error,
          day_closing: Boolean(closing),
          payment_snapshot: Boolean(snapshot),
          refunds: !refundsResult.error,
          cash_bank_ledger: !ledgerResult.error,
        },
      },
      created_by: userData.user.id,
      updated_at: new Date().toISOString(),
    }

    const { data: summary, error: summaryError } = await admin
      .from('restaurant_daily_finance_summaries')
      .upsert(payload, { onConflict: 'restaurant_id,summary_date' })
      .select('*')
      .single()

    if (summaryError) {
      return json({ error: summaryError.message }, 400)
    }

    return json({
      summary,
      message: 'Daily finance summary created successfully.',
    })
  } catch (error) {
    return json({ error: error?.message || 'Unexpected error while creating finance summary.' }, 500)
  }
})
