import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CreditCard,
  Download,
  PackageCheck,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingCart,
  Table2,
  Tags,
  UserRound,
  WalletCards,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './AdvancedSalesReportsManagement.css'

const reportTabs = [
  { id: 'summary', label: 'Summary' },
  { id: 'products', label: 'Products' },
  { id: 'categories', label: 'Categories' },
  { id: 'tables', label: 'Tables' },
  { id: 'staff', label: 'Waiters / Staff' },
  { id: 'payments', label: 'Payments' },
  { id: 'hourly', label: 'Hourly' },
  { id: 'exceptions', label: 'Exceptions' },
]

const orderTypeOptions = [
  { value: 'all', label: 'All order types' },
  { value: 'dine_in', label: 'Dine-in' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'counter', label: 'Counter' },
]

const paymentMethodOptions = [
  { value: 'all', label: 'All payments' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'cod', label: 'COD' },
  { value: 'online', label: 'Online' },
  { value: 'upi', label: 'UPI' },
]

function AdvancedSalesReportsManagement({ restaurant }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthInput())
  const [activeTab, setActiveTab] = useState('summary')
  const [search, setSearch] = useState('')
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [orders, setOrders] = useState([])
  const [orderItems, setOrderItems] = useState([])
  const [refunds, setRefunds] = useState([])
  const [loadErrors, setLoadErrors] = useState([])

  const currency = restaurant?.currency || 'AED'

  const loadReports = useCallback(
    async ({ silent = false } = {}) => {
      if (!restaurant?.id) return

      if (silent) setRefreshing(true)
      else setLoading(true)

      const { startIso, endIso } = getMonthIsoRange(selectedMonth)

      const { data: orderData, error: orderError } = await supabase
        .from('restaurant_orders')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(2000)

      const orderIds = (orderData || []).map((order) => order.id).filter(Boolean)

      let itemData = []
      let itemError = null
      if (orderIds.length > 0) {
        const result = await supabase
          .from('restaurant_order_items')
          .select('*')
          .in('order_id', orderIds)
          .order('created_at', { ascending: true })

        itemData = result.data || []
        itemError = result.error
      }

      const { data: refundData, error: refundError } = await supabase
        .from('restaurant_payment_refunds')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(1000)

      setOrders(orderData || [])
      setOrderItems(itemData)
      setRefunds(refundError?.code === '42P01' ? [] : refundData || [])
      setLoadErrors(
        [
          normalizeLoadError('Orders', orderError),
          normalizeLoadError('Order items', itemError),
          normalizeLoadError('Refund records', refundError),
        ].filter(Boolean),
      )
      setLoading(false)
      setRefreshing(false)
    },
    [restaurant?.id, selectedMonth],
  )

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const reportModel = useMemo(
    () =>
      buildAdvancedSalesReportModel({
        orders,
        orderItems,
        refunds,
        currency,
        search,
        orderTypeFilter,
        paymentFilter,
      }),
    [currency, orderItems, orderTypeFilter, orders, paymentFilter, refunds, search],
  )

  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print()
  }

  const handleExportCsv = () => {
    const rows = buildAdvancedSalesCsvRows(reportModel, selectedMonth, restaurant)
    downloadCsv(`spizy-sales-reports-${selectedMonth}.csv`, rows)
  }

  return (
    <section className="advanced-sales-reports-shell">
      <div className="advanced-sales-hero">
        <div>
          <p className="pricing-label">Advanced Reports</p>
          <h1>Sales Intelligence Center</h1>
          <p>
            Track product-wise sales, category performance, table sales, waiter/staff
            activity, payment gateway totals, discounts, refunds, cancellations and
            hourly demand from one owner report center.
          </p>
        </div>

        <div className="advanced-sales-hero-actions">
          <label>
            <CalendarDays size={16} />
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => loadReports({ silent: true })} disabled={refreshing}>
            <RefreshCw size={16} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button type="button" onClick={handlePrint}>
            <Printer size={16} />
            Print
          </button>
          <button type="button" onClick={handleExportCsv}>
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {loadErrors.length > 0 && (
        <div className="advanced-sales-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Some report data could not be loaded</strong>
            <span>{loadErrors.join(' • ')}</span>
          </div>
        </div>
      )}

      <div className="advanced-sales-filters">
        <label className="advanced-sales-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search order, customer, table, product, gateway..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <select value={orderTypeFilter} onChange={(event) => setOrderTypeFilter(event.target.value)}>
          {orderTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
          {paymentMethodOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="advanced-sales-loading">
          <RefreshCw size={20} />
          Loading sales reports...
        </div>
      ) : (
        <>
          <div className="advanced-sales-kpi-grid">
            <ReportMetricCard
              icon={<ReceiptText size={20} />}
              label="Gross Sales"
              value={formatMoney(currency, reportModel.summary.grossSales)}
              note={`${reportModel.summary.totalOrders} order${reportModel.summary.totalOrders === 1 ? '' : 's'}`}
              tone="gold"
            />
            <ReportMetricCard
              icon={<WalletCards size={20} />}
              label="Collected"
              value={formatMoney(currency, reportModel.summary.collectedTotal)}
              note="Paid / captured amount"
              tone="green"
            />
            <ReportMetricCard
              icon={<Tags size={20} />}
              label="Discounts"
              value={formatMoney(currency, reportModel.summary.discountTotal)}
              note="Coupons and manual discounts"
              tone="warning"
            />
            <ReportMetricCard
              icon={<RefreshCw size={20} />}
              label="Refunds"
              value={formatMoney(currency, reportModel.summary.refundTotal)}
              note={`${reportModel.refundRows.length} refund record${reportModel.refundRows.length === 1 ? '' : 's'}`}
              tone={reportModel.summary.refundTotal > 0 ? 'danger' : 'green'}
            />
            <ReportMetricCard
              icon={<ShoppingCart size={20} />}
              label="Net Sales"
              value={formatMoney(currency, reportModel.summary.netSales)}
              note="Gross - discounts - refunds"
              tone="blue"
            />
            <ReportMetricCard
              icon={<BarChart3 size={20} />}
              label="Average Order"
              value={formatMoney(currency, reportModel.summary.averageOrderValue)}
              note="Filtered order average"
              tone="blue"
            />
          </div>

          <div className="advanced-sales-tabs">
            {reportTabs.map((tab) => (
              <button
                type="button"
                key={tab.id}
                className={activeTab === tab.id ? 'active' : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'summary' && <SummaryReportPanel model={reportModel} currency={currency} />}
          {activeTab === 'products' && <RankedReportTable title="Best-selling products" rows={reportModel.productRows} currency={currency} />}
          {activeTab === 'categories' && <RankedReportTable title="Category-wise sales" rows={reportModel.categoryRows} currency={currency} />}
          {activeTab === 'tables' && <RankedReportTable title="Table-wise sales" rows={reportModel.tableRows} currency={currency} icon={<Table2 size={18} />} />}
          {activeTab === 'staff' && <RankedReportTable title="Waiter / staff-wise sales" rows={reportModel.staffRows} currency={currency} icon={<UserRound size={18} />} />}
          {activeTab === 'payments' && <PaymentsReportPanel model={reportModel} currency={currency} />}
          {activeTab === 'hourly' && <HourlyReportPanel rows={reportModel.hourlyRows} currency={currency} />}
          {activeTab === 'exceptions' && <ExceptionReportPanel model={reportModel} currency={currency} />}
        </>
      )}
    </section>
  )
}

function SummaryReportPanel({ model, currency }) {
  return (
    <div className="advanced-sales-panel-grid">
      <section className="advanced-sales-panel">
        <PanelHeader icon={<ShoppingCart size={18} />} title="Order type split" subtitle="Dine-in / delivery / takeaway / counter" />
        <SimpleBreakdown rows={model.orderTypeRows} currency={currency} />
      </section>
      <section className="advanced-sales-panel">
        <PanelHeader icon={<CreditCard size={18} />} title="Payment split" subtitle="Cash, card, online and gateway view" />
        <SimpleBreakdown rows={model.paymentRows} currency={currency} />
      </section>
      <section className="advanced-sales-panel wide">
        <PanelHeader icon={<PackageCheck size={18} />} title="Top products preview" subtitle="Highest revenue items in this filter" />
        <RankedReportTable rows={model.productRows.slice(0, 6)} currency={currency} compact />
      </section>
    </div>
  )
}

function PaymentsReportPanel({ model, currency }) {
  return (
    <div className="advanced-sales-panel-grid">
      <section className="advanced-sales-panel">
        <PanelHeader icon={<CreditCard size={18} />} title="Payment method report" subtitle="Collection method totals" />
        <SimpleBreakdown rows={model.paymentRows} currency={currency} />
      </section>
      <section className="advanced-sales-panel">
        <PanelHeader icon={<CreditCard size={18} />} title="Gateway report" subtitle="Restaurant-owned gateway totals only" />
        <SimpleBreakdown rows={model.gatewayRows} currency={currency} />
      </section>
    </div>
  )
}

function HourlyReportPanel({ rows, currency }) {
  return (
    <section className="advanced-sales-panel">
      <PanelHeader icon={<BarChart3 size={18} />} title="Hourly sales heatmap" subtitle="Demand and collection pattern by hour" />
      <div className="advanced-sales-hourly-grid">
        {rows.map((row) => (
          <article key={row.key} className="advanced-sales-hour-card">
            <span>{row.label}</span>
            <strong>{formatMoney(currency, row.revenue)}</strong>
            <small>{row.count} order{row.count === 1 ? '' : 's'}</small>
            <div className="advanced-sales-hour-bar">
              <span style={{ width: `${row.percent}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ExceptionReportPanel({ model, currency }) {
  return (
    <div className="advanced-sales-panel-grid">
      <section className="advanced-sales-panel">
        <PanelHeader icon={<AlertTriangle size={18} />} title="Cancelled orders" subtitle="Cancelled / voided revenue risk" />
        <ExceptionRows rows={model.cancelledRows} currency={currency} emptyText="No cancelled orders in this filter." />
      </section>
      <section className="advanced-sales-panel">
        <PanelHeader icon={<RefreshCw size={18} />} title="Refund records" subtitle="Refunds / adjustments captured in Spizy" />
        <ExceptionRows rows={model.refundRows} currency={currency} emptyText="No refund records in this filter." />
      </section>
      <section className="advanced-sales-panel wide">
        <PanelHeader icon={<Tags size={18} />} title="Discount report" subtitle="Coupon and manual discount impact" />
        <ExceptionRows rows={model.discountRows} currency={currency} emptyText="No discount activity in this filter." />
      </section>
    </div>
  )
}

function RankedReportTable({ title = '', rows, currency, icon = <PackageCheck size={18} />, compact = false }) {
  return (
    <section className={`advanced-sales-panel ${compact ? 'compact' : ''}`}>
      {title && <PanelHeader icon={icon} title={title} subtitle="Ranked by revenue" />}
      {rows.length === 0 ? (
        <div className="advanced-sales-empty">No matching records found.</div>
      ) : (
        <div className="advanced-sales-table-wrap">
          <table className="advanced-sales-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Qty / Orders</th>
                <th>Revenue</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.label}</strong>
                    {row.note && <span>{row.note}</span>}
                  </td>
                  <td>{formatQuantityValue(row.quantity, row.count)}</td>
                  <td>{formatMoney(currency, row.revenue)}</td>
                  <td>{formatPercent(row.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function SimpleBreakdown({ rows, currency }) {
  if (rows.length === 0) {
    return <div className="advanced-sales-empty">No matching records found.</div>
  }

  return (
    <div className="advanced-sales-breakdown-list">
      {rows.map((row) => (
        <article key={row.key}>
          <div>
            <strong>{row.label}</strong>
            <span>{row.count} order{row.count === 1 ? '' : 's'} • {formatPercent(row.share)}</span>
          </div>
          <b>{formatMoney(currency, row.revenue)}</b>
        </article>
      ))}
    </div>
  )
}

function ExceptionRows({ rows, currency, emptyText }) {
  if (rows.length === 0) {
    return <div className="advanced-sales-empty">{emptyText}</div>
  }

  return (
    <div className="advanced-sales-exception-list">
      {rows.slice(0, 12).map((row) => (
        <article key={row.key}>
          <div>
            <strong>{row.title}</strong>
            <span>{row.note}</span>
          </div>
          <b>{formatMoney(currency, row.amount)}</b>
        </article>
      ))}
    </div>
  )
}

function ReportMetricCard({ icon, label, value, note, tone }) {
  return (
    <article className={`advanced-sales-kpi ${tone || ''}`}>
      <div className="advanced-sales-kpi-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function PanelHeader({ icon, title, subtitle }) {
  return (
    <div className="advanced-sales-panel-head">
      <div className="advanced-sales-panel-icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  )
}

function buildAdvancedSalesReportModel({ orders, orderItems, refunds, currency, search, orderTypeFilter, paymentFilter }) {
  const keyword = search.trim().toLowerCase()
  const itemsByOrderId = groupBy(orderItems, (item) => item.order_id)

  const enrichedOrders = orders.map((order) => ({
    ...order,
    items: itemsByOrderId[String(order.id)] || itemsByOrderId[order.id] || [],
  }))

  const filteredOrders = enrichedOrders.filter((order) => {
    if (orderTypeFilter !== 'all' && normalizeOrderType(order.order_type) !== orderTypeFilter) return false
    if (paymentFilter !== 'all' && normalizePaymentMethod(order) !== paymentFilter) return false
    if (!keyword) return true

    const itemText = (order.items || []).map((item) => `${item.item_name || item.name || ''} ${item.variation_name || ''}`).join(' ')

    return [
      order.order_code,
      order.public_order_number,
      order.customer_name,
      order.customer_phone,
      order.table_name,
      order.table_number,
      order.waiter_name,
      order.staff_name,
      order.payment_method,
      order.payment_gateway,
      order.delivery_payment_type,
      itemText,
    ].some((value) => String(value || '').toLowerCase().includes(keyword))
  })

  const filteredOrderIds = new Set(filteredOrders.map((order) => String(order.id)))
  const filteredItems = orderItems.filter((item) => filteredOrderIds.has(String(item.order_id)))
  const filteredRefunds = refunds.filter((refund) =>
    !refund.order_id || filteredOrderIds.has(String(refund.order_id)),
  )

  const grossSales = sumValues(filteredOrders.map(getOrderTotal))
  const collectedTotal = sumValues(filteredOrders.map(getOrderCollectedAmount))
  const discountTotal = sumValues(filteredOrders.map(getOrderDiscountAmount))
  const orderRefundTotal = sumValues(filteredOrders.map(getOrderRefundAmount))
  const refundRecordTotal = sumValues(filteredRefunds.map(getRefundAmount))
  const refundTotal = Math.max(orderRefundTotal, refundRecordTotal)
  const netSales = Math.max(grossSales - discountTotal - refundTotal, 0)
  const averageOrderValue = filteredOrders.length > 0 ? grossSales / filteredOrders.length : 0
  const revenueBase = grossSales || 1

  const productRows = aggregateRows(filteredItems, {
    getKey: (item) => getItemName(item),
    getLabel: (item) => getItemName(item),
    getNote: (item) => item.variation_name || item.category_name || item.item_category || '',
    getQuantity: getItemQuantity,
    getRevenue: getItemRevenue,
    revenueBase,
  })

  const categoryRows = aggregateRows(filteredItems, {
    getKey: (item) => item.category_name || item.item_category || item.category || 'Uncategorised',
    getLabel: (item) => item.category_name || item.item_category || item.category || 'Uncategorised',
    getNote: () => 'Menu category',
    getQuantity: getItemQuantity,
    getRevenue: getItemRevenue,
    revenueBase,
  })

  const tableRows = aggregateRows(filteredOrders, {
    getKey: (order) => getTableLabel(order),
    getLabel: (order) => getTableLabel(order),
    getNote: (order) => formatTitle(normalizeOrderType(order.order_type)),
    getQuantity: () => 0,
    getRevenue: getOrderTotal,
    revenueBase,
    countLabel: 'orders',
  })

  const staffRows = aggregateRows(filteredOrders, {
    getKey: (order) => getStaffLabel(order),
    getLabel: (order) => getStaffLabel(order),
    getNote: () => 'Order owner / waiter',
    getQuantity: () => 0,
    getRevenue: getOrderTotal,
    revenueBase,
    countLabel: 'orders',
  })

  const orderTypeRows = aggregateRows(filteredOrders, {
    getKey: (order) => normalizeOrderType(order.order_type),
    getLabel: (order) => formatOrderType(order.order_type),
    getNote: () => 'Order type',
    getQuantity: () => 0,
    getRevenue: getOrderTotal,
    revenueBase,
  })

  const paymentRows = aggregateRows(filteredOrders, {
    getKey: normalizePaymentMethod,
    getLabel: (order) => formatPaymentMethod(normalizePaymentMethod(order)),
    getNote: () => 'Payment method',
    getQuantity: () => 0,
    getRevenue: getOrderCollectedOrTotal,
    revenueBase: collectedTotal || revenueBase,
  })

  const gatewayRows = aggregateRows(filteredOrders.filter(hasGatewayValue), {
    getKey: (order) => getGatewayLabel(order).toLowerCase(),
    getLabel: getGatewayLabel,
    getNote: () => 'Restaurant-owned gateway',
    getQuantity: () => 0,
    getRevenue: getOrderCollectedOrTotal,
    revenueBase: collectedTotal || revenueBase,
  })

  const hourlyRows = buildHourlyRows(filteredOrders, revenueBase)
  const cancelledRows = buildCancelledRows(filteredOrders)
  const refundRows = buildRefundRows(filteredOrders, filteredRefunds)
  const discountRows = buildDiscountRows(filteredOrders)

  return {
    currency,
    summary: {
      totalOrders: filteredOrders.length,
      grossSales,
      collectedTotal,
      discountTotal,
      refundTotal,
      netSales,
      averageOrderValue,
    },
    productRows,
    categoryRows,
    tableRows,
    staffRows,
    orderTypeRows,
    paymentRows,
    gatewayRows,
    hourlyRows,
    cancelledRows,
    refundRows,
    discountRows,
  }
}

function aggregateRows(items, config) {
  const map = new Map()

  items.forEach((item) => {
    const rawKey = String(config.getKey(item) || 'Unknown')
    const key = rawKey.toLowerCase()
    const existing = map.get(key) || {
      key,
      label: config.getLabel(item) || rawKey,
      note: config.getNote(item) || '',
      quantity: 0,
      revenue: 0,
      count: 0,
      share: 0,
    }

    existing.quantity += Number(config.getQuantity(item) || 0)
    existing.revenue += Number(config.getRevenue(item) || 0)
    existing.count += 1
    map.set(key, existing)
  })

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      share: config.revenueBase > 0 ? (row.revenue / config.revenueBase) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

function buildHourlyRows(orders, revenueBase) {
  const rows = Array.from({ length: 24 }, (_, hour) => ({
    key: String(hour).padStart(2, '0'),
    label: `${String(hour).padStart(2, '0')}:00`,
    count: 0,
    revenue: 0,
    percent: 0,
  }))

  orders.forEach((order) => {
    const date = new Date(order.created_at || order.ordered_at || order.updated_at || '')
    if (Number.isNaN(date.getTime())) return

    const row = rows[date.getHours()]
    row.count += 1
    row.revenue += getOrderTotal(order)
  })

  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1)

  return rows.map((row) => ({
    ...row,
    share: revenueBase > 0 ? (row.revenue / revenueBase) * 100 : 0,
    percent: Math.max(4, Math.round((row.revenue / maxRevenue) * 100)),
  }))
}

function buildCancelledRows(orders) {
  return orders
    .filter((order) => String(order.status || '').toLowerCase() === 'cancelled')
    .map((order) => ({
      key: order.id,
      title: order.order_code || order.public_order_number || 'Cancelled order',
      note: `${formatOrderType(order.order_type)} • ${formatDateTime(order.created_at)}`,
      amount: getOrderTotal(order),
    }))
}

function buildRefundRows(orders, refunds) {
  const orderRows = orders
    .filter((order) => getOrderRefundAmount(order) > 0 || String(order.payment_status || '').toLowerCase().includes('refund'))
    .map((order) => ({
      key: `order-${order.id}`,
      title: order.order_code || order.public_order_number || 'Refunded order',
      note: `${formatPaymentStatus(order.payment_status)} • ${formatDateTime(order.updated_at || order.created_at)}`,
      amount: getOrderRefundAmount(order) || getOrderTotal(order),
    }))

  const refundRows = refunds.map((refund) => ({
    key: `refund-${refund.id}`,
    title: refund.order_code || refund.payment_reference || 'Refund record',
    note: `${formatTitle(refund.refund_status || refund.status || 'recorded')} • ${formatDateTime(refund.created_at)}`,
    amount: getRefundAmount(refund),
  }))

  const merged = [...refundRows, ...orderRows]
  const seen = new Set()

  return merged.filter((row) => {
    const key = `${row.title}-${row.amount}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildDiscountRows(orders) {
  return orders
    .filter((order) => getOrderDiscountAmount(order) > 0)
    .map((order) => ({
      key: order.id,
      title: order.order_code || order.public_order_number || 'Discounted order',
      note: `${formatOrderType(order.order_type)} • ${formatDateTime(order.created_at)}`,
      amount: getOrderDiscountAmount(order),
    }))
}

function buildAdvancedSalesCsvRows(model, selectedMonth, restaurant) {
  const rows = [
    ['Spizy Advanced Sales Reports'],
    ['Restaurant', restaurant?.name || 'Restaurant'],
    ['Month', selectedMonth],
    [],
    ['Summary'],
    ['Gross sales', model.summary.grossSales],
    ['Collected', model.summary.collectedTotal],
    ['Discounts', model.summary.discountTotal],
    ['Refunds', model.summary.refundTotal],
    ['Net sales', model.summary.netSales],
    ['Average order', model.summary.averageOrderValue],
    [],
    ['Products'],
    ['Name', 'Qty', 'Orders/Rows', 'Revenue', 'Share %'],
    ...model.productRows.map((row) => [row.label, row.quantity, row.count, row.revenue, row.share]),
    [],
    ['Categories'],
    ['Name', 'Qty', 'Orders/Rows', 'Revenue', 'Share %'],
    ...model.categoryRows.map((row) => [row.label, row.quantity, row.count, row.revenue, row.share]),
    [],
    ['Tables'],
    ['Name', 'Orders', 'Revenue', 'Share %'],
    ...model.tableRows.map((row) => [row.label, row.count, row.revenue, row.share]),
    [],
    ['Staff'],
    ['Name', 'Orders', 'Revenue', 'Share %'],
    ...model.staffRows.map((row) => [row.label, row.count, row.revenue, row.share]),
    [],
    ['Payments'],
    ['Name', 'Orders', 'Revenue', 'Share %'],
    ...model.paymentRows.map((row) => [row.label, row.count, row.revenue, row.share]),
    [],
    ['Gateways'],
    ['Name', 'Orders', 'Revenue', 'Share %'],
    ...model.gatewayRows.map((row) => [row.label, row.count, row.revenue, row.share]),
  ]

  return rows
}

function groupBy(items, getKey) {
  return items.reduce((map, item) => {
    const key = String(getKey(item) || '')
    if (!map[key]) map[key] = []
    map[key].push(item)
    return map
  }, {})
}

function getCurrentMonthInput() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function getMonthIsoRange(monthKey) {
  const [year, month] = String(monthKey || getCurrentMonthInput()).split('-').map(Number)
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const end = new Date(year, month, 1, 0, 0, 0, 0)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

function normalizeLoadError(label, error) {
  if (!error) return ''
  if (['42P01', 'PGRST116'].includes(error.code)) return ''
  return `${label}: ${error.message}`
}

function getItemName(item) {
  return item.item_name || item.product_name || item.name || item.menu_item_name || 'Unnamed item'
}

function getItemQuantity(item) {
  return Number(item.quantity || item.qty || 1)
}

function getItemRevenue(item) {
  return getFirstNumericValue(item, [
    'total_price',
    'line_total',
    'subtotal',
    'total_amount',
    'item_total',
  ]) || getItemQuantity(item) * getFirstNumericValue(item, ['unit_price', 'price', 'item_price'])
}

function getOrderTotal(order) {
  return getFirstNumericValue(order, ['total_amount', 'grand_total', 'payable_amount', 'amount'])
}

function getOrderCollectedAmount(order) {
  const paidAmount = getFirstNumericValue(order, ['paid_amount', 'captured_amount', 'collected_amount'])
  if (paidAmount > 0) return paidAmount
  return isOrderPaid(order) ? getOrderTotal(order) : 0
}

function getOrderCollectedOrTotal(order) {
  return getOrderCollectedAmount(order) || getOrderTotal(order)
}

function getOrderDiscountAmount(order) {
  return getFirstNumericValue(order, [
    'discount_amount',
    'coupon_discount_amount',
    'reward_discount_amount',
    'manual_discount_amount',
    'total_discount',
  ])
}

function getOrderRefundAmount(order) {
  return getFirstNumericValue(order, ['refund_total', 'refunded_amount', 'refund_amount', 'adjustment_amount'])
}

function getRefundAmount(refund) {
  return getFirstNumericValue(refund, ['amount', 'refund_amount', 'total_amount'])
}

function getFirstNumericValue(source, keys) {
  if (!source || typeof source !== 'object') return 0

  for (const key of keys) {
    const value = Number(source[key] || 0)
    if (Number.isFinite(value) && value > 0) return value
  }

  return 0
}

function isOrderPaid(order) {
  const status = String(order?.payment_status || '').toLowerCase()
  return ['paid', 'captured', 'completed', 'settled'].includes(status)
}

function normalizeOrderType(type) {
  const value = String(type || 'counter').toLowerCase()
  if (['dine_in', 'dine-in', 'table'].includes(value)) return 'dine_in'
  if (['delivery', 'home_delivery'].includes(value)) return 'delivery'
  if (['takeaway', 'take_away', 'pickup'].includes(value)) return 'takeaway'
  return 'counter'
}

function normalizePaymentMethod(order) {
  const values = [order?.payment_method, order?.delivery_payment_type, order?.payment_gateway, order?.gateway]
    .map((value) => String(value || '').toLowerCase())
    .filter(Boolean)

  if (values.some((value) => ['cash'].includes(value))) return 'cash'
  if (values.some((value) => ['card'].includes(value))) return 'card'
  if (values.some((value) => ['cod', 'cash_on_delivery'].includes(value))) return 'cod'
  if (values.some((value) => ['upi'].includes(value))) return 'upi'
  if (values.some((value) => ['online', 'ziina', 'stripe', 'razorpay', 'cashfree', 'phonepe', 'paypal', 'network', 'ngenius', 'n-genius', 'payment_link'].includes(value))) return 'online'

  return values[0] || 'unpaid'
}

function hasGatewayValue(order) {
  return Boolean(order?.payment_gateway || order?.gateway || String(order?.payment_method || '').toLowerCase() === 'online')
}

function getGatewayLabel(order) {
  return formatGatewayName(order?.payment_gateway || order?.gateway || order?.online_gateway || 'Online')
}

function getTableLabel(order) {
  return order.table_name || order.table_number || (normalizeOrderType(order.order_type) === 'dine_in' ? 'Dine-in table' : formatOrderType(order.order_type))
}

function getStaffLabel(order) {
  return order.waiter_name || order.staff_name || order.cashier_name || order.created_by_name || 'Unassigned'
}

function formatOrderType(type) {
  const normalized = normalizeOrderType(type)
  if (normalized === 'dine_in') return 'Dine-in'
  if (normalized === 'delivery') return 'Delivery'
  if (normalized === 'takeaway') return 'Takeaway'
  return 'Counter'
}

function formatPaymentMethod(value) {
  if (value === 'cod') return 'COD'
  if (value === 'upi') return 'UPI'
  return formatTitle(value || 'Unpaid')
}

function formatGatewayName(value) {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'paypal') return 'PayPal'
  if (normalized === 'phonepe') return 'PhonePe'
  if (normalized === 'cashfree') return 'Cashfree'
  if (['network', 'ngenius', 'n-genius'].includes(normalized)) return 'Network / N-Genius'
  if (normalized === 'upi') return 'UPI'
  return formatTitle(value || 'Online')
}

function formatPaymentStatus(value) {
  return formatTitle(value || 'recorded')
}

function formatTitle(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDateTime(value) {
  if (!value) return 'No date'
  try {
    return new Intl.DateTimeFormat('en-AE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

function formatMoney(currency, amount) {
  const numericAmount = Number(amount || 0)

  try {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency: currency || 'AED',
      maximumFractionDigits: 2,
    }).format(numericAmount)
  } catch {
    return `${currency || 'AED'} ${numericAmount.toFixed(2)}`
  }
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

function formatQuantityValue(quantity, count) {
  if (quantity > 0) return `${Number(quantity).toFixed(quantity % 1 === 0 ? 0 : 2)} qty`
  return `${count || 0} order${count === 1 ? '' : 's'}`
}

function sumValues(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0)
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? '')
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
        })
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

export default AdvancedSalesReportsManagement
