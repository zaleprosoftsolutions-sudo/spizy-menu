import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Gift,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './SubscriptionCenterScratch.css'

const subscriptionPlans = [
  {
    key: 'qr_menu_monthly',
    name: 'Monthly Plan',
    amount: 75,
    currency: 'AED',
    cycle: 'month',
    billingCycle: 'monthly',
    badge: 'Flexible',
    description: 'Pay monthly for QR menu, POS, orders, kitchen, day closing and restaurant operations.',
    features: ['QR menu and table ordering', 'POS, Orders and Kitchen Display', 'Day Closing and Cash & Bank', 'Upgrade to yearly anytime'],
  },
  {
    key: 'qr_menu_yearly',
    name: 'Yearly Plan',
    amount: 750,
    currency: 'AED',
    cycle: 'year',
    billingCycle: 'yearly',
    badge: 'Best value',
    description: 'Pay yearly and save AED 150 compared to 12 monthly payments.',
    features: ['12 months access', 'AED 150 yearly saving', 'Priority launch support', 'Best for active restaurants'],
  },
]

function SubscriptionCenterScratch({ restaurant, profile }) {
  const [couponCode, setCouponCode] = useState('')
  const [creatingPlan, setCreatingPlan] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [invoices, setInvoices] = useState([])

  const subscriptionState = useMemo(() => buildSubscriptionState(restaurant), [restaurant])

  const loadBillingHistory = useCallback(async () => {
    if (!restaurant?.id) {
      setLoading(false)
      return
    }

    setLoading(true)

    const [attemptsResult, invoicesResult] = await Promise.all([
      supabase
        .from('restaurant_subscription_payment_attempts')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('restaurant_subscription_invoices')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(15),
    ])

    const historyErrors = []
    if (attemptsResult.error && attemptsResult.error.code !== '42P01') {
      historyErrors.push(attemptsResult.error.message)
    }
    if (invoicesResult.error && invoicesResult.error.code !== '42P01') {
      historyErrors.push(invoicesResult.error.message)
    }

    setAttempts(attemptsResult.data || [])
    setInvoices(invoicesResult.data || [])
    setMessage(historyErrors.length > 0 ? {
      type: 'warning',
      title: 'Billing history not fully loaded',
      text: historyErrors.join(' • '),
    } : null)
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadBillingHistory()
  }, [loadBillingHistory])

  const createCheckout = async (plan) => {
    if (!restaurant?.id) {
      setMessage({
        type: 'error',
        title: 'Restaurant not ready',
        text: 'Restaurant ID is missing, so Spizy cannot create a Mamo Pay checkout.',
      })
      return
    }

    setCreatingPlan(plan.key)
    setMessage({
      type: 'info',
      title: 'Creating Mamo Pay checkout',
      text: `Preparing ${plan.name} checkout for ${restaurant?.name || 'this restaurant'}.`,
    })

    const { data, error } = await supabase.functions.invoke('create-mamo-subscription-checkout', {
      body: {
        restaurant_id: restaurant.id,
        plan_key: plan.key,
        billing_cycle: plan.billingCycle,
        coupon_code: couponCode.trim() || null,
      },
    })

    setCreatingPlan('')

    if (error || data?.error) {
      setMessage({
        type: 'error',
        title: 'Mamo checkout failed',
        text: data?.error || error?.message || 'Unable to create Mamo Pay subscription checkout.',
      })
      return
    }

    setMessage({
      type: 'success',
      title: data?.discount_amount > 0 ? 'Discount applied' : 'Mamo checkout ready',
      text: data?.message || 'Redirecting to Mamo Pay checkout now.',
    })

    if (data?.checkout_url) {
      window.location.assign(data.checkout_url)
      return
    }

    await loadBillingHistory()
  }

  return (
    <section className="subscription-scratch-page">
      <div className="subscription-scratch-hero">
        <div>
          <p className="pricing-label">Subscription & Plans</p>
          <h1>Trial, current plan and Mamo Pay billing</h1>
          <p>
            Manage this restaurant’s Spizy Menu subscription. Mamo Pay is used only for Spizy subscription billing, not customer order payments.
          </p>
        </div>

        <div className={`subscription-scratch-status ${subscriptionState.tone}`}>
          <span>{subscriptionState.statusLabel}</span>
          <strong>{subscriptionState.currentPlanLabel}</strong>
          <small>{subscriptionState.endNote}</small>
        </div>
      </div>

      <div className="subscription-scratch-rule">
        <ShieldCheck size={20} />
        <div>
          <strong>Payment separation rule</strong>
          <span>Mamo Pay is for Spizy subscription payments only. Restaurant customer payments must use restaurant-owned gateways.</span>
        </div>
      </div>

      <div className="subscription-scratch-summary-grid">
        <SummaryCard icon={<Sparkles size={20} />} label="Current Status" value={subscriptionState.statusLabel} note={subscriptionState.statusNote} tone={subscriptionState.tone} />
        <SummaryCard icon={<CreditCard size={20} />} label="Current Plan" value={subscriptionState.currentPlanLabel} note={subscriptionState.planNote} />
        <SummaryCard icon={<CalendarDays size={20} />} label={subscriptionState.isActivePaid ? 'Plan Ends In' : 'Trial Ends In'} value={subscriptionState.countdownLabel} note={subscriptionState.endDate ? `Ends ${formatDate(subscriptionState.endDate)}` : 'End date not available'} />
      </div>

      {message && (
        <div className={`subscription-scratch-message ${message.type}`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{message.title}</strong>
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {!subscriptionState.isActivePaid && (
        <div className="subscription-scratch-message info">
          <Sparkles size={18} />
          <div>
            <strong>You are currently on trial</strong>
            <span>No paid monthly or yearly plan is active yet. Choose a plan below to continue with Mamo Pay.</span>
          </div>
        </div>
      )}

      {subscriptionState.isMonthlySubscriber && (
        <div className="subscription-scratch-message info">
          <Sparkles size={18} />
          <div>
            <strong>Yearly upgrade available</strong>
            <span>You are on monthly billing. Upgrade to yearly and save AED 150 compared to monthly billing for 12 months.</span>
          </div>
        </div>
      )}

      <div className="subscription-scratch-coupon">
        <Gift size={19} />
        <div>
          <strong>Discount coupon</strong>
          <span>Enter a Super Admin coupon before checkout.</span>
        </div>
        <input value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Coupon code" />
      </div>

      <div className="subscription-scratch-plan-grid">
        {subscriptionPlans.map((plan) => {
          const isCurrentPlan = subscriptionState.isActivePaid && subscriptionState.currentPlanKey === plan.key
          const isYearlyUpgrade = subscriptionState.isMonthlySubscriber && plan.key === 'qr_menu_yearly'
          const actionLabel = isCurrentPlan
            ? 'Current Active Plan'
            : isYearlyUpgrade
              ? 'Upgrade to Yearly with Mamo Pay'
              : `Subscribe ${plan.name} with Mamo Pay`

          return (
            <article className={`subscription-scratch-plan ${plan.billingCycle} ${isCurrentPlan ? 'current' : ''}`} key={plan.key}>
              <div className="subscription-scratch-plan-badge">{isCurrentPlan ? 'Current' : plan.badge}</div>
              <h2>{plan.name}</h2>
              <p>{plan.description}</p>
              <div className="subscription-scratch-price">
                <strong>{formatMoney(plan.currency, plan.amount)}</strong>
                <span>/{plan.cycle}</span>
              </div>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}><CheckCircle2 size={15} />{feature}</li>
                ))}
              </ul>
              <button type="button" onClick={() => createCheckout(plan)} disabled={creatingPlan === plan.key || isCurrentPlan}>
                {creatingPlan === plan.key ? <RefreshCw size={17} /> : <ExternalLink size={17} />}
                {creatingPlan === plan.key ? 'Creating Mamo link...' : actionLabel}
              </button>
            </article>
          )
        })}
      </div>

      <div className="subscription-scratch-history-grid">
        <HistoryPanel title="Recent Mamo checkout attempts" loading={loading} rows={attempts} type="attempts" />
        <HistoryPanel title="Subscription invoices" loading={loading} rows={invoices} type="invoices" />
      </div>
    </section>
  )
}

