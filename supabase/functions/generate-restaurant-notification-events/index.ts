import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-spizy-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const notificationRuleTemplates = [
  {
    key: 'payment_failed',
    title: 'Payment failed',
    priority: 'high',
    channel: 'in_app',
  },
  {
    key: 'customer_completed_bill',
    title: 'Customer completed / requested bill',
    priority: 'high',
    channel: 'in_app',
  },
  {
    key: 'cod_pending',
    title: 'COD pending reminder',
    priority: 'medium',
    channel: 'in_app',
  },
  {
    key: 'day_closing_due',
    title: 'Day closing reminder',
    priority: 'high',
    channel: 'in_app',
  },
  {
    key: 'month_close_due',
    title: 'Month close reminder',
    priority: 'medium',
    channel: 'in_app',
  },
  {
    key: 'vat_period_due',
    title: 'VAT period close reminder',
    priority: 'high',
    channel: 'in_app',
  },
  {
    key: 'low_stock',
    title: 'Low stock alert',
    priority: 'medium',
    channel: 'in_app',
  },
  {
    key: 'staff_task',
    title: 'Staff task / shift alert',
    priority: 'medium',
    channel: 'in_app',
  },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const cronSecret = Deno.env.get('SPIZY_CRON_SECRET') || ''

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Supabase Edge Function environment is missing.' }, 500)
    }

    const body = await req.json().catch(() => ({}))
    const restaurantId = String(body.restaurant_id || '').trim()
    const dryRun = Boolean(body.dry_run)
    const targetDate = normalizeDateKey(body.target_date) || getTimeZoneDateKey('Asia/Dubai')
    const monthKey = targetDate.slice(0, 7)
    const cronHeader = req.headers.get('x-spizy-cron-secret') || ''
    const isCronRun = Boolean(cronSecret && cronHeader && cronHeader === cronSecret)

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    let restaurants: any[] = []

    if (restaurantId) {
      if (!isCronRun) {
        const authorization = req.headers.get('Authorization') || ''
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authorization } },
        })
        const { data: userData, error: userError } = await userClient.auth.getUser()
        const user = userData?.user

        if (userError || !user) {
          return jsonResponse({ error: 'Login required to generate restaurant notification events.' }, 401)
        }

        const hasAccess = await verifyRestaurantAdminAccess(adminClient, restaurantId, user.id)

        if (!hasAccess) {
          return jsonResponse({ error: 'You do not have permission to generate alerts for this restaurant.' }, 403)
        }
      }

      const { data, error } = await adminClient
        .from('restaurants')
        .select('id, name, currency, slug, is_active')
        .eq('id', restaurantId)
        .maybeSingle()

      if (error || !data) {
        return jsonResponse({ error: error?.message || 'Restaurant not found.' }, 404)
      }

      restaurants = [data]
    } else if (isCronRun) {
      const { data, error } = await adminClient
        .from('restaurants')
        .select('id, name, currency, slug, is_active')
        .eq('is_active', true)
        .limit(250)

      if (error) {
        return jsonResponse({ error: error.message }, 500)
      }

      restaurants = data || []
    } else {
      return jsonResponse({ error: 'restaurant_id is required unless SPIZY_CRON_SECRET is used.' }, 400)
    }

    const results = []

    for (const restaurant of restaurants) {
      const result = await generateRestaurantEvents({
        adminClient,
        restaurant,
        targetDate,
        monthKey,
        dryRun,
      })

      results.push(result)
    }

    return jsonResponse({
      success: true,
      dry_run: dryRun,
      target_date: targetDate,
      month_key: monthKey,
      restaurants_checked: restaurants.length,
      total_created: results.reduce((total, result) => total + Number(result.created_count || 0), 0),
      results,
    })
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to generate restaurant notification events.',
      },
      500,
    )
  }
})

