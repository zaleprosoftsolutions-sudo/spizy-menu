import { useEffect, useMemo, useState } from 'react'
import { CreditCard, Sparkles, TimerReset } from 'lucide-react'
import './SubscriptionTrialHeaderBar.css'

const fallbackTrialDays = 7

function SubscriptionTrialHeaderBar({ restaurant, onSubscribe }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const subscriptionInfo = useMemo(
    () => buildSubscriptionInfo({ restaurant, now }),
    [restaurant, now],
  )

  return (
    <section className={`subscription-trial-header-bar ${subscriptionInfo.tone}`}>
      <div className="subscription-trial-main">
        <div className="subscription-trial-icon">
          {subscriptionInfo.isActive ? <Sparkles size={20} /> : <TimerReset size={20} />}
        </div>

        <div>
          <span>{subscriptionInfo.kicker}</span>
          <strong>{subscriptionInfo.title}</strong>
          <small>{subscriptionInfo.note}</small>
        </div>
      </div>

      <div className="subscription-countdown-wrap">
        {subscriptionInfo.countdown.map((item) => (
          <div className="subscription-countdown-box" key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <button type="button" className="subscription-header-button" onClick={onSubscribe}>
        <CreditCard size={17} />
        {subscriptionInfo.buttonLabel}
      </button>
    </section>
  )
}

function buildSubscriptionInfo({ restaurant, now }) {
  const status = String(restaurant?.subscription_status || 'trialing').toLowerCase()
  const plan = String(restaurant?.subscription_plan || restaurant?.plan || 'QR Menu').replace(/[_-]+/g, ' ')
  const activeStatuses = new Set(['active', 'paid', 'subscribed'])
  const trialStatuses = new Set(['trialing', 'trial', 'free_trial'])
  const trialEnd = getSubscriptionEndDate(restaurant)
  const isActive = activeStatuses.has(status)
  const isTrial = trialStatuses.has(status) || (!isActive && trialEnd)
  const remainingMs = trialEnd ? trialEnd.getTime() - now.getTime() : 0
  const isExpired = remainingMs <= 0 && !isActive
  const parts = getCountdownParts(Math.max(remainingMs, 0))

  if (isActive) {
    return {
      tone: 'active',
      isActive: true,
      kicker: 'Subscription Active',
      title: `${titleCase(plan)} plan is active`,
      note: trialEnd ? `Current period ends ${formatDate(trialEnd)}.` : 'Your restaurant subscription is active.',
      countdown: trialEnd
        ? [
            { label: 'days left', value: parts.days },
            { label: 'hours', value: parts.hours },
            { label: 'mins', value: parts.minutes },
          ]
        : [
            { label: 'status', value: 'ON' },
            { label: 'plan', value: 'OK' },
            { label: 'access', value: 'LIVE' },
          ],
      buttonLabel: 'Manage Plan',
    }
  }

  if (isExpired) {
    return {
      tone: 'danger',
      isActive: false,
      kicker: 'Trial Ended',
      title: 'Subscribe now to keep Spizy active',
      note: 'Choose monthly or yearly plan and pay securely with Mamo Pay.',
      countdown: [
        { label: 'days', value: '0' },
        { label: 'hours', value: '0' },
        { label: 'mins', value: '0' },
      ],
      buttonLabel: 'Subscribe Now',
    }
  }

  return {
    tone: isTrial ? 'trial' : 'warning',
    isActive: false,
    kicker: isTrial ? 'Free Trial Countdown' : 'Subscription Needed',
    title: trialEnd
      ? `Trial ends on ${formatDate(trialEnd)}`
      : 'Start your Spizy subscription',
    note: 'Upgrade to monthly or yearly plan. Payments are handled by Mamo Pay for Spizy subscription only.',
    countdown: [
      { label: 'days left', value: parts.days },
      { label: 'hours', value: parts.hours },
      { label: 'mins', value: parts.minutes },
    ],
    buttonLabel: 'Subscribe Now',
  }
}

function getSubscriptionEndDate(restaurant) {
  const directValue =
    restaurant?.trial_ends_at ||
    restaurant?.trial_end_at ||
    restaurant?.trial_expires_at ||
    restaurant?.subscription_trial_ends_at ||
    restaurant?.subscription_current_period_end ||
    restaurant?.current_period_end ||
    restaurant?.subscription_grace_until

  const directDate = parseDate(directValue)
  if (directDate) return directDate

  const createdAt = parseDate(restaurant?.created_at)
  const fallback = new Date(createdAt || new Date())
  fallback.setDate(fallback.getDate() + fallbackTrialDays)
  return fallback
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getCountdownParts(ms) {
  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  return {
    days: String(days),
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
  }
}

function formatDate(date) {
  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

function titleCase(value) {
  return String(value || '')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export default SubscriptionTrialHeaderBar
