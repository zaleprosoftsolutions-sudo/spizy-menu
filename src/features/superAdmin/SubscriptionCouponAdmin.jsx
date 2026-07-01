import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgePercent,
  CheckCircle2,
  Clock3,
  Copy,
  RefreshCw,
  Save,
  ToggleLeft,
  ToggleRight,
  Zap,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './SubscriptionCouponAdmin.css'

const defaultCouponForm = {
  id: '',
  code: '',
  coupon_name: '',
  description: '',
  discount_type: 'fixed_amount',
  discount_value: '70',
  max_redemptions: '5',
  starts_at: '',
  ends_at: '',
  is_active: true,
  applicable_plan_keys: ['qr_menu_monthly', 'qr_menu_yearly'],
}

const planOptions = [
  { key: 'qr_menu_monthly', label: 'Monthly AED 75' },
  { key: 'qr_menu_yearly', label: 'Yearly AED 750' },
]

function SubscriptionCouponAdmin() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [coupons, setCoupons] = useState([])
  const [form, setForm] = useState(defaultCouponForm)

  const activeCoupons = useMemo(
    () => coupons.filter((coupon) => coupon.is_active).length,
    [coupons],
  )

  const totalRedemptions = useMemo(
    () => coupons.reduce((total, coupon) => total + Number(coupon.redeemed_count || 0), 0),
    [coupons],
  )

  const loadCoupons = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.functions.invoke('manage-spizy-subscription-coupons', {
      body: { action: 'list' },
    })
    setLoading(false)

    if (error || data?.error) {
      setMessage({ type: 'error', text: await getFunctionErrorMessage(data, error, 'Unable to load coupons.') })
      return
    }

    setCoupons(data?.coupons || [])
    setMessage(null)
  }, [])

  useEffect(() => {
    loadCoupons()
  }, [loadCoupons])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const togglePlan = (planKey) => {
    setForm((current) => {
      const currentPlans = Array.isArray(current.applicable_plan_keys)
        ? current.applicable_plan_keys
        : []
      const nextPlans = currentPlans.includes(planKey)
        ? currentPlans.filter((item) => item !== planKey)
        : [...currentPlans, planKey]

      return {
        ...current,
        applicable_plan_keys: nextPlans.length > 0 ? nextPlans : [planKey],
      }
    })
  }

  const fillAed70TestCoupon = () => {
    setForm({
      ...defaultCouponForm,
      code: 'TEST70',
      coupon_name: 'AED 70 test discount',
      description: 'Testing coupon to reduce AED 75 monthly subscription to AED 5.',
      discount_type: 'fixed_amount',
      discount_value: '70',
      max_redemptions: '5',
      is_active: true,
      applicable_plan_keys: ['qr_menu_monthly'],
    })
    setMessage({ type: 'info', text: 'AED 70 test coupon filled. Click Save coupon to activate it.' })
  }

  const fillLaunchCoupon = () => {
    setForm({
      ...defaultCouponForm,
      code: 'LAUNCH25',
      coupon_name: 'Launch 25% discount',
      description: 'Launch promotion for monthly and yearly Spizy subscription plans.',
      discount_type: 'percentage',
      discount_value: '25',
      max_redemptions: '100',
      is_active: true,
      applicable_plan_keys: ['qr_menu_monthly', 'qr_menu_yearly'],
    })
    setMessage({ type: 'info', text: 'Launch coupon filled. Review and save when ready.' })
  }

  const editCoupon = (coupon) => {
    setForm({
      id: coupon.id || '',
      code: coupon.code || '',
      coupon_name: coupon.coupon_name || '',
      description: coupon.description || '',
      discount_type: coupon.discount_type || 'fixed_amount',
      discount_value: String(coupon.discount_value || ''),
      max_redemptions: coupon.max_redemptions ? String(coupon.max_redemptions) : '',
      starts_at: toDateTimeLocal(coupon.starts_at),
      ends_at: toDateTimeLocal(coupon.ends_at),
      is_active: coupon.is_active !== false,
      applicable_plan_keys: Array.isArray(coupon.applicable_plan_keys) && coupon.applicable_plan_keys.length > 0
        ? coupon.applicable_plan_keys
        : ['qr_menu_monthly', 'qr_menu_yearly'],
    })
    window.requestAnimationFrame?.(() => {
      document.querySelector('.super-coupon-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const copyCouponCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code)
      setMessage({ type: 'success', text: `${code} copied. Paste it in the restaurant subscription coupon field.` })
    } catch {
      setMessage({ type: 'info', text: `Coupon code: ${code}` })
    }
  }

  const saveCoupon = async (event) => {
    event.preventDefault()

    const cleanCode = form.code.trim().replace(/\s+/g, '').toUpperCase()
    if (!cleanCode) {
      setMessage({ type: 'error', text: 'Coupon code is required.' })
      return
    }

    if (Number(form.discount_value || 0) <= 0) {
      setMessage({ type: 'error', text: 'Discount value must be greater than zero.' })
      return
    }

    setSaving(true)

    const payload = {
      id: form.id || undefined,
      code: cleanCode,
      coupon_name: form.coupon_name.trim() || cleanCode,
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value || 0),
      max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      is_active: Boolean(form.is_active),
      applicable_plan_keys: form.applicable_plan_keys,
    }

    const { data, error } = await supabase.functions.invoke('manage-spizy-subscription-coupons', {
      body: { action: 'upsert', coupon: payload },
    })

    setSaving(false)

    if (error || data?.error) {
      setMessage({ type: 'error', text: await getFunctionErrorMessage(data, error, 'Unable to save coupon.') })
      return
    }

    setForm(defaultCouponForm)
    setMessage({ type: 'success', text: `Coupon ${payload.code} saved successfully.` })
    await loadCoupons()
  }

  const toggleCoupon = async (coupon) => {
    const { data, error } = await supabase.functions.invoke('manage-spizy-subscription-coupons', {
      body: {
        action: 'toggle',
        coupon_id: coupon.id,
        is_active: !coupon.is_active,
      },
    })

    if (error || data?.error) {
      setMessage({ type: 'error', text: await getFunctionErrorMessage(data, error, 'Unable to update coupon.') })
      return
    }

    await loadCoupons()
  }

  return (
    <section className="super-subscription-admin-shell">
      <div className="super-subscription-hero">
        <div>
          <p className="pricing-label">Super Admin</p>
          <h1>Subscription discount coupons</h1>
          <p>
            Create optional coupon codes for Spizy subscription checkout. These coupons
            apply only to restaurant subscriptions paid through Mamo Pay, not customer orders.
          </p>
        </div>
        <button type="button" onClick={loadCoupons} disabled={loading}>
          <RefreshCw size={17} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {message && <div className={`super-subscription-message ${message.type}`}>{message.text}</div>}

      <div className="super-subscription-kpis">
        <Kpi label="Total coupons" value={coupons.length} />
        <Kpi label="Active coupons" value={activeCoupons} />
        <Kpi label="Redemptions" value={totalRedemptions} />
      </div>

      <div className="super-coupon-quick-row">
        <button type="button" onClick={fillAed70TestCoupon}>
          <Zap size={17} />
          Fill AED 70 test coupon
        </button>
        <button type="button" onClick={fillLaunchCoupon}>
          <BadgePercent size={17} />
          Fill 25% launch coupon
        </button>
      </div>

      <div className="super-subscription-grid">
        <form className="super-subscription-panel super-coupon-form-panel" onSubmit={saveCoupon}>
          <div className="super-subscription-panel-head">
            <BadgePercent size={20} />
            <div>
              <h2>{form.id ? 'Edit coupon' : 'Create coupon'}</h2>
              <span>Use fixed AED amount for testing, or percentage for launch offers.</span>
            </div>
          </div>

          <label>
            Coupon code
            <input
              value={form.code}
              onChange={(event) => updateForm('code', event.target.value.toUpperCase())}
              placeholder="TEST70"
              required
            />
          </label>

          <label>
            Coupon name
            <input
              value={form.coupon_name}
              onChange={(event) => updateForm('coupon_name', event.target.value)}
              placeholder="AED 70 test discount"
              required
            />
          </label>

          <label>
            Description
            <textarea
              value={form.description}
              onChange={(event) => updateForm('description', event.target.value)}
              placeholder="Internal note"
            />
          </label>

          <div className="super-form-row">
            <label>
              Discount type
              <select
                value={form.discount_type}
                onChange={(event) => updateForm('discount_type', event.target.value)}
              >
                <option value="fixed_amount">Fixed AED amount</option>
                <option value="percentage">Percentage</option>
              </select>
            </label>

            <label>
              Discount value
              <input
                type="number"
                min="1"
                step="0.01"
                value={form.discount_value}
                onChange={(event) => updateForm('discount_value', event.target.value)}
                required
              />
            </label>
          </div>

          <div className="super-plan-checkboxes">
            {planOptions.map((plan) => (
              <label key={plan.key}>
                <input
                  type="checkbox"
                  checked={form.applicable_plan_keys.includes(plan.key)}
                  onChange={() => togglePlan(plan.key)}
                />
                <span>{plan.label}</span>
              </label>
            ))}
          </div>

          <div className="super-form-row">
            <label>
              Max redemptions
              <input
                type="number"
                min="1"
                value={form.max_redemptions}
                onChange={(event) => updateForm('max_redemptions', event.target.value)}
                placeholder="Optional"
              />
            </label>

            <label>
              Status
              <select
                value={form.is_active ? 'active' : 'inactive'}
                onChange={(event) => updateForm('is_active', event.target.value === 'active')}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="super-form-row">
            <label>
              Starts at
              <input
                type="datetime-local"
                value={form.starts_at}
                onChange={(event) => updateForm('starts_at', event.target.value)}
              />
            </label>

            <label>
              Ends at
              <input
                type="datetime-local"
                value={form.ends_at}
                onChange={(event) => updateForm('ends_at', event.target.value)}
              />
            </label>
          </div>

          <button type="submit" className="super-primary-button" disabled={saving}>
            {saving ? <RefreshCw size={17} /> : <Save size={17} />}
            {saving ? 'Saving...' : 'Save coupon'}
          </button>
        </form>

        <section className="super-subscription-panel">
          <div className="super-subscription-panel-head">
            <CheckCircle2 size={20} />
            <div>
              <h2>Manage coupons</h2>
              <span>Copy coupon code and paste it in the restaurant subscription page.</span>
            </div>
          </div>

          {loading ? (
            <div className="super-empty">Loading coupons...</div>
          ) : coupons.length === 0 ? (
            <div className="super-empty">No coupons created yet.</div>
          ) : (
            <div className="super-coupon-list">
              {coupons.map((coupon) => (
                <article className="super-coupon-card" key={coupon.id}>
                  <div>
                    <strong>{coupon.code}</strong>
                    <span>{coupon.coupon_name || 'Subscription coupon'}</span>
                    <small>
                      {formatDiscount(coupon)} • {formatPlans(coupon.applicable_plan_keys)} • Used {coupon.redeemed_count || 0}{coupon.max_redemptions ? `/${coupon.max_redemptions}` : ''}
                    </small>
                    {(coupon.starts_at || coupon.ends_at) && (
                      <small><Clock3 size={13} /> {formatDateRange(coupon.starts_at, coupon.ends_at)}</small>
                    )}
                  </div>

                  <button type="button" className="ghost" onClick={() => copyCouponCode(coupon.code)}>
                    <Copy size={15} />
                    Copy
                  </button>

                  <button type="button" className="ghost" onClick={() => editCoupon(coupon)}>
                    Edit
                  </button>

                  <button
                    type="button"
                    className={coupon.is_active ? 'active' : 'inactive'}
                    onClick={() => toggleCoupon(coupon)}
                  >
                    {coupon.is_active ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
                    {coupon.is_active ? 'Active' : 'Inactive'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}

async function getFunctionErrorMessage(data, error, fallback) {
  if (data?.error) {
    return data.detected_role
      ? `${data.error} Detected role: ${data.detected_role}`
      : data.error
  }

  const context = error?.context
  if (context?.json) {
    try {
      const cloned = typeof context.clone === 'function' ? context.clone() : context
      const body = await cloned.json()
      if (body?.error) {
        return body.detected_role
          ? `${body.error} Detected role: ${body.detected_role}`
          : body.error
      }
    } catch {
      // keep fallback below
    }
  }

  return error?.message || fallback
}

function Kpi({ label, value }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function formatDiscount(coupon) {
  if (coupon.discount_type === 'percentage') return `${Number(coupon.discount_value || 0)}% off`
  return `${coupon.currency || 'AED'} ${Number(coupon.discount_value || 0).toFixed(2)} off`
}

function formatPlans(plans) {
  const safePlans = Array.isArray(plans) ? plans : []
  if (safePlans.includes('qr_menu_monthly') && safePlans.includes('qr_menu_yearly')) return 'Monthly + Yearly'
  if (safePlans.includes('qr_menu_yearly')) return 'Yearly only'
  return 'Monthly only'
}

function formatDateRange(start, end) {
  const parts = []
  if (start) parts.push(`Starts ${formatDate(start)}`)
  if (end) parts.push(`Ends ${formatDate(end)}`)
  return parts.join(' • ')
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return 'soon'
  }
}

function toDateTimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

export default SubscriptionCouponAdmin