function SummaryCard({ icon, label, value, note, tone = 'neutral' }) {
  return (
    <article className={`subscription-scratch-summary ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value || '—'}</strong>
      <small>{note}</small>
    </article>
  )
}

function HistoryPanel({ title, loading, rows, type }) {
  return (
    <section className="subscription-scratch-history">
      <div className="subscription-scratch-history-head">
        <p className="pricing-label">History</p>
        <h2>{title}</h2>
      </div>
      {loading ? (
        <div className="subscription-scratch-empty"><RefreshCw size={17} /> Loading...</div>
      ) : rows.length === 0 ? (
        <div className="subscription-scratch-empty">No records found yet.</div>
      ) : (
        <div className="subscription-scratch-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.created_at || row.paid_at)}</td>
                  <td>{row.plan_name || row.plan_key || row.invoice_number || '—'}</td>
                  <td>{formatMoney(row.currency || 'AED', row.amount || row.paid_amount || 0)}</td>
                  <td>{formatTitle(row.status || (type === 'invoices' ? 'paid' : 'pending'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function buildSubscriptionState(restaurant) {
  const rawStatus = String(restaurant?.subscription_status || 'trialing').toLowerCase()
  const isActivePaid = ['active', 'paid', 'subscribed'].includes(rawStatus)
  const currentPlanKey = isActivePaid ? String(restaurant?.subscription_plan || restaurant?.plan || '') : ''
  const isMonthlySubscriber = currentPlanKey === 'qr_menu_monthly'
  const targetDate = isActivePaid ? getPeriodEndDate(restaurant) : getTrialEndDate(restaurant)
  const countdown = getCountdown(targetDate)
  const trialExpired = !isActivePaid && countdown.totalMinutes <= 0

  if (isActivePaid) {
    const plan = subscriptionPlans.find((item) => item.key === currentPlanKey)
    return {
      isActivePaid: true,
      isMonthlySubscriber,
      currentPlanKey,
      endDate: targetDate,
      statusLabel: 'Active',
      statusNote: `${plan?.name || 'Paid plan'} is active`,
      currentPlanLabel: plan?.name || 'Paid plan',
      planNote: plan ? `${formatMoney(plan.currency, plan.amount)} / ${plan.cycle}` : 'Paid through Mamo Pay',
      countdownLabel: countdown.label,
      endNote: targetDate ? `Ends ${formatDate(targetDate)}` : 'Subscription active',
      tone: 'good',
    }
  }

  return {
    isActivePaid: false,
    isMonthlySubscriber: false,
    currentPlanKey: '',
    endDate: targetDate,
    statusLabel: trialExpired ? 'Trial Ended' : 'Trialing',
    statusNote: trialExpired ? 'Subscribe to keep Spizy active' : 'Trial is active. No paid plan selected.',
    currentPlanLabel: 'Trial',
    planNote: 'No monthly/yearly subscription activated yet',
    countdownLabel: trialExpired ? 'Expired' : countdown.label,
    endNote: targetDate ? `Trial ends ${formatDate(targetDate)}` : 'Trial end not set',
    tone: trialExpired ? 'danger' : 'neutral',
  }
}

function getPeriodEndDate(restaurant) {
  return getDateFromRestaurant(restaurant, ['subscription_current_period_end', 'current_period_end', 'subscription_ends_at', 'plan_expires_at'])
}

function getTrialEndDate(restaurant) {
  return getDateFromRestaurant(restaurant, ['trial_ends_at', 'trial_end_at', 'subscription_trial_ends_at', 'trial_until']) || getFallbackTrialEnd(restaurant)
}

function getDateFromRestaurant(restaurant, keys) {
  for (const key of keys) {
    const value = restaurant?.[key]
    if (!value) continue
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

function getFallbackTrialEnd(restaurant) {
  const createdValue = restaurant?.created_at || restaurant?.inserted_at
  if (!createdValue) return addDays(new Date(), 3)
  const createdDate = new Date(createdValue)
  if (Number.isNaN(createdDate.getTime())) return addDays(new Date(), 3)
  return addDays(createdDate, 14)
}

function addDays(date, days) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function getCountdown(targetDate) {
  if (!targetDate) return { label: 'Not set', totalMinutes: 0 }
  const diff = Math.max(targetDate.getTime() - Date.now(), 0)
  const totalMinutes = Math.floor(diff / 60000)
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  return {
    totalMinutes,
    label: `${days}d ${hours}h ${minutes}m`,
  }
}

function formatMoney(currency, amount) {
  const safeCurrency = currency || 'AED'
  const numericAmount = Number(amount || 0)
  try {
    return new Intl.NumberFormat('en-AE', { style: 'currency', currency: safeCurrency, maximumFractionDigits: 2 }).format(numericAmount)
  } catch {
    return `${safeCurrency} ${numericAmount.toFixed(2)}`
  }
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
  } catch {
    return '—'
  }
}

function formatDateTime(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('en-AE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  } catch {
    return '—'
  }
}

function formatTitle(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default SubscriptionCenterScratch