async function generateRestaurantEvents({ adminClient, restaurant, targetDate, monthKey, dryRun }: any) {
  const restaurantId = restaurant.id
  const currency = restaurant.currency || 'AED'
  const { startIso, endIso } = getDateRangeIso(targetDate)

  const rules = await loadNotificationRules(adminClient, restaurantId)
  const enabledRules = rules.filter((rule: any) => rule.enabled !== false)
  const enabledKeys = new Set(enabledRules.map((rule: any) => rule.rule_key))
  const ruleMap = new Map(enabledRules.map((rule: any) => [rule.rule_key, rule]))

  const [orders, dayClosing, monthClose, vatClose, inventoryItems, openShiftClosings] = await Promise.all([
    safeSelectList(adminClient, 'restaurant_orders', restaurantId, (query: any) =>
      query.gte('created_at', startIso).lt('created_at', endIso).order('created_at', { ascending: false }).limit(200),
    ),
    safeMaybeSingle(adminClient, 'restaurant_day_closings', restaurantId, (query: any) =>
      query.eq('closing_date', targetDate),
    ),
    safeMaybeSingle(adminClient, 'restaurant_monthly_finance_closings', restaurantId, (query: any) =>
      query.eq('month_key', monthKey),
    ),
    safeMaybeSingle(adminClient, 'restaurant_tax_vat_period_closings', restaurantId, (query: any) =>
      query.eq('month_key', monthKey),
    ),
    safeSelectList(adminClient, 'restaurant_inventory_items', restaurantId, (query: any) =>
      query.limit(300),
    ),
    safeSelectList(adminClient, 'restaurant_staff_shift_closings', restaurantId, (query: any) =>
      query.eq('status', 'open').limit(100),
    ),
  ])

  const alerts = buildAlerts({
    restaurant,
    orders,
    dayClosing,
    monthClose,
    vatClose,
    inventoryItems,
    openShiftClosings,
    targetDate,
    monthKey,
    currency,
    enabledKeys,
  })

  const createdEvents = []
  const skippedEvents = []

  for (const alert of alerts) {
    const rule = ruleMap.get(alert.ruleKey) || {}
    const channel = normalizeChannel(rule.channel || 'in_app')
    const severity = normalizeSeverity(rule.priority || alert.priority || 'medium')
    const dedupeKey = `${restaurantId}:${alert.key}`

    if (dryRun) {
      createdEvents.push({ ...alert, channel, severity, dry_run: true })
      continue
    }

    const exists = await openEventExists(adminClient, restaurantId, dedupeKey, alert.key)

    if (exists) {
      skippedEvents.push({ alert_key: alert.key, reason: 'already_open' })
      continue
    }

    const { data, error } = await adminClient
      .from('restaurant_notification_events')
      .insert({
        restaurant_id: restaurantId,
        rule_key: alert.ruleKey,
        alert_key: alert.key,
        dedupe_key: dedupeKey,
        title: alert.title,
        message: alert.message,
        severity,
        channel,
        status: 'open',
        source_type: alert.sourceType || null,
        source_id: alert.sourceId || null,
        metadata: {
          ...(alert.metadata || {}),
          metric: alert.metric || null,
          section: alert.section || null,
          action_label: alert.actionLabel || null,
          generated_by: 'generate-restaurant-notification-events',
          generated_at: new Date().toISOString(),
          target_date: targetDate,
          month_key: monthKey,
        },
      })
      .select('id, alert_key, title, severity, channel, status, created_at')
      .single()

    if (error) {
      skippedEvents.push({ alert_key: alert.key, reason: error.message })
    } else {
      createdEvents.push(data)
    }
  }

  if (!dryRun && enabledRules.length > 0) {
    await adminClient
      .from('restaurant_notification_rules')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('restaurant_id', restaurantId)
      .in('rule_key', enabledRules.map((rule: any) => rule.rule_key))
  }

  return {
    restaurant_id: restaurantId,
    restaurant_name: restaurant.name || 'Restaurant',
    alerts_found: alerts.length,
    created_count: createdEvents.length,
    skipped_count: skippedEvents.length,
    created: createdEvents,
    skipped: skippedEvents,
  }
}

