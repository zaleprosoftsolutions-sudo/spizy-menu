import { useEffect, useMemo, useState } from 'react'
import { Clock3, CreditCard, Sparkles } from 'lucide-react'
import './SubscriptionTrialHeaderBar.css'

function SubscriptionTrialHeaderBar({ restaurant, onSubscribe }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  const trialInfo = useMemo(
    () => buildTrialInfo({ restaurant, now }),
    [now, restaurant],
  )

  return (
    <section className={`subscription-trial-header-bar ${trialInfo.tone}`}>
      <div className="subscription-trial-left">
        <div className="subscription-trial-icon">
          {trialInfo.isActiveSubscription ? <Sparkles size={18} /> : <Clock3 size={18} />}
        </div>

        <div>
          <span>{trialInfo.kicker}</span>
          <strong>{trialInfo.title}</strong>
        </div>
      </div>

      <div className="subscription-trial-countdown" aria-label="Subscription countdown">
        <CountdownCell label="Days" value={trialInfo.days} />
        <CountdownCell label="Hours" value={trialInfo.hours} />
        <CountdownCell label="Mins" value={trialInfo.minutes} />
      </div>

      <button
        type="button"
        className="subscription-trial-cta"
        onClick={onSubscribe}
      >
        <CreditCard size={17} />
        {trialInfo.buttonLabel}
      </button>
    </section>
  )
}

function CountdownCell({ label, value }) {
  return (
    <div className="subscription-countdown-cell">
      <strong>{String(Math.max(Number(value || 0), 0)).padStart(2, '0')}</strong>
      <span>{label}</span>
    </div>
  )
}

function buildTrialInfo({ restaurant, now }) {
  const status = String(restaurant?.subscription_status || 'trialing').toLowerCase()
  const plan = restaurant?.subscription_plan || restaurant?.plan || 'trial'
  const activeUntil = getDateFromRestaurant(restaurant, [
    'subscription_current_period_end',
    'current_period_end',
    'subscription_ends_at',
    'plan_expires_at',
  ])
  const trialEnd = getDateFromRestaurant(restaurant, [
    'trial_ends_at',
    'trial_end_at',
    'subscription_trial_ends_at',
    'trial_until',
  ]) || getFallbackTrialEnd(restaurant)

  const isActiveSubscription = ['active', 'paid', 'subscribed'].includes(status)
  const targetDate = isActiveSubscription ? activeUntil : trialEnd
  const diff = targetDate ? Math.max(targetDate.getTime() - now.getTime(), 0) : 0
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)

  if (isActiveSubscription) {
    return {
      tone: 'active',
      isActiveSubscription: true,
      kicker: 'Subscription Active',
      title: activeUntil
        ? `${formatPlan(plan)} active until ${formatDate(activeUntil)}`
        : `${formatPlan(plan)} subscription is active`,
      days,
      hours,
      minutes,
      buttonLabel: 'Manage Plan',
    }
  }

  if (diff <= 0) {
    return {
      tone: 'expired',
      isActiveSubscription: false,
      kicker: 'Trial Ended',
      title: 'Subscribe now to keep Spizy Menu active',
      days: 0,
      hours: 0,
      minutes: 0,
      buttonLabel: 'Subscribe Now',
    }
  }

  return {
    tone: 'trial',
    isActiveSubscription: false,
    kicker: 'Trial Countdown',
    title: `Trial ends ${formatDate(targetDate)} — subscribe before expiry`,
    days,
    hours,
    minutes,
    buttonLabel: 'Subscribe Now',
  }
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

function formatPlan(value) {
  return String(value || 'plan')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(value)
  } catch {
    return 'soon'
  }
}

export default SubscriptionTrialHeaderBar
