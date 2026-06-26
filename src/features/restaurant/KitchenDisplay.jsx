import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BellRing,
  CheckCircle2,
  ChefHat,
  Clock3,
  Flame,
  PackageCheck,
  RefreshCcw,
  Search,
  Truck,
  Utensils,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './KitchenDisplay.css'

const filterOptions = [
  { value: 'live', label: 'Live orders' },
  { value: 'new', label: 'New' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'dine_in', label: 'Dine-in' },
  { value: 'delivery', label: 'Delivery' },
]

const liveStatuses = [
  'order_received',
  'preparing',
  'ready',
  'served',
  'bill_requested',
  'out_for_delivery',
]

function KitchenDisplay({ restaurant }) {
  const [orders, setOrders] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState('')
  const [filter, setFilter] = useState('live')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  const currency = restaurant?.currency || 'AED'

  const showMessage = useCallback((text) => {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 2600)
  }, [])

  const loadKitchenOrders = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data: orderData, error: orderError } = await supabase
      .from('restaurant_orders')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .in('status', liveStatuses)
      .order('created_at', { ascending: true })

    if (orderError) {
      setOrders([])
      setItems([])
      setLoading(false)
      showMessage(orderError.message || 'Unable to load kitchen orders.')
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
    setItems(itemData)
    setLoading(false)
  }, [restaurant?.id, showMessage])

  useEffect(() => {
    loadKitchenOrders()
  }, [loadKitchenOrders])

  useEffect(() => {
    if (!restaurant?.id) return undefined

    const channel = supabase
      .channel(`spizy-kitchen-${restaurant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_orders',
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        () => {
          loadKitchenOrders()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_order_items',
        },
        () => {
          loadKitchenOrders()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadKitchenOrders, restaurant?.id])

  const itemsByOrderId = useMemo(() => {
    const grouped = new Map()

    items.forEach((item) => {
      const existing = grouped.get(item.order_id) || []
      existing.push(item)
      grouped.set(item.order_id, existing)
    })

    return grouped
  }, [items])

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return orders.filter((order) => {
      const orderItems = itemsByOrderId.get(order.id) || []
      const haystack = [
        order.order_code,
        order.public_order_number,
        order.table_name,
        order.customer_name,
        order.customer_phone,
        order.notes,
        order.order_type,
        order.status,
        ...orderItems.flatMap((item) => [
          item.item_name,
          item.variation_name,
          item.notes,
        ]),
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch = !keyword || haystack.includes(keyword)

      if (!matchesSearch) return false

      if (filter === 'live') return liveStatuses.includes(order.status)
      if (filter === 'new') return order.status === 'order_received'
      if (filter === 'preparing') return order.status === 'preparing'
      if (filter === 'ready') return order.status === 'ready'
      if (filter === 'dine_in') return order.order_type === 'dine_in'
      if (filter === 'delivery') return order.order_type === 'delivery'

      return true
    })
  }, [filter, itemsByOrderId, orders, search])

  const stats = useMemo(() => {
    return {
      newOrders: orders.filter((order) => order.status === 'order_received').length,
      preparing: orders.filter((order) => order.status === 'preparing').length,
      ready: orders.filter((order) => order.status === 'ready').length,
      live: orders.length,
    }
  }, [orders])

  const updateOrderStatus = async (order, nextStatus) => {
    if (!order?.id) return

    setUpdatingId(order.id)

    const { error } = await supabase
      .from('restaurant_orders')
      .update({ status: nextStatus })
      .eq('id', order.id)
      .eq('restaurant_id', restaurant.id)

    setUpdatingId('')

    if (error) {
      showMessage(error.message || 'Unable to update order status.')
      return
    }

    showMessage(`Order #${getPublicOrderNumber(order.public_order_number || order.order_code)} moved to ${formatStatus(nextStatus)}.`)
    await loadKitchenOrders()
  }

  if (loading) {
    return (
      <section className="management-section kitchen-screen">
        <div className="kitchen-empty-state">
          <ChefHat size={38} />
          <h2>Loading kitchen display...</h2>
          <p>Spizy is preparing live order cards for your kitchen team.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="management-section kitchen-screen">
      {message && <div className="kitchen-toast">{message}</div>}

      <header className="kitchen-header">
        <div>
          <p className="section-kicker">Kitchen Display</p>
          <h2>Live preparation board</h2>
          <span>
            Track new, preparing and ready orders in a clean kitchen-friendly view.
          </span>
        </div>

        <div className="kitchen-actions">
          <div className="kitchen-search-box">
            <Search size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order, table, item..."
            />
          </div>

          <button type="button" onClick={loadKitchenOrders}>
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>
      </header>

      <div className="kitchen-stat-grid">
        <KitchenStat icon={BellRing} label="New" value={stats.newOrders} />
        <KitchenStat icon={Flame} label="Preparing" value={stats.preparing} />
        <KitchenStat icon={PackageCheck} label="Ready" value={stats.ready} />
        <KitchenStat icon={Clock3} label="Live" value={stats.live} />
      </div>

      <div className="kitchen-filter-row">
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

      {filteredOrders.length === 0 ? (
        <div className="kitchen-empty-state compact">
          <ChefHat size={34} />
          <h3>No kitchen orders found</h3>
          <p>New POS, table and delivery orders will appear here automatically.</p>
        </div>
      ) : (
        <div className="kitchen-board-grid">
          {filteredOrders.map((order) => (
            <KitchenOrderCard
              key={order.id}
              order={order}
              items={itemsByOrderId.get(order.id) || []}
              currency={currency}
              updating={updatingId === order.id}
              onUpdateStatus={updateOrderStatus}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function KitchenStat({ icon: Icon, label, value }) {
  return (
    <article className="kitchen-stat-card">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <Icon size={24} />
    </article>
  )
}

function KitchenOrderCard({ order, items, currency, updating, onUpdateStatus }) {
  const orderNumber = getPublicOrderNumber(order.public_order_number || order.order_code)
  const isDelivery = order.order_type === 'delivery'

  return (
    <article className={`kitchen-order-card status-${order.status || 'order_received'}`}>
      <div className="kitchen-order-top">
        <div>
          <span>Order #{orderNumber}</span>
          <h3>{order.table_name || formatOrderType(order.order_type)}</h3>
        </div>

        <div className="kitchen-order-badges">
          <span className="type">{formatOrderType(order.order_type)}</span>
          <span className={`status ${order.status || 'order_received'}`}>
            {formatStatus(order.status)}
          </span>
        </div>
      </div>

      <div className="kitchen-order-meta">
        <span>
          <Clock3 size={14} />
          {formatElapsed(order.created_at)}
        </span>
        <span>{currency} {Number(order.total_amount || 0).toFixed(2)}</span>
      </div>

      {(order.customer_name || order.customer_phone) && (
        <div className="kitchen-customer-line">
          <strong>{order.customer_name || 'Customer'}</strong>
          {order.customer_phone && <span>{order.customer_phone}</span>}
        </div>
      )}

      <div className="kitchen-items-list">
        {items.map((item) => (
          <div className="kitchen-item-row" key={item.id}>
            <strong>{Number(item.quantity || 0)}×</strong>
            <div>
              <span>{item.item_name}</span>
              {item.variation_name && <small>{item.variation_name}</small>}
            </div>
          </div>
        ))}
      </div>

      {order.notes && (
        <div className="kitchen-notes">
          <strong>Notes</strong>
          <p>{order.notes}</p>
        </div>
      )}

      <div className="kitchen-card-actions">
        {order.status === 'order_received' && (
          <button
            type="button"
            onClick={() => onUpdateStatus(order, 'preparing')}
            disabled={updating}
          >
            <Flame size={16} />
            Start preparing
          </button>
        )}

        {order.status === 'preparing' && (
          <button
            type="button"
            onClick={() => onUpdateStatus(order, 'ready')}
            disabled={updating}
          >
            <CheckCircle2 size={16} />
            Mark ready
          </button>
        )}

        {order.status === 'ready' && !isDelivery && (
          <button
            type="button"
            onClick={() => onUpdateStatus(order, 'served')}
            disabled={updating}
          >
            <Utensils size={16} />
            Mark served
          </button>
        )}

        {order.status === 'ready' && isDelivery && (
          <button
            type="button"
            onClick={() => onUpdateStatus(order, 'out_for_delivery')}
            disabled={updating}
          >
            <Truck size={16} />
            Out for delivery
          </button>
        )}

        {['served', 'bill_requested', 'out_for_delivery'].includes(order.status) && (
          <div className="kitchen-waiting-note">
            Manage payment / completion from Orders screen.
          </div>
        )}
      </div>
    </article>
  )
}

function getPublicOrderNumber(orderCode) {
  const value = String(orderCode || '')

  if (!value.includes('-')) return value

  return value.split('-').pop()
}

function formatOrderType(type) {
  if (type === 'dine_in') return 'Dine-in'
  if (type === 'delivery') return 'Delivery'
  if (type === 'takeaway') return 'Takeaway'
  return 'Order'
}

function formatStatus(status) {
  if (status === 'preparing') return 'Preparing'
  if (status === 'ready') return 'Ready'
  if (status === 'served') return 'Served'
  if (status === 'bill_requested') return 'Bill requested'
  if (status === 'out_for_delivery') return 'Out for delivery'
  return 'New order'
}

function formatElapsed(value) {
  if (!value) return 'Just now'

  const createdAt = new Date(value).getTime()
  const now = Date.now()
  const differenceMinutes = Math.max(Math.floor((now - createdAt) / 60000), 0)

  if (differenceMinutes < 1) return 'Just now'
  if (differenceMinutes < 60) return `${differenceMinutes} min ago`

  const hours = Math.floor(differenceMinutes / 60)
  const minutes = differenceMinutes % 60

  return minutes > 0 ? `${hours}h ${minutes}m ago` : `${hours}h ago`
}

export default KitchenDisplay