async function loadNotificationRules(adminClient: any, restaurantId: string) {
  const { data, error } = await adminClient
    .from('restaurant_notification_rules')
    .select('rule_key, rule_title, enabled, channel, priority')
    .eq('restaurant_id', restaurantId)

  if (error || !Array.isArray(data) || data.length === 0) {
    return notificationRuleTemplates.map((template) => ({
      rule_key: template.key,
      rule_title: template.title,
      enabled: true,
      channel: template.channel,
      priority: template.priority,
    }))
  }

  const existingKeys = new Set(data.map((rule: any) => rule.rule_key))
  const missingDefaultRules = notificationRuleTemplates
    .filter((template) => !existingKeys.has(template.key))
    .map((template) => ({
      rule_key: template.key,
      rule_title: template.title,
      enabled: true,
      channel: template.channel,
      priority: template.priority,
    }))

  return [...data, ...missingDefaultRules]
}

function buildAlerts({
  restaurant,
  orders,
  dayClosing,
  monthClose,
  vatClose,
  inventoryItems,
  openShiftClosings,
  targetDate,
  monthKey,
  currency,
  enabledKeys,
}: any) {
  const alerts = []

  const failedPayments = orders.filter(isPaymentFailed)
  if (enabledKeys.has('payment_failed') && failedPayments.length > 0) {
    alerts.push({
      key: `payment_failed_${targetDate}`,
      ruleKey: 'payment_failed',
      title: 'Payment failures need review',
      message: `${failedPayments.length} online payment${failedPayments.length === 1 ? '' : 's'} failed or need gateway review today.`,
      metric: formatMoney(currency, sumOrders(failedPayments)),
      priority: 'high',
      section: 'orders',
      actionLabel: 'Open Orders',
      sourceType: 'restaurant_orders',
      metadata: { order_ids: failedPayments.map((order: any) => order.id) },
    })
  }

  const billRequests = orders.filter((order: any) => String(order.status || '').toLowerCase() === 'bill_requested')
  if (enabledKeys.has('customer_completed_bill') && billRequests.length > 0) {
    alerts.push({
      key: `bill_requested_${targetDate}`,
      ruleKey: 'customer_completed_bill',
      title: 'Customer completion requests',
      message: `${billRequests.length} table/customer order${billRequests.length === 1 ? '' : 's'} requested bill or completion.`,
      metric: formatMoney(currency, sumOrders(billRequests)),
      priority: 'high',
      section: 'orders',
      actionLabel: 'Complete Bills',
      sourceType: 'restaurant_orders',
      metadata: { order_ids: billRequests.map((order: any) => order.id) },
    })
  }

  const codPending = orders.filter(isCodPending)
  if (enabledKeys.has('cod_pending') && codPending.length > 0) {
    alerts.push({
      key: `cod_pending_${targetDate}`,
      ruleKey: 'cod_pending',
      title: 'COD collections pending',
      message: `${codPending.length} COD/unpaid order${codPending.length === 1 ? '' : 's'} still need collection confirmation.`,
      metric: formatMoney(currency, sumOrders(codPending)),
      priority: 'medium',
      section: 'customer-payments',
      actionLabel: 'Open Collections',
      sourceType: 'restaurant_orders',
      metadata: { order_ids: codPending.map((order: any) => order.id) },
    })
  }

  if (enabledKeys.has('day_closing_due') && dayClosing?.status !== 'closed') {
    alerts.push({
      key: `day_close_${targetDate}`,
      ruleKey: 'day_closing_due',
      title: 'Day closing not completed',
      message: `Today’s Z report for ${targetDate} is not closed yet.`,
      priority: 'high',
      section: 'day-closing',
      actionLabel: 'Close Day',
      sourceType: 'restaurant_day_closings',
      metadata: { closing_date: targetDate, status: dayClosing?.status || 'missing' },
    })
  }

  if (enabledKeys.has('month_close_due') && monthClose?.status !== 'closed') {
    alerts.push({
      key: `month_close_${monthKey}`,
      ruleKey: 'month_close_due',
      title: 'Month close is open',
      message: `Finance month ${monthKey} is not closed/reviewed yet.`,
      priority: 'medium',
      section: 'cash-bank',
      actionLabel: 'Open Month Close',
      sourceType: 'restaurant_monthly_finance_closings',
      metadata: { month_key: monthKey, status: monthClose?.status || 'missing' },
    })
  }

  if (enabledKeys.has('vat_period_due') && vatClose?.status !== 'closed') {
    alerts.push({
      key: `vat_close_${monthKey}`,
      ruleKey: 'vat_period_due',
      title: 'VAT period needs review',
      message: `VAT period ${monthKey} is not closed/reviewed yet.`,
      priority: 'high',
      section: 'vat-statutory',
      actionLabel: 'Open VAT',
      sourceType: 'restaurant_tax_vat_period_closings',
      metadata: { month_key: monthKey, status: vatClose?.status || 'missing' },
    })
  }

  const lowStockItems = normalizeLowStockItems(inventoryItems)
  if (enabledKeys.has('low_stock') && lowStockItems.length > 0) {
    alerts.push({
      key: 'low_stock_now',
      ruleKey: 'low_stock',
      title: 'Low stock items found',
      message: `${lowStockItems.length} inventory item${lowStockItems.length === 1 ? '' : 's'} appear below minimum stock level.`,
      metric: lowStockItems.slice(0, 3).map((item: any) => item.name).join(', '),
      priority: 'medium',
      section: 'inventory',
      actionLabel: 'Open Inventory',
      sourceType: 'restaurant_inventory_items',
      metadata: { items: lowStockItems.slice(0, 20) },
    })
  }

  const openOrderCount = orders.filter((order: any) => !isFinalOrderStatus(order.status)).length
  if (enabledKeys.has('staff_task') && (openOrderCount > 0 || openShiftClosings.length > 0)) {
    alerts.push({
      key: `staff_follow_up_${targetDate}`,
      ruleKey: 'staff_task',
      title: 'Staff follow-up needed',
      message:
        openShiftClosings.length > 0
          ? `${openShiftClosings.length} staff shift${openShiftClosings.length === 1 ? '' : 's'} are still open and may need handover.`
          : `${openOrderCount} live order${openOrderCount === 1 ? '' : 's'} may need waiter/kitchen follow-up or shift handover note.`,
      priority: 'low',
      section: 'shift-closing',
      actionLabel: 'Open Shift Closing',
      sourceType: 'restaurant_staff_shift_closings',
      metadata: {
        open_order_count: openOrderCount,
        open_shift_ids: openShiftClosings.map((shift: any) => shift.id),
      },
    })
  }

  return alerts.map((alert) => ({
    ...alert,
    metadata: {
      ...(alert.metadata || {}),
      restaurant_name: restaurant.name || null,
      restaurant_slug: restaurant.slug || null,
    },
  }))
}

