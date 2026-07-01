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
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './SubscriptionBillingManagement.css'

const subscriptionPlans = [
  {
    key: 'qr_menu_monthly',
    name: 'Spizy QR Menu Monthly',
    shortName: 'Monthly',
    amount: 75,
    currency: 'AED',
    cycle: 'month',
    billingCycle: 'monthly',
    days: 30,
    badge: 'Flexible',
    description:
      'Monthly Spizy Menu access for QR menu, POS, orders, kitchen, day closing and restaurant operations.',
    features: [
      'QR menu and table ordering',
      'POS, orders and kitchen display',
      'Day Closing and Cash & Bank',
      'Cancel or upgrade later',
    ],
  },
  {
    key: 'qr_menu_yearly',
    name: 'Spizy QR Menu Yearly',
    shortName: 'Yearly',
    amount: 750,
    currency: 'AED',
    cycle: 'year',
    billingCycle: 'yearly',
    days: 365,
    badge: 'Best Value',
    description:
      'Yearly Spizy Menu access with AED 150 saving compared to monthly billing.',
    features: [
      '12 months access',
      'AED 150 saving versus monthly',
      'Priority launch support',
      'Best value for active restaurants',
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
  const [checkoutPlan, setCheckoutPlan] = useState(null)
  const [couponPreview, setCouponPreview] = useState(null)
  const [couponChecking, setCouponChecking] = useState(false)
  const [liveRestaurant, setLiveRestaurant] = useState(null)

  const effectiveRestaurant = liveRestaurant || restaurant

  const subscriptionState = useMemo(
    () => buildSubscriptionState(effectiveRestaurant),
    [effectiveRestaurant],
  )

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
      if (attemptsResult.error && attemptsResult.error.code !== '42P01') {
        nextErrors.push(attemptsResult.error.message)
      }
      if (invoicesResult.error && invoicesResult.error.code !== '42P01') {
        nextErrors.push(invoicesResult.error.message)
      }

      setAttempts(attemptsResult.data || [])
      setInvoices(invoicesResult.data || [])
      setMessage(
        nextErrors.length > 0
          ? {
              type: 'warning',
              title: 'Billing history not fully loaded',
              text: nextErrors.join(' • '),
            }
          : null,
      )
      setLoading(false)
      setRefreshing(false)
    },
    [restaurant?.id],
  )

  const refreshRestaurantSubscription = useCallback(async () => {
    if (!restaurant?.id) return null

    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', restaurant.id)
      .maybeSingle()

    if (!error && data) {
      setLiveRestaurant(data)
      return data
    }

    return null
  }, [restaurant?.id])

  const verifyReturnParams = useCallback(async () => {
    if (!restaurant?.id || typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const mamoStatus = params.get('status') || params.get('mamo_status') || ''
    const transactionId = params.get('transactionId') || params.get('transaction_id') || ''
    const paymentLinkId = params.get('paymentLinkId') || params.get('payment_link_id') || ''
    const attemptId = params.get('attempt_id') || ''

    if (!mamoStatus && !transactionId && !paymentLinkId && !attemptId) return

    setVerifying(true)
    setMessage({
      type: 'info',
      title: 'Checking Mamo Pay result',
      text: 'Spizy is verifying the returned subscription payment status.',
    })

    const { data, error } = await supabase.functions.invoke(
      'verify-mamo-subscription-payment',
      {
        body: {
          restaurant_id: restaurant.id,
          attempt_id: attemptId || null,
          payment_link_id: paymentLinkId || null,
          transaction_id: transactionId || null,
          redirect_status: mamoStatus || null,
        },
      },
    )

    setVerifying(false)

    if (error || data?.error) {
      setMessage({
        type: 'warning',
        title: 'Payment verification needs review',
        text: await getFunctionErrorMessage(
          data,
          error,
          'Mamo Pay result could not be verified automatically.',
        ),
      })
      await loadBilling({ silent: true })
      return
    }

    const isCaptured = data?.status === 'captured'
    const latestRestaurant = await refreshRestaurantSubscription()
    await loadBilling({ silent: true })

    setMessage({
      type: isCaptured ? 'success' : 'info',
      title: isCaptured
        ? 'Payment successful — subscription activated'
        : 'Payment status checked',
      text: isCaptured
        ? buildSuccessMessage(data, latestRestaurant)
        : data?.message || 'Billing status has been refreshed.',
    })

    cleanMamoReturnUrl()
  }, [loadBilling, refreshRestaurantSubscription, restaurant?.id])

  useEffect(() => {
    loadBilling()
    refreshRestaurantSubscription()
  }, [loadBilling, refreshRestaurantSubscription])

  useEffect(() => {
    verifyReturnParams()
  }, [verifyReturnParams])

  const openCheckoutReview = (plan) => {
    setMessage(null)
    setCouponPreview(null)
    setCheckoutPlan(plan)
  }

  const closeCheckoutReview = () => {
    if (creatingPlan) return
    setCheckoutPlan(null)
    setCouponPreview(null)
  }

  const applyCouponPreview = async (plan) => {
    if (!plan || !restaurant?.id) return

    const cleanCoupon = String(couponCode || '').trim().toUpperCase()
    if (!cleanCoupon) {
      setCouponPreview({
        type: 'idle',
        title: 'No coupon entered',
        text: 'Enter a coupon code first, then click Apply Coupon.',
        originalAmount: plan.amount,
        discountAmount: 0,
        finalAmount: plan.amount,
      })
      return
    }

    setCouponChecking(true)
    setCouponPreview(null)

    const { data, error } = await supabase.functions.invoke(
      'create-mamo-subscription-checkout',
      {
        body: {
          restaurant_id: restaurant.id,
          plan_key: plan.key,
          billing_cycle: plan.billingCycle,
          coupon_code: cleanCoupon,
          preview_only: true,
        },
      },
    )

    setCouponChecking(false)

    if (error || data?.error) {
      setCouponPreview({
        type: 'error',
        title: 'Coupon not applied',
        text: await getFunctionErrorMessage(
          data,
          error,
          'This coupon could not be validated.',
        ),
        originalAmount: plan.amount,
        discountAmount: 0,
        finalAmount: plan.amount,
      })
      return
    }

    setCouponPreview({
      type: Number(data?.discount_amount || 0) > 0 ? 'success' : 'info',
      title: Number(data?.discount_amount || 0) > 0 ? 'Coupon applied' : 'Coupon checked',
      text: data?.message || 'Coupon pricing has been calculated.',
      couponCode: data?.coupon_code || cleanCoupon,
      originalAmount: Number(data?.original_amount ?? plan.amount),
      discountAmount: Number(data?.discount_amount || 0),
      finalAmount: Number(data?.final_amount ?? plan.amount),
    })
  }

  const createCheckout = async (plan) => {
    if (!restaurant?.id) {
      setMessage({
        type: 'error',
        title: 'Restaurant not ready',
        text: 'Restaurant ID is missing, so Spizy cannot create a Mamo Pay subscription checkout.',
      })
      return
    }

    setCreatingPlan(plan.key)
    setMessage(null)

    const { data, error } = await supabase.functions.invoke(
      'create-mamo-subscription-checkout',
      {
        body: {
          restaurant_id: restaurant.id,
          plan_key: plan.key,
          billing_cycle: plan.billingCycle,
          coupon_code: couponCode.trim() || null,
        },
      },
    )

    setCreatingPlan('')

    if (error || data?.error) {
      setMessage({
        type: 'error',
        title: 'Mamo checkout failed',
        text: await getFunctionErrorMessage(
          data,
          error,
          'Unable to create a Mamo Pay subscription checkout right now.',
        ),
      })
      return
    }

    setMessage({
      type: 'success',
      title:
        data?.discount_amount > 0
          ? 'Discount applied'
          : 'Mamo checkout link created',
      text:
        data?.message ||
        'The restaurant can now complete Spizy subscription payment through Mamo Pay.',
    })

    setCheckoutPlan(null)
    await loadBilling({ silent: true })

    if (data?.checkout_url) {
      window.location.assign(data.checkout_url)
    }
  }

  return (
    <section className="subscription-billing-shell spizy-subscription-workspace-page">
      <div className="subscription-billing-hero">
        <div>
          <p className="pricing-label">Spizy Subscription Billing</p>
          <h1>Trial, current plan and Mamo Pay checkout</h1>
          <p>
            Manage this restaurant’s Spizy SaaS subscription separately from
            customer order payments. Mamo Pay is used only for restaurant
            subscription payments to Spizy.
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
          <span>
            Mamo Pay is for Spizy subscription billing only. Restaurant customers
            must pay through restaurant-owned gateways configured in Settings.
          </span>
        </div>
      </div>

      {message && (
        <div className={`subscription-message ${message.type}`}>
          {message.type === 'success' ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertTriangle size={18} />
          )}
          <div>
            <strong>{message.title}</strong>
            <span>{message.text}</span>
          </div>
        </div>
      )}

      <div className="subscription-status-grid">
        <SubscriptionStatusCard
          icon={<Sparkles size={20} />}
          label="Current Status"
          value={subscriptionState.statusLabel}
          note={subscriptionState.statusNote}
          tone={subscriptionState.tone}
        />
        <SubscriptionStatusCard
          icon={<CalendarDays size={20} />}
          label={subscriptionState.isActivePaid ? 'Current Period Ends' : 'Trial Ends In'}
          value={subscriptionState.countdownLabel}
          note={subscriptionState.endDate ? `Ends ${formatDate(subscriptionState.endDate)}` : 'End date not set'}
        />
        <SubscriptionStatusCard
          icon={<CreditCard size={20} />}
          label="Current Plan"
          value={subscriptionState.currentPlanLabel}
          note={subscriptionState.planNote}
        />
        <SubscriptionStatusCard
          icon={<WalletCards size={20} />}
          label="Last Payment"
          value={formatDateTime(effectiveRestaurant?.subscription_last_payment_at)}
          note={effectiveRestaurant?.subscription_payment_gateway || 'Mamo Pay pending'}
        />
      </div>

      <div className="subscription-coupon-strip compact">
        <Gift size={19} />
        <div>
          <strong>Have a discount coupon?</strong>
          <span>
            Choose a plan and enter the coupon in the checkout review popup before going to Mamo Pay.
          </span>
        </div>
      </div>

      {!subscriptionState.isActivePaid && (
        <div className="subscription-message info">
          <Sparkles size={18} />
          <div>
            <strong>You are currently on trial</strong>
            <span>
              No paid monthly or yearly plan is active yet. Choose Monthly or
              Yearly below to create a Mamo Pay subscription checkout.
            </span>
          </div>
        </div>
      )}

      {subscriptionState.isMonthlySubscriber && (
        <div className="subscription-message info">
          <Sparkles size={18} />
          <div>
            <strong>Yearly upgrade available</strong>
            <span>
              You are on the monthly plan. Upgrade to the AED 750 yearly plan to
              save AED 150 compared to paying monthly for 12 months.
            </span>
          </div>
        </div>
      )}

      <div className="subscription-plan-grid two spizy-subscription-plan-grid-full">
        {subscriptionPlans.map((plan) => {
          const isCurrentPlan =
            subscriptionState.isActivePaid &&
            subscriptionState.currentPlanKey === plan.key
          const isYearlyUpgrade =
            subscriptionState.isMonthlySubscriber && plan.key === 'qr_menu_yearly'
          const actionLabel = isCurrentPlan
            ? 'Current Plan'
            : isYearlyUpgrade
              ? 'Upgrade Yearly'
              : 'Subscribe Now'

          return (
            <article
              className={`subscription-plan-card ${plan.billingCycle} ${isCurrentPlan ? 'current-plan' : ''}`}
              key={plan.key}
            >
              <div className="subscription-plan-top">
                <span>{isCurrentPlan ? 'Current Plan' : plan.badge}</span>
                <strong>{plan.shortName} Plan</strong>
              </div>

              <p>{plan.description}</p>

              <div className="subscription-price">
                <strong>{formatMoney(plan.currency, plan.amount)}</strong>
                <span>/{plan.cycle}</span>
              </div>

              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <CheckCircle2 size={15} />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className="subscription-primary-button"
                onClick={() => openCheckoutReview(plan)}
                disabled={creatingPlan === plan.key || isCurrentPlan}
              >
                {creatingPlan === plan.key ? (
                  <>
                    <RefreshCw size={17} />
                    Creating Mamo link...
                  </>
                ) : (
                  <>
                    <ExternalLink size={17} />
                    {actionLabel}
                  </>
                )}
              </button>
            </article>
          )
        })}
      </div>

      <section className="subscription-panel">
        <div className="subscription-panel-head">
          <div>
            <p className="pricing-label">Mamo Attempts</p>
            <h2>Recent checkout links</h2>
          </div>
        </div>

        {loading ? (
          <div className="subscription-loading">
            <RefreshCw size={18} />
            Loading billing history...
          </div>
        ) : attempts.length === 0 ? (
          <div className="subscription-empty">
            <CreditCard size={18} />
            No subscription checkout attempt created yet.
          </div>
        ) : (
          <div className="subscription-table-wrap">
            <table className="subscription-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Coupon</th>
                  <th>Status</th>
                  <th>Mamo Link</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{formatDateTime(attempt.created_at)}</td>
                    <td>{attempt.plan_name || attempt.plan_key}</td>
                    <td>{formatMoney(attempt.currency || 'AED', attempt.amount)}</td>
                    <td>{attempt.coupon_code || '—'}</td>
                    <td><StatusPill status={attempt.status} /></td>
                    <td>
                      {attempt.mamo_checkout_url ? (
                        <a href={attempt.mamo_checkout_url} target="_blank" rel="noreferrer">Open</a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="subscription-panel">
        <div className="subscription-panel-head">
          <div>
            <p className="pricing-label">Invoices</p>
            <h2>Spizy subscription receipts</h2>
          </div>
        </div>

        {invoices.length === 0 ? (
          <div className="subscription-empty">
            <FileText size={18} />
            No paid subscription invoice found yet.
          </div>
        ) : (
          <div className="subscription-table-wrap">
            <table className="subscription-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Paid At</th>
                  <th>Period</th>
                  <th>Amount</th>
                  <th>Coupon</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoice_number}</td>
                    <td>{formatDateTime(invoice.paid_at)}</td>
                    <td>{formatDate(invoice.period_start)} → {formatDate(invoice.period_end)}</td>
                    <td>{formatMoney(invoice.currency || 'AED', invoice.amount)}</td>
                    <td>{invoice.coupon_code || '—'}</td>
                    <td><StatusPill status={invoice.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>


      {checkoutPlan && (
        <CheckoutReviewModal
          plan={checkoutPlan}
          couponCode={couponCode}
          setCouponCode={(value) => {
            setCouponCode(value)
            setCouponPreview(null)
          }}
          couponPreview={couponPreview}
          couponChecking={couponChecking}
          creating={creatingPlan === checkoutPlan.key}
          onApplyCoupon={() => applyCouponPreview(checkoutPlan)}
          onClearCoupon={() => {
            setCouponCode('')
            setCouponPreview(null)
          }}
          onClose={closeCheckoutReview}
          onConfirm={() => createCheckout(checkoutPlan)}
        />
      )}
    </section>
  )
}

function cleanMamoReturnUrl() {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const hasMamoParams = [
    'attempt_id',
    'status',
    'mamo_status',
    'transactionId',
    'transaction_id',
    'paymentLinkId',
    'payment_link_id',
  ].some((key) => params.has(key))

  if (!hasMamoParams) return

  const cleanParams = new URLSearchParams()
  cleanParams.set('section', 'subscription-billing')
  window.history.replaceState({}, '', `${window.location.pathname}?${cleanParams.toString()}`)
}

function buildSuccessMessage(data, latestRestaurant) {
  const plan = subscriptionPlans.find((item) => item.key === latestRestaurant?.subscription_plan)
  const periodEnd = latestRestaurant?.subscription_current_period_end
  const planName = plan?.shortName || formatTitle(latestRestaurant?.subscription_plan || 'subscription')
  const paidText = data?.attempt?.amount
    ? `Paid ${formatMoney(data.attempt.currency || 'AED', data.attempt.amount)}. `
    : ''
  const endText = periodEnd ? `Active until ${formatDate(periodEnd)}.` : 'Subscription details are updated.'
  return `${paidText}${planName} plan is active. ${endText}`
}

async function getFunctionErrorMessage(data, error, fallback) {
  if (data?.error) return data.error

  const context = error?.context
  if (context?.json) {
    try {
      const cloned = typeof context.clone === 'function' ? context.clone() : context
      const body = await cloned.json()
      if (body?.error) return body.error
      if (body?.message) return body.message
    } catch {
      // keep fallback below
    }
  }

  return error?.message || fallback
}

function CheckoutReviewModal({
  plan,
  couponCode,
  setCouponCode,
  couponPreview,
  couponChecking,
  creating,
  onApplyCoupon,
  onClearCoupon,
  onClose,
  onConfirm,
}) {
  const cleanCoupon = String(couponCode || '').trim().toUpperCase()
  const originalAmount = Number(couponPreview?.originalAmount ?? plan.amount)
  const discountAmount = Number(couponPreview?.discountAmount || 0)
  const finalAmount = Number(couponPreview?.finalAmount ?? plan.amount)
  const hasAppliedCoupon = couponPreview?.type === 'success' && discountAmount > 0
  const couponNeedsApply = Boolean(cleanCoupon && couponPreview?.couponCode !== cleanCoupon)

  return (
    <div className="subscription-checkout-overlay" role="dialog" aria-modal="true" aria-label="Subscription checkout review">
      <section className="subscription-checkout-modal">
        <button type="button" className="subscription-checkout-close" onClick={onClose} aria-label="Close checkout review">
          <X size={18} />
        </button>

        <div className="subscription-checkout-head">
          <p className="pricing-label">Checkout Review</p>
          <h2>{plan.shortName} Plan</h2>
          <span>Apply coupon first, confirm the payable amount, then continue to Mamo Pay.</span>
        </div>

        <div className="subscription-breakdown-card">
          <div>
            <span>Plan price</span>
            <strong>{formatMoney(plan.currency, originalAmount)}</strong>
          </div>
          <div>
            <span>Billing cycle</span>
            <strong>{plan.billingCycle === 'yearly' ? 'Yearly' : 'Monthly'}</strong>
          </div>
          <div>
            <span>Coupon discount</span>
            <strong className={hasAppliedCoupon ? 'discount-good' : ''}>
              {hasAppliedCoupon ? `- ${formatMoney(plan.currency, discountAmount)}` : formatMoney(plan.currency, 0)}
            </strong>
          </div>
          <div className="subscription-breakdown-total">
            <span>Mamo amount</span>
            <strong>{formatMoney(plan.currency, finalAmount)}</strong>
          </div>
        </div>

        <label className="subscription-popup-coupon-field">
          Optional coupon code
          <div className="subscription-coupon-apply-row">
            <input
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
              placeholder="TEST70"
              autoFocus
            />
            <button
              type="button"
              className="subscription-apply-coupon-button"
              onClick={onApplyCoupon}
              disabled={couponChecking || creating || !cleanCoupon}
            >
              {couponChecking ? <RefreshCw size={15} /> : <Gift size={15} />}
              {couponChecking ? 'Checking...' : 'Apply Coupon'}
            </button>
          </div>
          <small>
            Super Admin coupons are validated before the Mamo Pay link is created.
          </small>
        </label>

        {couponPreview && (
          <div className={`subscription-coupon-preview ${couponPreview.type}`}>
            {couponPreview.type === 'error' ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
            <div>
              <strong>{couponPreview.title}</strong>
              <span>{couponPreview.text}</span>
            </div>
            {couponPreview.type !== 'idle' && (
              <button type="button" onClick={onClearCoupon} disabled={creating || couponChecking}>
                Clear
              </button>
            )}
          </div>
        )}

        <div className="subscription-checkout-actions">
          <button type="button" className="subscription-secondary-button" onClick={onClose} disabled={creating}>
            Cancel
          </button>
          <button type="button" className="subscription-primary-button" onClick={onConfirm} disabled={creating || couponChecking || couponPreview?.type === 'error' || couponNeedsApply}>
            {creating ? <RefreshCw size={17} /> : <ExternalLink size={17} />}
            {creating ? 'Creating Link...' : couponNeedsApply ? 'Apply Coupon First' : 'Go to Checkout'}
          </button>
        </div>
      </section>
    </div>
  )
}

function SubscriptionStatusCard({ icon, label, value, note, tone = 'neutral' }) {
  return (
    <article className={`subscription-status-card ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value || '—'}</strong>
      <small>{note}</small>
    </article>
  )
}

function StatusPill({ status }) {
  const normalized = String(status || 'pending').toLowerCase()
  const good = ['active', 'paid', 'captured', 'checkout_created'].includes(normalized)
  const bad = ['failed', 'cancelled', 'expired'].includes(normalized)
  return (
    <span className={`subscription-status-pill ${good ? 'good' : bad ? 'bad' : 'neutral'}`}>
      {formatTitle(normalized)}
    </span>
  )
}

function buildSubscriptionState(restaurant) {
  const rawStatus = String(restaurant?.subscription_status || 'trialing').toLowerCase()
  const isActivePaid = ['active', 'paid', 'subscribed'].includes(rawStatus)
  const currentPlanKey = isActivePaid
    ? String(restaurant?.subscription_plan || restaurant?.plan || '')
    : ''
  const currentPlan = subscriptionPlans.find((plan) => plan.key === currentPlanKey) || null
  const isMonthlySubscriber = isActivePaid && currentPlanKey === 'qr_menu_monthly'
  const isYearlySubscriber = isActivePaid && currentPlanKey === 'qr_menu_yearly'
  const targetDate = isActivePaid
    ? getPeriodEndDate(restaurant)
    : getTrialEndDate(restaurant)
  const countdown = getCountdown(targetDate)
  const trialExpired = !isActivePaid && countdown.totalMinutes <= 0

  if (isActivePaid) {
    return {
      rawStatus,
      isActivePaid,
      isMonthlySubscriber,
      isYearlySubscriber,
      currentPlanKey,
      endDate: targetDate,
      statusLabel: 'Active',
      statusNote: `${currentPlan?.shortName || 'Paid'} subscription is active`,
      currentPlanLabel: currentPlan?.shortName || 'Paid plan',
      planNote: currentPlan
        ? `${formatMoney(currentPlan.currency, currentPlan.amount)} / ${currentPlan.cycle}`
        : 'Paid subscription through Mamo Pay',
      countdownLabel: countdown.label,
      tone: 'good',
    }
  }

  return {
    rawStatus,
    isActivePaid: false,
    isMonthlySubscriber: false,
    isYearlySubscriber: false,
    currentPlanKey: '',
    endDate: targetDate,
    statusLabel: trialExpired ? 'Trial Ended' : 'Trialing',
    statusNote: trialExpired
      ? 'Subscribe with Mamo Pay to keep Spizy active'
      : 'Trial access is active. No paid plan is selected yet.',
    currentPlanLabel: 'Trial',
    planNote: 'No monthly/yearly subscription activated yet',
    countdownLabel: trialExpired ? 'Expired' : countdown.label,
    tone: trialExpired ? 'danger' : 'neutral',
  }
}

function getPeriodEndDate(restaurant) {
  return getDateFromRestaurant(restaurant, [
    'subscription_current_period_end',
    'current_period_end',
    'subscription_ends_at',
    'plan_expires_at',
  ])
}

function getTrialEndDate(restaurant) {
  return (
    getDateFromRestaurant(restaurant, [
      'subscription_trial_ends_at',
      'trial_ends_at',
      'trial_end_at',
      'trial_until',
    ]) || getFallbackTrialEnd(restaurant)
  )
}

function getDateFromRestaurant(restaurant, keys) {
  for (const key of keys) {
    const value = restaurant?.[key]
    if (!value) continue
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

function getFallbackTrialEnd(restaurant) {
  const createdValue = restaurant?.created_at || restaurant?.inserted_at
  const createdDate = createdValue ? new Date(createdValue) : new Date()
  const fallback = Number.isNaN(createdDate.getTime()) ? new Date() : new Date(createdDate)
  fallback.setDate(fallback.getDate() + 14)
  fallback.setHours(23, 59, 59, 999)
  return fallback
}

function getCountdown(targetDate) {
  if (!targetDate) return { totalMinutes: 0, label: 'Not set' }
  const diff = targetDate.getTime() - Date.now()
  const totalMinutes = Math.max(0, Math.floor(diff / 60000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes - days * 1440) / 60)
  const minutes = totalMinutes % 60
  return {
    totalMinutes,
    days,
    hours,
    minutes,
    label: `${days}d ${hours}h ${minutes}m`,
  }
}

function formatMoney(currency, amount) {
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

function formatDate(value) {
  if (!value) return 'Not set'
  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

function formatDateTime(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

function formatTitle(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default SubscriptionBillingManagement
