import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  CreditCard,
  HandCoins,
  Phone,
  ReceiptText,
  RefreshCw,
  Search,
  WalletCards,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './CustomerPaymentsManagement.css'

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'online', label: 'Online' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'other', label: 'Other' },
]

const filterOptions = [
  { value: 'collect', label: 'To collect' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'cod', label: 'COD' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'all', label: 'All orders' },
]

function CustomerPaymentsManagement({ restaurant }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [orders, setOrders] = useState([])
  const [payments, setPayments] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('collect')
  const [toast, setToast] = useState('')
  const [paymentModal, setPaymentModal] = useState(null)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_method: 'cash',
    payment_reference: '',
    notes: '',
  })

  const currency = restaurant?.currency || 'AED'

  const showMessage = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }

  const loadPaymentsData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data: orderData, error: orderError } = await supabase
      .from('restaurant_orders')
      .select(
        `
          id,
          order_code,
          public_order_number,
          order_type,
          status,
          payment_method,
          payment_status,
          customer_name,
          customer_phone,
          table_name,
          total_amount,
          paid_amount,
          currency,
          notes,
          created_at
        `,
      )
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })
      .limit(120)

    const { data: paymentData, error: paymentError } = await supabase
      .from('restaurant_customer_payments')
      .select(
        `
          id,
          order_id,
          customer_name,
          customer_phone,
          amount,
          payment_method,
          payment_reference,
          notes,
          is_void,
          received_at,
          order:restaurant_orders (
            order_code,
            total_amount,
            currency
          )
        `,
      )
      .eq('restaurant_id', restaurant.id)
      .order('received_at', { ascending: false })
      .limit(80)

    if (orderError) showMessage(orderError.message)
    if (paymentError) showMessage(paymentError.message)

    setOrders(orderData || [])
    setPayments(paymentData || [])
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadPaymentsData()
  }, [loadPaymentsData])

  const normalizedOrders = useMemo(() => {
    return orders.map((order) => {
      const total = Number(order.total_amount || 0)
      const paid = getPaidAmount(order)
      const balance = Math.max(total - paid, 0)
      const isPaid = balance <= 0 || order.payment_status === 'paid'
      const isPartial = paid > 0 && balance > 0

      return {
        ...order,
        total,
        paid,
        balance,
        isPaid,
        isPartial,
      }
    })
  }, [orders])

  const summary = useMemo(() => {
    return normalizedOrders.reduce(
      (total, order) => {
        total.orderCount += 1
        total.receivable += order.balance
        total.collected += order.paid

        if (order.balance > 0) total.toCollectCount += 1
        if (order.isPartial) total.partialCount += 1
        if (order.payment_method === 'cod') total.codDue += order.balance

        return total
      },
      {
        orderCount: 0,
        toCollectCount: 0,
        partialCount: 0,
        receivable: 0,
        collected: 0,
        codDue: 0,
      },
    )
  }, [normalizedOrders])

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return normalizedOrders.filter((order) => {
      if (filter === 'collect' && order.balance <= 0) return false
      if (filter === 'partial' && !order.isPartial) return false
      if (filter === 'paid' && !order.isPaid) return false
      if (filter === 'cod' && order.payment_method !== 'cod') return false
      if (filter === 'delivery' && order.order_type !== 'delivery') return false

      if (!keyword) return true

      return [
        order.order_code,
        order.public_order_number,
        order.customer_name,
        order.customer_phone,
        order.table_name,
        order.payment_method,
        order.order_type,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [filter, normalizedOrders, search])

  const openPaymentModal = (order) => {
    const defaultAmount = order.balance > 0 ? order.balance : order.total

    setPaymentModal(order)
    setPaymentForm({
      amount: defaultAmount.toFixed(2),
      payment_method: order.payment_method === 'cod' ? 'cash' : order.payment_method || 'cash',
      payment_reference: '',
      notes: '',
    })
  }

  const savePayment = async () => {
    if (!paymentModal?.id) return

    const amount = Number(paymentForm.amount || 0)

    if (amount <= 0) {
      showMessage('Enter a valid payment amount.')
      return
    }

    setSaving(true)

    const { error } = await supabase.rpc('record_restaurant_customer_payment', {
      p_order_id: paymentModal.id,
      p_amount: amount,
      p_payment_method: paymentForm.payment_method,
      p_payment_reference: paymentForm.payment_reference.trim() || null,
      p_notes: paymentForm.notes.trim() || null,
    })

    setSaving(false)

    if (error) {
      showMessage(error.message)
      return
    }

    setPaymentModal(null)
    showMessage('Customer payment saved.')
    await loadPaymentsData()
  }

  const voidPayment = async (payment) => {
    const { error } = await supabase.rpc('void_restaurant_customer_payment', {
      p_payment_id: payment.id,
      p_void_reason: 'Voided by restaurant',
    })

    if (error) {
      showMessage(error.message)
      return
    }

    showMessage('Payment voided and order balance updated.')
    await loadPaymentsData()
  }

  if (!restaurant?.id) {
    return (
      <section className="customer-payments-page">
        <div className="customer-payments-empty">Restaurant profile not found.</div>
      </section>
    )
  }

  return (
    <section className="customer-payments-page">
      {toast && <div className="customer-payments-toast">{toast}</div>}

      <div className="customer-payments-hero">
        <div>
          <p>Customer Payments</p>
          <h2>COD, card-on-delivery and unpaid collections</h2>
          <span>
            Track delivery collections, table balances, partial payments and customer payment history.
          </span>
        </div>

        <button
          type="button"
          className="customer-payments-refresh"
          onClick={loadPaymentsData}
          disabled={loading}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      <div className="customer-payments-stats">
        <SummaryCard
          icon={<WalletCards size={20} />}
          label="To collect"
          value={formatMoney(currency, summary.receivable)}
          text={`${summary.toCollectCount} unpaid / open balances`}
          tone="warn"
        />
        <SummaryCard
          icon={<HandCoins size={20} />}
          label="Collected"
          value={formatMoney(currency, summary.collected)}
          text="Recorded customer payments"
          tone="success"
        />
        <SummaryCard
          icon={<CreditCard size={20} />}
          label="COD due"
          value={formatMoney(currency, summary.codDue)}
          text="Cash / card machine collections"
          tone="gold"
        />
        <SummaryCard
          icon={<ReceiptText size={20} />}
          label="Partial bills"
          value={summary.partialCount}
          text="Paid partly, balance pending"
          tone="blue"
        />
      </div>

      <div className="customer-payments-toolbar">
        <div className="customer-payments-search">
          <Search size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search order, customer, phone, table..."
          />
        </div>

        <div className="customer-payments-filters">
          {filterOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              className={filter === option.value ? 'active' : ''}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="customer-payments-layout">
        <div className="customer-payments-orders">
          <div className="customer-payments-panel-head">
            <div>
              <h3>Order balances</h3>
              <span>{filteredOrders.length} matching orders</span>
            </div>
          </div>

          {loading ? (
            <div className="customer-payments-empty">Loading customer payments...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="customer-payments-empty">No matching payment balances found.</div>
          ) : (
            <div className="customer-payments-list">
              {filteredOrders.map((order) => (
                <OrderPaymentCard
                  key={order.id}
                  order={order}
                  currency={order.currency || currency}
                  onCollect={() => openPaymentModal(order)}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="customer-payments-history">
          <div className="customer-payments-panel-head">
            <div>
              <h3>Recent collections</h3>
              <span>Latest payment ledger entries</span>
            </div>
          </div>

          <div className="customer-payments-history-list">
            {payments.length === 0 ? (
              <div className="customer-payments-empty small">No customer payments recorded yet.</div>
            ) : (
              payments.map((payment) => (
                <PaymentHistoryRow
                  key={payment.id}
                  payment={payment}
                  fallbackCurrency={currency}
                  onVoid={() => voidPayment(payment)}
                />
              ))
            )}
          </div>
        </aside>
      </div>

      {paymentModal && (
        <PaymentModal
          order={paymentModal}
          form={paymentForm}
          currency={paymentModal.currency || currency}
          saving={saving}
          onChange={(key, value) =>
            setPaymentForm((current) => ({ ...current, [key]: value }))
          }
          onClose={() => setPaymentModal(null)}
          onSave={savePayment}
        />
      )}
    </section>
  )
}

function SummaryCard({ icon, label, value, text, tone }) {
  return (
    <article className={`customer-payments-summary ${tone || ''}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{text}</small>
    </article>
  )
}

function OrderPaymentCard({ order, currency, onCollect }) {
  const status = order.balance <= 0 ? 'paid' : order.isPartial ? 'partial' : 'unpaid'

  return (
    <article className={`customer-payment-card ${status}`}>
      <div className="customer-payment-main">
        <div>
          <span>Order #{getPublicOrderNumber(order.public_order_number || order.order_code)}</span>
          <h4>{order.customer_name || order.table_name || formatOrderType(order.order_type)}</h4>
          <p>
            {formatOrderType(order.order_type)} • {formatPaymentMethod(order.payment_method)} •{' '}
            {formatDate(order.created_at)}
          </p>
          {order.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="customer-payment-phone">
              <Phone size={14} />
              {order.customer_phone}
            </a>
          )}
        </div>

        <div className="customer-payment-status-stack">
          <span className={`customer-payment-status ${status}`}>
            {status === 'paid' ? 'Paid' : status === 'partial' ? 'Partial' : 'To collect'}
          </span>
          {order.table_name && <small>{order.table_name}</small>}
        </div>
      </div>

      <div className="customer-payment-money-grid">
        <div>
          <span>Total</span>
          <strong>{formatMoney(currency, order.total)}</strong>
        </div>
        <div>
          <span>Paid</span>
          <strong>{formatMoney(currency, order.paid)}</strong>
        </div>
        <div className={order.balance > 0 ? 'due' : 'clear'}>
          <span>Balance</span>
          <strong>{formatMoney(currency, order.balance)}</strong>
        </div>
      </div>

      <button type="button" onClick={onCollect}>
        <HandCoins size={16} />
        {order.balance > 0 ? 'Collect payment' : 'Add payment'}
      </button>
    </article>
  )
}

function PaymentHistoryRow({ payment, fallbackCurrency, onVoid }) {
  const orderCurrency = payment.order?.currency || fallbackCurrency

  return (
    <article className={`customer-payment-history-row ${payment.is_void ? 'void' : ''}`}>
      <div>
        <strong>{formatMoney(orderCurrency, payment.amount)}</strong>
        <span>
          {formatPaymentMethod(payment.payment_method)} • Order {payment.order?.order_code || 'Manual'}
        </span>
        <small>
          {(payment.customer_name || payment.customer_phone || 'Customer payment')} •{' '}
          {formatDate(payment.received_at)}
        </small>
        {payment.payment_reference && <em>Ref: {payment.payment_reference}</em>}
      </div>

      {payment.is_void ? (
        <span className="customer-payment-void-pill">Voided</span>
      ) : (
        <button type="button" onClick={onVoid}>Void</button>
      )}
    </article>
  )
}

function PaymentModal({ order, form, currency, saving, onChange, onClose, onSave }) {
  return (
    <div className="customer-payment-modal-overlay" onClick={onClose}>
      <div className="customer-payment-modal" onClick={(event) => event.stopPropagation()}>
        <div className="customer-payment-modal-head">
          <div>
            <p>Collect payment</p>
            <h3>Order #{getPublicOrderNumber(order.public_order_number || order.order_code)}</h3>
            <span>
              Balance: {formatMoney(currency, order.balance)} • Total:{' '}
              {formatMoney(currency, order.total)}
            </span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <div className="customer-payment-form-grid">
          <label>
            Payment amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(event) => onChange('amount', event.target.value)}
              placeholder="0.00"
            />
          </label>

          <label>
            Payment method
            <select
              value={form.payment_method}
              onChange={(event) => onChange('payment_method', event.target.value)}
            >
              {paymentMethods.map((method) => (
                <option value={method.value} key={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="customer-payment-full-field">
          Reference / transaction ID
          <input
            type="text"
            value={form.payment_reference}
            onChange={(event) => onChange('payment_reference', event.target.value)}
            placeholder="Optional reference"
          />
        </label>

        <label className="customer-payment-full-field">
          Notes
          <textarea
            value={form.notes}
            onChange={(event) => onChange('notes', event.target.value)}
            placeholder="Optional notes"
            rows="3"
          />
        </label>

        <button type="button" className="customer-payment-save" onClick={onSave} disabled={saving}>
          <CheckCircle2 size={18} />
          {saving ? 'Saving payment...' : 'Save payment'}
        </button>
      </div>
    </div>
  )
}

function getPaidAmount(order) {
  const paidAmount = Number(order.paid_amount || 0)

  if (paidAmount > 0) return paidAmount
  if (order.payment_status === 'paid') return Number(order.total_amount || 0)

  return 0
}

function getPublicOrderNumber(orderCode) {
  const value = String(orderCode || '')

  if (!value.includes('-')) return value

  return value.split('-').pop()
}

function formatMoney(currency, amount) {
  return `${currency || 'AED'} ${Number(amount || 0).toFixed(2)}`
}

function formatPaymentMethod(value) {
  if (value === 'cod') return 'COD'
  if (value === 'upi') return 'UPI'
  if (value === 'bank') return 'Bank'
  return String(value || 'cash').replace(/_/g, ' ').toUpperCase()
}

function formatOrderType(value) {
  if (value === 'dine_in') return 'Dine-in'
  if (value === 'delivery') return 'Delivery'
  if (value === 'takeaway') return 'Takeaway'
  return 'Counter'
}

function formatDate(value) {
  if (!value) return 'Just now'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Just now'
  }
}

export default CustomerPaymentsManagement