async function safeSelectList(adminClient: any, tableName: string, restaurantId: string, applyFilters: any) {
  try {
    let query = adminClient.from(tableName).select('*').eq('restaurant_id', restaurantId)
    query = applyFilters ? applyFilters(query) : query
    const { data, error } = await query
    if (error) return []
    return data || []
  } catch (_error) {
    return []
  }
}

async function safeMaybeSingle(adminClient: any, tableName: string, restaurantId: string, applyFilters: any) {
  try {
    let query = adminClient.from(tableName).select('*').eq('restaurant_id', restaurantId)
    query = applyFilters ? applyFilters(query) : query
    const { data, error } = await query.maybeSingle()
    if (error) return null
    return data || null
  } catch (_error) {
    return null
  }
}

async function openEventExists(adminClient: any, restaurantId: string, dedupeKey: string, alertKey: string) {
  const { data, error } = await adminClient
    .from('restaurant_notification_events')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .or(`dedupe_key.eq.${escapeFilterValue(dedupeKey)},alert_key.eq.${escapeFilterValue(alertKey)}`)
    .in('status', ['open', 'sent'])
    .limit(1)

  if (error) return false

  return Array.isArray(data) && data.length > 0
}

async function verifyRestaurantAdminAccess(adminClient: any, restaurantId: string, userId: string) {
  const { data, error } = await adminClient
    .from('restaurant_members')
    .select('id, role')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', userId)
    .in('role', ['owner', 'restaurant_owner', 'admin', 'manager', 'partner_admin'])
    .limit(1)

  if (error) return false

  return Array.isArray(data) && data.length > 0
}

