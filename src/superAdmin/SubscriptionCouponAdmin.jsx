import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgePercent, Plus, RefreshCcw, Save } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import './SubscriptionCouponAdmin.css'

const defaultForm = {
  code: '',
  description: '',
  discount_type: 'percentage',
  discount_value: '20',
  max_redemptions: '',
  starts_at: '',
  expires_at: '',
  is_active: true,
}

function SubscriptionCouponAdmin() {
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState(defaultForm)

  const loadCoupons = useCallback(async () => {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('spizy_subscription_coupons')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      setCoupons([])
    } else {
      setCoupons(data || [])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadCoupons()
  }, [loadCoupons])

  const stats = useMemo(() => {
    const active = coupons.filter((coupon) => coupon.is_active !== false).length
    const expired = coupons.filter((coupon) => coupon.expires_at && new Date(coupon.expires_at) < new Date()).length

    return {
      total: coupons.length,
      active,
      expired,
    }
  }, [coupons])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  const createCoupon = async (event) => {
    event.preventDefault()

    const code = form.code.trim().toUpperCase().replace(/\s+/g, '')
    if (!code) {
      setMessage('Enter a coupon code.')
      return
    }

    const discountValue = Number(form.discount_value || 0)
    if (discountValue <= 0) {
      setMessage('Enter a valid discount value.')
      return
    }

    setSaving(true)

    const payload = {
      code,
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: discountValue,
      max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
      starts_at: form.starts_at || null,
      expires_at: form.expires_at || null,
      is_active: form.is_active,
    }

    const { data, error } = await supabase.functions.invoke(
      'manage-spizy-subscription-coupons',
      {
        body: {
          action: 'create_coupon',
          coupon: payload,
        },
      },
    )

    if (error || data?.error) {
      setMessage(data?.error || error?.message || 'Coupon save failed.')
      setSaving(false)
      return
    }

    setForm(defaultForm)
    setSaving(false)
    setMessage('Coupon created successfully.')
    await loadCoupons()
  }

  const toggleCoupon = async (coupon) => {
    setSaving(true)

    const { data, error } = await supabase.functions.invoke(
      'manage-spizy-subscription-coupons',
      {
        body: {
          action: 'update_coupon',
          coupon_id: coupon.id,
          coupon: {
            is_active: coupon.is_active === false,
          },
        },
      },
    )

    if (error || data?.error) {
      setMessage(data?.error || error?.message || 'Coupon update failed.')
    } else {
      setMessage('Coupon updated.')
      await loadCoupons()
    }

    setSaving(false)
  }

  return (
    <section className="subscription-coupon-admin management-section">
      <div className="management-header">
        <div>
          <p className="pricing-label">Super Admin Only</p>
          <h2>Subscription Discount Coupons</h2>
          <span>Create launch offers and yearly/monthly subscription discounts for Mamo Pay subscription checkout.</span>
        </div>

        <button type="button" className="tiny-button" onClick={loadCoupons} disabled={loading}>
          <RefreshCcw size={15} />
          Refresh
        </button>
      </div>

      <div className="coupon-admin-kpis">
        <CouponKpi label="Total Coupons" value={stats.total} />
        <CouponKpi label="Active Coupons" value={stats.active} />
        <CouponKpi label="Expired Coupons" value={stats.expired} />
      </div>

      <form className="coupon-admin-form" onSubmit={createCoupon}>
        <div className="mini-form-head">
          <BadgePercent size={22} />
          <div>
            <h3>Create coupon</h3>
            <p>Coupon applies only to Spizy subscription payments, not restaurant customer payments.</p>
          </div>
        </div>

        <div className="form-grid three">
          <label>
            Coupon code
            <input value={form.code} onChange={(event) => updateForm('code', event.target.value)} placeholder="LAUNCH20" />
          </label>
          <label>
            Discount type
            <select value={form.discount_type} onChange={(event) => updateForm('discount_type', event.target.value)}>
              <option value="percentage">Percentage</option>
              <option value="fixed_amount">Fixed amount</option>
            </select>
          </label>
          <label>
            Discount value
            <input type="number" min="0" value={form.discount_value} onChange={(event) => updateForm('discount_value', event.target.value)} />
          </label>
        </div>

        <div className="form-grid three">
          <label>
            Max redemptions
            <input type="number" min="0" value={form.max_redemptions} onChange={(event) => updateForm('max_redemptions', event.target.value)} placeholder="Optional" />
          </label>
          <label>
            Starts at
            <input type="date" value={form.starts_at} onChange={(event) => updateForm('starts_at', event.target.value)} />
          </label>
          <label>
            Expires at
            <input type="date" value={form.expires_at} onChange={(event) => updateForm('expires_at', event.target.value)} />
          </label>
        </div>

        <label>
          Description
          <textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Launch coupon / yearly plan offer" />
        </label>

        {message && <div className="auth-message">{message}</div>}

        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? <RefreshCcw size={17} /> : <Plus size={17} />}
          {saving ? 'Saving...' : 'Create Coupon'}
        </button>
      </form>

      <div className="restaurants-table-wrap coupon-table-wrap">
        <table className="restaurants-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Discount</th>
              <th>Status</th>
              <th>Limit</th>
              <th>Expiry</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 ? (
              <tr>
                <td colSpan="6">{loading ? 'Loading coupons...' : 'No coupons created yet.'}</td>
              </tr>
            ) : coupons.map((coupon) => (
              <tr key={coupon.id}>
                <td><strong>{coupon.code}</strong><span>{coupon.description || 'Subscription coupon'}</span></td>
                <td>{formatCouponDiscount(coupon)}</td>
                <td><span className={`status-pill ${coupon.is_active === false ? 'cancelled' : 'active'}`}>{coupon.is_active === false ? 'Inactive' : 'Active'}</span></td>
                <td>{coupon.max_redemptions || 'Unlimited'}</td>
                <td>{coupon.expires_at ? formatDate(coupon.expires_at) : 'No expiry'}</td>
                <td>
                  <button type="button" className="tiny-button" onClick={() => toggleCoupon(coupon)} disabled={saving}>
                    <Save size={14} />
                    {coupon.is_active === false ? 'Activate' : 'Disable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CouponKpi({ label, value }) {
  return (
    <article className="coupon-admin-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function formatCouponDiscount(coupon) {
  if (coupon.discount_type === 'fixed_amount') return `AED ${Number(coupon.discount_value || 0).toFixed(2)}`
  return `${Number(coupon.discount_value || 0)}%`
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
  } catch {
    return value
  }
}

export default SubscriptionCouponAdmin
