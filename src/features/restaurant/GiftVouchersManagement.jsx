import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  CalendarClock,
  Copy,
  Gift,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  TicketPercent,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './GiftVouchersManagement.css'

const emptyVoucherForm = {
  id: null,
  title: '',
  voucher_code: '',
  customer_name: '',
  customer_phone: '',
  amount: '',
  balance_amount: '',
  expires_at: '',
  status: 'active',
  notes: '',
}

const voucherStatuses = [
  { value: 'active', label: 'Active' },
  { value: 'redeemed', label: 'Redeemed' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
]

function GiftVouchersManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [vouchers, setVouchers] = useState([])
  const [transactions, setTransactions] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyVoucherForm)
  const [redeemVoucher, setRedeemVoucher] = useState(null)
  const [redeemForm, setRedeemForm] = useState({ amount: '', notes: '' })

  const currency = restaurant?.currency || 'AED'

  const loadGiftVouchers = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data: voucherData, error: voucherError } = await supabase
      .from('restaurant_gift_vouchers')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    const { data: transactionData, error: transactionError } = await supabase
      .from('restaurant_gift_voucher_transactions')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })
      .limit(40)

    if (voucherError) {
      showToast({
        type: 'error',
        title: 'Gift vouchers loading failed',
        message: voucherError.message,
      })
    }

    if (transactionError) {
      showToast({
        type: 'error',
        title: 'Gift voucher history failed',
        message: transactionError.message,
      })
    }

    setVouchers(voucherData || [])
    setTransactions(transactionData || [])
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadGiftVouchers()
  }, [loadGiftVouchers])

  const summary = useMemo(() => {
    const activeVouchers = vouchers.filter((voucher) => voucher.status === 'active')
    const totalIssued = vouchers.reduce(
      (total, voucher) => total + Number(voucher.amount || 0),
      0,
    )
    const activeBalance = activeVouchers.reduce(
      (total, voucher) => total + Number(voucher.balance_amount || 0),
      0,
    )
    const redeemedValue = vouchers.reduce(
      (total, voucher) =>
        total +
        Math.max(
          Number(voucher.amount || 0) - Number(voucher.balance_amount || 0),
          0,
        ),
      0,
    )
    const expiringSoon = activeVouchers.filter((voucher) => {
      if (!voucher.expires_at) return false

      const expiryTime = new Date(voucher.expires_at).getTime()
      const now = Date.now()
      const sevenDays = 7 * 24 * 60 * 60 * 1000

      return expiryTime >= now && expiryTime <= now + sevenDays
    }).length

    return {
      activeCount: activeVouchers.length,
      totalIssued,
      activeBalance,
      redeemedValue,
      expiringSoon,
    }
  }, [vouchers])

  const filteredVouchers = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return vouchers.filter((voucher) => {
      if (statusFilter !== 'all' && voucher.status !== statusFilter) {
        return false
      }

      if (!keyword) return true

      return [
        voucher.title,
        voucher.voucher_code,
        voucher.customer_name,
        voucher.customer_phone,
        voucher.notes,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [search, statusFilter, vouchers])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const startCreate = () => {
    setForm({
      ...emptyVoucherForm,
      voucher_code: generateVoucherCode(restaurant?.name),
    })
    setShowForm(true)
  }

  const startEdit = (voucher) => {
    setForm({
      id: voucher.id,
      title: voucher.title || '',
      voucher_code: voucher.voucher_code || '',
      customer_name: voucher.customer_name || '',
      customer_phone: voucher.customer_phone || '',
      amount: String(voucher.amount || ''),
      balance_amount: String(voucher.balance_amount || ''),
      expires_at: toDateInputValue(voucher.expires_at),
      status: voucher.status || 'active',
      notes: voucher.notes || '',
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setForm(emptyVoucherForm)
  }

  const handleSaveVoucher = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const voucherCode = normalizeVoucherCode(form.voucher_code)
    const amount = Number(form.amount || 0)
    const currentBalance = Number(form.balance_amount || amount)

    if (!voucherCode) {
      showToast({
        type: 'warning',
        title: 'Voucher code required',
        message: 'Add or generate a voucher code before saving.',
      })
      return
    }

    if (amount <= 0) {
      showToast({
        type: 'warning',
        title: 'Amount required',
        message: 'Gift voucher amount should be greater than zero.',
      })
      return
    }

    setSaving(true)

    const payload = {
      restaurant_id: restaurant.id,
      title: form.title.trim() || 'Gift Voucher',
      voucher_code: voucherCode,
      customer_name: form.customer_name.trim() || null,
      customer_phone: form.customer_phone.trim() || null,
      amount,
      balance_amount: Math.min(Math.max(currentBalance, 0), amount),
      currency,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      status: form.status,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    if (!form.id && payload.balance_amount <= 0) {
      payload.balance_amount = amount
    }

    const query = form.id
      ? supabase
          .from('restaurant_gift_vouchers')
          .update(payload)
          .eq('id', form.id)
          .eq('restaurant_id', restaurant.id)
          .select('*')
          .single()
      : supabase
          .from('restaurant_gift_vouchers')
          .insert(payload)
          .select('*')
          .single()

    const { data, error } = await query

    if (error) {
      setSaving(false)
      showToast({
        type: 'error',
        title: 'Gift voucher save failed',
        message: error.message,
      })
      return
    }

    if (!form.id) {
      await supabase.from('restaurant_gift_voucher_transactions').insert({
        restaurant_id: restaurant.id,
        voucher_id: data.id,
        action_type: 'issue',
        amount,
        balance_after: Number(data.balance_amount || amount),
        notes: 'Gift voucher issued',
      })
    }

    setSaving(false)
    closeForm()
    await loadGiftVouchers()

    showToast({
      type: 'success',
      title: form.id ? 'Voucher updated' : 'Voucher created',
      message: `${voucherCode} saved successfully.`,
    })
  }

  const handleDeleteVoucher = async (voucher) => {
    const confirmed = await confirmAction({
      title: 'Delete gift voucher?',
      message: `This will hide ${voucher.voucher_code} from active records.`,
      confirmText: 'Delete',
      cancelText: 'Keep',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('restaurant_gift_vouchers')
      .update({
        is_deleted: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', voucher.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Delete failed',
        message: error.message,
      })
      return
    }

    setVouchers((current) => current.filter((item) => item.id !== voucher.id))
    showToast({
      type: 'success',
      title: 'Voucher deleted',
      message: `${voucher.voucher_code} removed.`,
    })
  }

  const handleCopyCode = async (voucher) => {
    const code = voucher?.voucher_code || ''

    try {
      await navigator.clipboard.writeText(code)
      showToast({
        type: 'success',
        title: 'Code copied',
        message: code,
      })
    } catch {
      showToast({
        type: 'warning',
        title: 'Copy not supported',
        message: code,
      })
    }
  }

  const handleRedeemVoucher = async (event) => {
    event.preventDefault()

    if (!redeemVoucher?.id) return

    const redeemAmount = Number(redeemForm.amount || 0)
    const oldBalance = Number(redeemVoucher.balance_amount || 0)

    if (redeemAmount <= 0) {
      showToast({
        type: 'warning',
        title: 'Redeem amount required',
        message: 'Enter an amount greater than zero.',
      })
      return
    }

    if (redeemAmount > oldBalance) {
      showToast({
        type: 'warning',
        title: 'Amount exceeds balance',
        message: 'Redeem amount cannot be more than voucher balance.',
      })
      return
    }

    const nextBalance = Math.max(oldBalance - redeemAmount, 0)
    const nextStatus = nextBalance <= 0 ? 'redeemed' : 'active'

    setSaving(true)

    const { error: updateError } = await supabase
      .from('restaurant_gift_vouchers')
      .update({
        balance_amount: nextBalance,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', redeemVoucher.id)
      .eq('restaurant_id', restaurant.id)

    if (updateError) {
      setSaving(false)
      showToast({
        type: 'error',
        title: 'Redeem failed',
        message: updateError.message,
      })
      return
    }

    await supabase.from('restaurant_gift_voucher_transactions').insert({
      restaurant_id: restaurant.id,
      voucher_id: redeemVoucher.id,
      action_type: 'redeem',
      amount: redeemAmount,
      balance_after: nextBalance,
      notes: redeemForm.notes.trim() || 'Manual gift voucher redemption',
    })

    setSaving(false)
    setRedeemVoucher(null)
    setRedeemForm({ amount: '', notes: '' })
    await loadGiftVouchers()

    showToast({
      type: 'success',
      title: 'Voucher redeemed',
      message: `${formatMoney(currency, redeemAmount)} redeemed successfully.`,
    })
  }

  if (!restaurant?.id) {
    return (
      <section className="gift-vouchers-page">
        <div className="gift-vouchers-empty">Restaurant profile not found.</div>
      </section>
    )
  }

  return (
    <section className="gift-vouchers-page">
      <div className="gift-vouchers-hero">
        <div>
          <p className="pricing-label">Gift Vouchers</p>
          <h2>Store credit and gift cards</h2>
          <span>
            Issue gift cards, track remaining balance and redeem store credit
            for loyal customers.
          </span>
        </div>

        <div className="gift-voucher-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={loadGiftVouchers}
            disabled={loading}
          >
            <RefreshCw size={17} />
            Refresh
          </button>

          <button type="button" className="primary-button" onClick={startCreate}>
            <Plus size={17} />
            New Voucher
          </button>
        </div>
      </div>

      <div className="gift-voucher-summary-grid">
        <SummaryCard
          icon={<Gift size={21} />}
          label="Active vouchers"
          value={summary.activeCount}
          text="Ready to redeem"
        />
        <SummaryCard
          icon={<TicketPercent size={21} />}
          label="Issued value"
          value={formatMoney(currency, summary.totalIssued)}
          text="Total gift card value"
        />
        <SummaryCard
          icon={<WalletCards size={21} />}
          label="Open balance"
          value={formatMoney(currency, summary.activeBalance)}
          text="Unused customer credit"
        />
        <SummaryCard
          icon={<BadgeCheck size={21} />}
          label="Redeemed"
          value={formatMoney(currency, summary.redeemedValue)}
          text="Used voucher value"
        />
        <SummaryCard
          icon={<CalendarClock size={21} />}
          label="Expiring soon"
          value={summary.expiringSoon}
          text="Within 7 days"
        />
      </div>

      <div className="gift-voucher-toolbar">
        <div className="gift-voucher-search">
          <Search size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search code, customer, phone or notes..."
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All status</option>
          {voucherStatuses.map((status) => (
            <option value={status.value} key={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>

      {showForm && (
        <VoucherForm
          form={form}
          currency={currency}
          saving={saving}
          restaurantName={restaurant?.name}
          onUpdate={updateForm}
          onGenerate={() => updateForm('voucher_code', generateVoucherCode(restaurant?.name))}
          onClose={closeForm}
          onSave={handleSaveVoucher}
        />
      )}

      {loading ? (
        <div className="gift-vouchers-empty">Loading gift vouchers...</div>
      ) : filteredVouchers.length === 0 ? (
        <div className="gift-vouchers-empty">
          No gift vouchers found. Create the first store credit voucher.
        </div>
      ) : (
        <div className="gift-voucher-grid">
          {filteredVouchers.map((voucher) => (
            <VoucherCard
              key={voucher.id}
              voucher={voucher}
              currency={currency}
              onEdit={() => startEdit(voucher)}
              onCopy={() => handleCopyCode(voucher)}
              onRedeem={() => {
                setRedeemVoucher(voucher)
                setRedeemForm({ amount: '', notes: '' })
              }}
              onDelete={() => handleDeleteVoucher(voucher)}
            />
          ))}
        </div>
      )}

      <section className="gift-voucher-history">
        <div className="gift-voucher-section-head">
          <div>
            <p className="pricing-label">Ledger</p>
            <h3>Recent voucher activity</h3>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="gift-vouchers-empty compact">No voucher activity yet.</div>
        ) : (
          <div className="gift-voucher-history-list">
            {transactions.map((transaction) => (
              <div className="gift-voucher-history-row" key={transaction.id}>
                <div>
                  <strong>{formatActionType(transaction.action_type)}</strong>
                  <span>{transaction.notes || 'Gift voucher activity'}</span>
                  <small>{formatDateTime(transaction.created_at)}</small>
                </div>

                <div>
                  <strong>{formatMoney(currency, transaction.amount)}</strong>
                  <span>
                    Balance: {formatMoney(currency, transaction.balance_after)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {redeemVoucher && (
        <RedeemModal
          voucher={redeemVoucher}
          currency={currency}
          form={redeemForm}
          saving={saving}
          onUpdate={(key, value) =>
            setRedeemForm((current) => ({ ...current, [key]: value }))
          }
          onClose={() => setRedeemVoucher(null)}
          onSubmit={handleRedeemVoucher}
        />
      )}
    </section>
  )
}

function SummaryCard({ icon, label, value, text }) {
  return (
    <article className="gift-voucher-summary-card">
      <div className="gift-voucher-summary-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{text}</p>
    </article>
  )
}

function VoucherForm({
  form,
  currency,
  saving,
  restaurantName,
  onUpdate,
  onGenerate,
  onClose,
  onSave,
}) {
  return (
    <form className="gift-voucher-form" onSubmit={onSave}>
      <div className="gift-voucher-section-head">
        <div>
          <p className="pricing-label">{form.id ? 'Edit Voucher' : 'New Voucher'}</p>
          <h3>{form.id ? 'Update gift voucher' : 'Issue gift voucher'}</h3>
          <span>
            Currency uses store default: <strong>{currency}</strong>
          </span>
        </div>

        <button type="button" className="tiny-button danger" onClick={onClose}>
          <X size={15} />
          Close
        </button>
      </div>

      <div className="gift-voucher-form-grid">
        <label>
          Voucher title
          <input
            type="text"
            value={form.title}
            onChange={(event) => onUpdate('title', event.target.value)}
            placeholder="Example: Birthday gift card"
          />
        </label>

        <label className="gift-code-field">
          Voucher code
          <div>
            <input
              type="text"
              value={form.voucher_code}
              onChange={(event) =>
                onUpdate('voucher_code', event.target.value.toUpperCase())
              }
              placeholder={`${makeRestaurantPrefix(restaurantName)}-2026`}
            />
            <button type="button" onClick={onGenerate}>
              Generate
            </button>
          </div>
        </label>

        <label>
          Customer name
          <input
            type="text"
            value={form.customer_name}
            onChange={(event) => onUpdate('customer_name', event.target.value)}
            placeholder="Optional"
          />
        </label>

        <label>
          Customer phone
          <input
            type="tel"
            value={form.customer_phone}
            onChange={(event) => onUpdate('customer_phone', event.target.value)}
            placeholder="Optional"
          />
        </label>

        <label>
          Voucher amount
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(event) => {
              onUpdate('amount', event.target.value)
              if (!form.id) onUpdate('balance_amount', event.target.value)
            }}
            placeholder="0.00"
          />
        </label>

        <label>
          Current balance
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.balance_amount}
            onChange={(event) => onUpdate('balance_amount', event.target.value)}
            placeholder="0.00"
          />
        </label>

        <label>
          Expiry date
          <input
            type="date"
            value={form.expires_at}
            onChange={(event) => onUpdate('expires_at', event.target.value)}
          />
        </label>

        <label>
          Status
          <select
            value={form.status}
            onChange={(event) => onUpdate('status', event.target.value)}
          >
            {voucherStatuses.map((status) => (
              <option value={status.value} key={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>

        <label className="gift-voucher-wide-field">
          Notes
          <textarea
            value={form.notes}
            onChange={(event) => onUpdate('notes', event.target.value)}
            rows="3"
            placeholder="Internal notes, reason, buyer name, etc."
          />
        </label>
      </div>

      <div className="gift-voucher-form-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? 'Saving...' : form.id ? 'Update Voucher' : 'Issue Voucher'}
        </button>
      </div>
    </form>
  )
}

function VoucherCard({ voucher, currency, onEdit, onCopy, onRedeem, onDelete }) {
  const balance = Number(voucher.balance_amount || 0)
  const amount = Number(voucher.amount || 0)
  const usedPercent = amount > 0 ? Math.min(((amount - balance) / amount) * 100, 100) : 0
  const isUsable = voucher.status === 'active' && balance > 0

  return (
    <article className={`gift-voucher-card status-${voucher.status || 'active'}`}>
      <div className="gift-voucher-card-top">
        <div>
          <span className="gift-voucher-status">{formatStatus(voucher.status)}</span>
          <h3>{voucher.title || 'Gift Voucher'}</h3>
          <button type="button" className="gift-voucher-code" onClick={onCopy}>
            <strong>{voucher.voucher_code}</strong>
            <Copy size={14} />
          </button>
        </div>

        <div className="gift-voucher-card-icon">
          <Gift size={24} />
        </div>
      </div>

      <div className="gift-voucher-balance-box">
        <span>Balance</span>
        <strong>{formatMoney(currency, balance)}</strong>
        <small>Issued: {formatMoney(currency, amount)}</small>
        <div className="gift-voucher-progress">
          <span style={{ width: `${usedPercent}%` }} />
        </div>
      </div>

      <div className="gift-voucher-meta-grid">
        <div>
          <span>Customer</span>
          <strong>{voucher.customer_name || 'Walk-in / Open'}</strong>
          <small>{voucher.customer_phone || 'No phone linked'}</small>
        </div>

        <div>
          <span>Expiry</span>
          <strong>{voucher.expires_at ? formatDate(voucher.expires_at) : 'No expiry'}</strong>
          <small>{voucher.created_at ? `Issued ${formatDate(voucher.created_at)}` : ''}</small>
        </div>
      </div>

      {voucher.notes && <p className="gift-voucher-note">{voucher.notes}</p>}

      <div className="gift-voucher-card-actions">
        <button type="button" className="secondary-button" onClick={onEdit}>
          Edit
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onRedeem}
          disabled={!isUsable}
        >
          Redeem
        </button>
        <button type="button" className="tiny-button danger" onClick={onDelete}>
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  )
}

function RedeemModal({ voucher, currency, form, saving, onUpdate, onClose, onSubmit }) {
  return (
    <div className="gift-voucher-modal-overlay" onClick={onClose}>
      <form
        className="gift-voucher-redeem-modal"
        onClick={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
      >
        <div className="gift-voucher-section-head">
          <div>
            <p className="pricing-label">Redeem Gift Voucher</p>
            <h3>{voucher.voucher_code}</h3>
            <span>
              Available balance:{' '}
              <strong>{formatMoney(currency, voucher.balance_amount)}</strong>
            </span>
          </div>

          <button type="button" className="tiny-button danger" onClick={onClose}>
            <X size={15} />
            Close
          </button>
        </div>

        <label>
          Redeem amount
          <input
            type="number"
            min="0"
            max={Number(voucher.balance_amount || 0)}
            step="0.01"
            value={form.amount}
            onChange={(event) => onUpdate('amount', event.target.value)}
            placeholder="0.00"
          />
        </label>

        <label>
          Notes / order reference
          <textarea
            rows="3"
            value={form.notes}
            onChange={(event) => onUpdate('notes', event.target.value)}
            placeholder="Example: Redeemed in store order #1005"
          />
        </label>

        <div className="gift-voucher-form-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            <RotateCcw size={17} />
            {saving ? 'Redeeming...' : 'Redeem Now'}
          </button>
        </div>
      </form>
    </div>
  )
}

function generateVoucherCode(restaurantName) {
  const prefix = makeRestaurantPrefix(restaurantName)
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase()
  const timePart = String(Date.now()).slice(-4)

  return `${prefix}-${randomPart}${timePart}`
}

function makeRestaurantPrefix(restaurantName) {
  const cleaned = String(restaurantName || 'SPIZY')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 5)
    .toUpperCase()

  return cleaned || 'SPIZY'
}

function normalizeVoucherCode(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .toUpperCase()
}

function toDateInputValue(value) {
  if (!value) return ''

  try {
    return new Date(value).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function formatStatus(status) {
  if (status === 'redeemed') return 'Redeemed'
  if (status === 'expired') return 'Expired'
  if (status === 'cancelled') return 'Cancelled'
  return 'Active'
}

function formatActionType(actionType) {
  if (actionType === 'issue') return 'Voucher issued'
  if (actionType === 'redeem') return 'Voucher redeemed'
  if (actionType === 'top_up') return 'Voucher topped up'
  if (actionType === 'cancel') return 'Voucher cancelled'
  if (actionType === 'adjust') return 'Balance adjusted'
  return 'Gift voucher activity'
}

function formatDate(value) {
  if (!value) return '—'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

function formatDateTime(value) {
  if (!value) return '—'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

function formatMoney(currency, amount) {
  return `${currency || 'AED'} ${Number(amount || 0).toFixed(2)}`
}

export default GiftVouchersManagement
