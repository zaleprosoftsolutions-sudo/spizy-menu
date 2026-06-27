import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Award,
  Crown,
  Edit3,
  Gift,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './LoyaltyTiersManagement.css'

const defaultTierForm = {
  tier_name: '',
  tier_label: '',
  tier_rank: 1,
  tier_color: '#f97316',
  required_spend: '',
  required_orders: '',
  required_points: '',
  reward_multiplier: '1',
  discount_percent: '',
  perks: '',
  is_active: true,
}

const suggestedTiers = [
  {
    tier_name: 'Bronze',
    tier_label: 'New regular customer',
    tier_rank: 1,
    tier_color: '#cd7f32',
    required_spend: 0,
    required_orders: 0,
    required_points: 0,
    reward_multiplier: 1,
    discount_percent: 0,
    perks: 'Entry level loyalty tier for all repeat customers.',
    is_active: true,
  },
  {
    tier_name: 'Silver',
    tier_label: 'Repeat customer',
    tier_rank: 2,
    tier_color: '#94a3b8',
    required_spend: 250,
    required_orders: 5,
    required_points: 50,
    reward_multiplier: 1.1,
    discount_percent: 3,
    perks: 'Small loyalty discount and priority offer targeting.',
    is_active: true,
  },
  {
    tier_name: 'Gold',
    tier_label: 'VIP customer',
    tier_rank: 3,
    tier_color: '#f59e0b',
    required_spend: 750,
    required_orders: 15,
    required_points: 150,
    reward_multiplier: 1.25,
    discount_percent: 5,
    perks: 'VIP discount, special coupons and birthday-style offers.',
    is_active: true,
  },
]

function LoyaltyTiersManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tiers, setTiers] = useState([])
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [activeView, setActiveView] = useState('customers')
  const [editingTier, setEditingTier] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(defaultTierForm)

  const currency = restaurant?.currency || 'AED'

  const loadData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    await supabase.rpc('refresh_restaurant_customers', {
      p_restaurant_id: restaurant.id,
    })

    const [tierResult, customerResult] = await Promise.all([
      supabase
        .from('restaurant_loyalty_tiers')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .order('tier_rank', { ascending: true })
        .order('required_spend', { ascending: true }),
      supabase
        .from('restaurant_customers')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('total_spend', { ascending: false })
        .limit(250),
    ])

    if (tierResult.error) {
      showToast({
        type: 'error',
        title: 'Loyalty tiers failed',
        message: tierResult.error.message,
      })
    }

    if (customerResult.error) {
      showToast({
        type: 'error',
        title: 'Customers failed',
        message: customerResult.error.message,
      })
    }

    setTiers(tierResult.data || [])
    setCustomers(customerResult.data || [])
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const activeTiers = useMemo(() => {
    return tiers
      .filter((tier) => tier.is_active)
      .sort((a, b) => {
        const rankDiff = Number(b.tier_rank || 0) - Number(a.tier_rank || 0)
        if (rankDiff !== 0) return rankDiff
        return Number(b.required_spend || 0) - Number(a.required_spend || 0)
      })
  }, [tiers])

  const customerRows = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return customers
      .map((customer) => ({
        ...customer,
        tier: getCustomerTier(customer, activeTiers),
        nextTier: getNextTier(customer, activeTiers),
      }))
      .filter((customer) => {
        if (!keyword) return true

        return [
          customer.customer_name,
          customer.customer_phone,
          customer.tier?.tier_name,
          customer.nextTier?.tier_name,
        ].some((value) =>
          String(value || '')
            .toLowerCase()
            .includes(keyword),
        )
      })
  }, [activeTiers, customers, search])

  const stats = useMemo(() => {
    const vipCustomers = customerRows.filter((customer) => customer.tier).length
    const totalSpend = customers.reduce(
      (sum, customer) => sum + Number(customer.total_spend || 0),
      0,
    )
    const totalPoints = customers.reduce(
      (sum, customer) => sum + Number(customer.reward_points || 0),
      0,
    )

    return {
      tiers: tiers.filter((tier) => !tier.is_deleted).length,
      activeTiers: tiers.filter((tier) => tier.is_active && !tier.is_deleted).length,
      customers: customers.length,
      vipCustomers,
      totalSpend,
      totalPoints,
    }
  }, [customerRows, customers, tiers])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const openNewTier = () => {
    setEditingTier(null)
    setForm({
      ...defaultTierForm,
      tier_rank: tiers.length + 1,
    })
    setShowForm(true)
  }

  const openEditTier = (tier) => {
    setEditingTier(tier)
    setForm({
      tier_name: tier.tier_name || '',
      tier_label: tier.tier_label || '',
      tier_rank: tier.tier_rank || 1,
      tier_color: tier.tier_color || '#f97316',
      required_spend: safeNumberInput(tier.required_spend),
      required_orders: safeNumberInput(tier.required_orders),
      required_points: safeNumberInput(tier.required_points),
      reward_multiplier: safeNumberInput(tier.reward_multiplier || 1),
      discount_percent: safeNumberInput(tier.discount_percent),
      perks: tier.perks || '',
      is_active: tier.is_active !== false,
    })
    setShowForm(true)
  }

  const handleSaveTier = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const tierName = form.tier_name.trim()

    if (!tierName) {
      showToast({
        type: 'warning',
        title: 'Tier name needed',
        message: 'Add a tier name like Bronze, Silver, Gold or VIP.',
      })
      return
    }

    setSaving(true)

    const payload = {
      restaurant_id: restaurant.id,
      tier_name: tierName,
      tier_label: form.tier_label.trim() || null,
      tier_rank: Number(form.tier_rank || 1),
      tier_color: form.tier_color || '#f97316',
      required_spend: Number(form.required_spend || 0),
      required_orders: Number(form.required_orders || 0),
      required_points: Number(form.required_points || 0),
      reward_multiplier: Math.max(Number(form.reward_multiplier || 1), 1),
      discount_percent: Number(form.discount_percent || 0),
      perks: form.perks.trim() || null,
      is_active: Boolean(form.is_active),
      updated_at: new Date().toISOString(),
    }

    const query = editingTier?.id
      ? supabase
          .from('restaurant_loyalty_tiers')
          .update(payload)
          .eq('id', editingTier.id)
          .eq('restaurant_id', restaurant.id)
      : supabase.from('restaurant_loyalty_tiers').insert(payload)

    const { error } = await query

    setSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Tier save failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: editingTier ? 'Tier updated' : 'Tier created',
      message: `${tierName} is ready for customer segmentation.`,
    })

    setShowForm(false)
    setEditingTier(null)
    setForm(defaultTierForm)
    await loadData()
  }

  const handleSeedTiers = async () => {
    if (!restaurant?.id) return

    setSaving(true)

    const { error } = await supabase.from('restaurant_loyalty_tiers').insert(
      suggestedTiers.map((tier) => ({
        ...tier,
        restaurant_id: restaurant.id,
      })),
    )

    setSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Default tiers failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Default tiers added',
      message: 'Bronze, Silver and Gold loyalty tiers are ready.',
    })

    await loadData()
  }

  const handleDeleteTier = async (tier) => {
    const confirmed = await confirmAction({
      title: 'Delete loyalty tier?',
      message: `${tier.tier_name} will be hidden from future customer tier matching.`,
      confirmText: 'Delete tier',
      cancelText: 'Keep',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('restaurant_loyalty_tiers')
      .update({ is_deleted: true, is_active: false, updated_at: new Date().toISOString() })
      .eq('id', tier.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Delete failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Tier deleted',
      message: `${tier.tier_name} was removed.`,
    })

    await loadData()
  }

  if (!restaurant?.id) {
    return (
      <section className="loyalty-page">
        <div className="loyalty-empty">Restaurant profile is required.</div>
      </section>
    )
  }

  return (
    <section className="loyalty-page">
      <div className="loyalty-hero">
        <div>
          <p className="pricing-label">Customer Loyalty</p>
          <h2>Membership tiers</h2>
          <span>
            Create Bronze, Silver, Gold or VIP tiers based on spend, orders and points.
          </span>
        </div>

        <div className="loyalty-hero-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={17} />
            Refresh
          </button>

          <button type="button" className="primary-button" onClick={openNewTier}>
            <Plus size={17} />
            New Tier
          </button>
        </div>
      </div>

      <div className="loyalty-stats-grid">
        <LoyaltyStatCard
          icon={<Crown size={20} />}
          label="Active tiers"
          value={`${stats.activeTiers}/${stats.tiers}`}
          text="Visible tier rules"
        />
        <LoyaltyStatCard
          icon={<Users size={20} />}
          label="Customers"
          value={stats.customers}
          text="Known paid customers"
        />
        <LoyaltyStatCard
          icon={<Award size={20} />}
          label="Tier matched"
          value={stats.vipCustomers}
          text="Customers in a tier"
        />
        <LoyaltyStatCard
          icon={<Gift size={20} />}
          label="Reward points"
          value={formatNumber(stats.totalPoints)}
          text={`${currency} ${formatMoney(stats.totalSpend)} spend`}
        />
      </div>

      <div className="loyalty-toolbar">
        <div className="loyalty-tabs">
          <button
            type="button"
            className={activeView === 'customers' ? 'active' : ''}
            onClick={() => setActiveView('customers')}
          >
            Customer tiers
          </button>
          <button
            type="button"
            className={activeView === 'rules' ? 'active' : ''}
            onClick={() => setActiveView('rules')}
          >
            Tier rules
          </button>
        </div>

        <div className="loyalty-search">
          <Search size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search customer, phone or tier..."
          />
        </div>
      </div>

      {loading ? (
        <div className="loyalty-empty">Loading loyalty data...</div>
      ) : activeView === 'rules' ? (
        <TierRulesView
          tiers={tiers}
          currency={currency}
          saving={saving}
          onSeedTiers={handleSeedTiers}
          onEditTier={openEditTier}
          onDeleteTier={handleDeleteTier}
        />
      ) : (
        <CustomerTiersView
          rows={customerRows}
          tiers={activeTiers}
          currency={currency}
        />
      )}

      {showForm && (
        <TierFormModal
          form={form}
          editingTier={editingTier}
          saving={saving}
          currency={currency}
          onUpdate={updateForm}
          onClose={() => {
            setShowForm(false)
            setEditingTier(null)
          }}
          onSubmit={handleSaveTier}
        />
      )}
    </section>
  )
}

