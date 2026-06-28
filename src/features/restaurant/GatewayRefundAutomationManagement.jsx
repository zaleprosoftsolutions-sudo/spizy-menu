import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  FileText,
  RefreshCcw,
  RotateCcw,
  Save,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './GatewayRefundAutomationManagement.css'

const gatewayOptions = [
  { key: 'stripe', label: 'Stripe' },
  { key: 'ziina', label: 'Ziina' },
  { key: 'razorpay', label: 'Razorpay' },
  { key: 'cashfree', label: 'Cashfree' },
  { key: 'phonepe', label: 'PhonePe' },
  { key: 'network', label: 'Network / N-Genius' },
  { key: 'paypal', label: 'PayPal' },
  { key: 'manual', label: 'Manual / Other' },
]

const statusOptions = [
  { value: 'needs_manual_action', label: 'Needs manual action' },
  { value: 'queued', label: 'Queued for API refund' },
  { value: 'processing', label: 'Processing' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const emptyAttemptForm = {
  order_id: '',
  gateway: 'manual',
  amount: '',
  reason: '',
  notes: '',
}

function GatewayRefundAutomationManagement({ restaurant }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState('')
  const [message, setMessage] = useState('')
  const [orders, setOrders] = useState([])
  const [refunds, setRefunds] = useState([])
  const [attempts, setAttempts] = useState([])
  const [restaurantSettings, setRestaurantSettings] = useState(null)
  const [form, setForm] = useState(emptyAttemptForm)
  const [gatewayFilter, setGatewayFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const currency = restaurant?.currency || 'AED'

  const loadRefundCenter = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)
    setMessage('')

    const [restaurantResult, ordersResult, refundsResult, attemptsResult] = await Promise.all([
      supabase
        .from('restaurants')
        .select('id, currency, payment_gateway_settings')
        .eq('id', restaurant.id)
        .maybeSingle(),
      supabase
        .from('restaurant_orders')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(150),
      supabase
        .from('restaurant_payment_refunds')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(120),
      supabase
        .from('restaurant_gateway_refund_attempts')
        .select(
          `
            *,
            order:restaurant_orders (
              id,
              order_code,
              public_order_number,
              customer_name,
              payment_gateway,
              payment_method,
              total_amount,
              currency
            )
          `,
        )
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(120),
    ])

    if (restaurantResult.error) {
      setMessage(`Settings loading warning: ${restaurantResult.error.message}`)
    }

    if (ordersResult.error) {
      setMessage(`Orders loading failed: ${ordersResult.error.message}`)
    }

    if (refundsResult.error && refundsResult.error.code !== '42P01') {
      setMessage(`Recorded refunds loading warning: ${refundsResult.error.message}`)
    }

    if (attemptsResult.error) {
      const tableMissing = attemptsResult.error.code === '42P01'
      setMessage(
        tableMissing
          ? 'Run the included SQL file first to activate the Gateway Refund Automation Center.'
          : `Refund automation loading failed: ${attemptsResult.error.message}`,
      )
    }

    setRestaurantSettings(restaurantResult.data || null)
    setOrders(ordersResult.data || [])
    setRefunds(refundsResult.data || [])
    setAttempts(attemptsResult.data || [])
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadRefundCenter()
  }, [loadRefundCenter])

  const gatewaySettings = useMemo(
    () => normalizeGatewaySettings(
      restaurantSettings?.payment_gateway_settings || restaurant?.payment_gateway_settings,
    ),
    [restaurant?.payment_gateway_settings, restaurantSettings?.payment_gateway_settings],
  )

  const eligibleOrders = useMemo(() => {
    return orders.filter((order) => {
      const gateway = getOrderGateway(order)
      const paid = isOrderPaid(order)
      const cancelled = ['cancelled', 'voided'].includes(String(order.status || '').toLowerCase())
      return paid || gateway !== 'manual' || cancelled
    })
  }, [orders])

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === form.order_id) || null,
    [form.order_id, orders],
  )

  const filteredAttempts = useMemo(() => {
    return attempts.filter((attempt) => {
      if (gatewayFilter !== 'all' && attempt.gateway !== gatewayFilter) return false
      if (statusFilter !== 'all' && attempt.status !== statusFilter) return false
      return true
    })
  }, [attempts, gatewayFilter, statusFilter])

  const summary = useMemo(
    () => buildRefundAutomationSummary({
      attempts,
      refunds,
      gatewaySettings,
      orders,
    }),
    [attempts, gatewaySettings, orders, refunds],
  )

  const updateForm = (key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value }

      if (key === 'order_id') {
        const order = orders.find((item) => item.id === value)
        if (order) {
          next.gateway = getOrderGateway(order)
          next.amount = numberToInput(getSafeNumber(order.total_amount))
        }
      }

      return next
    })
    setMessage('')
  }

  const handleCreateAttempt = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const amount = Number(form.amount || 0)

    if (amount <= 0) {
      setMessage('Enter a refund amount greater than zero.')
      return
    }

    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()
    const order = selectedOrder
    const gateway = form.gateway || getOrderGateway(order) || 'manual'

    const { error } = await supabase.from('restaurant_gateway_refund_attempts').insert({
      restaurant_id: restaurant.id,
      order_id: form.order_id || null,
      gateway,
      refund_mode: gateway === 'manual' ? 'manual_record' : 'api_readiness',
      amount,
      currency: order?.currency || restaurant.currency || currency,
      status: 'needs_manual_action',
      gateway_order_id: order?.gateway_order_id || null,
      gateway_transaction_id: order?.gateway_transaction_id || null,
      reason: form.reason.trim() || null,
      notes:
        form.notes.trim() ||
        'Created from Spizy Gateway Refund Automation Center. Actual gateway refund should be completed in the restaurant-owned gateway dashboard until API automation is enabled and tested.',
      metadata: {
        source: 'gateway_refund_automation_center',
        order_code: order?.order_code || order?.public_order_number || null,
        payment_method: order?.payment_method || null,
        payment_gateway: order?.payment_gateway || null,
      },
      created_by: userData?.user?.id || null,
    })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setForm(emptyAttemptForm)
    await loadRefundCenter()
    setMessage('Refund action record created. The owner can now complete it manually or keep it ready for future API automation.')
  }

  const updateAttemptStatus = async (attempt, status) => {
    setUpdatingId(attempt.id)
    setMessage('')

    const { data: userData } = await supabase.auth.getUser()
    const finished = ['succeeded', 'failed', 'cancelled'].includes(status)

    const { error } = await supabase
      .from('restaurant_gateway_refund_attempts')
      .update({
        status,
        attempted_at: finished ? new Date().toISOString() : attempt.attempted_at,
        attempted_by: finished ? userData?.user?.id || null : attempt.attempted_by,
      })
      .eq('restaurant_id', restaurant.id)
      .eq('id', attempt.id)

    setUpdatingId('')

    if (error) {
      setMessage(error.message)
      return
    }

    await loadRefundCenter()
  }

  const printReport = () => {
    if (typeof window !== 'undefined') window.print()
  }

  const exportCsv = () => {
    const rows = [
      ['Created', 'Order', 'Gateway', 'Amount', 'Currency', 'Status', 'Reason', 'Notes'],
      ...filteredAttempts.map((attempt) => [
        formatDateTime(attempt.created_at),
        getAttemptOrderLabel(attempt),
        getGatewayLabel(attempt.gateway),
        formatPlainNumber(attempt.amount),
        attempt.currency || currency,
        getStatusLabel(attempt.status),
        attempt.reason || '',
        attempt.notes || '',
      ]),
    ]

    downloadCsv(`spizy-refund-automation-${getTodayInputDate()}.csv`, rows)
  }

  return (
    <section className="gateway-refund-shell">
      <div className="gateway-refund-hero">
        <div>
          <p className="pricing-label">Gateway Refund Automation</p>
          <h1>Refund Automation Center</h1>
          <p>
            Track refund readiness for restaurant-owned gateways. Spizy records the refund workflow;
            actual money refunds should stay inside the restaurant’s own gateway dashboard until each API automation is enabled and tested.
          </p>
        </div>

        <div className="gateway-refund-actions">
          <button type="button" onClick={loadRefundCenter} disabled={loading}>
            <RefreshCcw size={17} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" onClick={printReport}>
            <FileText size={17} />
            Print
          </button>
          <button type="button" onClick={exportCsv}>
            <Download size={17} />
            Export CSV
          </button>
        </div>
      </div>

      <div className="gateway-refund-warning">
        <ShieldCheck size={18} />
        <div>
          <strong>Important payment rule</strong>
          <span>
            These are restaurant-owned customer-payment gateways. Do not refund customer payments from a Spizy/Zalepro-owned gateway account.
          </span>
        </div>
      </div>

      {message && (
        <div className="gateway-refund-message">
          <AlertTriangle size={17} />
          <span>{message}</span>
        </div>
      )}

      <div className="gateway-refund-kpi-grid">
        <RefundKpiCard
          icon={<RotateCcw size={20} />}
          label="Refund records"
          value={String(summary.recordedRefundCount)}
          note={formatMoney(summary.recordedRefundAmount, currency)}
        />
        <RefundKpiCard
          icon={<CreditCard size={20} />}
          label="API-ready gateways"
          value={String(summary.readyGatewayCount)}
          note={`${summary.enabledGatewayCount} enabled gateway${summary.enabledGatewayCount === 1 ? '' : 's'}`}
        />
        <RefundKpiCard
          icon={<Clock3 size={20} />}
          label="Manual action"
          value={String(summary.manualActionCount)}
          note="Needs gateway dashboard action"
          tone={summary.manualActionCount > 0 ? 'warning' : 'good'}
        />
        <RefundKpiCard
          icon={<XCircle size={20} />}
          label="Failed attempts"
          value={String(summary.failedCount)}
          note="Review before retry"
          tone={summary.failedCount > 0 ? 'danger' : 'good'}
        />
      </div>

      <div className="gateway-refund-main-grid">
        <section className="gateway-refund-panel">
          <div className="gateway-refund-panel-head">
            <div>
              <p className="pricing-label">Gateway Readiness</p>
              <h2>Restaurant-owned accounts</h2>
            </div>
          </div>

          <div className="gateway-refund-readiness-grid">
            {gatewayOptions.filter((gateway) => gateway.key !== 'manual').map((gateway) => {
              const readiness = getGatewayReadiness(gateway.key, gatewaySettings)

              return (
                <article className={`gateway-readiness-card ${readiness.tone}`} key={gateway.key}>
                  <div>
                    <strong>{gateway.label}</strong>
                    <span>{readiness.label}</span>
                  </div>
                  <small>{readiness.note}</small>
                </article>
              )
            })}
          </div>
        </section>

        <section className="gateway-refund-panel">
          <div className="gateway-refund-panel-head">
            <div>
              <p className="pricing-label">Create Action</p>
              <h2>Record refund task</h2>
            </div>
          </div>

          <form className="gateway-refund-form" onSubmit={handleCreateAttempt}>
            <label>
              <span>Order</span>
              <select value={form.order_id} onChange={(event) => updateForm('order_id', event.target.value)}>
                <option value="">Manual refund / no linked order</option>
                {eligibleOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {getOrderLabel(order)} • {formatMoney(order.total_amount, order.currency || currency)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Gateway</span>
              <select value={form.gateway} onChange={(event) => updateForm('gateway', event.target.value)}>
                {gatewayOptions.map((gateway) => (
                  <option key={gateway.key} value={gateway.key}>{gateway.label}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Refund amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) => updateForm('amount', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              <span>Reason</span>
              <input
                value={form.reason}
                onChange={(event) => updateForm('reason', event.target.value)}
                placeholder="Customer cancellation, item issue, duplicate payment..."
              />
            </label>

            <label className="gateway-refund-wide-field">
              <span>Notes</span>
              <textarea
                rows="3"
                value={form.notes}
                onChange={(event) => updateForm('notes', event.target.value)}
                placeholder="Add gateway dashboard reference, approval note or manager instruction."
              />
            </label>

            <button type="submit" className="gateway-refund-primary" disabled={saving}>
              <Save size={17} />
              {saving ? 'Saving...' : 'Create Refund Action'}
            </button>
          </form>
        </section>
      </div>

      <section className="gateway-refund-panel gateway-refund-print-area">
        <div className="gateway-refund-panel-head">
          <div>
            <p className="pricing-label">Automation Queue</p>
            <h2>Refund action history</h2>
          </div>
          <div className="gateway-refund-filter-row">
            <select value={gatewayFilter} onChange={(event) => setGatewayFilter(event.target.value)}>
              <option value="all">All gateways</option>
              {gatewayOptions.map((gateway) => (
                <option key={gateway.key} value={gateway.key}>{gateway.label}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="gateway-refund-loading">
            <RefreshCcw size={18} />
            Loading refund center...
          </div>
        ) : filteredAttempts.length === 0 ? (
          <div className="gateway-refund-empty">
            <RotateCcw size={20} />
            No refund action records yet.
          </div>
        ) : (
          <div className="gateway-refund-table-wrap">
            <table className="gateway-refund-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Order</th>
                  <th>Gateway</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{formatDateTime(attempt.created_at)}</td>
                    <td>{getAttemptOrderLabel(attempt)}</td>
                    <td>{getGatewayLabel(attempt.gateway)}</td>
                    <td>{formatMoney(attempt.amount, attempt.currency || currency)}</td>
                    <td><StatusChip status={attempt.status} /></td>
                    <td>{attempt.reason || '—'}</td>
                    <td>
                      <div className="gateway-refund-table-actions">
                        <button
                          type="button"
                          onClick={() => updateAttemptStatus(attempt, 'succeeded')}
                          disabled={updatingId === attempt.id || attempt.status === 'succeeded'}
                        >
                          <CheckCircle2 size={14} />
                          Done
                        </button>
                        <button
                          type="button"
                          onClick={() => updateAttemptStatus(attempt, 'failed')}
                          disabled={updatingId === attempt.id || attempt.status === 'failed'}
                        >
                          <XCircle size={14} />
                          Failed
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}

function RefundKpiCard({ icon, label, value, note, tone = 'neutral' }) {
  return (
    <article className={`gateway-refund-kpi ${tone}`}>
      <div className="gateway-refund-kpi-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  )
}

function StatusChip({ status }) {
  return <span className={`gateway-refund-status ${status || 'draft'}`}>{getStatusLabel(status)}</span>
}

function buildRefundAutomationSummary({ attempts, refunds, gatewaySettings, orders }) {
  const recordedRefundAmount = refunds.reduce(
    (total, refund) => total + getSafeNumber(refund.refund_amount ?? refund.amount),
    0,
  )
  const enabledGatewayCount = gatewayOptions
    .filter((gateway) => gateway.key !== 'manual')
    .filter((gateway) => getGatewayReadiness(gateway.key, gatewaySettings).enabled)
    .length
  const readyGatewayCount = gatewayOptions
    .filter((gateway) => gateway.key !== 'manual')
    .filter((gateway) => getGatewayReadiness(gateway.key, gatewaySettings).ready)
    .length
  const manualActionCount = attempts.filter((attempt) =>
    ['draft', 'needs_manual_action', 'queued', 'processing'].includes(attempt.status),
  ).length
  const failedCount = attempts.filter((attempt) => attempt.status === 'failed').length
  const refundableOrderCount = orders.filter((order) => isOrderPaid(order)).length

  return {
    recordedRefundCount: refunds.length,
    recordedRefundAmount,
    enabledGatewayCount,
    readyGatewayCount,
    manualActionCount,
    failedCount,
    refundableOrderCount,
  }
}

function getGatewayReadiness(gatewayKey, gatewaySettings) {
  const settings = gatewaySettings?.[gatewayKey] || {}
  const enabled = settings.enabled === true
  const connectionStatus = String(settings.connection_status || '').toLowerCase()
  const credentialStatus = String(settings.credential_status || '').toLowerCase()
  const ready =
    enabled &&
    ['connected', 'verified', 'ready'].includes(connectionStatus) &&
    ['active', 'saved', 'available', 'verified', 'configured'].includes(credentialStatus)

  if (ready) {
    return {
      enabled,
      ready,
      tone: 'ready',
      label: 'Ready for API testing',
      note: 'Credentials look connected. Test refunds carefully before automation.',
    }
  }

  if (enabled) {
    return {
      enabled,
      ready,
      tone: 'warning',
      label: 'Enabled, not fully verified',
      note: 'Complete credential test/verification before enabling real API refunds.',
    }
  }

  return {
    enabled,
    ready,
    tone: 'manual',
    label: 'Manual only',
    note: 'Refund inside the restaurant-owned gateway dashboard.',
  }
}

function normalizeGatewaySettings(value) {
  if (!value || typeof value !== 'object') return {}
  return value
}

function getOrderGateway(order) {
  if (!order) return 'manual'
  const gateway = String(order.payment_gateway || order.gateway || '').toLowerCase()
  if (gateway) return gateway
  const method = String(order.payment_method || '').toLowerCase()
  return gatewayOptions.some((item) => item.key === method) ? method : 'manual'
}

function isOrderPaid(order) {
  const status = String(order?.payment_status || '').toLowerCase()
  return ['paid', 'refunded', 'partially_refunded', 'partial_refund'].includes(status)
}

function getOrderLabel(order) {
  return order?.order_code || order?.public_order_number || order?.id?.slice(0, 8) || 'Order'
}

function getAttemptOrderLabel(attempt) {
  return attempt?.order?.order_code || attempt?.order?.public_order_number || attempt?.order_id?.slice(0, 8) || 'Manual refund'
}

function getGatewayLabel(value) {
  return gatewayOptions.find((gateway) => gateway.key === value)?.label || value || 'Manual / Other'
}

function getStatusLabel(value) {
  return statusOptions.find((status) => status.value === value)?.label || value || 'Draft'
}

function getSafeNumber(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function numberToInput(value) {
  const number = getSafeNumber(value)
  return number > 0 ? String(number) : ''
}

function formatMoney(value, currency = 'AED') {
  return `${currency} ${getSafeNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatPlainNumber(value) {
  return getSafeNumber(value).toFixed(2)
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTodayInputDate() {
  return new Date().toISOString().slice(0, 10)
}

function escapeCsvCell(value) {
  const text = String(value ?? '')
  if (!/[",\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
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

export default GatewayRefundAutomationManagement
