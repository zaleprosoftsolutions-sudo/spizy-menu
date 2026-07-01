import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Download,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './SuperAdminSubscriptionsManagement.css'

const statusOptions = [
  { value: 'trialing', label: 'Trialing' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past due' },
  { value: 'expired', label: 'Expired' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'cancelled', label: 'Cancelled' },
]

const planOptions = [
  { value: 'qr_menu_monthly', label: 'QR Menu Monthly - AED 75', cycle: 'monthly' },
  { value: 'qr_menu_yearly', label: 'QR Menu Yearly - AED 750', cycle: 'yearly' },
]

function SuperAdminSubscriptionsManagement({ onStatsRefresh }) {
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [message, setMessage] = useState(null)
  const [restaurants, setRestaurants] = useState([])
  const [attempts, setAttempts] = useState([])
  const [invoices, setInvoices] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const loadSubscriptions = useCallback(async () => {
    setLoading(true)

    const { data, error } = await supabase.functions.invoke(
      'manage-spizy-subscriptions',
      { body: { action: 'list' } },
    )

    setLoading(false)

    if (error || data?.error) {
      setMessage({
        type: 'error',
        text:
          data?.error ||
          error?.message ||
          'Unable to load subscription management data.',
      })
      return
    }

    setRestaurants(data?.restaurants || [])
    setAttempts(data?.attempts || [])
    setInvoices(data?.invoices || [])
    setMessage(null)
  }, [])

  useEffect(() => {
    loadSubscriptions()
  }, [loadSubscriptions])

  const summary = useMemo(() => {
    const total = restaurants.length
    const active = restaurants.filter((item) => item.subscription_status === 'active').length
    const trialing = restaurants.filter((item) => item.subscription_status === 'trialing').length
    const risk = restaurants.filter((item) =>
      ['past_due', 'expired', 'suspended', 'cancelled'].includes(item.subscription_status),
    ).length
    const monthlyRevenue = restaurants
      .filter((item) => item.subscription_status === 'active')
      .reduce((totalAmount, item) => {
        if (item.subscription_plan === 'qr_menu_yearly') return totalAmount + 62.5
        return totalAmount + 75
      }, 0)

    return { total, active, trialing, risk, monthlyRevenue }
  }, [restaurants])

  const filteredRestaurants = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return restaurants.filter((restaurant) => {
      if (statusFilter !== 'all' && restaurant.subscription_status !== statusFilter) {
        return false
      }

      if (!keyword) return true

      return [
        restaurant.name,
        restaurant.slug,
        restaurant.owner_email,
        restaurant.subscription_status,
        restaurant.subscription_plan,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [restaurants, search, statusFilter])

  const updateRestaurantSubscription = async ({ restaurant, status, planKey, periodDays }) => {
    if (!restaurant?.id) return

    setSavingId(restaurant.id)

    const now = new Date()
    const end = new Date(now)
    end.setDate(now.getDate() + Number(periodDays || 30))

    const plan = planOptions.find((item) => item.value === planKey) || planOptions[0]

    const { data, error } = await supabase.functions.invoke(
      'manage-spizy-subscriptions',
      {
        body: {
          action: 'update_subscription',
          restaurant_id: restaurant.id,
          subscription_status: status,
          subscription_plan: plan.value,
          subscription_current_period_start: formatDateInput(now),
          subscription_current_period_end: formatDateInput(end),
          subscription_grace_until: formatDateInput(addDays(end, 5)),
        },
      },
    )

    setSavingId('')

    if (error || data?.error) {
      setMessage({
        type: 'error',
        text: data?.error || error?.message || 'Unable to update subscription.',
      })
      return
    }

    setMessage({ type: 'success', text: 'Subscription updated successfully.' })
    await loadSubscriptions()
    if (onStatsRefresh) onStatsRefresh()
  }

  const extendTrial = async (restaurant, days = 7) => {
    if (!restaurant?.id) return

    setSavingId(restaurant.id)

    const { data, error } = await supabase.functions.invoke(
      'manage-spizy-subscriptions',
      {
        body: {
          action: 'extend_trial',
          restaurant_id: restaurant.id,
          days,
        },
      },
    )

    setSavingId('')

    if (error || data?.error) {
      setMessage({
        type: 'error',
        text: data?.error || error?.message || 'Unable to extend trial.',
      })
      return
    }

    setMessage({ type: 'success', text: `Trial extended by ${days} days.` })
    await loadSubscriptions()
    if (onStatsRefresh) onStatsRefresh()
  }

  const exportCsv = () => {
    const rows = [
      ['Restaurant', 'Slug', 'Owner Email', 'Status', 'Plan', 'Period End', 'Grace Until'],
      ...filteredRestaurants.map((restaurant) => [
        restaurant.name || '',
        restaurant.slug || '',
        restaurant.owner_email || '',
        restaurant.subscription_status || '',
        restaurant.subscription_plan || '',
        restaurant.subscription_current_period_end || '',
        restaurant.subscription_grace_until || '',
      ]),
    ]

    downloadCsv(`spizy-subscriptions-${formatDateInput(new Date())}.csv`, rows)
  }

  return (
    <section className="super-subscriptions-shell">
      <div className="super-subscriptions-hero">
        <div>
          <p className="pricing-label">Super Admin</p>
          <h1>Subscription management</h1>
          <p>
            Manage restaurant trials, monthly/yearly plans, grace periods and manual
            status changes. Mamo Pay remains only for Spizy SaaS subscription billing.
          </p>
        </div>

        <div className="super-subscriptions-actions">
          <button type="button" onClick={exportCsv} disabled={loading || filteredRestaurants.length === 0}>
            <Download size={17} />
            Export
          </button>
          <button type="button" onClick={loadSubscriptions} disabled={loading}>
            <RefreshCw size={17} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {message && <div className={`super-subscriptions-message ${message.type}`}>{message.text}</div>}

      <div className="super-subscriptions-kpis">
        <Kpi icon={<CreditCard size={20} />} label="Active" value={summary.active} note="Paid restaurants" />
        <Kpi icon={<CalendarDays size={20} />} label="Trial" value={summary.trialing} note="Trial restaurants" />
        <Kpi icon={<XCircle size={20} />} label="Needs action" value={summary.risk} note="Expired / suspended" />
        <Kpi icon={<TrendingUp size={20} />} label="Est. MRR" value={`AED ${summary.monthlyRevenue.toFixed(2)}`} note="Monthly equivalent" />
      </div>

      <div className="super-subscriptions-toolbar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search restaurant, slug, owner email..."
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="super-subscriptions-table-wrap">
        <table className="super-subscriptions-table">
          <thead>
            <tr>
              <th>Restaurant</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Period</th>
              <th>Quick actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5">Loading subscriptions...</td></tr>
            ) : filteredRestaurants.length === 0 ? (
              <tr><td colSpan="5">No restaurants matched this filter.</td></tr>
            ) : (
              filteredRestaurants.map((restaurant) => (
                <tr key={restaurant.id}>
                  <td>
                    <strong>{restaurant.name || 'Restaurant'}</strong>
                    <span>{restaurant.slug || restaurant.owner_email || 'No slug/email'}</span>
                  </td>
                  <td>
                    <span className={`subscription-status-pill ${restaurant.subscription_status || 'trialing'}`}>
                      {formatTitle(restaurant.subscription_status || 'trialing')}
                    </span>
                  </td>
                  <td>
                    <strong>{formatPlan(restaurant.subscription_plan)}</strong>
                    <span>{restaurant.subscription_payment_gateway || 'mamo_pay ready'}</span>
                  </td>
                  <td>
                    <strong>{formatDate(restaurant.subscription_current_period_end || restaurant.subscription_trial_ends_at)}</strong>
                    <span>Grace: {formatDate(restaurant.subscription_grace_until)}</span>
                  </td>
                  <td>
                    <div className="super-subscription-row-actions">
                      <button
                        type="button"
                        disabled={savingId === restaurant.id}
                        onClick={() => extendTrial(restaurant, 7)}
                      >
                        +7d trial
                      </button>
                      <button
                        type="button"
                        disabled={savingId === restaurant.id}
                        onClick={() => updateRestaurantSubscription({
                          restaurant,
                          status: 'active',
                          planKey: 'qr_menu_monthly',
                          periodDays: 30,
                        })}
                      >
                        Active monthly
                      </button>
                      <button
                        type="button"
                        disabled={savingId === restaurant.id}
                        onClick={() => updateRestaurantSubscription({
                          restaurant,
                          status: 'active',
                          planKey: 'qr_menu_yearly',
                          periodDays: 365,
                        })}
                      >
                        Active yearly
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={savingId === restaurant.id}
                        onClick={() => updateRestaurantSubscription({
                          restaurant,
                          status: 'suspended',
                          planKey: restaurant.subscription_plan || 'qr_menu_monthly',
                          periodDays: 0,
                        })}
                      >
                        Suspend
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="super-subscriptions-foot-grid">
        <section>
          <div className="super-subscriptions-panel-head">
            <CheckCircle2 size={19} />
            <div>
              <strong>Latest paid invoices</strong>
              <span>{invoices.length} recent records</span>
            </div>
          </div>
          <div className="super-subscriptions-mini-list">
            {invoices.slice(0, 6).map((invoice) => (
              <article key={invoice.id}>
                <strong>{invoice.invoice_number || 'Invoice'}</strong>
                <span>{invoice.plan_name || invoice.plan_key} • AED {Number(invoice.amount || 0).toFixed(2)}</span>
              </article>
            ))}
            {invoices.length === 0 && <div className="super-empty">No invoices found yet.</div>}
          </div>
        </section>

        <section>
          <div className="super-subscriptions-panel-head">
            <ShieldCheck size={19} />
            <div>
              <strong>Latest payment attempts</strong>
              <span>{attempts.length} recent records</span>
            </div>
          </div>
          <div className="super-subscriptions-mini-list">
            {attempts.slice(0, 6).map((attempt) => (
              <article key={attempt.id}>
                <strong>{formatTitle(attempt.status || 'created')}</strong>
                <span>{attempt.plan_name || attempt.plan_key} • AED {Number(attempt.amount || 0).toFixed(2)}</span>
              </article>
            ))}
            {attempts.length === 0 && <div className="super-empty">No payment attempts found yet.</div>}
          </div>
        </section>
      </div>
    </section>
  )
}

function Kpi({ icon, label, value, note }) {
  return (
    <article>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function formatPlan(value) {
  if (value === 'qr_menu_yearly') return 'QR Menu Yearly'
  if (value === 'qr_menu_monthly') return 'QR Menu Monthly'
  return formatTitle(value || 'QR Menu Monthly')
}

function formatTitle(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value) {
  if (!value) return 'Not set'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function formatDateInput(value) {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(value, days) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  date.setDate(date.getDate() + Number(days || 0))
  return date
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default SuperAdminSubscriptionsManagement
