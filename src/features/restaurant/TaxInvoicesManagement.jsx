import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Calculator,
  Download,
  Eye,
  FileText,
  Percent,
  Printer,
  RefreshCcw,
  Search,
  WalletCards,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './TaxInvoicesManagement.css'

const rangeOptions = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
]

function TaxInvoicesManagement({ restaurant }) {
  const [orders, setOrders] = useState([])
  const [orderItems, setOrderItems] = useState([])
  const [purchases, setPurchases] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('month')
  const [search, setSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState(null)

  const currency = restaurant?.currency || 'AED'

  const loadTaxData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [ordersResult, orderItemsResult, purchasesResult, expensesResult] =
      await Promise.all([
        supabase
          .from('restaurant_orders')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('restaurant_order_items')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('restaurant_purchases')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('purchase_date', { ascending: false }),
        supabase
          .from('restaurant_expenses')
          .select('*, category:restaurant_expense_categories(id, name)')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false)
          .order('expense_date', { ascending: false }),
      ])

    setOrders(ordersResult.data || [])
    setOrderItems(orderItemsResult.data || [])
    setPurchases(purchasesResult.data || [])
    setExpenses(expensesResult.data || [])
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadTaxData()
  }, [loadTaxData])

  const itemsByOrderId = useMemo(() => {
    const grouped = new Map()

    orderItems.forEach((item) => {
      const current = grouped.get(item.order_id) || []
      current.push(item)
      grouped.set(item.order_id, current)
    })

    return grouped
  }, [orderItems])

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return filterByRange(orders, range, 'created_at')
      .filter((order) => order.status !== 'cancelled')
      .filter((order) => {
        if (!keyword) return true

        return [
          order.order_code,
          order.public_order_number,
          order.customer_name,
          order.customer_phone,
          order.table_name,
          order.order_type,
          order.payment_method,
        ].some((value) =>
          String(value || '')
            .toLowerCase()
            .includes(keyword),
        )
      })
  }, [orders, range, search])

  const filteredPurchases = useMemo(
    () =>
      filterByRange(purchases, range, 'purchase_date').filter(
        (purchase) => purchase.status !== 'cancelled',
      ),
    [purchases, range],
  )

  const filteredExpenses = useMemo(
    () => filterByRange(expenses, range, 'expense_date'),
    [expenses, range],
  )

  const taxSummary = useMemo(() => {
    const salesSubtotal = sumBy(filteredOrders, 'subtotal')
    const salesDiscount = sumBy(filteredOrders, 'discount_amount')
    const salesExtra = sumBy(filteredOrders, 'extra_amount')
    const deliveryCharges =
      sumBy(filteredOrders, 'shipping_fee') + sumBy(filteredOrders, 'packaging_fee')
    const salesTax = sumBy(filteredOrders, 'tax_amount')
    const salesTotal = sumBy(filteredOrders, 'total_amount')
    const purchaseTax = sumBy(filteredPurchases, 'tax_amount')
    const expenseTax = sumBy(filteredExpenses, 'tax_amount')
    const inputTax = purchaseTax + expenseTax
    const netTax = salesTax - inputTax

    return {
      salesSubtotal,
      salesDiscount,
      salesExtra,
      deliveryCharges,
      salesTax,
      salesTotal,
      purchaseTax,
      expenseTax,
      inputTax,
      netTax,
      orderCount: filteredOrders.length,
      purchaseCount: filteredPurchases.length,
      expenseCount: filteredExpenses.length,
    }
  }, [filteredExpenses, filteredOrders, filteredPurchases])

  const taxableOrderList = useMemo(() => {
    return filteredOrders.map((order) => ({
      ...order,
      items: itemsByOrderId.get(order.id) || [],
    }))
  }, [filteredOrders, itemsByOrderId])

  const exportTaxCsv = () => {
    const header = [
      'Date',
      'Invoice / Order No',
      'Customer',
      'Phone',
      'Type',
      'Payment',
      'Subtotal',
      'Discount',
      'Extra',
      'Tax',
      'Total',
      'Status',
    ]

    const rows = taxableOrderList.map((order) => [
      formatCsvDate(order.created_at),
      order.order_code || order.public_order_number || '',
      order.customer_name || '',
      order.customer_phone || '',
      formatOrderType(order.order_type),
      formatPaymentMethod(order.payment_method),
      numberValue(order.subtotal),
      numberValue(order.discount_amount),
      numberValue(order.extra_amount),
      numberValue(order.tax_amount),
      numberValue(order.total_amount),
      order.payment_status || '',
    ])

    const csv = [header, ...rows]
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `spizy-tax-report-${range}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handlePrintInvoice = (order) => {
    const printWindow = window.open('', '_blank', 'width=900,height=760')

    if (!printWindow) return

    printWindow.document.write(
      buildTaxInvoiceHtml({
        restaurant,
        order,
        currency,
      }),
    )
    printWindow.document.close()
    printWindow.focus()

    window.setTimeout(() => {
      printWindow.print()
    }, 250)
  }

  if (!restaurant?.id) {
    return (
      <section className="tax-invoices-screen">
        <div className="tax-empty-card">
          Restaurant profile not found. Complete restaurant setup first.
        </div>
      </section>
    )
  }

  return (
    <section className="tax-invoices-screen">
      <div className="tax-invoices-header">
        <div>
          <p className="pricing-label">Tax & Invoices</p>
          <h2>Tax invoice and VAT/GST report</h2>
          <span>
            Review sales tax, input tax from purchases/expenses, and print tax
            invoices for customer orders.
          </span>
        </div>

        <div className="tax-invoices-actions">
          <select value={range} onChange={(event) => setRange(event.target.value)}>
            {rangeOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button type="button" onClick={exportTaxCsv} disabled={loading}>
            <Download size={18} />
            CSV
          </button>

          <button type="button" onClick={loadTaxData} disabled={loading}>
            <RefreshCcw size={18} />
            Refresh
          </button>
        </div>
      </div>

      <div className="tax-summary-grid">
        <TaxStatCard
          icon={<Percent size={22} />}
          label="Output tax"
          value={formatMoney(currency, taxSummary.salesTax)}
          text={`${taxSummary.orderCount} taxable sales orders`}
          tone="gold"
        />

        <TaxStatCard
          icon={<WalletCards size={22} />}
          label="Input tax"
          value={formatMoney(currency, taxSummary.inputTax)}
          text={`${formatMoney(currency, taxSummary.purchaseTax)} purchases + ${formatMoney(
            currency,
            taxSummary.expenseTax,
          )} expenses`}
          tone="blue"
        />

        <TaxStatCard
          icon={<Calculator size={22} />}
          label={taxSummary.netTax >= 0 ? 'Estimated tax payable' : 'Tax credit'}
          value={formatMoney(currency, Math.abs(taxSummary.netTax))}
          text={
            taxSummary.netTax >= 0
              ? 'Output tax minus input tax'
              : 'Input tax is higher than output tax'
          }
          tone={taxSummary.netTax >= 0 ? 'red' : 'green'}
        />

        <TaxStatCard
          icon={<FileText size={22} />}
          label="Taxable sales"
          value={formatMoney(currency, taxSummary.salesTotal)}
          text={`Discounts ${formatMoney(currency, taxSummary.salesDiscount)} • Extras ${formatMoney(
            currency,
            taxSummary.salesExtra + taxSummary.deliveryCharges,
          )}`}
          tone="neutral"
        />
      </div>

      <div className="tax-invoices-panel">
        <div className="tax-panel-head">
          <div>
            <h3>Sales tax invoices</h3>
            <p>
              Print simple tax invoice copies from completed, served, delivered
              and unpaid orders.
            </p>
          </div>

          <div className="tax-search-box">
            <Search size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search invoice, customer, phone, table..."
            />
          </div>
        </div>

        {loading ? (
          <div className="tax-empty-card">Loading tax invoices...</div>
        ) : taxableOrderList.length === 0 ? (
          <div className="tax-empty-card">
            No tax invoices found for this filter.
          </div>
        ) : (
          <div className="tax-invoice-list">
            {taxableOrderList.map((order) => (
              <article className="tax-invoice-row" key={order.id}>
                <div className="tax-invoice-main">
                  <div className="tax-invoice-icon">
                    <FileText size={19} />
                  </div>

                  <div>
                    <strong>{order.order_code || order.public_order_number}</strong>
                    <span>
                      {formatDateTime(order.created_at)} • {formatOrderType(order.order_type)}
                    </span>
                    <small>
                      {order.customer_name || 'Walk-in customer'}
                      {order.customer_phone ? ` • ${order.customer_phone}` : ''}
                    </small>
                  </div>
                </div>

                <div className="tax-invoice-money-grid">
                  <div>
                    <span>Subtotal</span>
                    <strong>{formatMoney(currency, order.subtotal)}</strong>
                  </div>

                  <div>
                    <span>Tax</span>
                    <strong>{formatMoney(currency, order.tax_amount)}</strong>
                  </div>

                  <div>
                    <span>Total</span>
                    <strong>{formatMoney(currency, order.total_amount)}</strong>
                  </div>
                </div>

                <div className="tax-invoice-actions">
                  <span className={`tax-status ${order.payment_status || 'unpaid'}`}>
                    {formatPaymentStatus(order.payment_status)}
                  </span>

                  <button
                    type="button"
                    onClick={() => setSelectedInvoice(order)}
                  >
                    <Eye size={16} />
                    View
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePrintInvoice(order)}
                  >
                    <Printer size={16} />
                    Print
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="tax-notes-grid">
        <div className="tax-note-card">
          <strong>Important</strong>
          <span>
            Tax invoices use the tax amount stored on each order. Update global
            tax percentage in Restaurant Settings before taking new orders.
          </span>
        </div>

        <div className="tax-note-card">
          <strong>Input tax</strong>
          <span>
            Purchase and expense tax amounts are included as input tax when those
            modules have tax values entered.
          </span>
        </div>
      </div>

      {selectedInvoice && (
        <TaxInvoicePreviewModal
          restaurant={restaurant}
          currency={currency}
          order={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onPrint={() => handlePrintInvoice(selectedInvoice)}
        />
      )}
    </section>
  )
}

function TaxStatCard({ icon, label, value, text, tone }) {
  return (
    <div className={`tax-stat-card ${tone || 'neutral'}`}>
      <div className="tax-stat-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{text}</small>
    </div>
  )
}

function TaxInvoicePreviewModal({ restaurant, currency, order, onClose, onPrint }) {
  return (
    <div className="tax-modal-overlay" onClick={onClose}>
      <div className="tax-preview-modal" onClick={(event) => event.stopPropagation()}>
        <div className="tax-preview-head">
          <div>
            <p className="pricing-label">Invoice Preview</p>
            <h3>{order.order_code || order.public_order_number}</h3>
            <span>{formatDateTime(order.created_at)}</span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="tax-preview-paper">
          <div className="tax-paper-top">
            <div>
              <h2>{restaurant?.name || 'Spizy Restaurant'}</h2>
              <p>{restaurant?.address || 'Restaurant address'}</p>
              {restaurant?.phone && <p>Phone: {restaurant.phone}</p>}
              {getTaxNumber(restaurant) && <p>Tax No: {getTaxNumber(restaurant)}</p>}
            </div>

            <div>
              <strong>Tax Invoice</strong>
              <span>{order.order_code || order.public_order_number}</span>
            </div>
          </div>

          <div className="tax-paper-line" />

          <div className="tax-paper-grid">
            <div>
              <span>Customer</span>
              <strong>{order.customer_name || 'Walk-in customer'}</strong>
            </div>
            <div>
              <span>Phone</span>
              <strong>{order.customer_phone || '-'}</strong>
            </div>
            <div>
              <span>Order type</span>
              <strong>{formatOrderType(order.order_type)}</strong>
            </div>
            <div>
              <span>Payment</span>
              <strong>{formatPaymentMethod(order.payment_method)}</strong>
            </div>
          </div>

          <div className="tax-paper-line" />

          <div className="tax-paper-totals">
            <div>
              <span>Subtotal</span>
              <strong>{formatMoney(currency, order.subtotal)}</strong>
            </div>
            <div>
              <span>Discount</span>
              <strong>- {formatMoney(currency, order.discount_amount)}</strong>
            </div>
            <div>
              <span>Extra / delivery</span>
              <strong>
                +{' '}
                {formatMoney(
                  currency,
                  numberValue(order.extra_amount) +
                    numberValue(order.shipping_fee) +
                    numberValue(order.packaging_fee),
                )}
              </strong>
            </div>
            <div>
              <span>Tax {numberValue(order.tax_rate_snapshot) > 0 ? `(${order.tax_rate_snapshot}%)` : ''}</span>
              <strong>{formatMoney(currency, order.tax_amount)}</strong>
            </div>
            <div className="grand">
              <span>Total</span>
              <strong>{formatMoney(currency, order.total_amount)}</strong>
            </div>
          </div>
        </div>

        <div className="tax-preview-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
          <button type="button" className="primary" onClick={onPrint}>
            <Printer size={17} />
            Print Invoice
          </button>
        </div>
      </div>
    </div>
  )
}

function filterByRange(rows, range, dateKey) {
  if (range === 'all') return rows

  const now = new Date()
  const start = new Date(now)

  if (range === 'today') {
    start.setHours(0, 0, 0, 0)
  } else if (range === '7d') {
    start.setDate(now.getDate() - 6)
    start.setHours(0, 0, 0, 0)
  } else if (range === '30d') {
    start.setDate(now.getDate() - 29)
    start.setHours(0, 0, 0, 0)
  } else if (range === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  }

  return rows.filter((row) => {
    const value = row?.[dateKey]
    if (!value) return false
    return new Date(value) >= start
  })
}

function sumBy(rows, key) {
  return rows.reduce((total, row) => total + numberValue(row?.[key]), 0)
}

function numberValue(value) {
  return Number(value || 0)
}

function formatMoney(currency, amount) {
  return `${currency || 'AED'} ${Number(amount || 0).toFixed(2)}`
}

function formatDateTime(value) {
  if (!value) return '-'

  return new Intl.DateTimeFormat('en-AE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatCsvDate(value) {
  if (!value) return ''

  return new Date(value).toISOString()
}

function formatOrderType(value) {
  if (value === 'dine_in') return 'Dine-in'
  if (value === 'delivery') return 'Delivery'
  if (value === 'takeaway') return 'Takeaway'
  return 'Counter'
}

function formatPaymentMethod(value) {
  if (value === 'cod') return 'COD'
  if (value === 'upi') return 'UPI'
  return String(value || 'cash').toUpperCase()
}

function formatPaymentStatus(value) {
  if (value === 'paid') return 'Paid'
  if (value === 'refunded') return 'Refunded'
  if (value === 'partial') return 'Partial'
  return 'Unpaid'
}

function getTaxNumber(restaurant) {
  return (
    restaurant?.tax_number ||
    restaurant?.tax_registration_number ||
    restaurant?.vat_number ||
    restaurant?.trn ||
    ''
  )
}

function escapeCsvCell(value) {
  const stringValue = String(value ?? '')
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`
  }

  return stringValue
}

