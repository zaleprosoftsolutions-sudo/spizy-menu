import { useCallback, useEffect, useMemo, useState } from 'react'
import { BadgePercent, CheckCircle2, RefreshCw, Save, ToggleLeft, ToggleRight } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './SubscriptionCouponAdmin.css'

const defaultCouponForm = {
  code: '',
  coupon_name: '',
  description: '',
  discount_type: 'percentage',
  discount_value: '',
  max_redemptions: '',
  starts_at: '',
  ends_at: '',
  is_active: true,
  applicable_plan_keys: ['qr_menu_monthly', 'qr_menu_yearly'],
}

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

  const loadCoupons = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.functions.invoke('manage-spizy-subscription-coupons', {
      body: { action: 'list' },
    })
    setLoading(false)

    if (error || data?.error) {
      setMessage({ type: 'error', text: data?.error || error?.message || 'Unable to load coupons.' })
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

  const saveCoupon = async (event) => {
    event.preventDefault()
    setSaving(true)

    const payload = {
      ...form,
      code: form.code.trim().toUpperCase(),
      discount_value: Number(form.discount_value || 0),
      max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
    }

    const { data, error } = await supabase.functions.invoke('manage-spizy-subscription-coupons', {
      body: { action: 'upsert', coupon: payload },
    })

    setSaving(false)

    if (error || data?.error) {
      setMessage({ type: 'error', text: data?.error || error?.message || 'Unable to save coupon.' })
      return
    }

    setForm(defaultCouponForm)
    setMessage({ type: 'success', text: 'Subscription coupon saved successfully.' })
    await loadCoupons()
  }

  const toggleCoupon = async (coupon) => {
    const { data, error } = await supabase.functions.invoke('manage-spizy-subscription-coupons', {
      body: { action: 'toggle', coupon_id: coupon.id, is_active: !coupon.is_active },
    })

    if (error || data?.error) {
      setMessage({ type: 'error', text: data?.error || error?.message || 'Unable to update coupon.' })
      return
    }

    await loadCoupons()
  }

  return (
    <section className="super-subscription-admin-shell">
      <div className="super-subscription-hero">
        <div>
          <p className="pricing-label">Super Admin</p>
          <h1>Subscription coupons</h1>
          <p>Create launch discounts for Spizy subscription billing. Coupons apply only to Spizy SaaS plans paid through Mamo Pay.</p>
        </div>
        <button type="button" onClick={loadCoupons} disabled={loading}>
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      {message && <div className={`super-subscription-message ${message.type}`}>{message.text}</div>}

      <div className="super-subscription-kpis">
        <Kpi label="Total coupons" value={coupons.length} />
        <Kpi label="Active coupons" value={activeCoupons} />
        <Kpi label="Total redemptions" value={coupons.reduce((total, item) => total + Number(item.redeemed_count || 0), 0)} />
      </div>

      <div className="super-subscription-grid">
        <form className="super-subscription-panel" onSubmit={saveCoupon}>
          <div className="super-subscription-panel-head">
            <BadgePercent size={20} />
            <div><h2>Create coupon</h2><span>Only super admin can create or activate these coupons.</span></div>
          </div>

          <label>Coupon code<input value={form.code} onChange={(event) => updateForm('code', event.target.value.toUpperCase())} placeholder="LAUNCH25" required /></label>
          <label>Coupon name<input value={form.coupon_name} onChange={(event) => updateForm('coupon_name', event.target.value)} placeholder="Launch discount" required /></label>
          <label>Description<textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} placeholder="Internal note" /></label>

          <div className="super-form-row">
            <label>Discount type<select value={form.discount_type} onChange={(event) => updateForm('discount_type', event.target.value)}><option value="percentage">Percentage</option><option value="fixed_amount">Fixed AED amount</option></select></label>
            <label>Discount value<input type="number" min="1" step="0.01" value={form.discount_value} onChange={(event) => updateForm('discount_value', event.target.value)} required /></label>
          </div>

          <div className="super-form-row">
            <label>Max redemptions<input type="number" min="1" value={form.max_redemptions} onChange={(event) => updateForm('max_redemptions', event.target.value)} placeholder="Optional" /></label>
            <label>Status<select value={form.is_active ? 'active' : 'inactive'} onChange={(event) => updateForm('is_active', event.target.value === 'active')}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          </div>

          <div className="super-form-row">
            <label>Starts at<input type="datetime-local" value={form.starts_at} onChange={(event) => updateForm('starts_at', event.target.value)} /></label>
            <label>Ends at<input type="datetime-local" value={form.ends_at} onChange={(event) => updateForm('ends_at', event.target.value)} /></label>
          </div>

          <button type="submit" className="super-primary-button" disabled={saving}>
            {saving ? <RefreshCw size={17} /> : <Save size={17} />}
            {saving ? 'Saving...' : 'Save coupon'}
          </button>
        </form>

        <section className="super-subscription-panel">
          <div className="super-subscription-panel-head">
            <CheckCircle2 size={20} />
            <div><h2>Manage coupons</h2><span>Enable/disable active launch discounts.</span></div>
          </div>

          {loading ? <div className="super-empty">Loading coupons...</div> : coupons.length === 0 ? <div className="super-empty">No coupons created yet.</div> : (
            <div className="super-coupon-list">
              {coupons.map((coupon) => (
                <article className="super-coupon-card" key={coupon.id}>
                  <div><strong>{coupon.code}</strong><span>{coupon.coupon_name}</span></div>
                  <div><strong>{formatDiscount(coupon)}</strong><span>{coupon.redeemed_count || 0} redeemed</span></div>
                  <button type="button" onClick={() => toggleCoupon(coupon)}>
                    {coupon.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
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

function Kpi({ label, value }) {
  return <article><span>{label}</span><strong>{value}</strong></article>
}

function formatDiscount(coupon) {
  return coupon.discount_type === 'percentage'
    ? `${Number(coupon.discount_value || 0)}% off`
    : `AED ${Number(coupon.discount_value || 0).toFixed(2)} off`
}

export default SubscriptionCouponAdmin