function LoyaltyStatCard({ icon, label, value, text }) {
  return (
    <article className="loyalty-stat-card">
      <div className="loyalty-stat-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{text}</p>
    </article>
  )
}

function TierRulesView({ tiers, currency, saving, onSeedTiers, onEditTier, onDeleteTier }) {
  if (tiers.length === 0) {
    return (
      <div className="loyalty-empty premium">
        <div className="loyalty-empty-icon">
          <Sparkles size={32} />
        </div>
        <h3>No loyalty tiers yet</h3>
        <p>
          Add tiers manually, or start with Bronze, Silver and Gold recommended defaults.
        </p>
        <button
          type="button"
          className="primary-button"
          onClick={onSeedTiers}
          disabled={saving}
        >
          <ShieldCheck size={17} />
          Add default tiers
        </button>
      </div>
    )
  }

  return (
    <div className="loyalty-tier-grid">
      {tiers.map((tier) => (
        <article className={`loyalty-tier-card ${tier.is_active ? '' : 'muted'}`} key={tier.id}>
          <div className="loyalty-tier-top">
            <div className="loyalty-tier-medal" style={{ '--tier-color': tier.tier_color || '#f97316' }}>
              <Crown size={20} />
            </div>
            <div>
              <strong>{tier.tier_name}</strong>
              <span>{tier.tier_label || `Rank ${tier.tier_rank || 1}`}</span>
            </div>
          </div>

          <div className="loyalty-tier-rules">
            <div>
              <span>Spend</span>
              <strong>{currency} {formatMoney(tier.required_spend)}</strong>
            </div>
            <div>
              <span>Orders</span>
              <strong>{formatNumber(tier.required_orders)}</strong>
            </div>
            <div>
              <span>Points</span>
              <strong>{formatNumber(tier.required_points)}</strong>
            </div>
            <div>
              <span>Discount</span>
              <strong>{formatNumber(tier.discount_percent)}%</strong>
            </div>
          </div>

          <p>{tier.perks || 'No perks added yet.'}</p>

          <div className="loyalty-tier-foot">
            <span className={tier.is_active ? 'active' : 'hidden'}>
              {tier.is_active ? 'Active' : 'Hidden'}
            </span>
            <div>
              <button type="button" onClick={() => onEditTier(tier)}>
                <Edit3 size={15} />
              </button>
              <button type="button" className="danger" onClick={() => onDeleteTier(tier)}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function CustomerTiersView({ rows, tiers, currency }) {
  if (tiers.length === 0) {
    return (
      <div className="loyalty-empty premium">
        <div className="loyalty-empty-icon">
          <Award size={32} />
        </div>
        <h3>Create tier rules first</h3>
        <p>
          After you create loyalty tiers, Spizy will automatically match customers based on spend, orders and reward points.
        </p>
      </div>
    )
  }

  if (rows.length === 0) {
    return <div className="loyalty-empty">No matching customers found.</div>
  }

  return (
    <div className="loyalty-customer-list">
      {rows.map((customer) => (
        <CustomerTierRow customer={customer} currency={currency} key={customer.id} />
      ))}
    </div>
  )
}

function CustomerTierRow({ customer, currency }) {
  const tier = customer.tier
  const nextTier = customer.nextTier
  const progress = nextTier ? getTierProgress(customer, nextTier) : 100

  return (
    <article className="loyalty-customer-row">
      <div className="loyalty-customer-main">
        <div className="loyalty-customer-avatar">
          {(customer.customer_name || customer.customer_phone || 'CU').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <strong>{customer.customer_name || 'Customer'}</strong>
          <span>{customer.customer_phone}</span>
        </div>
      </div>

      <div className="loyalty-customer-metrics">
        <div>
          <span>Spend</span>
          <strong>{currency} {formatMoney(customer.total_spend)}</strong>
        </div>
        <div>
          <span>Orders</span>
          <strong>{formatNumber(customer.total_orders)}</strong>
        </div>
        <div>
          <span>Points</span>
          <strong>{formatNumber(customer.reward_points)}</strong>
        </div>
      </div>

      <div className="loyalty-current-tier">
        {tier ? (
          <>
            <div className="loyalty-tier-pill" style={{ '--tier-color': tier.tier_color || '#f97316' }}>
              <Crown size={15} />
              {tier.tier_name}
            </div>
            <span>{tier.discount_percent ? `${formatNumber(tier.discount_percent)}% discount tier` : tier.tier_label || 'Tier matched'}</span>
          </>
        ) : (
          <>
            <div className="loyalty-tier-pill no-tier">
              <Award size={15} />
              No tier
            </div>
            <span>Customer has not reached the first tier yet.</span>
          </>
        )}
      </div>

      <div className="loyalty-next-tier">
        {nextTier ? (
          <>
            <div className="loyalty-progress-head">
              <span>Next: {nextTier.tier_name}</span>
              <strong>{Math.round(progress)}%</strong>
            </div>
            <div className="loyalty-progress-bar">
              <i style={{ width: `${progress}%` }} />
            </div>
            <small>
              Needs {currency} {formatMoney(Math.max(Number(nextTier.required_spend || 0) - Number(customer.total_spend || 0), 0))} spend or {formatNumber(Math.max(Number(nextTier.required_orders || 0) - Number(customer.total_orders || 0), 0))} orders.
            </small>
          </>
        ) : (
          <div className="loyalty-top-customer">
            <ShieldCheck size={17} />
            Top tier customer
          </div>
        )}
      </div>
    </article>
  )
}

function TierFormModal({ form, editingTier, saving, currency, onUpdate, onClose, onSubmit }) {
  return (
    <div className="loyalty-modal-overlay" onClick={onClose}>
      <form className="loyalty-tier-form" onSubmit={onSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="loyalty-form-head">
          <div>
            <p className="pricing-label">Loyalty Tier</p>
            <h3>{editingTier ? 'Edit tier' : 'Create tier'}</h3>
          </div>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="loyalty-form-grid">
          <label>
            Tier name
            <input
              type="text"
              value={form.tier_name}
              onChange={(event) => onUpdate('tier_name', event.target.value)}
              placeholder="Gold / VIP / Diamond"
            />
          </label>

          <label>
            Short label
            <input
              type="text"
              value={form.tier_label}
              onChange={(event) => onUpdate('tier_label', event.target.value)}
              placeholder="VIP customer"
            />
          </label>

          <label>
            Rank
            <input
              type="number"
              min="1"
              value={form.tier_rank}
              onChange={(event) => onUpdate('tier_rank', event.target.value)}
            />
          </label>

          <label>
            Color
            <input
              type="color"
              value={form.tier_color}
              onChange={(event) => onUpdate('tier_color', event.target.value)}
            />
          </label>

          <label>
            Required spend ({currency})
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.required_spend}
              onChange={(event) => onUpdate('required_spend', event.target.value)}
              placeholder="0.00"
            />
          </label>

          <label>
            Required orders
            <input
              type="number"
              min="0"
              value={form.required_orders}
              onChange={(event) => onUpdate('required_orders', event.target.value)}
              placeholder="0"
            />
          </label>

          <label>
            Required reward points
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.required_points}
              onChange={(event) => onUpdate('required_points', event.target.value)}
              placeholder="0"
            />
          </label>

          <label>
            Reward multiplier
            <input
              type="number"
              min="1"
              step="0.01"
              value={form.reward_multiplier}
              onChange={(event) => onUpdate('reward_multiplier', event.target.value)}
              placeholder="1.00"
            />
          </label>

          <label>
            Tier discount %
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.discount_percent}
              onChange={(event) => onUpdate('discount_percent', event.target.value)}
              placeholder="0"
            />
          </label>

          <label className="loyalty-toggle-field">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => onUpdate('is_active', event.target.checked)}
            />
            <span>Active tier</span>
          </label>
        </div>

        <label className="loyalty-textarea-label">
          Perks / notes
          <textarea
            value={form.perks}
            onChange={(event) => onUpdate('perks', event.target.value)}
            placeholder="Example: Free dessert coupon, VIP offers, priority table booking..."
            rows="4"
          />
        </label>

        <div className="loyalty-form-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? 'Saving...' : editingTier ? 'Update tier' : 'Create tier'}
          </button>
        </div>
      </form>
    </div>
  )
}

function getCustomerTier(customer, tiers) {
  return tiers.find((tier) => customerQualifiesForTier(customer, tier)) || null
}

function getNextTier(customer, tiers) {
  const ascendingTiers = [...tiers].sort(
    (a, b) => Number(a.tier_rank || 0) - Number(b.tier_rank || 0),
  )

  return ascendingTiers.find((tier) => !customerQualifiesForTier(customer, tier)) || null
}

function customerQualifiesForTier(customer, tier) {
  const spendReady = Number(customer.total_spend || 0) >= Number(tier.required_spend || 0)
  const ordersReady = Number(customer.total_orders || 0) >= Number(tier.required_orders || 0)
  const pointsReady = Number(customer.reward_points || 0) >= Number(tier.required_points || 0)

  return spendReady && ordersReady && pointsReady
}

function getTierProgress(customer, tier) {
  const spendRequired = Number(tier.required_spend || 0)
  const orderRequired = Number(tier.required_orders || 0)
  const pointRequired = Number(tier.required_points || 0)

  const parts = []

  if (spendRequired > 0) {
    parts.push(Math.min((Number(customer.total_spend || 0) / spendRequired) * 100, 100))
  }

  if (orderRequired > 0) {
    parts.push(Math.min((Number(customer.total_orders || 0) / orderRequired) * 100, 100))
  }

  if (pointRequired > 0) {
    parts.push(Math.min((Number(customer.reward_points || 0) / pointRequired) * 100, 100))
  }

  if (parts.length === 0) return 100

  return Math.max(Math.min(Math.min(...parts), 100), 0)
}

function safeNumberInput(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}

function formatNumber(value) {
  const numberValue = Number(value || 0)
  if (Number.isInteger(numberValue)) return String(numberValue)
  return numberValue.toFixed(2)
}

export default LoyaltyTiersManagement
