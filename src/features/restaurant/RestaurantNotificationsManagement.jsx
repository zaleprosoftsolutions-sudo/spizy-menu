import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Download,
  FileText,
  PackageCheck,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  ShoppingCart,
  ToggleLeft,
  ToggleRight,
  WalletCards,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './RestaurantNotificationsManagement.css'

const notificationRuleTemplates = [
  {
    key: 'payment_failed',
    title: 'Payment failed',
    description: 'Alert owner when an online payment fails or needs attention.',
    priority: 'high',
    icon: CreditCard,
  },
  {
    key: 'customer_completed_bill',
    title: 'Customer completed / requested bill',
    description: 'Alert restaurant when a table customer says they are finished.',
    priority: 'high',
    icon: ShoppingCart,
  },
  {
    key: 'cod_pending',
    title: 'COD pending reminder',
    description: 'Keep COD / unpaid delivery collections visible until closed.',
    priority: 'medium',
    icon: WalletCards,
  },
  {
    key: 'day_closing_due',
    title: 'Day closing reminder',
    description: 'Remind owner or manager to close the daily Z report.',
    priority: 'high',
    icon: ClipboardCheck,
  },
  {
    key: 'month_close_due',
    title: 'Month close reminder',
    description: 'Show month-end finance close actions when the period is not closed.',
    priority: 'medium',
    icon: CalendarClock,
  },
  {
    key: 'vat_period_due',
    title: 'VAT period close reminder',
    description: 'Remind owner/accountant to review and close the VAT period.',
    priority: 'high',
    icon: FileText,
  },
  {
    key: 'low_stock',
    title: 'Low stock alert',
    description: 'Surface items where stock is below the minimum level.',
    priority: 'medium',
    icon: PackageCheck,
  },
  {
    key: 'staff_task',
    title: 'Staff task / shift alert',
    description: 'Track pending staff handover, shift close and operation tasks.',
    priority: 'medium',
    icon: BellRing,
  },
]

const ruleChannels = [
  { value: 'in_app', label: 'In-app' },
  { value: 'email', label: 'Email later' },
  { value: 'whatsapp', label: 'WhatsApp later' },
  { value: 'push', label: 'Push later' },
]

