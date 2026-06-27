import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  RefreshCw,
  Search,
  Trash2,
  WalletCards,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './SupplierPaymentsManagement.css'

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'online', label: 'Online' },
  { value: 'upi', label: 'UPI' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'credit', label: 'Credit adjustment' },
  { value: 'other', label: 'Other' },
]

const initialForm = {
  supplierId: '',
  purchaseId: '',
  amount: '',
  paymentMethod: 'cash',
  paidDate: getTodayInputDate(),
  referenceNo: '',
  notes: '',
}

function SupplierPaymentsManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [suppliers, setSuppliers] = useState([])
  const [purchases, setPurchases] = useState([])
  const [payments, setPayments] = useState([])
  const [form, setForm] = useState(initialForm)
  const [search, setSearch] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [methodFilter, setMethodFilter] = useState('all')

  const currency = restaurant?.currency || 'AED'

  const loadSupplierPayments = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [supplierResponse, purchaseResponse, paymentResponse] = await Promise.all([
      supabase
        .from('restaurant_suppliers')
        .select('id, name, phone, email, is_active')
        .eq('restaurant_id', restaurant.id)
        .order('name', { ascending: true }),
      supabase
        .from('restaurant_purchases')
        .select(
          'id, supplier_id, supplier_name, invoice_number, purchase_date, status, payment_status, payment_method, total_amount, amount_paid',
        )
        .eq('restaurant_id', restaurant.id)
        .neq('status', 'cancelled')
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('restaurant_supplier_payments')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .order('paid_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(120),
    ])

    if (supplierResponse.error) {
      showToast({
        type: 'error',
        title: 'Suppliers loading failed',
        message: supplierResponse.error.message,
      })
    }

    if (purchaseResponse.error) {
      showToast({
        type: 'error',
        title: 'Purchases loading failed',
        message: purchaseResponse.error.message,
      })
    }

    if (paymentResponse.error) {
      showToast({
        type: 'error',
        title: 'Supplier payments loading failed',
        message: paymentResponse.error.message,
      })
    }

    setSuppliers(supplierResponse.data || [])
    setPurchases(purchaseResponse.data || [])
    setPayments(paymentResponse.data || [])
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadSupplierPayments()
  }, [loadSupplierPayments])

  const supplierMap = useMemo(() => {
    return suppliers.reduce((map, supplier) => {
      map[supplier.id] = supplier
      return map
    }, {})
  }, [suppliers])

  const purchaseMap = useMemo(() => {
    return purchases.reduce((map, purchase) => {
      map[purchase.id] = purchase
      return map
    }, {})
  }, [purchases])

  const openPurchases = useMemo(() => {
    return purchases.filter((purchase) => getPurchaseDue(purchase) > 0)
  }, [purchases])

  const selectedSupplierOpenPurchases = useMemo(() => {
    if (!form.supplierId) return openPurchases

    return openPurchases.filter(
      (purchase) => purchase.supplier_id === form.supplierId,
    )
  }, [form.supplierId, openPurchases])

  const summary = useMemo(() => {
    const totalPurchases = purchases.reduce(
      (sum, purchase) => sum + Number(purchase.total_amount || 0),
      0,
    )
    const totalPaidOnBills = purchases.reduce(
      (sum, purchase) => sum + Number(purchase.amount_paid || 0),
      0,
    )
    const totalDue = purchases.reduce(
      (sum, purchase) => sum + getPurchaseDue(purchase),
      0,
    )
    const paymentsTotal = payments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0,
    )
    const suppliersWithDue = new Set(
      purchases
        .filter((purchase) => getPurchaseDue(purchase) > 0)
        .map((purchase) => purchase.supplier_id || purchase.supplier_name || purchase.id),
    ).size

    return {
      totalPurchases,
      totalPaidOnBills,
      totalDue,
      paymentsTotal,
      suppliersWithDue,
    }
  }, [payments, purchases])

  const supplierDueRows = useMemo(() => {
    const rows = new Map()

    purchases.forEach((purchase) => {
      const due = getPurchaseDue(purchase)
      const key = purchase.supplier_id || `name-${purchase.supplier_name || 'unknown'}`
      const existing = rows.get(key) || {
        key,
        supplierName:
          supplierMap[purchase.supplier_id]?.name ||
          purchase.supplier_name ||
          'Unknown supplier',
        supplierPhone: supplierMap[purchase.supplier_id]?.phone || '',
        bills: 0,
        total: 0,
        paid: 0,
        due: 0,
      }

      existing.bills += 1
      existing.total += Number(purchase.total_amount || 0)
      existing.paid += Number(purchase.amount_paid || 0)
      existing.due += due
      rows.set(key, existing)
    })

    return [...rows.values()]
      .filter((row) => row.due > 0)
      .sort((a, b) => b.due - a.due)
      .slice(0, 8)
  }, [purchases, supplierMap])

  const filteredPayments = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return payments.filter((payment) => {
      if (supplierFilter !== 'all' && payment.supplier_id !== supplierFilter) {
        return false
      }

      if (methodFilter !== 'all' && payment.payment_method !== methodFilter) {
        return false
      }

      if (!keyword) return true

      const supplierName =
        supplierMap[payment.supplier_id]?.name || payment.supplier_name || ''
      const purchase = purchaseMap[payment.purchase_id]

      return [
        supplierName,
        payment.reference_no,
        payment.notes,
        purchase?.invoice_number,
        purchase?.supplier_name,
        payment.payment_method,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [methodFilter, payments, purchaseMap, search, supplierFilter, supplierMap])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handlePurchaseSelect = (purchaseId) => {
    const purchase = purchaseMap[purchaseId]

    if (!purchase) {
      setForm((current) => ({ ...current, purchaseId }))
      return
    }

    setForm((current) => ({
      ...current,
      purchaseId,
      supplierId: purchase.supplier_id || current.supplierId,
      amount: getPurchaseDue(purchase).toFixed(2),
    }))
  }

  const handleSupplierSelect = (supplierId) => {
    setForm((current) => ({
      ...current,
      supplierId,
      purchaseId:
        current.purchaseId &&
        purchaseMap[current.purchaseId]?.supplier_id &&
        purchaseMap[current.purchaseId]?.supplier_id !== supplierId
          ? ''
          : current.purchaseId,
    }))
  }

  const handleSavePayment = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const amount = Number(form.amount || 0)

    if (!form.supplierId && !form.purchaseId) {
      showToast({
        type: 'warning',
        title: 'Supplier required',
        message: 'Choose a supplier or a purchase bill before saving payment.',
      })
      return
    }

    if (amount <= 0) {
      showToast({
        type: 'warning',
        title: 'Invalid amount',
        message: 'Enter a payment amount greater than zero.',
      })
      return
    }

    setSaving(true)

    const { error } = await supabase.rpc('record_supplier_payment', {
      p_restaurant_id: restaurant.id,
      p_supplier_id: form.supplierId || null,
      p_purchase_id: form.purchaseId || null,
      p_amount: amount,
      p_payment_method: form.paymentMethod,
      p_paid_at: buildPaidAt(form.paidDate),
      p_reference_no: form.referenceNo.trim() || null,
      p_notes: form.notes.trim() || null,
    })

    setSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Payment save failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Supplier payment saved',
      message: 'Supplier ledger and purchase due are updated.',
    })

    setForm(initialForm)
    await loadSupplierPayments()
  }

  const handleVoidPayment = async (payment) => {
    const confirmed = await confirmAction({
      title: 'Void supplier payment?',
      message:
        'This will reverse the amount from the linked purchase bill if it has one.',
      confirmText: 'Void payment',
      cancelText: 'Keep',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase.rpc('void_supplier_payment', {
      p_payment_id: payment.id,
    })

    if (error) {
      showToast({
        type: 'error',
        title: 'Void failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Payment voided',
      message: 'Supplier balance has been recalculated.',
    })

    await loadSupplierPayments()
  }

  if (!restaurant?.id) {
    return (
      <section className="management-section">
        <div className="empty-state">
          Restaurant profile not found. Please complete restaurant setup first.
        </div>
      </section>
    )
  }

  return (
    <section className="supplier-payments-screen">
      <div className="supplier-payments-head">
        <div>
          <p className="pricing-label">Supplier Payments</p>
          <h2>Pay supplier dues</h2>
          <span>
            Record supplier bill payments, advance payments and keep purchase dues
            updated.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadSupplierPayments}
          disabled={loading}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="supplier-payments-stats">
        <SupplierPaymentStat
          icon={<FileText size={20} />}
          label="Purchase bills"
          value={formatMoney(currency, summary.totalPurchases)}
          note="Total purchase value"
        />
        <SupplierPaymentStat
          icon={<CheckCircle2 size={20} />}
          label="Paid on bills"
          value={formatMoney(currency, summary.totalPaidOnBills)}
          note="Recorded against purchases"
        />
        <SupplierPaymentStat
          icon={<CircleDollarSign size={20} />}
          label="Supplier due"
          value={formatMoney(currency, summary.totalDue)}
          note={`${summary.suppliersWithDue} supplier${summary.suppliersWithDue === 1 ? '' : 's'} with due`}
          danger={summary.totalDue > 0}
        />
        <SupplierPaymentStat
          icon={<WalletCards size={20} />}
          label="Payment ledger"
          value={formatMoney(currency, summary.paymentsTotal)}
          note="All active payment entries"
        />
      </div>

      <div className="supplier-payments-layout">
        <form className="supplier-payment-form" onSubmit={handleSavePayment}>
          <div className="supplier-payment-form-head">
            <div className="supplier-form-icon">
              <Banknote size={22} />
            </div>
            <div>
              <h3>Record payment</h3>
              <p>Choose a purchase bill to reduce due, or save as supplier advance.</p>
            </div>
          </div>

          <label>
            Supplier
            <select
              value={form.supplierId}
              onChange={(event) => handleSupplierSelect(event.target.value)}
            >
              <option value="">Choose supplier</option>
              {suppliers.map((supplier) => (
                <option value={supplier.id} key={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Link purchase bill optional
            <select
              value={form.purchaseId}
              onChange={(event) => handlePurchaseSelect(event.target.value)}
            >
              <option value="">Supplier advance / no bill selected</option>
              {selectedSupplierOpenPurchases.map((purchase) => (
                <option value={purchase.id} key={purchase.id}>
                  {formatPurchaseLabel(purchase, currency)}
                </option>
              ))}
            </select>
          </label>

          <div className="supplier-payment-form-grid">
            <label>
              Amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) => updateForm('amount', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Payment method
              <select
                value={form.paymentMethod}
                onChange={(event) =>
                  updateForm('paymentMethod', event.target.value)
                }
              >
                {paymentMethods.map((method) => (
                  <option value={method.value} key={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="supplier-payment-form-grid">
            <label>
              Payment date
              <input
                type="date"
                value={form.paidDate}
                onChange={(event) => updateForm('paidDate', event.target.value)}
              />
            </label>

            <label>
              Reference no.
              <input
                type="text"
                value={form.referenceNo}
                onChange={(event) =>
                  updateForm('referenceNo', event.target.value)
                }
                placeholder="Receipt / transfer ref"
              />
            </label>
          </div>

          <label>
            Notes
            <textarea
              value={form.notes}
              onChange={(event) => updateForm('notes', event.target.value)}
              placeholder="Payment remarks"
              rows="3"
            />
          </label>

          <button
            type="submit"
            className="primary-button supplier-save-button"
            disabled={saving}
          >
            {saving ? 'Saving payment...' : 'Save supplier payment'}
          </button>
        </form>

        <div className="supplier-due-panel">
          <div className="supplier-due-head">
            <div>
              <h3>Top supplier dues</h3>
              <p>Outstanding amount from purchase bills.</p>
            </div>
          </div>

          {supplierDueRows.length === 0 ? (
            <div className="supplier-empty-box">
              No supplier dues found. Paid purchases will stay balanced here.
            </div>
          ) : (
            <div className="supplier-due-list">
              {supplierDueRows.map((row) => (
                <article className="supplier-due-card" key={row.key}>
                  <div>
                    <strong>{row.supplierName}</strong>
                    <span>
                      {row.bills} bill{row.bills === 1 ? '' : 's'} • Paid{' '}
                      {formatMoney(currency, row.paid)}
                    </span>
                    {row.supplierPhone && <small>{row.supplierPhone}</small>}
                  </div>

                  <strong>{formatMoney(currency, row.due)}</strong>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="supplier-payments-list-card">
        <div className="supplier-payments-list-head">
          <div>
            <h3>Payment history</h3>
            <p>Recent supplier payment entries and reversals.</p>
          </div>

          <div className="supplier-payment-filters">
            <div className="search-box supplier-search-box">
              <Search size={18} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search supplier, invoice, ref..."
              />
            </div>

            <select
              value={supplierFilter}
              onChange={(event) => setSupplierFilter(event.target.value)}
            >
              <option value="all">All suppliers</option>
              {suppliers.map((supplier) => (
                <option value={supplier.id} key={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>

            <select
              value={methodFilter}
              onChange={(event) => setMethodFilter(event.target.value)}
            >
              <option value="all">All methods</option>
              {paymentMethods.map((method) => (
                <option value={method.value} key={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="empty-state compact">Loading supplier payments...</div>
        ) : filteredPayments.length === 0 ? (
          <div className="supplier-empty-box">
            No supplier payments found for the selected filter.
          </div>
        ) : (
          <div className="supplier-payment-table-wrap">
            <table className="supplier-payment-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Bill / Ref</th>
                  <th>Method</th>
                  <th>Date</th>
                  <th className="right">Amount</th>
                  <th className="right">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredPayments.map((payment) => {
                  const supplier = supplierMap[payment.supplier_id]
                  const purchase = purchaseMap[payment.purchase_id]

                  return (
                    <tr key={payment.id}>
                      <td>
                        <strong>
                          {supplier?.name || payment.supplier_name || 'Supplier'}
                        </strong>
                        {payment.notes && <span>{payment.notes}</span>}
                      </td>
                      <td>
                        <strong>
                          {purchase?.invoice_number ||
                            payment.reference_no ||
                            'Advance payment'}
                        </strong>
                        <span>
                          {purchase ? 'Linked purchase bill' : 'General supplier ledger'}
                        </span>
                      </td>
                      <td>
                        <span className="supplier-method-pill">
                          {formatPaymentMethod(payment.payment_method)}
                        </span>
                      </td>
                      <td>{formatDate(payment.paid_at)}</td>
                      <td className="right strong">
                        {formatMoney(currency, payment.amount)}
                      </td>
                      <td className="right">
                        <button
                          type="button"
                          className="tiny-button danger"
                          onClick={() => handleVoidPayment(payment)}
                        >
                          <Trash2 size={14} />
                          Void
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function SupplierPaymentStat({ icon, label, value, note, danger = false }) {
  return (
    <article className={`supplier-payment-stat ${danger ? 'danger' : ''}`}>
      <div className="supplier-stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  )
}

function getPurchaseDue(purchase) {
  return Math.max(
    Number(purchase?.total_amount || 0) - Number(purchase?.amount_paid || 0),
    0,
  )
}

function getTodayInputDate() {
  return new Date().toISOString().slice(0, 10)
}

function buildPaidAt(dateValue) {
  if (!dateValue) return new Date().toISOString()

  return `${dateValue}T12:00:00.000Z`
}

function formatPurchaseLabel(purchase, currency) {
  const invoice = purchase.invoice_number || 'No invoice'
  const due = getPurchaseDue(purchase)
  const supplier = purchase.supplier_name ? ` • ${purchase.supplier_name}` : ''

  return `${invoice}${supplier} • Due ${formatMoney(currency, due)}`
}

function formatMoney(currency, amount) {
  return `${currency || 'AED'} ${Number(amount || 0).toFixed(2)}`
}

function formatDate(value) {
  if (!value) return '-'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return '-'
  }
}

function formatPaymentMethod(value) {
  const method = paymentMethods.find((item) => item.value === value)
  return method?.label || String(value || 'Cash')
}

export default SupplierPaymentsManagement