function isPaymentFailed(order: any) {
  const status = String(order.payment_status || '').toLowerCase()
  const gatewayStatus = String(order.gateway_payment_status || order.online_payment_status || '').toLowerCase()

  return ['failed', 'payment_failed', 'cancelled', 'expired'].includes(status) ||
    ['failed', 'payment_failed', 'cancelled', 'expired'].includes(gatewayStatus)
}

function isCodPending(order: any) {
  const paymentMethod = String(order.payment_method || order.delivery_payment_type || '').toLowerCase()
  const status = String(order.payment_status || '').toLowerCase()

  return ['cod', 'cash_on_delivery', 'unpaid', 'cash'].includes(paymentMethod) &&
    !['paid', 'refunded'].includes(status) &&
    String(order.status || '').toLowerCase() !== 'cancelled'
}

function isFinalOrderStatus(status: string) {
  return ['completed', 'cancelled', 'delivered'].includes(String(status || '').toLowerCase())
}

function sumOrders(orders: any[]) {
  return orders.reduce((total, order) => total + Number(order.total_amount || order.grand_total || 0), 0)
}

function normalizeLowStockItems(items: any[]) {
  return (items || [])
    .map((item) => {
      const name = item.item_name || item.name || item.product_name || 'Inventory item'
      const currentStock = Number(item.current_stock ?? item.stock_quantity ?? item.quantity_available ?? item.quantity ?? 0)
      const minimumStock = Number(item.min_stock_level ?? item.minimum_stock ?? item.reorder_level ?? 0)

      return {
        id: item.id,
        name,
        currentStock,
        minimumStock,
        unit: item.unit || item.stock_unit || '',
      }
    })
    .filter((item) => item.minimumStock > 0 && item.currentStock <= item.minimumStock)
}

function normalizeChannel(value: string) {
  return ['in_app', 'email', 'whatsapp', 'push'].includes(value) ? value : 'in_app'
}

function normalizeSeverity(value: string) {
  if (value === 'critical') return 'critical'
  if (value === 'high') return 'high'
  if (value === 'low') return 'low'
  return 'medium'
}

function normalizeDateKey(value: unknown) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function getDateRangeIso(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00+04:00`)
  const end = new Date(start)
  end.setDate(start.getDate() + 1)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

function getTimeZoneDateKey(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === 'year')?.value || '1970'
  const month = parts.find((part) => part.type === 'month')?.value || '01'
  const day = parts.find((part) => part.type === 'day')?.value || '01'

  return `${year}-${month}-${day}`
}

function formatMoney(currency: string, amount: number) {
  const safeCurrency = currency || 'AED'
  const numericAmount = Number(amount || 0)

  try {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(numericAmount)
  } catch {
    return `${safeCurrency} ${numericAmount.toFixed(2)}`
  }
}

function escapeFilterValue(value: string) {
  return String(value || '').replace(/[,()]/g, '')
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}