function RestaurantNotificationsManagement({ restaurant, onOpenSection }) {
  const { showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [savingEventKey, setSavingEventKey] = useState('')
  const [rules, setRules] = useState([])
  const [events, setEvents] = useState([])
  const [orders, setOrders] = useState([])
  const [dayClosing, setDayClosing] = useState(null)
  const [monthClose, setMonthClose] = useState(null)
  const [vatClose, setVatClose] = useState(null)
  const [inventoryItems, setInventoryItems] = useState([])
  const [loadNotes, setLoadNotes] = useState([])
  const [selectedPriority, setSelectedPriority] = useState('all')

  const currency = restaurant?.currency || 'AED'
  const todayKey = useMemo(() => getTodayDateKey(), [])
  const monthKey = useMemo(() => todayKey.slice(0, 7), [todayKey])

  const loadNotificationCenter = useCallback(
    async ({ silent = false } = {}) => {
      if (!restaurant?.id) return

      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      const { startIso, endIso } = getDateRangeIso(todayKey)
      const nextNotes = []

      const [
        rulesResult,
        eventsResult,
        ordersResult,
        dayClosingResult,
        monthCloseResult,
        vatCloseResult,
        inventoryResult,
      ] = await Promise.all([
        supabase
          .from('restaurant_notification_rules')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('restaurant_notification_events')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .gte('created_at', startIso)
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('restaurant_orders')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .gte('created_at', startIso)
          .lt('created_at', endIso)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('restaurant_day_closings')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .eq('closing_date', todayKey)
          .maybeSingle(),
        supabase
          .from('restaurant_monthly_finance_closings')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .eq('month_key', monthKey)
          .maybeSingle(),
        supabase
          .from('restaurant_tax_vat_period_closings')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .eq('month_key', monthKey)
          .maybeSingle(),
        supabase
          .from('restaurant_inventory_items')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .limit(200),
      ])

      if (rulesResult.error) {
        nextNotes.push(formatLoadNote('Notification rules', rulesResult.error))
      }

      if (eventsResult.error) {
        nextNotes.push(formatLoadNote('Notification history', eventsResult.error))
      }

      if (ordersResult.error) {
        nextNotes.push(formatLoadNote('Orders', ordersResult.error))
      }

      if (dayClosingResult.error && dayClosingResult.error.code !== 'PGRST116') {
        nextNotes.push(formatLoadNote('Day closing', dayClosingResult.error))
      }

      if (monthCloseResult.error && monthCloseResult.error.code !== 'PGRST116') {
        nextNotes.push(formatLoadNote('Month close', monthCloseResult.error))
      }

      if (vatCloseResult.error && vatCloseResult.error.code !== 'PGRST116') {
        nextNotes.push(formatLoadNote('VAT close', vatCloseResult.error))
      }

      if (inventoryResult.error && inventoryResult.error.code !== '42P01') {
        nextNotes.push(formatLoadNote('Low stock', inventoryResult.error))
      }

      setRules(rulesResult.data || [])
      setEvents(eventsResult.data || [])
      setOrders(ordersResult.data || [])
      setDayClosing(dayClosingResult.data || null)
      setMonthClose(monthCloseResult.data || null)
      setVatClose(vatCloseResult.data || null)
      setInventoryItems(inventoryResult.data || [])
      setLoadNotes(nextNotes.filter(Boolean))
      setLoading(false)
      setRefreshing(false)
    },
    [monthKey, restaurant?.id, todayKey],
  )

  useEffect(() => {
    loadNotificationCenter()
  }, [loadNotificationCenter])

  const ruleViewModels = useMemo(
    () =>
      notificationRuleTemplates.map((template) => {
        const savedRule = rules.find((rule) => rule.rule_key === template.key)

        return {
          ...template,
          enabled: savedRule?.enabled ?? true,
          channel: savedRule?.channel || 'in_app',
          triggerTiming: savedRule?.trigger_timing || 'real_time',
          savedRule,
        }
      }),
    [rules],
  )

  const liveAlerts = useMemo(
    () =>
      buildLiveNotificationAlerts({
        orders,
        dayClosing,
        monthClose,
        vatClose,
        inventoryItems,
        todayKey,
        monthKey,
        currency,
        rules: ruleViewModels,
      }),
    [currency, dayClosing, inventoryItems, monthClose, monthKey, orders, ruleViewModels, todayKey, vatClose],
  )

  const filteredLiveAlerts = useMemo(() => {
    if (selectedPriority === 'all') return liveAlerts

    return liveAlerts.filter((alert) => alert.priority === selectedPriority)
  }, [liveAlerts, selectedPriority])

  const summary = useMemo(() => {
    const enabledRules = ruleViewModels.filter((rule) => rule.enabled).length
    const highPriorityAlerts = liveAlerts.filter((alert) => alert.priority === 'high').length
    const openEvents = events.filter((event) => event.status !== 'resolved').length
    const disabledRules = ruleViewModels.length - enabledRules

    return {
      enabledRules,
      disabledRules,
      liveAlertCount: liveAlerts.length,
      highPriorityAlerts,
      openEvents,
      sentToday: events.length,
    }
  }, [events, liveAlerts, ruleViewModels])

  const toggleRule = async (rule) => {
    if (!restaurant?.id) return

    setSavingKey(rule.key)

    const nextEnabled = !rule.enabled
    const { data: userData } = await supabase.auth.getUser()
    const payload = {
      restaurant_id: restaurant.id,
      rule_key: rule.key,
      rule_title: rule.title,
      enabled: nextEnabled,
      channel: rule.channel || 'in_app',
      trigger_timing: rule.triggerTiming || 'real_time',
      priority: rule.priority || 'medium',
      updated_by: userData?.user?.id || null,
    }

    const { error } = await supabase
      .from('restaurant_notification_rules')
      .upsert(payload, { onConflict: 'restaurant_id,rule_key' })

    setSavingKey('')

    if (error) {
      showToast({
        type: 'error',
        title: 'Rule update failed',
        message: error.message,
      })
      return
    }

    await loadNotificationCenter({ silent: true })

    showToast({
      type: 'success',
      title: nextEnabled ? 'Notification enabled' : 'Notification disabled',
      message: `${rule.title} is now ${nextEnabled ? 'active' : 'paused'}.`,
    })
  }

  const updateRuleChannel = async (rule, channel) => {
    if (!restaurant?.id) return

    setSavingKey(rule.key)

    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('restaurant_notification_rules')
      .upsert(
        {
          restaurant_id: restaurant.id,
          rule_key: rule.key,
          rule_title: rule.title,
          enabled: rule.enabled,
          channel,
          trigger_timing: rule.triggerTiming || 'real_time',
          priority: rule.priority || 'medium',
          updated_by: userData?.user?.id || null,
        },
        { onConflict: 'restaurant_id,rule_key' },
      )

    setSavingKey('')

    if (error) {
      showToast({
        type: 'error',
        title: 'Channel update failed',
        message: error.message,
      })
      return
    }

    await loadNotificationCenter({ silent: true })
  }

  const markAlertNoted = async (alert) => {
    if (!restaurant?.id) return

    setSavingEventKey(alert.key)

    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('restaurant_notification_events').insert({
      restaurant_id: restaurant.id,
      rule_key: alert.ruleKey,
      alert_key: alert.key,
      title: alert.title,
      message: alert.message,
      severity: alert.priority,
      source_type: alert.sourceType || null,
      source_id: alert.sourceId || null,
      status: 'noted',
      metadata: alert.metadata || {},
      created_by: userData?.user?.id || null,
      resolved_by: userData?.user?.id || null,
      resolved_at: new Date().toISOString(),
    })

    setSavingEventKey('')

    if (error) {
      showToast({
        type: 'error',
        title: 'Unable to mark noted',
        message: error.message,
      })
      return
    }

    await loadNotificationCenter({ silent: true })

    showToast({
      type: 'success',
      title: 'Alert noted',
      message: 'This alert has been added to today’s notification history.',
    })
  }

  const exportCsv = () => {
    const rows = [
      ['Type', 'Priority', 'Title', 'Message', 'Action', 'Created'],
      ...liveAlerts.map((alert) => [
        'Live alert',
        alert.priority,
        alert.title,
        alert.message,
        alert.actionLabel || '',
        todayKey,
      ]),
      ...events.map((event) => [
        'History',
        event.severity || '',
        event.title || '',
        event.message || '',
        event.status || '',
        event.created_at || '',
      ]),
    ]

    downloadCsv(`spizy-notifications-${todayKey}.csv`, rows)
  }

  if (loading) {
    return (
      <section className="spizy-notification-shell">
        <div className="spizy-notification-loading">
          <RefreshCw size={20} />
          Loading notification center...
        </div>
      </section>
    )
  }

  return (
    <section className="spizy-notification-shell">
      <div className="spizy-notification-hero">
        <div>
          <p className="pricing-label">Restaurant Notifications</p>
          <h1>Reminder & Alert Center</h1>
          <p>
            Central place for payment failures, customer bill completion, COD pending,
            day closing, month close, VAT period close, low stock and staff task reminders.
          </p>
        </div>

        <div className="spizy-notification-hero-actions">
          <button
            type="button"
            className="spizy-notification-secondary"
            onClick={exportCsv}
          >
            <Download size={17} />
            Export CSV
          </button>
          <button
            type="button"
            className="spizy-notification-primary"
            onClick={() => loadNotificationCenter({ silent: true })}
            disabled={refreshing}
          >
            <RefreshCw size={17} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {loadNotes.length > 0 && (
        <div className="spizy-notification-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Some notification sources need setup</strong>
            <span>{loadNotes.join(' • ')}</span>
          </div>
        </div>
      )}

      <div className="spizy-notification-kpi-grid">
        <NotificationKpi
          icon={<BellRing size={20} />}
          label="Live Alerts"
          value={summary.liveAlertCount}
          note={`${summary.highPriorityAlerts} high priority`}
          tone={summary.liveAlertCount > 0 ? 'warning' : 'green'}
        />
        <NotificationKpi
          icon={<ShieldCheck size={20} />}
          label="Enabled Rules"
          value={summary.enabledRules}
          note={`${summary.disabledRules} paused`}
          tone="blue"
        />
        <NotificationKpi
          icon={<Send size={20} />}
          label="History Today"
          value={summary.sentToday}
          note={`${summary.openEvents} open / unresolved`}
          tone="gold"
        />
        <NotificationKpi
          icon={<CheckCircle2 size={20} />}
          label="Current Status"
          value={summary.highPriorityAlerts > 0 ? 'Review' : 'Clear'}
          note={summary.highPriorityAlerts > 0 ? 'Owner attention needed' : 'No urgent alerts'}
          tone={summary.highPriorityAlerts > 0 ? 'danger' : 'green'}
        />
      </div>

      <div className="spizy-notification-main-grid">
        <section className="spizy-notification-panel">
          <div className="spizy-notification-panel-head">
            <div>
              <p className="pricing-label">Live Action Alerts</p>
              <h2>What needs attention now?</h2>
            </div>

            <select
              value={selectedPriority}
              onChange={(event) => setSelectedPriority(event.target.value)}
            >
              <option value="all">All priorities</option>
              <option value="high">High only</option>
              <option value="medium">Medium only</option>
              <option value="low">Low only</option>
            </select>
          </div>

          {filteredLiveAlerts.length === 0 ? (
            <div className="spizy-notification-empty">
              <CheckCircle2 size={22} />
              <strong>No live alerts for this filter.</strong>
              <span>Spizy will show restaurant action reminders here.</span>
            </div>
          ) : (
            <div className="spizy-live-alert-list">
              {filteredLiveAlerts.map((alert) => (
                <article className={`spizy-live-alert ${alert.priority}`} key={alert.key}>
                  <div className="spizy-live-alert-icon">
                    <AlertTriangle size={18} />
                  </div>

                  <div>
                    <div className="spizy-live-alert-title-row">
                      <h3>{alert.title}</h3>
                      <span>{alert.priority}</span>
                    </div>
                    <p>{alert.message}</p>
                    {alert.metric && <strong>{alert.metric}</strong>}

                    <div className="spizy-live-alert-actions">
                      {alert.section && (
                        <button type="button" onClick={() => onOpenSection?.(alert.section)}>
                          {alert.actionLabel || 'Open module'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => markAlertNoted(alert)}
                        disabled={savingEventKey === alert.key}
                      >
                        {savingEventKey === alert.key ? 'Saving...' : 'Mark noted'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="spizy-notification-panel">
          <div className="spizy-notification-panel-head">
            <div>
              <p className="pricing-label">Notification Rules</p>
              <h2>Owner reminder setup</h2>
            </div>
          </div>

          <div className="spizy-rule-list">
            {ruleViewModels.map((rule) => {
              const Icon = rule.icon
              return (
                <article className="spizy-rule-card" key={rule.key}>
                  <div className="spizy-rule-card-top">
                    <div className="spizy-rule-icon">
                      <Icon size={18} />
                    </div>
                    <button
                      type="button"
                      className={`spizy-rule-toggle ${rule.enabled ? 'enabled' : ''}`}
                      onClick={() => toggleRule(rule)}
                      disabled={savingKey === rule.key}
                    >
                      {rule.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                      {savingKey === rule.key ? 'Saving...' : rule.enabled ? 'Enabled' : 'Paused'}
                    </button>
                  </div>

                  <h3>{rule.title}</h3>
                  <p>{rule.description}</p>

                  <label>
                    Channel
                    <select
                      value={rule.channel}
                      onChange={(event) => updateRuleChannel(rule, event.target.value)}
                      disabled={savingKey === rule.key}
                    >
                      {ruleChannels.map((channel) => (
                        <option value={channel.value} key={channel.value}>
                          {channel.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              )
            })}
          </div>
        </section>
      </div>

      <section className="spizy-notification-panel">
        <div className="spizy-notification-panel-head">
          <div>
            <p className="pricing-label">Today’s Notification History</p>
            <h2>Logged reminders and notes</h2>
          </div>
        </div>

        {events.length === 0 ? (
          <div className="spizy-notification-empty compact">
            <BellRing size={20} />
            <strong>No notification history yet today.</strong>
            <span>Use “Mark noted” on alerts to create an audit history.</span>
          </div>
        ) : (
          <div className="spizy-notification-table-wrap">
            <table className="spizy-notification-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Alert</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTime(event.created_at)}</td>
                    <td>{event.title || event.rule_key}</td>
                    <td><span className={`spizy-severity ${event.severity || 'medium'}`}>{event.severity || 'medium'}</span></td>
                    <td>{event.status || 'open'}</td>
                    <td>{event.message || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="spizy-notification-note-box">
        <Save size={18} />
        <div>
          <strong>Foundation note</strong>
          <span>
            This package creates the notification rules and in-app reminder foundation.
            Real email, WhatsApp, push and scheduled delivery can be connected later through
            Edge Functions and provider credentials.
          </span>
        </div>
      </section>
    </section>
  )
}

function NotificationKpi({ icon, label, value, note, tone = 'blue' }) {
  return (
    <article className={`spizy-notification-kpi ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function buildLiveNotificationAlerts({ orders, dayClosing, monthClose, vatClose, inventoryItems, todayKey, monthKey, currency, rules }) {
  const enabled = new Set(rules.filter((rule) => rule.enabled).map((rule) => rule.key))
  const alerts = []

  const failedPayments = orders.filter((order) => isPaymentFailed(order))
  if (enabled.has('payment_failed') && failedPayments.length > 0) {
    alerts.push({
      key: 'payment_failed_today',
      ruleKey: 'payment_failed',
      title: 'Payment failures need review',
      message: `${failedPayments.length} online payment${failedPayments.length === 1 ? '' : 's'} failed or need gateway review today.`,
      metric: formatMoney(currency, sumOrders(failedPayments)),
      priority: 'high',
      section: 'orders',
      actionLabel: 'Open Orders',
      sourceType: 'restaurant_orders',
      metadata: { order_ids: failedPayments.map((order) => order.id) },
    })
  }

  const billRequests = orders.filter((order) => order.status === 'bill_requested')
  if (enabled.has('customer_completed_bill') && billRequests.length > 0) {
    alerts.push({
      key: 'bill_requested_today',
      ruleKey: 'customer_completed_bill',
      title: 'Customer completion requests',
      message: `${billRequests.length} table/customer order${billRequests.length === 1 ? '' : 's'} requested bill or completion.`,
      metric: formatMoney(currency, sumOrders(billRequests)),
      priority: 'high',
      section: 'orders',
      actionLabel: 'Complete Bills',
      sourceType: 'restaurant_orders',
      metadata: { order_ids: billRequests.map((order) => order.id) },
    })
  }

  const codPending = orders.filter((order) => isCodPending(order))
  if (enabled.has('cod_pending') && codPending.length > 0) {
    alerts.push({
      key: 'cod_pending_today',
      ruleKey: 'cod_pending',
      title: 'COD collections pending',
      message: `${codPending.length} COD/unpaid order${codPending.length === 1 ? '' : 's'} still need collection confirmation.`,
      metric: formatMoney(currency, sumOrders(codPending)),
      priority: 'medium',
      section: 'customer-payments',
      actionLabel: 'Open Collections',
      sourceType: 'restaurant_orders',
      metadata: { order_ids: codPending.map((order) => order.id) },
    })
  }

  if (enabled.has('day_closing_due') && dayClosing?.status !== 'closed') {
    alerts.push({
      key: `day_close_${todayKey}`,
      ruleKey: 'day_closing_due',
      title: 'Day closing not completed',
      message: `Today’s Z report for ${formatSimpleDate(todayKey)} is not closed yet.`,
      priority: 'high',
      section: 'day-closing',
      actionLabel: 'Close Day',
      sourceType: 'restaurant_day_closings',
      metadata: { closing_date: todayKey, status: dayClosing?.status || 'missing' },
    })
  }

  if (enabled.has('month_close_due') && monthClose?.status !== 'closed') {
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

  if (enabled.has('vat_period_due') && vatClose?.status !== 'closed') {
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
  if (enabled.has('low_stock') && lowStockItems.length > 0) {
    alerts.push({
      key: 'low_stock_now',
      ruleKey: 'low_stock',
      title: 'Low stock items found',
      message: `${lowStockItems.length} inventory item${lowStockItems.length === 1 ? '' : 's'} appear below minimum stock level.`,
      metric: lowStockItems.slice(0, 3).map((item) => item.name).join(', '),
      priority: 'medium',
      section: 'inventory',
      actionLabel: 'Open Inventory',
      sourceType: 'restaurant_inventory_items',
      metadata: { items: lowStockItems.slice(0, 20) },
    })
  }

  if (enabled.has('staff_task')) {
    const activeOpenOrders = orders.filter((order) => !isFinalOrderStatus(order.status)).length
    if (activeOpenOrders > 0) {
      alerts.push({
        key: 'staff_live_orders',
        ruleKey: 'staff_task',
        title: 'Staff follow-up needed',
        message: `${activeOpenOrders} live order${activeOpenOrders === 1 ? '' : 's'} may need waiter/kitchen follow-up or shift handover note.`,
        priority: 'low',
        section: 'shift-closing',
        actionLabel: 'Open Shift Closing',
        sourceType: 'restaurant_orders',
        metadata: { open_order_count: activeOpenOrders },
      })
    }
  }

  return alerts
}

function isPaymentFailed(order) {
  const status = String(order.payment_status || '').toLowerCase()
  const gatewayStatus = String(order.gateway_payment_status || order.online_payment_status || '').toLowerCase()

  return ['failed', 'payment_failed', 'cancelled', 'expired'].includes(status) ||
    ['failed', 'payment_failed', 'cancelled', 'expired'].includes(gatewayStatus)
}

function isCodPending(order) {
  const paymentMethod = String(order.payment_method || order.delivery_payment_type || '').toLowerCase()
  const status = String(order.payment_status || '').toLowerCase()

  return ['cod', 'cash_on_delivery', 'unpaid', 'cash'].includes(paymentMethod) &&
    !['paid', 'refunded'].includes(status) &&
    String(order.status || '').toLowerCase() !== 'cancelled'
}

function isFinalOrderStatus(status) {
  return ['completed', 'cancelled', 'delivered'].includes(String(status || '').toLowerCase())
}

function sumOrders(orders) {
  return orders.reduce((total, order) => total + Number(order.total_amount || order.grand_total || 0), 0)
}

function normalizeLowStockItems(items) {
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

function formatLoadNote(label, error) {
  if (!error) return ''

  if (error.code === '42P01') return `${label} table not installed yet`
  if (error.code === 'PGRST116') return ''

  return `${label}: ${error.message}`
}

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10)
}

function getDateRangeIso(dateKey) {
  const start = new Date(`${dateKey}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

function formatSimpleDate(dateKey) {
  if (!dateKey) return '-'

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(`${dateKey}T00:00:00`))
}

function formatDateTime(value) {
  if (!value) return '-'

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatMoney(currency, amount) {
  return `${currency} ${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default RestaurantNotificationsManagement
