import { useCallback, useEffect, useMemo, useState } from 'react'
import { CreditCard, RefreshCcw, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import './SuperAdminSubscriptionsManagement.css'

function SuperAdminSubscriptionsManagement({ onStatsRefresh }) {
  const [restaurants, setRestaurants] = useState([])
  const [attempts, setAttempts] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState('')
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setMessage('')

    const [restaurantResult, attemptsResult] = await Promise.all([
      supabase
        .from('restaurants')
        .select('id, name, slug, owner_email, subscription_status, subscription_plan, subscription_current_period_start, subscription_current_period_end, subscription_grace_until, created_at')
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('spizy_subscription_payment_attempts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    if (restaurantResult.error) setMessage(restaurantResult.error.message)
    setRestaurants(restaurantResult.data || [])
    setAttempts(attemptsResult.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const stats = useMemo(() => {
    const trial = restaurants.filter((restaurant) => String(restaurant.subscription_status || '').toLowerCase().includes('trial')).length
    const active = restaurants.filter((restaurant) => ['active', 'paid', 'subscribed'].includes(String(restaurant.subscription_status || '').toLowerCase())).length
    const expired = restaurants.filter((restaurant) => ['expired', 'suspended', 'cancelled', 'past_due'].includes(String(restaurant.subscription_status || '').toLowerCase())).length
    const yearly = restaurants.filter((restaurant) => String(restaurant.subscription_plan || '').toLowerCase().includes('year')).length

    return { trial, active, expired, yearly }
  }, [restaurants])

  const runAction = async (restaurant, action) => {
    setUpdatingId(`${restaurant.id}-${action}`)
    setMessage('')

    const { data, error } = await supabase.functions.invoke('manage-spizy-subscriptions', {
      body: {
        action,
        restaurant_id: restaurant.id,
      },
    })

    if (error || data?.error) {
      setMessage(data?.error || error?.message || 'Subscription update failed.')
    } else {
      setMessage('Subscription updated successfully.')
      await loadData()
      if (onStatsRefresh) onStatsRefresh()
    }

    setUpdatingId('')
  }

  return (
    <section className="super-subscription-management management-section">
      <div className="management-header">
        <div>
          <p className="pricing-label">Super Admin</p>
          <h2>Subscription Management</h2>
          <span>Manage trial, monthly, yearly, expired and manually extended restaurant subscriptions.</span>
        </div>

        <button type="button" className="tiny-button" onClick={loadData} disabled={loading}>
          <RefreshCcw size={15} />
          Refresh
        </button>
      </div>

      <div className="super-sub-kpis">
        <SubKpi icon={<CreditCard size={20} />} label="Active" value={stats.active} />
        <SubKpi icon={<ShieldCheck size={20} />} label="Trials" value={stats.trial} />
        <SubKpi icon={<CreditCard size={20} />} label="Yearly" value={stats.yearly} />
        <SubKpi icon={<RefreshCcw size={20} />} label="Expired/Suspended" value={stats.expired} />
      </div>

      {message && <div className="auth-message">{message}</div>}

      <div className="restaurants-table-wrap">
        <table className="restaurants-table">
          <thead>
            <tr>
              <th>Restaurant</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Period</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {restaurants.length === 0 ? (
              <tr><td colSpan="5">{loading ? 'Loading subscriptions...' : 'No restaurants found.'}</td></tr>
            ) : restaurants.map((restaurant) => (
              <tr key={restaurant.id}>
                <td><strong>{restaurant.name || 'Restaurant'}</strong><span>{restaurant.owner_email || restaurant.slug || restaurant.id}</span></td>
                <td><span className={`status-pill ${restaurant.subscription_status || 'trialing'}`}>{restaurant.subscription_status || 'trialing'}</span></td>
                <td>{formatTitle(restaurant.subscription_plan || 'trial')}</td>
                <td>{formatPeriod(restaurant)}</td>
                <td>
                  <div className="table-actions">
                    <button type="button" className="tiny-button" onClick={() => runAction(restaurant, 'extend_trial_7_days')} disabled={Boolean(updatingId)}>Extend 7d</button>
                    <button type="button" className="tiny-button success" onClick={() => runAction(restaurant, 'activate_monthly')} disabled={Boolean(updatingId)}>Monthly</button>
                    <button type="button" className="tiny-button success" onClick={() => runAction(restaurant, 'activate_yearly')} disabled={Boolean(updatingId)}>Yearly</button>
                    <button type="button" className="tiny-button danger" onClick={() => runAction(restaurant, 'suspend')} disabled={Boolean(updatingId)}>Suspend</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="super-sub-attempts">
        <h3>Recent Mamo Payment Attempts</h3>
        <div className="restaurants-table-wrap">
          <table className="restaurants-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {attempts.length === 0 ? (
                <tr><td colSpan="5">No payment attempts yet.</td></tr>
              ) : attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td><strong>{attempt.payment_reference || attempt.mamo_payment_link_id || attempt.id}</strong></td>
                  <td>{formatTitle(attempt.plan_key || attempt.plan || 'subscription')}</td>
                  <td>AED {Number(attempt.final_amount ?? attempt.amount ?? 0).toFixed(2)}</td>
                  <td>{attempt.status || 'created'}</td>
                  <td>{formatDate(attempt.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function SubKpi({ icon, label, value }) {
  return (
    <article className="super-sub-kpi">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function formatPeriod(restaurant) {
  const start = restaurant.subscription_current_period_start ? formatDate(restaurant.subscription_current_period_start) : '—'
  const end = restaurant.subscription_current_period_end ? formatDate(restaurant.subscription_current_period_end) : '—'
  return `${start} → ${end}`
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
  } catch {
    return value
  }
}

function formatTitle(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default SuperAdminSubscriptionsManagement
