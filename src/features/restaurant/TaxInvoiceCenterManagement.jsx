import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Hash,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './TaxInvoiceCenterManagement.css'

const invoiceStatuses = [
  { value: 'all', label: 'All invoices' },
  { value: 'draft', label: 'Draft' },
  { value: 'issued', label: 'Issued' },
  { value: 'voided', label: 'Voided' },
]

function TaxInvoiceCenterManagement({ restaurant }) {
  const [loading, setLoading] = useState(true)
  const [savingInvoice, setSavingInvoice] = useState(false)
  const [month, setMonth] = useState(() => getCurrentMonthInput())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [orders, setOrders] = useState([])
  const [orderItems, setOrderItems] = useState([])
  const [invoiceRecords, setInvoiceRecords] = useState([])
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [message, setMessage] = useState('')
  const [invoiceRecordTableReady, setInvoiceRecordTableReady] = useState(true)
  const [invoiceForm, setInvoiceForm] = useState({
    customer_name: '',
    customer_tax_number: '',
    customer_address: '',
    notes: '',
  })

  const currency = restaurant?.currency || 'AED'

  const loadInvoiceCenter = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)
    setMessage('')

    const { startIso, endIso } = getMonthDateRangeIso(month)

    const { data: orderData, error: orderError } = await supabase
      .from('restaurant_orders')
      .select(
        'id, order_code, public_order_number, customer_name, customer_phone, table_name, order_type, status, payment_status, payment_method, total_amount, subtotal_amount, discount_amount, tax_amount, service_charge, service_charge_amount, currency, created_at',
      )
      .eq('restaurant_id', restaurant.id)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(250)

    if (orderError) {
      setMessage(orderError.message)
      setOrders([])
      setOrderItems([])
      setInvoiceRecords([])
      setLoading(false)
      return
    }

    const orderIds = (orderData || []).map((order) => order.id)
    let nextOrderItems = []

    if (orderIds.length > 0) {
      const { data: itemData } = await supabase
        .from('restaurant_order_items')
        .select('id, order_id, item_name, variation_name, quantity, unit_price, total_price, tax_amount, notes')
        .in('order_id', orderIds)
        .order('created_at', { ascending: true })

      nextOrderItems = itemData || []
    }

    const { data: invoiceData, error: invoiceError } = await supabase
      .from('restaurant_tax_invoice_records')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .gte('invoice_date', getMonthStartDate(month))
      .lte('invoice_date', getMonthEndDate(month))
      .order('invoice_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(250)

    if (invoiceError && invoiceError.code === '42P01') {
      setInvoiceRecordTableReady(false)
      setInvoiceRecords([])
    } else if (invoiceError) {
      setInvoiceRecordTableReady(false)
      setMessage(invoiceError.message)
      setInvoiceRecords([])
    } else {
      setInvoiceRecordTableReady(true)
      setInvoiceRecords(invoiceData || [])
    }

    setOrders(orderData || [])
    setOrderItems(nextOrderItems)
    setSelectedOrderId((current) => current || orderData?.[0]?.id || '')
    setLoading(false)
  }, [month, restaurant?.id])

  useEffect(() => {
    loadInvoiceCenter()
  }, [loadInvoiceCenter])

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || orders[0] || null,
    [orders, selectedOrderId],
  )

  const selectedOrderItems = useMemo(
    () => orderItems.filter((item) => item.order_id === selectedOrder?.id),
    [orderItems, selectedOrder?.id],
  )

  useEffect(() => {
    if (!selectedOrder) return

    setInvoiceForm((current) => ({
      ...current,
      customer_name: current.customer_name || selectedOrder.customer_name || '',
    }))
  }, [selectedOrder])

  const filteredInvoices = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return invoiceRecords.filter((record) => {
      if (statusFilter !== 'all' && record.status !== statusFilter) return false
      if (!keyword) return true

      return [
        record.invoice_number,
        record.order_code,
        record.customer_name,
        record.customer_tax_number,
        record.status,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [invoiceRecords, search, statusFilter])

  const previewInvoice = useMemo(
    () =>
      buildInvoicePreview({
        restaurant,
        order: selectedOrder,
        items: selectedOrderItems,
        invoiceRecords,
        invoiceForm,
      }),
    [invoiceForm, invoiceRecords, restaurant, selectedOrder, selectedOrderItems],
  )

  const summary = useMemo(
    () => buildInvoiceCenterSummary({ invoices: invoiceRecords, orders, previewInvoice }),
    [invoiceRecords, orders, previewInvoice],
  )

  const readinessChecks = useMemo(
    () =>
      buildInvoiceReadinessChecks({
        restaurant,
        invoiceRecordTableReady,
        invoiceRecords,
        orders,
      }),
    [invoiceRecordTableReady, invoiceRecords, orders, restaurant],
  )

  const createDraftInvoice = async () => {
    if (!restaurant?.id || !selectedOrder) return

    if (!invoiceRecordTableReady) {
      setMessage('Run the included SQL first, then create invoice records.')
      return
    }

    setSavingInvoice(true)
    setMessage('')

    const { data: userData } = await supabase.auth.getUser()
    const invoiceDate = getInputDateFromIso(selectedOrder.created_at) || getTodayDateKey()
    const invoicePayload = {
      restaurant_id: restaurant.id,
      order_id: selectedOrder.id,
      invoice_number: previewInvoice.invoiceNumber,
      invoice_date: invoiceDate,
      invoice_type: 'tax_invoice',
      status: 'draft',
      order_code: selectedOrder.order_code || selectedOrder.public_order_number || null,
      customer_name: invoiceForm.customer_name.trim() || selectedOrder.customer_name || null,
      customer_phone: selectedOrder.customer_phone || null,
      customer_tax_number: invoiceForm.customer_tax_number.trim() || null,
      customer_address: invoiceForm.customer_address.trim() || null,
      currency: selectedOrder.currency || currency,
      subtotal_amount: previewInvoice.subtotal,
      discount_amount: previewInvoice.discount,
      taxable_amount: previewInvoice.taxableAmount,
      tax_rate: previewInvoice.taxRate,
      tax_amount: previewInvoice.taxAmount,
      total_amount: previewInvoice.total,
      restaurant_trn: previewInvoice.restaurantTrn || null,
      pricing_mode: previewInvoice.pricingMode,
      notes: invoiceForm.notes.trim() || null,
      metadata: {
        source: 'tax_invoice_center_foundation',
        order_type: selectedOrder.order_type || null,
        table_name: selectedOrder.table_name || null,
        item_count: selectedOrderItems.length,
      },
      created_by: userData?.user?.id || null,
    }

    const { data, error } = await supabase
      .from('restaurant_tax_invoice_records')
      .insert(invoicePayload)
      .select('*')
      .single()

    setSavingInvoice(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setInvoiceRecords((current) => [data, ...current])
    setMessage('Draft tax invoice record created. Review and issue/lock it after accountant approval.')
  }

  const exportCsv = () => {
    const headers = [
      'Invoice No',
      'Date',
      'Order',
      'Customer',
      'Status',
      'Subtotal',
      'Taxable',
      'VAT',
      'Total',
      'TRN',
    ]

    const rows = filteredInvoices.map((record) => [
      record.invoice_number,
      record.invoice_date,
      record.order_code,
      record.customer_name,
      record.status,
      record.subtotal_amount,
      record.taxable_amount,
      record.tax_amount,
      record.total_amount,
      record.restaurant_trn,
    ])

    downloadCsv(`spizy-tax-invoices-${month}.csv`, [headers, ...rows])
  }

  return (
    <section className="tax-invoice-center-shell">
      <div className="tax-invoice-center-hero">
        <div>
          <p className="pricing-label">Tax Invoice Center</p>
          <h1>VAT invoice numbering, preview and issue readiness</h1>
          <p>
            Prepare UAE-style tax invoices from completed restaurant orders. This
            foundation keeps invoice records separate from payment gateways and helps
            owners review TRN, VAT values and invoice sequences before production.
          </p>
        </div>

        <div className="tax-invoice-center-actions">
          <button type="button" onClick={loadInvoiceCenter} disabled={loading}>
            <RefreshCw size={16} />
            Refresh
          </button>
          <button type="button" onClick={() => window.print()}>
            <Printer size={16} />
            Print
          </button>
          <button type="button" onClick={exportCsv} disabled={filteredInvoices.length === 0}>
            <Download size={16} />
            CSV
          </button>
        </div>
      </div>

      {message && (
        <div className="tax-invoice-message">
          <AlertTriangle size={17} />
          <span>{message}</span>
        </div>
      )}

      <div className="tax-invoice-kpi-grid">
        <TaxInvoiceKpiCard icon={<ReceiptText size={20} />} label="Invoice Records" value={summary.invoiceCount} note="Saved in this period" />
        <TaxInvoiceKpiCard icon={<Hash size={20} />} label="Next Preview No." value={previewInvoice.invoiceNumber} note="From current sequence" />
        <TaxInvoiceKpiCard icon={<FileText size={20} />} label="Taxable Orders" value={summary.taxableOrderCount} note="Orders ready for invoice review" />
        <TaxInvoiceKpiCard icon={<CheckCircle2 size={20} />} label="Readiness" value={`${summary.readinessScore}%`} note={summary.readinessLabel} />
      </div>

      <div className="tax-invoice-layout-grid">
        <section className="tax-invoice-panel">
          <div className="tax-invoice-panel-head">
            <div>
              <p className="pricing-label">Invoice Preview</p>
              <h2>Create draft tax invoice</h2>
            </div>
          </div>

          <div className="tax-invoice-form-grid">
            <label>
              <span>Month</span>
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            </label>

            <label>
              <span>Order</span>
              <select value={selectedOrder?.id || ''} onChange={(event) => setSelectedOrderId(event.target.value)}>
                {orders.length === 0 ? (
                  <option value="">No orders found</option>
                ) : (
                  orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.order_code || order.public_order_number || 'Order'} • {formatMoney(order.currency || currency, getOrderTotal(order))}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label>
              <span>Customer name</span>
              <input value={invoiceForm.customer_name} onChange={(event) => setInvoiceForm((current) => ({ ...current, customer_name: event.target.value }))} placeholder="Customer / company name" />
            </label>

            <label>
              <span>Customer TRN / Tax No.</span>
              <input value={invoiceForm.customer_tax_number} onChange={(event) => setInvoiceForm((current) => ({ ...current, customer_tax_number: event.target.value }))} placeholder="Optional" />
            </label>

            <label className="tax-invoice-span-two">
              <span>Customer address</span>
              <input value={invoiceForm.customer_address} onChange={(event) => setInvoiceForm((current) => ({ ...current, customer_address: event.target.value }))} placeholder="Optional billing address" />
            </label>

            <label className="tax-invoice-span-two">
              <span>Notes</span>
              <textarea value={invoiceForm.notes} onChange={(event) => setInvoiceForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Internal invoice notes" rows={3} />
            </label>
          </div>

          <div className="tax-invoice-preview-paper">
            <div className="tax-invoice-paper-head">
              <div>
                <strong>{restaurant?.name || 'Restaurant'}</strong>
                <span>{restaurant?.address || 'Restaurant address'}</span>
                <span>TRN: {previewInvoice.restaurantTrn || 'Not set'}</span>
              </div>
              <div>
                <strong>TAX INVOICE</strong>
                <span>{previewInvoice.invoiceNumber}</span>
                <span>{formatSimpleDate(previewInvoice.invoiceDate)}</span>
              </div>
            </div>

            <div className="tax-invoice-bill-box">
              <div>
                <span>Bill to</span>
                <strong>{previewInvoice.customerName || 'Walk-in customer'}</strong>
                <small>{invoiceForm.customer_address || selectedOrder?.customer_phone || 'Customer details optional'}</small>
              </div>
              <div>
                <span>Order</span>
                <strong>{selectedOrder?.order_code || selectedOrder?.public_order_number || 'Select order'}</strong>
                <small>{formatTitle(selectedOrder?.order_type || 'counter')}</small>
              </div>
            </div>

            <div className="tax-invoice-lines">
              <div className="tax-invoice-line header">
                <span>Item</span>
                <span>Qty</span>
                <span>Total</span>
              </div>
              {previewInvoice.items.length === 0 ? (
                <div className="tax-invoice-empty-line">No order items loaded.</div>
              ) : (
                previewInvoice.items.map((item) => (
                  <div className="tax-invoice-line" key={item.id}>
                    <span>{item.label}</span>
                    <span>{item.quantity}</span>
                    <span>{formatMoney(previewInvoice.currency, item.total)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="tax-invoice-totals">
              <InvoiceTotalRow label="Subtotal" value={formatMoney(previewInvoice.currency, previewInvoice.subtotal)} />
              <InvoiceTotalRow label="Discount" value={formatMoney(previewInvoice.currency, previewInvoice.discount)} />
              <InvoiceTotalRow label="Taxable amount" value={formatMoney(previewInvoice.currency, previewInvoice.taxableAmount)} />
              <InvoiceTotalRow label={`VAT ${previewInvoice.taxRate}%`} value={formatMoney(previewInvoice.currency, previewInvoice.taxAmount)} />
              <InvoiceTotalRow label="Grand total" value={formatMoney(previewInvoice.currency, previewInvoice.total)} strong />
            </div>
          </div>

          <button
            type="button"
            className="tax-invoice-primary-button"
            onClick={createDraftInvoice}
            disabled={!selectedOrder || savingInvoice}
          >
            <Save size={17} />
            {savingInvoice ? 'Creating...' : 'Create Draft Invoice Record'}
          </button>
        </section>

        <section className="tax-invoice-panel">
          <div className="tax-invoice-panel-head">
            <div>
              <p className="pricing-label">Readiness</p>
              <h2>VAT invoice setup checks</h2>
            </div>
          </div>

          <div className="tax-invoice-check-list">
            {readinessChecks.map((check) => (
              <article className={`tax-invoice-check-card ${check.status}`} key={check.key}>
                {check.status === 'ready' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                <div>
                  <strong>{check.title}</strong>
                  <span>{check.message}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="tax-invoice-panel">
        <div className="tax-invoice-panel-head">
          <div>
            <p className="pricing-label">Invoice Register</p>
            <h2>Saved tax invoice records</h2>
          </div>
          <div className="tax-invoice-filter-row">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {invoiceStatuses.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <label>
              <Search size={15} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice, order or customer" />
            </label>
          </div>
        </div>

        <div className="tax-invoice-table-wrap">
          <table className="tax-invoice-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th>VAT</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7">Loading invoices...</td></tr>
              ) : filteredInvoices.length === 0 ? (
                <tr><td colSpan="7">No invoice records found for this filter.</td></tr>
              ) : (
                filteredInvoices.map((record) => (
                  <tr key={record.id}>
                    <td>{record.invoice_number}</td>
                    <td>{formatSimpleDate(record.invoice_date)}</td>
                    <td>{record.order_code || 'Order'}</td>
                    <td>{record.customer_name || 'Walk-in'}</td>
                    <td>{formatTitle(record.status || 'draft')}</td>
                    <td>{formatMoney(record.currency || currency, record.tax_amount)}</td>
                    <td>{formatMoney(record.currency || currency, record.total_amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function TaxInvoiceKpiCard({ icon, label, value, note }) {
  return (
    <article className="tax-invoice-kpi-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function InvoiceTotalRow({ label, value, strong = false }) {
  return (
    <div className={strong ? 'strong' : ''}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function buildInvoicePreview({ restaurant, order, items, invoiceRecords, invoiceForm }) {
  const currency = order?.currency || restaurant?.currency || 'AED'
  const taxRate = Number(restaurant?.tax_rate ?? restaurant?.vat_rate ?? 5) || 5
  const total = getOrderTotal(order)
  const itemTotal = sumValues((items || []).map((item) => getItemTotal(item)))
  const subtotal = Number(order?.subtotal_amount || 0) > 0 ? Number(order.subtotal_amount) : itemTotal || total
  const discount = Number(order?.discount_amount || 0)
  const explicitTax = Number(order?.tax_amount || 0)
  const taxableAmount = Math.max(subtotal - discount, 0)
  const taxAmount = explicitTax > 0 ? explicitTax : calculateTaxFromTotal({ total, taxableAmount, taxRate, pricingMode: restaurant?.tax_pricing_mode })
  const invoiceDate = getInputDateFromIso(order?.created_at) || getTodayDateKey()

  return {
    invoiceNumber: buildNextInvoiceNumber({ restaurant, invoiceRecords }),
    invoiceDate,
    customerName: invoiceForm.customer_name || order?.customer_name || '',
    restaurantTrn: restaurant?.trn || restaurant?.tax_registration_number || restaurant?.vat_trn || '',
    pricingMode: restaurant?.tax_pricing_mode || 'inclusive',
    currency,
    subtotal,
    discount,
    taxableAmount,
    taxRate,
    taxAmount,
    total,
    items: normalizeInvoiceItems(items, order),
  }
}

function buildInvoiceCenterSummary({ invoices, orders, previewInvoice }) {
  const readinessScore = calculateReadinessScore({ invoices, orders, previewInvoice })

  return {
    invoiceCount: String(invoices.length),
    taxableOrderCount: String(orders.filter((order) => getOrderTotal(order) > 0).length),
    readinessScore,
    readinessLabel: readinessScore >= 80 ? 'Ready for accountant review' : 'Setup review needed',
  }
}

function buildInvoiceReadinessChecks({ restaurant, invoiceRecordTableReady, invoiceRecords, orders }) {
  return [
    {
      key: 'table',
      status: invoiceRecordTableReady ? 'ready' : 'warning',
      title: 'Invoice register table',
      message: invoiceRecordTableReady
        ? 'Invoice records table is available.'
        : 'Run the included SQL migration before saving invoice records.',
    },
    {
      key: 'trn',
      status: restaurant?.trn || restaurant?.tax_registration_number || restaurant?.vat_trn ? 'ready' : 'warning',
      title: 'Restaurant TRN',
      message: restaurant?.trn || restaurant?.tax_registration_number || restaurant?.vat_trn
        ? 'Restaurant tax registration number is available.'
        : 'Add TRN in VAT Statutory settings before issuing final tax invoices.',
    },
    {
      key: 'sequence',
      status: 'ready',
      title: 'Invoice sequence preview',
      message: `${invoiceRecords.length} invoice record${invoiceRecords.length === 1 ? '' : 's'} loaded for this period.`,
    },
    {
      key: 'orders',
      status: orders.length > 0 ? 'ready' : 'warning',
      title: 'Orders available',
      message: orders.length > 0
        ? `${orders.length} order${orders.length === 1 ? '' : 's'} found for invoice preview.`
        : 'No orders found for this month yet.',
    },
  ]
}

function calculateReadinessScore({ invoices, orders, previewInvoice }) {
  let score = 40

  if (orders.length > 0) score += 20
  if (previewInvoice.restaurantTrn) score += 20
  if (previewInvoice.invoiceNumber) score += 10
  if (invoices.length > 0) score += 10

  return Math.min(100, score)
}

function buildNextInvoiceNumber({ restaurant, invoiceRecords }) {
  const prefix = restaurant?.tax_invoice_prefix || restaurant?.invoice_prefix || 'SPZ-TAX-'
  const padding = Number(restaurant?.tax_invoice_number_padding || 5)
  const configuredNext = Number(restaurant?.tax_invoice_next_number || 1)
  const maxExistingNumber = (invoiceRecords || []).reduce((max, record) => {
    const match = String(record.invoice_number || '').match(/(\d+)$/)
    const value = match ? Number(match[1]) : 0
    return Math.max(max, value)
  }, 0)
  const nextNumber = Math.max(configuredNext, maxExistingNumber + 1)

  return `${prefix}${String(nextNumber).padStart(padding, '0')}`
}

function normalizeInvoiceItems(items, order) {
  if (Array.isArray(items) && items.length > 0) {
    return items.map((item) => ({
      id: item.id,
      label: [item.item_name, item.variation_name].filter(Boolean).join(' - '),
      quantity: Number(item.quantity || 1),
      total: getItemTotal(item),
    }))
  }

  if (!order) return []

  return [
    {
      id: order.id,
      label: order.order_code || order.public_order_number || 'Restaurant order',
      quantity: 1,
      total: getOrderTotal(order),
    },
  ]
}

function calculateTaxFromTotal({ total, taxableAmount, taxRate, pricingMode }) {
  if (taxRate <= 0) return 0

  if (pricingMode === 'exclusive') {
    return (taxableAmount * taxRate) / 100
  }

  return total - total / (1 + taxRate / 100)
}

function getOrderTotal(order) {
  return Number(order?.total_amount ?? order?.grand_total ?? order?.amount ?? 0)
}

function getItemTotal(item) {
  return Number(item?.total_price ?? item?.line_total ?? Number(item?.quantity || 1) * Number(item?.unit_price || 0))
}

function sumValues(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0)
}

function getCurrentMonthInput() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getTodayDateKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function getMonthStartDate(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function getMonthEndDate(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const endDate = new Date(year, month, 0)
  return `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
}

function getMonthDateRangeIso(monthKey) {
  const startDate = getMonthStartDate(monthKey)
  const [year, month] = monthKey.split('-').map(Number)
  const end = new Date(year, month, 1)

  return {
    startIso: new Date(`${startDate}T00:00:00`).toISOString(),
    endIso: end.toISOString(),
  }
}

function getInputDateFromIso(value) {
  if (!value) return ''

  try {
    return new Date(value).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function formatSimpleDate(value) {
  if (!value) return 'Not set'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${value}T00:00:00`))
  } catch {
    return value
  }
}

function formatMoney(currency, amount) {
  const safeCurrency = currency || 'AED'
  const numericAmount = Number(amount || 0)

  try {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(numericAmount)
  } catch {
    return `${safeCurrency} ${numericAmount.toFixed(2)}`
  }
}

function formatTitle(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default TaxInvoiceCenterManagement
