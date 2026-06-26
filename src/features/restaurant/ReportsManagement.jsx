import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  CreditCard,
  RefreshCcw,
  ShoppingBag,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './ReportsManagement.css'

const rangeOptions = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
]

function ReportsManagement({ restaurant }) {
  const [orders, setOrders] = useState([])
  const [orderItems, setOrderItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('30d')

  const currency = restaurant?.currency || 'AED'

  const loadReports = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data: orderData, error: orderError } = await supabase
      .from('restaurant_orders')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })

    if (orderError) {
      setOrders([])
      setOrderItems([])
      setLoading(false)
      return
    }

    const orderIds = (orderData || []).map((order) => order.id)
    let itemData = []

    if (orderIds.length > 0) {
      const { data } = await supabase
        .from('restaurant_order_items')
        .select('*')
        .in('order_id', orderIds)
        .order('created_at', { ascending: true })

      itemData = data || []
    }

    setOrders(orderData || [])
    setOrderItems(itemData)
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const filteredOrders = useMemo(() => {
    return filterOrdersByRange(orders, range)
  }, [orders, range])

  const filteredOrderIds = useMemo(
    () => new Set(filteredOrders.map((order) => order.id)),
    [filteredOrders],
  )

  const filteredItems = useMemo(() => {
    return orderItems.filter((item) => filteredOrderIds.has(item.order_id))
  }, [filteredOrderIds, orderItems])

  const stats = useMemo(() => {
    const paidOrders = filteredOrders.filter(
      (order) => order.payment_status === 'paid',
    )
    const unpaidOrders = filteredOrders.filter(
      (order) => order.payment_status !== 'paid',
    )
    const completedOrders = filteredOrders.filter((order) =>
      ['completed', 'delivered'].includes(order.status),
    )
    const liveOrders = filteredOrders.filter(
      (order) => !['completed', 'cancelled', 'delivered'].includes(order.status),
    )
    const cancelledOrders = filteredOrders.filter(
      (order) => order.status === 'cancelled',
    )

    const paidRevenue = paidOrders.reduce(
      (total, order) => total + Number(order.total_amount || 0),
      0,
    )
    const unpaidAmount = unpaidOrders.reduce(
      (total, order) => total + Number(order.total_amount || 0),
      0,
    )
    const discountAmount = filteredOrders.reduce(
      (total, order) => total + Number(order.discount_amount || 0),
      0,
    )
    const extraAmount = filteredOrders.reduce(
      (total, order) => total + Number(order.extra_amount || 0),
      0,
    )

    const customerPhones = new Set(
      filteredOrders
        .map((order) => order.customer_phone)
        .filter(Boolean)
        .map((phone) => String(phone).trim()),
    )

    return {
      totalOrders: filteredOrders.length,
      paidOrders: paidOrders.length,
      completedOrders: completedOrders.length,
      liveOrders: liveOrders.length,
      cancelledOrders: cancelledOrders.length,
      paidRevenue,
      unpaidAmount,
      discountAmount,
      extraAmount,
      averageOrderValue:
        paidOrders.length > 0 ? paidRevenue / paidOrders.length : 0,
      knownCustomers: customerPhones.size,
    }
  }, [filteredOrders])

  const bestSellers = useMemo(() => {
    const groupedItems = new Map()

    filteredItems.forEach((item) => {
      const key = `${item.item_name || 'Item'}${item.variation_name ? ` - ${item.variation_name}` : ''}`
      const existing = groupedItems.get(key) || {
        name: item.item_name || 'Item',
        variation: item.variation_name || '',
        quantity: 0,
        revenue: 0,
      }

      existing.quantity += Number(item.quantity || 0)
      existing.revenue += Number(item.total_price || 0)
      groupedItems.set(key, existing)
    })

    return Array.from(groupedItems.values())
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 8)
  }, [filteredItems])

  const orderTypeSplit = useMemo(
    () => buildCountSplit(filteredOrders, 'order_type'),
    [filteredOrders],
  )

  const paymentSplit = useMemo(
    () => buildCountSplit(filteredOrders, 'payment_method'),
    [filteredOrders],
  )

  const dailySales = useMemo(() => {
    return buildDailySales(filteredOrders, range)
  }, [filteredOrders, range])

  if (loading) {
    return (
      <section className="management-section reports-screen">
        <div className="reports-empty-state">
          <BarChart3 size={36} />
          <h2>Loading reports...</h2>
          <p>Please wait while Spizy prepares restaurant analytics.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="management-section reports-screen">
      <header className="reports-header">
        <div>
          <p className="section-kicker">Reports</p>
          <h2>Sales analytics</h2>
          <span>
            Track revenue, orders, customers, best-selling items, payment methods
            and daily performance.
          </span>
        </div>

        <div className="reports-actions">
          <select value={range} onChange={(event) => setRange(event.target.value)}>
            {rangeOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button type="button" onClick={loadReports}>
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>
      </header>

      <div className="reports-stat-grid">
        <ReportStatCard
          icon={WalletCards}
          label="Paid revenue"
          value={formatMoney(stats.paidRevenue, currency)}
        />
        <ReportStatCard
          icon={ClipboardList}
          label="Total orders"
          value={stats.totalOrders}
        />
        <ReportStatCard
          icon={TrendingUp}
          label="Average order"
          value={formatMoney(stats.averageOrderValue, currency)}
        />
        <ReportStatCard
          icon={Users}
          label="Known customers"
          value={stats.knownCustomers}
        />
        <ReportStatCard
          icon={CreditCard}
          label="Unpaid bills"
          value={formatMoney(stats.unpaidAmount, currency)}
        />
      </div>

      <div className="reports-grid-two">
        <section className="reports-panel">
          <div className="reports-panel-head">
            <div>
              <p className="section-kicker">Trend</p>
              <h3>Daily sales</h3>
            </div>
            <CalendarDays size={20} />
          </div>

          <div className="reports-bars">
            {dailySales.map((day) => (
              <div className="reports-bar-row" key={day.label}>
                <span>{day.label}</span>
                <div>
                  <strong
                    style={{
                      width: `${Math.max(8, day.percent)}%`,
                    }}
                  />
                </div>
                <em>{formatMoney(day.revenue, currency)}</em>
              </div>
            ))}
          </div>
        </section>

        <section className="reports-panel">
          <div className="reports-panel-head">
            <div>
              <p className="section-kicker">Items</p>
              <h3>Best sellers</h3>
            </div>
            <ShoppingBag size={20} />
          </div>

          {bestSellers.length === 0 ? (
            <div className="reports-mini-empty">No item sales found.</div>
          ) : (
            <div className="reports-best-sellers">
              {bestSellers.map((item, index) => (
                <article key={`${item.name}-${item.variation}-${index}`}>
                  <div>
                    <strong>{item.name}</strong>
                    {item.variation && <span>{item.variation}</span>}
                  </div>

                  <div>
                    <strong>{item.quantity} sold</strong>
                    <span>{formatMoney(item.revenue, currency)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="reports-grid-three">
        <SplitPanel title="Order types" rows={orderTypeSplit} />
        <SplitPanel title="Payment methods" rows={paymentSplit} />

        <section className="reports-panel report-summary-panel">
          <p className="section-kicker">Summary</p>
          <h3>Operational snapshot</h3>

          <div className="report-summary-list">
            <SummaryLine label="Completed" value={stats.completedOrders} />
            <SummaryLine label="Live orders" value={stats.liveOrders} />
            <SummaryLine label="Cancelled" value={stats.cancelledOrders} />
            <SummaryLine
              label="Discounts given"
              value={formatMoney(stats.discountAmount, currency)}
            />
            <SummaryLine
              label="Extra charges"
              value={formatMoney(stats.extraAmount, currency)}
            />
          </div>
        </section>
      </div>
    </section>
  )
}

function ReportStatCard({ icon: Icon, label, value }) {
  return (
    <div className="reports-stat-card">
      <div>
        <Icon size={18} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function SplitPanel({ title, rows }) {
  return (
    <section className="reports-panel">
      <p className="section-kicker">Split</p>
      <h3>{title}</h3>

      {rows.length === 0 ? (
        <div className="reports-mini-empty">No data found.</div>
      ) : (
        <div className="reports-split-list">
          {rows.map((row) => (
            <div className="reports-split-row" key={row.label}>
              <span>{formatSplitLabel(row.label)}</span>
              <strong>{row.count}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function SummaryLine({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function filterOrdersByRange(orders, range) {
  if (range === 'all') return orders

  const now = new Date()
  const startDate = new Date(now)

  if (range === 'today') {
    startDate.setHours(0, 0, 0, 0)
  } else if (range === '7d') {
    startDate.setDate(now.getDate() - 6)
    startDate.setHours(0, 0, 0, 0)
  } else {
    startDate.setDate(now.getDate() - 29)
    startDate.setHours(0, 0, 0, 0)
  }

  return orders.filter((order) => {
    if (!order.created_at) return false
    return new Date(order.created_at) >= startDate
  })
}

function buildCountSplit(orders, field) {
  const splitMap = new Map()

  orders.forEach((order) => {
    const key = order[field] || 'unknown'
    splitMap.set(key, (splitMap.get(key) || 0) + 1)
  })

  return Array.from(splitMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
}

function buildDailySales(orders, range) {
  const days = range === 'today' ? 1 : range === '7d' ? 7 : 14
  const rows = []
  const now = new Date()

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(now)
    date.setDate(now.getDate() - index)
    const key = date.toISOString().slice(0, 10)

    const revenue = orders
      .filter((order) => String(order.created_at || '').slice(0, 10) === key)
      .filter((order) => order.payment_status === 'paid')
      .reduce((total, order) => total + Number(order.total_amount || 0), 0)

    rows.push({
      key,
      label: new Intl.DateTimeFormat('en-AE', {
        day: '2-digit',
        month: 'short',
      }).format(date),
      revenue,
    })
  }

  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1)

  return rows.map((row) => ({
    ...row,
    percent: (row.revenue / maxRevenue) * 100,
  }))
}

function formatMoney(value, currency = 'AED') {
  return `${currency || 'AED'} ${Number(value || 0).toFixed(2)}`
}

function formatSplitLabel(value) {
  if (value === 'dine_in') return 'Dine-in'
  if (value === 'counter') return 'Counter'
  if (value === 'delivery') return 'Delivery'
  if (value === 'cash') return 'Cash'
  if (value === 'card') return 'Card'
  if (value === 'upi') return 'UPI'
  if (value === 'cod') return 'COD'
  if (value === 'online') return 'Online'
  return String(value || 'Unknown')
}

export default ReportsManagement
