import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileText,
  Gift,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './SubscriptionBillingManagement.css'

const subscriptionPlans = [
  {
    key: 'qr_menu_monthly',
    name: 'Spizy QR Menu Monthly',
    shortName: 'Monthly',
    amount: 50,
    currency: 'AED',
    cycle: 'monthly',
    days: 30,
    badge: 'Flexible',
    description: 'Monthly Spizy Menu access for QR menu, POS, orders, day closing and restaurant operations.',
    features: [
      'QR menu and table ordering',
      'POS, orders and kitchen display',
      'Day Closing and Cash & Bank',
      'Receipt/KOT and launch tools',
    ],
  },
  {
    key: 'qr_menu_yearly',
    name: 'Spizy QR Menu Yearly',
    shortName: 'Yearly',
    amount: 499,
    currency: 'AED',
    cycle: 'yearly',
    days: 365,
    badge: 'Best Value',
    description: 'Yearly Spizy Menu access with launch-friendly pricing and fewer renewal interruptions.',
    features: [
      'Everything in monthly plan',
      'One yearly renewal instead of monthly payment',
      'Best option for serious restaurants',
      'Discount coupon support when available',
    ],
  },
]

function SubscriptionBillingManagement({ restaurant, profile, onOpenSection }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [creatingPlan, setCreatingPlan] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [message, setMessage] = useState(null)
  const [attempts, setAttempts] = useState([])
  const [invoices, setInvoices] = useState([])
  const [couponCode, setCouponCode] = useState('')

  const activePlan = useMemo(
    () =>
      subscriptionPlans.find((plan) => plan.key === restaurant?.subscription_plan) ||
      subscriptionPlans[0],
    [restaurant?.subscription_plan],
  )

  const billingStatus = useMemo(
    () => buildBillingStatus({ restaurant, activePlan }),
    [activePlan, restaurant],
  )

  const trialInfo = useMemo(() => buildTrialInfo(restaurant), [restaurant])

  const loadBilling = useCallback(
    async ({ silent = false } = {}) => {
      if (!restaurant?.id) return

      if (silent) setRefreshing(true)
      else setLoading(true)

      const [attemptsResult, invoicesResult] = await Promise.all([
        supabase
          .from('restaurant_subscription_payment_attempts')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('restaurant_subscription_invoices')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: false })
          .limit(25),
      ])

      const nextErrors = []
      if (attemptsResult.error && attemptsResult.error.code !== '42P01') nextErrors.push(attemptsResult.error.message)
      if (invoicesResult.error && invoicesResult.error.code !== '42P01') nextErrors.push(invoicesResult.error.message)

      setAttempts(attemptsResult.data || [])
      setInvoices(invoicesResult.data || [])
      setMessage(
        nextErrors.length > 0
          ? { type: 'warning', title: 'Billing history not fully loaded', text: nextErrors.join(' • ') }
          : null,
      )
      setLoading(false)
      setRefreshing(false)
    },
    [restaurant?.id],
  )

  const verifyReturnParams = useCallback(async () => {
    if (!restaurant?.id || typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const mamoStatus = params.get('status') || params.get('mamo_status') || ''
    const transactionId = params.get('transactionId') || params.get('transaction_id') || ''
    const paymentLinkId = params.get('paymentLinkId') || params.get('payment_link_id') || ''
    const attemptId = params.get('attempt_id') || ''

    if (!mamoStatus && !transactionId && !paymentLinkId && !attemptId) return

    setVerifying(true)
    setMessage({ type: 'info', title: 'Checking Mamo Pay result', text: 'Spizy is verifying the returned payment status.' })

    const { data, error } = await supabase.functions.invoke('verify-mamo-subscription-payment', {
      body: {
        restaurant_id: restaurant.id,
        attempt_id: attemptId || null,
        payment_link_id: paymentLinkId || null,
        transaction_id: transactionId || null,
        redirect_status: mamoStatus || null,
      },
    })

    setVerifying(false)

    if (error || data?.error) {
      setMessage({
        type: 'warning',
        title: 'Payment verification needs review',
        text: data?.error || error?.message || 'Mamo Pay result could not be verified automatically.',
      })
      await loadBilling({ silent: true })
      return
    }

    setMessage({
      type: data?.status === 'captured' ? 'success' : 'info',
      title: data?.status === 'captured' ? 'Subscription payment verified' : 'Payment status checked',
      text: data?.message || 'Billing status has been refreshed.',
    })
    await loadBilling({ silent: true })
  }, [loadBilling, restaurant?.id])

  useEffect(() => {
    loadBilling()
  }, [loadBilling])

  useEffect(() => {
    verifyReturnParams()
  }, [verifyReturnParams])

  const createCheckout = async (plan) => {
    if (!restaurant?.id) return

    setCreatingPlan(plan.key)
    setMessage(null)

    const { data, error } = await supabase.functions.invoke('create-mamo-subscription-checkout', {
      body: {
        restaurant_id: restaurant.id,
        plan_key: plan.key,
        billing_cycle: plan.cycle,
        coupon_code: couponCode.trim() || null,
      },
    })

    setCreatingPlan('')

    if (error || data?.error) {
      setMessage({
        type: 'error',
        title: 'Mamo checkout failed',
        text: data?.error || error?.message || 'Unable to create a Mamo Pay subscription checkout right now.',
      })
      return
    }

    setMessage({
      type: 'success',
      title: data?.discount_amount > 0 ? 'Discount applied' : 'Mamo checkout link created',
      text: data?.message || 'The restaurant can now complete Spizy subscription payment through Mamo Pay.',
    })

    await loadBilling({ silent: true })

    if (data?.checkout_url) window.open(data.checkout_url, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="subscription-billing-shell">
      <div className="subscription-billing-hero">
        <div>
          <p className="pricing-label">Spizy Subscription Billing</p>
          <h1>Plans, trial and Mamo Pay</h1>
          <p>
            Manage this restaurant’s Spizy SaaS subscription separately from customer order payments.
            Mamo Pay is used only for restaurant subscription payments to Spizy.
          </p>
        </div>

        <button
          type="button"
          className="subscription-refresh-button"
          onClick={() => loadBilling({ silent: true })}
          disabled={refreshing || verifying}
        >
          <RefreshCw size={17} />
          {refreshing || verifying ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="subscription-rule-box">
        <ShieldCheck size={20} />
        <div>
          <strong>Payment separation rule</strong>
          <span>Mamo Pay is for Spizy subscription billing only. Restaurant customers must pay through restaurant-owned gateways configured in Settings.</span>
        </div>
      </div>

      {message && (
        <div className={`subscription-message ${message.type}`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{message.title}</strong>
            <span>{message.text}</span>
          </div>
        </div>
      )}

      <div className="subscription-status-grid">
        <SubscriptionStatusCard icon={<CreditCard size={20} />} label="Current Plan" value={activePlan.shortName} note={billingStatus.planNote} />
        <SubscriptionStatusCard icon={<Sparkles size={20} />} label="Status" value={billingStatus.label} note={billingStatus.note} tone={billingStatus.tone} />
        <SubscriptionStatusCard icon={<CalendarDays size={20} />} label="Trial / Period End" value={formatDate(billingStatus.endDate || trialInfo.endDate)} note={billingStatus.daysLeftText || trialInfo.daysLeftText} />
        <SubscriptionStatusCard icon={<WalletCards size={20} />} label="Last Payment" value={formatDateTime(restaurant?.subscription_last_payment_at)} note={restaurant?.subscription_payment_gateway || 'Mamo Pay pending'} />
      </div>

      <div className="subscription-coupon-strip">
        <Gift size={19} />
        <div>
          <strong>Have a discount coupon?</strong>
          <span>Enter coupon code before clicking Subscribe. Coupons are controlled by Super Admin only.</span>
        </div>
        <input
          value={couponCode}
          onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
          placeholder="Coupon code"
        />
      </div>

      <div className="subscription-main-grid">
        <section className="subscription-panel">
          <div className="subscription-panel-head">
            <div>
              <p className="pricing-label">Available Plans</p>
              <h2>Choose subscription</h2>
            </div>
          </div>

          <div className="subscription-plan-grid two">
            {subscriptionPlans.map((plan) => (
              <article className={`subscription-plan-card ${plan.cycle}`} key={plan.key}>
                <div className="subscription-plan-top">
                  <span>{plan.badge}</span>
                  <strong>{plan.shortName}</strong>
                </div>

                <p>{plan.description}</p>

                <div className="subscription-price">
                  <strong>{formatMoney(plan.currency, plan.amount)}</strong>
                  <span>/{plan.cycle}</span>
                </div>

                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}><CheckCircle2 size={15} />{feature}</li>
                  ))}
                </ul>

                <button type="button" className="subscription-primary-button" onClick={() => createCheckout(plan)} disabled={creatingPlan === plan.key}>
                  {creatingPlan === plan.key ? <><RefreshCw size={17} />Creating Mamo link...</> : <><ExternalLink size={17} />Subscribe with Mamo Pay</>}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="subscription-panel">
          <div className="subscription-panel-head">
            <div>
              <p className="pricing-label">Trial Period</p>
              <h2>{trialInfo.title}</h2>
            </div>
          </div>

          <div className="subscription-trial-countdown-card">
            <CountdownCell label="Days" value={trialInfo.days} />
            <CountdownCell label="Hours" value={trialInfo.hours} />
            <CountdownCell label="Minutes" value={trialInfo.minutes} />
          </div>

          <div className="subscription-helper-card">
            <strong>{trialInfo.isExpired ? 'Trial ended' : 'Trial protection'}</strong>
            <span>{trialInfo.note}</span>
          </div>

          <button type="button" className="subscription-secondary-button" onClick={() => onOpenSection?.('settings')}>Open restaurant settings</button>
        </section>
      </div>

      <section className="subscription-panel">
        <div className="subscription-panel-head"><div><p className="pricing-label">Mamo Attempts</p><h2>Recent checkout links</h2></div></div>
        {loading ? <div className="subscription-loading"><RefreshCw size={18} />Loading billing history...</div> : attempts.length === 0 ? <div className="subscription-empty"><CreditCard size={18} />No subscription checkout attempt created yet.</div> : (
          <div className="subscription-table-wrap"><table className="subscription-table"><thead><tr><th>Created</th><th>Plan</th><th>Amount</th><th>Coupon</th><th>Status</th><th>Mamo Link</th></tr></thead><tbody>{attempts.map((attempt) => (<tr key={attempt.id}><td>{formatDateTime(attempt.created_at)}</td><td>{attempt.plan_name || attempt.plan_key}</td><td>{formatMoney(attempt.currency || 'AED', attempt.amount)}</td><td>{attempt.coupon_code || '—'}</td><td><StatusPill status={attempt.status} /></td><td>{attempt.mamo_checkout_url ? <a href={attempt.mamo_checkout_url} target="_blank" rel="noreferrer">Open</a> : '—'}</td></tr>))}</tbody></table></div>
        )}
      </section>

      <section className="subscription-panel">
        <div className="subscription-panel-head"><div><p className="pricing-label">Invoices</p><h2>Spizy subscription receipts</h2></div></div>
        {invoices.length === 0 ? <div className="subscription-empty"><FileText size={18} />No paid subscription invoice found yet.</div> : (
          <div className="subscription-table-wrap"><table className="subscription-table"><thead><tr><th>Invoice</th><th>Paid At</th><th>Period</th><th>Amount</th><th>Coupon</th><th>Status</th></tr></thead><tbody>{invoices.map((invoice) => (<tr key={invoice.id}><td>{invoice.invoice_number}</td><td>{formatDateTime(invoice.paid_at)}</td><td>{formatDate(invoice.period_start)} → {formatDate(invoice.period_end)}</td><td>{formatMoney(invoice.currency || 'AED', invoice.amount)}</td><td>{invoice.coupon_code || '—'}</td><td><StatusPill status={invoice.status} /></td></tr>))}</tbody></table></div>
        )}
      </section>
    </section>
  )
}

function CountdownCell({ label, value }) {
  return <div><strong>{String(Math.max(0, Number(value || 0))).padStart(2, '0')}</strong><span>{label}</span></div>
}

function SubscriptionStatusCard({ icon, label, value, note, tone = 'neutral' }) {
  return <article className={`subscription-status-card ${tone}`}><div>{icon}</div><span>{label}</span><strong>{value || '—'}</strong><small>{note}</small></article>
}

function StatusPill({ status }) {
  const normalized = String(status || 'pending').toLowerCase()
  const good = ['active', 'paid', 'captured', 'checkout_created'].includes(normalized)
  const bad = ['failed', 'cancelled', 'expired'].includes(normalized)
  return <span className={`subscription-status-pill ${good ? 'good' : bad ? 'bad' : 'neutral'}`}>{formatTitle(normalized)}</span>
}

function buildBillingStatus({ restaurant, activePlan }) {
  const rawStatus = String(restaurant?.subscription_status || 'trialing').toLowerCase()
  const periodEnd = restaurant?.subscription_current_period_end
  const daysLeft = getDaysLeft(periodEnd)
  const planNote = `${formatMoney(activePlan.currency, activePlan.amount)} / ${activePlan.cycle}`

  if (rawStatus === 'active') return { label: 'Active', tone: 'good', note: 'Subscription is active', daysLeftText: daysLeft >= 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'Period active', planNote, endDate: periodEnd }
  if (rawStatus === 'past_due') return { label: 'Past due', tone: 'warning', note: 'Payment renewal required', daysLeftText: daysLeft >= 0 ? `Grace: ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : 'Grace ended', planNote, endDate: restaurant?.subscription_grace_until || periodEnd }
  if (rawStatus === 'cancelled' || rawStatus === 'inactive') return { label: formatTitle(rawStatus), tone: 'danger', note: 'Subscription is not active', daysLeftText: 'Renew to continue', planNote, endDate: periodEnd }
  return { label: formatTitle(rawStatus || 'Trialing'), tone: 'neutral', note: 'Trial or setup mode', daysLeftText: '', planNote, endDate: periodEnd }
}

function buildTrialInfo(restaurant) {
  const endDate = getTrialEndDate(restaurant)
  const diff = endDate.getTime() - Date.now()
  const totalMinutes = Math.max(0, Math.floor(diff / 60000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes - days * 1440) / 60)
  const minutes = totalMinutes % 60
  const isExpired = diff <= 0 && String(restaurant?.subscription_status || '').toLowerCase() !== 'active'
  return {
    endDate,
    days,
    hours,
    minutes,
    isExpired,
    title: isExpired ? 'Trial ended' : `${days} day${days === 1 ? '' : 's'} trial left`,
    daysLeftText: isExpired ? 'Subscribe now' : `${days} day${days === 1 ? '' : 's'} left`,
    note: isExpired ? 'Subscribe with Mamo Pay to continue without interruption.' : `Trial ends on ${formatDate(endDate)}. Subscribe early to keep service smooth.`,
  }
}

function getTrialEndDate(restaurant) {
  const explicit = restaurant?.subscription_trial_ends_at || restaurant?.trial_ends_at || restaurant?.subscription_current_period_end
  if (explicit) {
    const parsed = new Date(`${String(explicit).slice(0, 10)}T23:59:59`)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  const created = restaurant?.created_at ? new Date(restaurant.created_at) : new Date()
  const fallback = Number.isNaN(created.getTime()) ? new Date() : new Date(created)
  fallback.setDate(fallback.getDate() + 14)
  fallback.setHours(23, 59, 59, 999)
  return fallback
}

function getDaysLeft(dateValue) {
  if (!dateValue) return -1
  const end = new Date(`${String(dateValue).slice(0, 10)}T23:59:59`)
  if (Number.isNaN(end.getTime())) return -1
  return Math.ceil((end.getTime() - Date.now()) / 86400000)
}

function formatMoney(currency, amount) {
  const safeCurrency = currency || 'AED'
  const numericAmount = Number(amount || 0)
  try { return new Intl.NumberFormat('en-AE', { style: 'currency', currency: safeCurrency, maximumFractionDigits: 2 }).format(numericAmount) } catch { return `${safeCurrency} ${numericAmount.toFixed(2)}` }
}
function formatDate(value) {
  if (!value) return 'Not set'
  try { return new Intl.DateTimeFormat('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) } catch { return String(value) }
}
function formatDateTime(value) {
  if (!value) return '—'
  try { return new Intl.DateTimeFormat('en-AE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) } catch { return String(value) }
}
function formatTitle(value) { return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }

export default SubscriptionBillingManagement