function buildTaxInvoiceHtml({ restaurant, order, currency }) {
  const itemsHtml = Array.isArray(order.items)
    ? order.items
        .map(
          (item) => `
            <tr>
              <td>
                <strong>${escapeHtml(item.item_name || 'Item')}</strong>
                ${
                  item.variation_name
                    ? `<small>${escapeHtml(item.variation_name)}</small>`
                    : ''
                }
              </td>
              <td>${Number(item.quantity || 0)}</td>
              <td>${formatMoney(currency, item.unit_price)}</td>
              <td>${formatMoney(currency, item.total_price)}</td>
            </tr>
          `,
        )
        .join('')
    : ''

  return `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(order.order_code || 'Tax Invoice')}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 28px;
            color: #111827;
            background: #ffffff;
            font-family: Arial, sans-serif;
          }
          .invoice {
            max-width: 820px;
            margin: 0 auto;
            border: 1px solid #e5e7eb;
            padding: 28px;
          }
          .head, .grid, .total-row {
            display: flex;
            justify-content: space-between;
            gap: 18px;
          }
          h1, h2, p { margin: 0; }
          h1 { font-size: 28px; }
          h2 { font-size: 18px; margin-top: 6px; }
          p, small, span { color: #4b5563; }
          .right { text-align: right; }
          .line { border-top: 1px solid #d1d5db; margin: 22px 0; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); }
          .box { border: 1px solid #e5e7eb; padding: 12px; border-radius: 10px; }
          .box span { display: block; font-size: 12px; }
          .box strong { display: block; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; }
          th { text-align: left; font-size: 12px; color: #6b7280; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 6px; }
          td small { display: block; margin-top: 4px; }
          .totals { margin-left: auto; width: min(360px, 100%); }
          .total-row { padding: 8px 0; }
          .grand { border-top: 2px solid #111827; margin-top: 8px; padding-top: 12px; font-size: 20px; }
          .footer { margin-top: 30px; text-align: center; color: #6b7280; }
          @media print {
            body { padding: 0; }
            .invoice { border: 0; }
          }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="head">
            <div>
              <h1>${escapeHtml(restaurant?.name || 'Spizy Restaurant')}</h1>
              <p>${escapeHtml(restaurant?.address || '')}</p>
              ${restaurant?.phone ? `<p>Phone: ${escapeHtml(restaurant.phone)}</p>` : ''}
              ${getTaxNumber(restaurant) ? `<p>Tax No: ${escapeHtml(getTaxNumber(restaurant))}</p>` : ''}
            </div>
            <div class="right">
              <h1>Tax Invoice</h1>
              <h2>${escapeHtml(order.order_code || order.public_order_number || '')}</h2>
              <p>${escapeHtml(formatDateTime(order.created_at))}</p>
            </div>
          </div>

          <div class="line"></div>

          <div class="grid">
            <div class="box"><span>Customer</span><strong>${escapeHtml(order.customer_name || 'Walk-in customer')}</strong></div>
            <div class="box"><span>Phone</span><strong>${escapeHtml(order.customer_phone || '-')}</strong></div>
            <div class="box"><span>Order Type</span><strong>${escapeHtml(formatOrderType(order.order_type))}</strong></div>
            <div class="box"><span>Payment</span><strong>${escapeHtml(formatPaymentMethod(order.payment_method))}</strong></div>
          </div>

          <div class="line"></div>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Rate</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml || '<tr><td colspan="4">Order item details unavailable.</td></tr>'}
            </tbody>
          </table>

          <div class="line"></div>

          <div class="totals">
            <div class="total-row"><span>Subtotal</span><strong>${formatMoney(currency, order.subtotal)}</strong></div>
            <div class="total-row"><span>Discount</span><strong>- ${formatMoney(currency, order.discount_amount)}</strong></div>
            <div class="total-row"><span>Extra / delivery</span><strong>+ ${formatMoney(currency, numberValue(order.extra_amount) + numberValue(order.shipping_fee) + numberValue(order.packaging_fee))}</strong></div>
            <div class="total-row"><span>Tax ${numberValue(order.tax_rate_snapshot) > 0 ? `(${order.tax_rate_snapshot}%)` : ''}</span><strong>${formatMoney(currency, order.tax_amount)}</strong></div>
            <div class="total-row grand"><span>Total</span><strong>${formatMoney(currency, order.total_amount)}</strong></div>
          </div>

          <div class="footer">
            Thank you. Powered by Spizy Menu.
          </div>
        </div>
      </body>
    </html>
  `
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export default TaxInvoicesManagement
