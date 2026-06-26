import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgePercent,
  CalendarClock,
  Edit3,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './DiscountsManagement.css'

const defaultDiscountForm = {
  title: '',
  code: '',
  discount_type: 'fixed_amount',
  discount_value: 10,
  min_order_amount: 0,
  max_discount_amount: '',
  usage_limit: '',
  per_customer_limit: 1,
  starts_at: '',
  ends_at: '',
  is_active: true,
}

const discountTypeOptions = [
  { value: 'fixed_amount', label: 'Fixed amount' },
  { value: 'percentage', label: 'Percentage' },
]

function DiscountsManagement({ restaurant }) {
  const [discounts, setDiscounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingDiscount, setEditingDiscount] = useState(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState(defaultDiscountForm)

  const currency = restaurant?.currency || 'AED'

  const loadDiscounts = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data, error } = await supabase
      .from('restaurant_discounts')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    setDiscounts(error ? [] : data || [])
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadDiscounts()
  }, [loadDiscounts])

  const stats = useMemo(() => {
    const active = discounts.filter((discount) => discount.is_active).length
    const expired = discounts.filter((discount) => isExpired(discount)).length
    const scheduled = discounts.filter((discount) => isScheduled(discount)).length

    return {
      total: discounts.length,
      active,
      expired,
      scheduled,
    }
  }, [discounts])

  const filteredDiscounts = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return discounts

    return discounts.filter((discount) =>
      [discount.title, discount.code, discount.discount_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    )
  }, [discounts, search])

  const showInlineMessage = (type, text) => {
    setMessage({ type, text })

    window.setTimeout(() => {
      setMessage(null)
    }, 3500)
  }

  const refreshDiscounts = async () => {
    setRefreshing(true)
    await loadDiscounts()
    setRefreshing(false)
  }

  const openCreateForm = () => {
    setEditingDiscount(null)
    setForm(defaultDiscountForm)
    setShowForm(true)
  }

  const openEditForm = (discount) => {
    setEditingDiscount(discount)
    setForm({
      title: discount.title || '',
      code: discount.code || '',
      discount_type: discount.discount_type || 'fixed_amount',
      discount_value: Number(discount.discount_value || 0),
      min_order_amount: Number(discount.min_order_amount || 0),
      max_discount_amount:
        discount.max_discount_amount === null ||
        discount.max_discount_amount === undefined
          ? ''
          : Number(discount.max_discount_amount),
      usage_limit:
        discount.usage_limit === null || discount.usage_limit === undefined
          ? ''
          : Number(discount.usage_limit),
      per_customer_limit: Number(discount.per_customer_limit || 1),
      starts_at: toInputDateTime(discount.starts_at),
      ends_at: toInputDateTime(discount.ends_at),
      is_active: Boolean(discount.is_active),
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingDiscount(null)
    setForm(defaultDiscountForm)
  }

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleSaveDiscount = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const title = form.title.trim()
    const code = normalizeDiscountCode(form.code)
    const discountType = form.discount_type
    const discountValue = Number(form.discount_value || 0)
    const minOrderAmount = Math.max(0, Number(form.min_order_amount || 0))
    const maxDiscountAmount =
      form.max_discount_amount === ''
        ? null
        : Math.max(0, Number(form.max_discount_amount || 0))
    const usageLimit =
      form.usage_limit === '' ? null : Math.max(1, Number(form.usage_limit || 1))
    const perCustomerLimit = Math.max(1, Number(form.per_customer_limit || 1))

    if (!title) {
      showInlineMessage('error', 'Discount title is required.')
      return
    }

    if (!code) {
      showInlineMessage('error', 'Coupon code is required.')
      return
    }

    if (discountValue <= 0) {
      showInlineMessage('error', 'Discount value should be greater than 0.')
      return
    }

    if (discountType === 'percentage' && discountValue > 100) {
      showInlineMessage('error', 'Percentage discount cannot be more than 100%.')
      return
    }

    if (form.starts_at && form.ends_at) {
      const startTime = new Date(form.starts_at).getTime()
      const endTime = new Date(form.ends_at).getTime()

      if (endTime <= startTime) {
        showInlineMessage('error', 'End date should be after start date.')
        return
      }
    }

    setSaving(true)

    const payload = {
      restaurant_id: restaurant.id,
      title,
      code,
      discount_type: discountType,
      discount_value: discountValue,
      min_order_amount: minOrderAmount,
      max_discount_amount: maxDiscountAmount,
      usage_limit: usageLimit,
      per_customer_limit: perCustomerLimit,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      is_active: Boolean(form.is_active),
      updated_at: new Date().toISOString(),
    }

    const query = editingDiscount?.id
      ? supabase
          .from('restaurant_discounts')
          .update(payload)
          .eq('id', editingDiscount.id)
          .select('*')
          .single()
      : supabase
          .from('restaurant_discounts')
          .insert(payload)
          .select('*')
          .single()

    const { data, error } = await query

    setSaving(false)

    if (error) {
      const isDuplicate = String(error.message || '')
        .toLowerCase()
        .includes('duplicate')

      showInlineMessage(
        'error',
        isDuplicate
          ? 'This coupon code already exists for this restaurant.'
          : error.message || 'Failed to save discount.',
      )
      return
    }

    if (editingDiscount?.id) {
      setDiscounts((current) =>
        current.map((discount) =>
          discount.id === editingDiscount.id ? data : discount,
        ),
      )
      showInlineMessage('success', 'Discount updated.')
    } else {
      setDiscounts((current) => [data, ...current])
      showInlineMessage('success', 'Discount created.')
    }

    closeForm()
  }

  const toggleDiscount = async (discount) => {
    const nextActive = !discount.is_active

    setDiscounts((current) =>
      current.map((item) =>
        item.id === discount.id ? { ...item, is_active: nextActive } : item,
      ),
    )

    const { error } = await supabase
      .from('restaurant_discounts')
      .update({
        is_active: nextActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', discount.id)

    if (error) {
      setDiscounts((current) =>
        current.map((item) =>
          item.id === discount.id ? { ...item, is_active: discount.is_active } : item,
        ),
      )
      showInlineMessage('error', 'Failed to update discount status.')
    }
  }

  const deleteDiscount = async (discount) => {
    setDiscounts((current) => current.filter((item) => item.id !== discount.id))

    const { error } = await supabase
      .from('restaurant_discounts')
      .update({
        is_deleted: true,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', discount.id)

    if (error) {
      setDiscounts((current) => [discount, ...current])
      showInlineMessage('error', 'Failed to delete discount.')
      return
    }

    showInlineMessage('success', 'Discount deleted.')
  }

  if (loading) {
    return (
      <section className="management-section discounts-screen">
        <div className="discounts-empty-state">
          <BadgePercent size={38} />
          <h2>Loading discounts...</h2>
          <p>Please wait while Spizy prepares coupons and offers.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="management-section discounts-screen">
      <header className="discounts-header">
        <div>
          <p className="section-kicker">Discounts</p>
          <h2>Coupons and offers</h2>
          <span>
            Create coupon codes for QR menu, delivery orders and customer
            campaigns. Customer checkout activation will be connected next.
          </span>
        </div>

        <div className="discounts-header-actions">
          <button
            type="button"
            className="discounts-secondary-button"
            onClick={refreshDiscounts}
            disabled={refreshing}
          >
            <RefreshCcw size={16} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            type="button"
            className="discounts-primary-button"
            onClick={openCreateForm}
          >
            <Plus size={16} />
            Add coupon
          </button>
        </div>
      </header>

      {message && (
        <div className={`discounts-message ${message.type}`}>{message.text}</div>
      )}

      <div className="discounts-stats-grid">
        <DiscountStatCard label="Total coupons" value={stats.total} />
        <DiscountStatCard label="Active" value={stats.active} />
        <DiscountStatCard label="Scheduled" value={stats.scheduled} />
        <DiscountStatCard label="Expired" value={stats.expired} />
      </div>

      <div className="discounts-toolbar">
        <div className="discounts-search">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search coupon title or code..."
          />
        </div>
      </div>

      {filteredDiscounts.length === 0 ? (
        <div className="discounts-empty-state">
          <Tag size={38} />
          <h2>No coupons found</h2>
          <p>
            Create your first coupon code. You can keep it inactive until the
            campaign is ready.
          </p>
        </div>
      ) : (
        <div className="discounts-table-card">
          <div className="discounts-table-head">
            <span>Coupon</span>
            <span>Rule</span>
            <span>Validity</span>
            <span>Limits</span>
            <span>Status</span>
          </div>

          <div className="discounts-table-body">
            {filteredDiscounts.map((discount) => (
              <DiscountRow
                key={discount.id}
                discount={discount}
                currency={currency}
                onEdit={openEditForm}
                onToggle={toggleDiscount}
                onDelete={deleteDiscount}
              />
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <DiscountFormModal
          form={form}
          currency={currency}
          editing={Boolean(editingDiscount)}
          saving={saving}
          onClose={closeForm}
          onChange={updateForm}
          onSubmit={handleSaveDiscount}
        />
      )}
    </section>
  )
}

function DiscountStatCard({ label, value }) {
  return (
    <div className="discounts-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function DiscountRow({ discount, currency, onEdit, onToggle, onDelete }) {
  const status = getDiscountStatus(discount)

  return (
    <article className="discounts-row">
      <div className="discounts-coupon-cell">
        <div className="discounts-code-icon">
          <BadgePercent size={18} />
        </div>

        <div>
          <strong>{discount.title}</strong>
          <span>{discount.code}</span>

          <div className="discounts-inline-actions">
            <button type="button" onClick={() => onEdit(discount)}>
              <Edit3 size={14} />
              Edit
            </button>

            <button
              type="button"
              className="danger"
              onClick={() => onDelete(discount)}
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="discounts-rule-cell">
        <strong>{formatDiscountValue(discount, currency)}</strong>
        <span>
          Min order {formatMoney(discount.min_order_amount, currency)}
          {discount.max_discount_amount
            ? ` • Max ${formatMoney(discount.max_discount_amount, currency)}`
            : ''}
        </span>
      </div>

      <div className="discounts-validity-cell">
        <CalendarClock size={15} />
        <div>
          <strong>{formatDateRange(discount)}</strong>
          <span>{status.label}</span>
        </div>
      </div>

      <div className="discounts-limits-cell">
        <strong>
          {discount.usage_limit ? `${discount.usage_limit} total` : 'Unlimited'}
        </strong>
        <span>{discount.per_customer_limit || 1} per customer</span>
      </div>

      <div>
        <button
          type="button"
          className={`discounts-status-pill ${status.className}`}
          onClick={() => onToggle(discount)}
        >
          {discount.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          {discount.is_active ? 'Active' : 'Inactive'}
        </button>
      </div>

    </article>
  )
}

function DiscountFormModal({
  form,
  currency,
  editing,
  saving,
  onClose,
  onChange,
  onSubmit,
}) {
  return (
    <div className="discounts-modal-overlay" onClick={onClose}>
      <form
        className="discounts-modal-card"
        onSubmit={onSubmit}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="discounts-modal-head">
          <div>
            <p className="section-kicker">{editing ? 'Edit coupon' : 'New coupon'}</p>
            <h2>{editing ? 'Update discount' : 'Create discount'}</h2>
            <span>Coupon code will be used by customers during checkout.</span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="discounts-form-grid">
          <label className="wide">
            Coupon title
            <input
              type="text"
              value={form.title}
              onChange={(event) => onChange('title', event.target.value)}
              placeholder="Example: Weekend offer"
            />
          </label>

          <label>
            Coupon code
            <input
              type="text"
              value={form.code}
              onChange={(event) => onChange('code', event.target.value)}
              placeholder="WEEKEND10"
            />
          </label>

          <label>
            Discount type
            <select
              value={form.discount_type}
              onChange={(event) => onChange('discount_type', event.target.value)}
            >
              {discountTypeOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Discount value
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.discount_value}
              onChange={(event) => onChange('discount_value', event.target.value)}
              placeholder={form.discount_type === 'percentage' ? '10%' : currency}
            />
          </label>

          <label>
            Minimum order
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.min_order_amount}
              onChange={(event) => onChange('min_order_amount', event.target.value)}
            />
          </label>

          <label>
            Max discount
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.max_discount_amount}
              onChange={(event) => onChange('max_discount_amount', event.target.value)}
              placeholder="Optional"
            />
          </label>

          <label>
            Total usage limit
            <input
              type="number"
              min="1"
              value={form.usage_limit}
              onChange={(event) => onChange('usage_limit', event.target.value)}
              placeholder="Unlimited"
            />
          </label>

          <label>
            Per customer limit
            <input
              type="number"
              min="1"
              value={form.per_customer_limit}
              onChange={(event) => onChange('per_customer_limit', event.target.value)}
            />
          </label>

          <div className="discounts-date-time-group">
            <label>
              Start date
              <input
                type="date"
                value={getDateInputValue(form.starts_at)}
                onChange={(event) =>
                  onChange(
                    'starts_at',
                    combineDateAndTime(
                      event.target.value,
                      getTimeInputValue(form.starts_at),
                    ),
                  )
                }
              />
            </label>

            <label>
              Start time
              <input
                type="time"
                value={getTimeInputValue(form.starts_at)}
                onChange={(event) =>
                  onChange(
                    'starts_at',
                    combineDateAndTime(
                      getDateInputValue(form.starts_at),
                      event.target.value,
                    ),
                  )
                }
                disabled={!getDateInputValue(form.starts_at)}
              />
            </label>
          </div>

          <div className="discounts-date-time-group">
            <label>
              End date
              <input
                type="date"
                value={getDateInputValue(form.ends_at)}
                onChange={(event) =>
                  onChange(
                    'ends_at',
                    combineDateAndTime(
                      event.target.value,
                      getTimeInputValue(form.ends_at),
                    ),
                  )
                }
              />
            </label>

            <label>
              End time
              <input
                type="time"
                value={getTimeInputValue(form.ends_at)}
                onChange={(event) =>
                  onChange(
                    'ends_at',
                    combineDateAndTime(
                      getDateInputValue(form.ends_at),
                      event.target.value,
                    ),
                  )
                }
                disabled={!getDateInputValue(form.ends_at)}
              />
            </label>
          </div>
        </div>

        <button
          type="button"
          className={`discounts-active-toggle ${form.is_active ? 'active' : ''}`}
          onClick={() => onChange('is_active', !form.is_active)}
        >
          {form.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
          {form.is_active ? 'Coupon active' : 'Coupon inactive'}
        </button>

        <div className="discounts-form-preview">
          <strong>Preview</strong>
          <span>
            {form.code ? normalizeDiscountCode(form.code) : 'CODE'} gives{' '}
            {form.discount_type === 'percentage'
              ? `${form.discount_value || 0}% off`
              : `${currency} ${Number(form.discount_value || 0).toFixed(2)} off`}
            {Number(form.min_order_amount || 0) > 0
              ? ` above ${currency} ${Number(form.min_order_amount || 0).toFixed(2)}`
              : ''}
            .
          </span>
        </div>

        <button
          type="submit"
          className="discounts-save-button"
          disabled={saving}
        >
          <Save size={16} />
          {saving ? 'Saving...' : editing ? 'Save changes' : 'Create coupon'}
        </button>
      </form>
    </div>
  )
}

function normalizeDiscountCode(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
}

function formatMoney(value, currency = 'AED') {
  return `${currency || 'AED'} ${Number(value || 0).toFixed(2)}`
}

function formatDiscountValue(discount, currency) {
  if (discount.discount_type === 'percentage') {
    return `${Number(discount.discount_value || 0).toFixed(0)}% off`
  }

  return `${formatMoney(discount.discount_value, currency)} off`
}

function formatDateRange(discount) {
  if (!discount.starts_at && !discount.ends_at) return 'Always available'

  if (discount.starts_at && discount.ends_at) {
    return `${formatShortDate(discount.starts_at)} - ${formatShortDate(discount.ends_at)}`
  }

  if (discount.starts_at) return `From ${formatShortDate(discount.starts_at)}`

  return `Until ${formatShortDate(discount.ends_at)}`
}

function formatShortDate(value) {
  if (!value) return 'Not set'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
    }).format(new Date(value))
  } catch {
    return 'Not set'
  }
}

function toInputDateTime(value) {
  if (!value) return ''

  try {
    const date = new Date(value)
    const timezoneOffset = date.getTimezoneOffset() * 60000
    return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16)
  } catch {
    return ''
  }
}

function getDateInputValue(value) {
  return String(value || '').slice(0, 10)
}

function getTimeInputValue(value) {
  const timeValue = String(value || '').slice(11, 16)

  return timeValue || '00:00'
}

function combineDateAndTime(dateValue, timeValue) {
  if (!dateValue) return ''

  return `${dateValue}T${timeValue || '00:00'}`
}

function isExpired(discount) {
  if (!discount.ends_at) return false

  return new Date(discount.ends_at).getTime() < Date.now()
}

function isScheduled(discount) {
  if (!discount.starts_at) return false

  return new Date(discount.starts_at).getTime() > Date.now()
}

function getDiscountStatus(discount) {
  if (!discount.is_active) {
    return { label: 'Inactive', className: 'inactive' }
  }

  if (isExpired(discount)) {
    return { label: 'Expired', className: 'expired' }
  }

  if (isScheduled(discount)) {
    return { label: 'Scheduled', className: 'scheduled' }
  }

  return { label: 'Live now', className: 'live' }
}

export default DiscountsManagement
