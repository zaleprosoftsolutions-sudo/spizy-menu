import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CreditCard, Sparkles } from 'lucide-react'
import './SubscriptionTrialHeaderBar.css'

function SubscriptionTrialHeaderBar({ restaurant, onOpenSection }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  const trialInfo = useMemo(
    () => buildTrialInfo({ restaurant, now }),
    [restaurant, now],
  )

  const status = String(restaurant?.subscription_status || 'trialing').toLowerCase()
  const isActive = status === 'active'

  return (
    <section className={`spizy-subscription-header-bar ${isActive ? 'active' : trialInfo.isExpired ? 'expired' : 'trial'}`}>
      <div className="spizy-subscription-header-main">
        <div className="spizy-subscription-header-icon">
          {isActive ? <CreditCard size={20} /> : <CalendarClock size={20} />}
        </div>

        <div>
          <p>{isActive ? 'Subscription active' : trialInfo.isExpired ? 'Trial ended' : 'Trial countdown'}</p>
          <h3>{isActive ? 'Your Spizy plan is active' : trialInfo.title}</h3>
          <span>{isActive ? trialInfo.activeNote : trialInfo.note}</span>
        </div>
      </div>

      <div className="spizy-subscription-countdown">
        <CountdownCell label="Days" value={trialInfo.days} />
        <CountdownCell label="Hours" value={trialInfo.hours} />
        <CountdownCell label="Mins" value={trialInfo.minutes} />
      </div>

      <button
        type="button"
        className="spizy-subscribe-now-button"
        onClick={() => onOpenSection?.('subscription-billing')}
      >
        <Sparkles size={17} />
        {isActive ? 'Manage Plan' : 'Subscribe Now'}
      </button>
    </section>
  )
}

function CountdownCell({ label, value }) {
  return (
    <div>
      <strong>{String(Math.max(0, Number(value || 0))).padStart(2, '0')}</strong>
      <span>{label}</span>
    </div>
  )
}

function buildTrialInfo({ restaurant, now }) {
  const status = String(restaurant?.subscription_status || 'trialing').toLowerCase()
  const trialEnd = getTrialEndDate(restaurant)
  const diffMs = trialEnd.getTime() - now.getTime()
  const positiveMs = Math.max(0, diffMs)
  const totalMinutes = Math.floor(positiveMs / (1000 * 60))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60)
  const minutes = totalMinutes % 60
  const isExpired = diffMs <= 0 && status !== 'active'

  return {
    days,
    hours,
    minutes,
    isExpired,
    title: isExpired ? 'Subscribe to keep restaurant tools active' : `${days} day${days === 1 ? '' : 's'} left in trial`,
    note: isExpired
      ? 'Trial is over. Subscribe with Mamo Pay to continue using Spizy after launch.'
      : `Trial ends on ${formatDate(trialEnd)}. Subscribe now to avoid interruption.`,
    activeNote: restaurant?.subscription_current_period_end
      ? `Current period ends on ${formatDate(new Date(`${String(restaurant.subscription_current_period_end).slice(0, 10)}T23:59:59`))}.`
      : 'Open Subscription to view invoice and renewal details.',
  }
}

function getTrialEndDate(restaurant) {
  const explicitTrialEnd = restaurant?.subscription_trial_ends_at || restaurant?.trial_ends_at
  if (explicitTrialEnd) {
    const parsed = new Date(`${String(explicitTrialEnd).slice(0, 10)}T23:59:59`)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  if (restaurant?.subscription_current_period_end) {
    const parsed = new Date(`${String(restaurant.subscription_current_period_end).slice(0, 10)}T23:59:59`)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  const createdAt = restaurant?.created_at ? new Date(restaurant.created_at) : new Date()
  if (!Number.isNaN(createdAt.getTime())) {
    const fallback = new Date(createdAt)
    fallback.setDate(fallback.getDate() + 14)
    fallback.setHours(23, 59, 59, 999)
    return fallback
  }

  const fallback = new Date()
  fallback.setDate(fallback.getDate() + 14)
  fallback.setHours(23, 59, 59, 999)
  return fallback
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(value)
  } catch {
    return 'trial end date'
  }
}

export default SubscriptionTrialHeaderBar
