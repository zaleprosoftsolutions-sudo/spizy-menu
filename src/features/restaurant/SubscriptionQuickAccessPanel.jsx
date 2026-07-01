import { useMemo, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Crown,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './SubscriptionQuickAccessPanel.css'

const PLANS = {
  monthly: {
    key: 'qr_menu_monthly',
    label: 'Monthly Plan',
    price: 'AED 75',
    period: '/ month',
    note: 'Best for starting restaurants',
    highlights: ['QR menu + POS dashboard', 'Orders, payments, day closing', 'Cancel or upgrade later'],
  },
  yearly: {
    key: 'qr_menu_yearly',
    label: 'Yearly Plan',
    price: 'AED 750',
    period: '/ year',
    note: 'Save AED 150 compared to monthly',
    highlights: ['12 months access', 'Priority launch support', 'Best value for active restaurants'],
  },
}

function SubscriptionQuickAccessPanel({ restaurant, onClose }) {
  const [couponCode, setCouponCode] = useState('')
  const [loadingPlan, setLoadingPlan] = useState('')
  const [message, setMessage] = useState('')

  const subscriptionInfo = useMemo(() => buildSubscriptionInfo(restaurant), [restaurant])
  const isMonthly = String(restaurant?.subscription_plan || restaurant?.plan || '').toLowerCase().includes('monthly')

  const startCheckout = async (planKey) => {
    if (!restaurant?.id) {
      setMessage('Restaurant was not found. Please refresh and try again.')
      return
    }

    setMessage('')
    setLoadingPlan(planKey)

    const { data, error } = await supabase.functions.invoke('create-mamo-subscription-checkout', {
      body: {
        restaurant_id: restaurant.id,
        plan_key: planKey,
        coupon_code: couponCode.trim() || null,
      },
    })

    setLoadingPlan('')

    if (error || data?.error) {
      setMessage(error?.message || data?.error || 'Unable to create Mamo Pay checkout.')
      return
    }

    const checkoutUrl = data?.payment_url || data?.checkout_url || data?.url || data?.link_url || data?.mamo_payment_url

    if (!checkoutUrl) {
      setMessage('Mamo Pay checkout was created, but no checkout URL was returned.')
      return
    }

    window.location.href = checkoutUrl
  }

  return (
    <div className="spizy-subscription-overlay" role="dialog" aria-modal="true">
      <button type="button" className="spizy-subscription-backdrop" onClick={onClose} aria-label="Close subscription panel" />

      <section className="spizy-subscription-panel">
        <div className="spizy-subscription-panel-head">
          <div>
            <p className="pricing-label">Spizy Subscription</p>
            <h2>Subscription & Plans</h2>
            <span>Manage trial, monthly billing, yearly upgrade and Mamo Pay checkout.</span>
          </div>

          <button type="button" className="spizy-subscription-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="spizy-subscription-status-grid">
          <StatusCard
            icon={<ShieldCheck size={19} />}
            label="Current status"
            value={subscriptionInfo.statusLabel}
            note={subscriptionInfo.statusNote}
          />
          <StatusCard
            icon={<CalendarClock size={19} />}
            label={subscriptionInfo.isTrial ? 'Trial ends in' : 'Current period'}
            value={subscriptionInfo.mainCountdown}
            note={subscriptionInfo.dateNote}
          />
          <StatusCard
            icon={<CreditCard size={19} />}
            label="Current plan"
            value={subscriptionInfo.planLabel}
            note="Mamo Pay billing for Spizy subscription only"
          />
        </div>

        <label className="spizy-subscription-coupon">
          <span>Discount coupon</span>
          <input
            value={couponCode}
            onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
            placeholder="Enter coupon code if available"
          />
        </label>

        <div className="spizy-subscription-plan-grid">
          <PlanCard
            plan={PLANS.monthly}
            loading={loadingPlan === PLANS.monthly.key}
            buttonLabel={isMonthly ? 'Current monthly plan' : 'Subscribe Monthly'}
            disabled={loadingPlan || isMonthly}
            onCheckout={() => startCheckout(PLANS.monthly.key)}
          />
          <PlanCard
            plan={PLANS.yearly}
            featured
            loading={loadingPlan === PLANS.yearly.key}
            buttonLabel={isMonthly ? 'Upgrade to Yearly' : 'Subscribe Yearly'}
            disabled={loadingPlan}
            onCheckout={() => startCheckout(PLANS.yearly.key)}
          />
        </div>

        {message && <div className="spizy-subscription-message">{message}</div>}

        <div className="spizy-subscription-safe-note">
          <Sparkles size={17} />
          <span>Mamo Pay is used only for Spizy restaurant subscription billing. Restaurant customer payments stay under each restaurant’s own payment gateway accounts.</span>
        </div>
      </section>
    </div>
  )
}

function StatusCard({ icon, label, value, note }) {
  return (
    <article className="spizy-subscription-status-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function PlanCard({ plan, featured = false, loading = false, disabled = false, buttonLabel, onCheckout }) {
  return (
    <article className={`spizy-subscription-plan-card ${featured ? 'featured' : ''}`}>
      <div className="spizy-subscription-plan-top">
        <div>
          <p>{featured ? 'Best Value' : 'Flexible'}</p>
          <h3>{plan.label}</h3>
        </div>
        {featured ? <Crown size={22} /> : <CreditCard size={22} />}
      </div>

      <div className="spizy-subscription-price">
        <strong>{plan.price}</strong>
        <span>{plan.period}</span>
      </div>
      <p className="spizy-subscription-plan-note">{plan.note}</p>

      <ul>
        {plan.highlights.map((item) => (
          <li key={item}><CheckCircle2 size={15} /> {item}</li>
        ))}
      </ul>

      <button type="button" onClick={onCheckout} disabled={Boolean(disabled)}>
        {loading && <RefreshCw size={16} />}
        {loading ? 'Creating Mamo checkout...' : buttonLabel}
      </button>
    </article>
  )
}

function buildSubscriptionInfo(restaurant) {
  const status = String(restaurant?.subscription_status || 'trialing').toLowerCase()
  const plan = String(restaurant?.subscription_plan || restaurant?.plan || '').toLowerCase()
  const isTrial = status.includes('trial')
  const trialEnd = getBestDate(restaurant, [
    'trial_ends_at',
    'trial_end_date',
    'trial_expires_at',
    'subscription_trial_ends_at',
    'trial_until',
  ])
  const periodEnd = getBestDate(restaurant, [
    'subscription_current_period_end',
    'current_period_end',
    'subscription_ends_at',
    'paid_until',
    'grace_until',
  ])
  const targetDate = isTrial ? trialEnd : periodEnd
  const countdown = getCountdownText(targetDate)

  return {
    isTrial,
    statusLabel: formatTitle(status || 'trialing'),
    statusNote: isTrial ? 'Trial access is active' : 'Subscription billing status',
    planLabel: plan ? formatTitle(plan.replace('qr_menu_', '')) : isTrial ? 'Trial Plan' : 'Not selected',
    mainCountdown: countdown || (isTrial ? 'Trial date not set' : 'Not set'),
    dateNote: targetDate ? `Ends ${formatDate(targetDate)}` : 'Set trial/period end in subscription settings',
  }
}

function getBestDate(source, keys) {
  for (const key of keys) {
    const value = source?.[key]
    if (!value) continue
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

function getCountdownText(date) {
  if (!date) return ''
  const diff = date.getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatTitle(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(date) {
  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date)
  } catch {
    return String(date)
  }
}

export default SubscriptionQuickAccessPanel
