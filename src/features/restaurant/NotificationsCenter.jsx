import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  CalendarCheck,
  CheckCircle2,
  ChefHat,
  CircleAlert,
  Clock,
  ExternalLink,
  PackageCheck,
  RefreshCw,
  Search,
  Star,
  Utensils,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './NotificationsCenter.css'

const alertFilters = [
  { id: 'all', label: 'All alerts' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'orders', label: 'Orders' },
  { id: 'service', label: 'Service' },
  { id: 'stock', label: 'Stock' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'reviews', label: 'Reviews' },
]

const openOrderStatuses = [
  'order_received',
  'preparing',
  'ready',
  'served',
  'bill_requested',
  'out_for_delivery',
]

function NotificationsCenter({ restaurant, onOpenSection }) {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [orders, setOrders] = useState([])
  const [serviceRequests, setServiceRequests] = useState([])
  const [reservations, setReservations] = useState([])
  const [reviews, setReviews] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [activeFilter, setActiveFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [dismissedIds, setDismissedIds] = useState(() => new Set())
  const [actionBusyId, setActionBusyId] = useState('')

  const loadAlerts = useCallback(
    async ({ silent = false } = {}) => {
      if (!restaurant?.id) return

      if (silent) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      const [ordersResult, serviceResult, reservationsResult, reviewsResult, stockResult] =
        await Promise.all([
          safeSelect(() =>
            supabase
              .from('restaurant_orders')
              .select(
                'id, order_code, public_order_number, order_type, status, payment_status, payment_method, total_amount, customer_name, customer_phone, table_name, created_at, updated_at, notes',
              )
              .eq('restaurant_id', restaurant.id)
              .in('status', openOrderStatuses)
              .order('created_at', { ascending: false })
              .limit(80),
          ),
          safeSelect(() =>
            supabase
              .from('restaurant_service_requests')
              .select(
                'id, request_code, request_type, request_title, message, table_name, customer_name, customer_phone, status, priority, created_at, updated_at',
              )
              .eq('restaurant_id', restaurant.id)
              .eq('is_deleted', false)
              .in('status', ['new', 'acknowledged'])
              .order('created_at', { ascending: false })
              .limit(80),
          ),
          safeSelect(() =>
            supabase
              .from('restaurant_reservations')
              .select(
                'id, reservation_code, customer_name, customer_phone, guest_count, reservation_date, reservation_time, table_preference, status, source, created_at, updated_at',
              )
              .eq('restaurant_id', restaurant.id)
              .in('status', ['pending', 'confirmed'])
              .order('reservation_date', { ascending: true })
              .order('reservation_time', { ascending: true })
              .limit(80),
          ),
          safeSelect(() =>
            supabase
              .from('restaurant_reviews')
              .select(
                'id, customer_name, customer_phone, rating, comment, reply, is_visible, is_deleted, created_at, updated_at',
              )
              .eq('restaurant_id', restaurant.id)
              .eq('is_deleted', false)
              .order('created_at', { ascending: false })
              .limit(60),
          ),
          safeSelect(() =>
            supabase
              .from('menu_items')
              .select('id, name, price, track_stock, stock_quantity, low_stock_quantity, stock_unit, is_available, created_at, updated_at')
              .eq('restaurant_id', restaurant.id)
              .eq('is_deleted', false)
              .eq('track_stock', true)
              .order('stock_quantity', { ascending: true })
              .limit(80),
          ),
        ])

      setOrders(ordersResult)
      setServiceRequests(serviceResult)
      setReservations(reservationsResult)
      setReviews(reviewsResult)
      setStockItems(stockResult)
      setLoading(false)
      setRefreshing(false)
    },
    [restaurant?.id],
  )

  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  useEffect(() => {
    if (!restaurant?.id) return undefined

    const channel = supabase
      .channel(`restaurant-alerts-${restaurant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_orders',
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        () => loadAlerts({ silent: true }),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_service_requests',
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        () => loadAlerts({ silent: true }),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_reservations',
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        () => loadAlerts({ silent: true }),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadAlerts, restaurant?.id])

  const alerts = useMemo(
    () =>
      buildAlertItems({
        orders,
        serviceRequests,
        reservations,
        reviews,
        stockItems,
      }).filter((alert) => !dismissedIds.has(alert.id)),
    [dismissedIds, orders, reservations, reviews, serviceRequests, stockItems],
  )

  const stats = useMemo(() => {
    const urgent = alerts.filter((alert) => alert.priority === 'urgent').length
    const today = alerts.filter((alert) => isToday(alert.sortDate)).length
    const stock = alerts.filter((alert) => alert.type === 'stock').length

    return {
      total: alerts.length,
      urgent,
      today,
      stock,
    }
  }, [alerts])

  const filteredAlerts = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return alerts.filter((alert) => {
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'urgent' && alert.priority === 'urgent') ||
        alert.type === activeFilter

      if (!matchesFilter) return false
      if (!keyword) return true

      return [
        alert.title,
        alert.subtitle,
        alert.meta,
        alert.reference,
        alert.customer,
        alert.searchText,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
  }, [activeFilter, alerts, search])

  const handleDismiss = (alertId) => {
    setDismissedIds((current) => {
      const next = new Set(current)
      next.add(alertId)
      return next
    })
  }

  const handleServiceStatus = async (requestId, status) => {
    setActionBusyId(requestId)

    const updatePayload = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'acknowledged') updatePayload.acknowledged_at = new Date().toISOString()
    if (status === 'completed') updatePayload.completed_at = new Date().toISOString()

    const { error } = await supabase
      .from('restaurant_service_requests')
      .update(updatePayload)
      .eq('id', requestId)
      .eq('restaurant_id', restaurant.id)

    setActionBusyId('')

    if (error) {
      showNotificationMessage(error.message)
      return
    }

    showNotificationMessage(
      status === 'acknowledged' ? 'Service request acknowledged.' : 'Service request completed.',
    )
    await loadAlerts({ silent: true })
  }

  const handleReservationStatus = async (reservationId, status) => {
    setActionBusyId(reservationId)

    const { error } = await supabase
      .from('restaurant_reservations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', reservationId)
      .eq('restaurant_id', restaurant.id)

    setActionBusyId('')

    if (error) {
      showNotificationMessage(error.message)
      return
    }

    showNotificationMessage(status === 'confirmed' ? 'Reservation confirmed.' : 'Reservation updated.')
    await loadAlerts({ silent: true })
  }

  return (
    <section className="notifications-center-page">
      <NotificationToast />

      <div className="notifications-hero">
        <div>
          <p>Live Command Alerts</p>
          <h1>Alerts Center</h1>
          <span>
            One place for new orders, bill requests, service calls, low stock,
            reservations and reviews.
          </span>
        </div>

        <button
          type="button"
          className="notifications-refresh-button"
          onClick={() => loadAlerts({ silent: true })}
          disabled={refreshing}
        >
          <RefreshCw size={17} className={refreshing ? 'spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="notifications-stats-grid">
        <NotificationStatCard
          label="Open alerts"
          value={stats.total}
          text="All active items"
          icon={<BellRing size={20} />}
        />
        <NotificationStatCard
          label="Urgent"
          value={stats.urgent}
          text="Needs fast action"
          icon={<AlertTriangle size={20} />}
          tone="urgent"
        />
        <NotificationStatCard
          label="Today"
          value={stats.today}
          text="Created or due today"
          icon={<Clock size={20} />}
        />
        <NotificationStatCard
          label="Low stock"
          value={stats.stock}
          text="Inventory warnings"
          icon={<PackageCheck size={20} />}
          tone="stock"
        />
      </div>

      <div className="notifications-toolbar">
        <div className="notifications-search-box">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search order, table, item, customer or alert..."
          />
        </div>

        <div className="notifications-filter-strip">
          {alertFilters.map((filter) => (
            <button
              type="button"
              key={filter.id}
              className={activeFilter === filter.id ? 'active' : ''}
              onClick={() => setActiveFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="notifications-loading-card">
          <div />
          <div />
          <div />
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="notifications-empty-card">
          <CheckCircle2 size={42} />
          <h2>All clear for now</h2>
          <p>
            No matching live alerts. New orders, bill requests, service calls,
            low-stock items and booking requests will appear here.
          </p>
        </div>
      ) : (
        <div className="notifications-list">
          {filteredAlerts.map((alert) => (
            <NotificationAlertCard
              alert={alert}
              key={alert.id}
              busy={actionBusyId === alert.sourceId}
              onDismiss={handleDismiss}
              onOpenSection={onOpenSection}
              onServiceStatus={handleServiceStatus}
              onReservationStatus={handleReservationStatus}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function NotificationStatCard({ label, value, text, icon, tone = '' }) {
  return (
    <article className={`notification-stat-card ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{text}</small>
    </article>
  )
}

function NotificationAlertCard({
  alert,
  busy,
  onDismiss,
  onOpenSection,
  onServiceStatus,
  onReservationStatus,
}) {
  const Icon = alert.icon

  return (
    <article className={`notification-alert-card ${alert.priority} ${alert.type}`}>
      <div className="notification-alert-icon">
        <Icon size={21} />
      </div>

      <div className="notification-alert-main">
        <div className="notification-alert-head">
          <div>
            <span>{alert.badge}</span>
            <h3>{alert.title}</h3>
          </div>

          <time>{formatRelativeTime(alert.sortDate)}</time>
        </div>

        <p>{alert.subtitle}</p>

        <div className="notification-alert-meta-row">
          {alert.reference && <span>{alert.reference}</span>}
          {alert.meta && <span>{alert.meta}</span>}
          {alert.customer && <span>{alert.customer}</span>}
        </div>

        <div className="notification-alert-actions">
          {alert.section && (
            <button type="button" onClick={() => onOpenSection?.(alert.section)}>
              <ExternalLink size={15} />
              Open {alert.sectionLabel}
            </button>
          )}

          {alert.type === 'service' && alert.rawStatus === 'new' && (
            <button
              type="button"
              className="primary"
              onClick={() => onServiceStatus(alert.sourceId, 'acknowledged')}
              disabled={busy}
            >
              Acknowledge
            </button>
          )}

          {alert.type === 'service' && alert.rawStatus === 'acknowledged' && (
            <button
              type="button"
              className="primary"
              onClick={() => onServiceStatus(alert.sourceId, 'completed')}
              disabled={busy}
            >
              Complete
            </button>
          )}

          {alert.type === 'reservations' && alert.rawStatus === 'pending' && (
            <button
              type="button"
              className="primary"
              onClick={() => onReservationStatus(alert.sourceId, 'confirmed')}
              disabled={busy}
            >
              Confirm
            </button>
          )}

          <button type="button" className="ghost" onClick={() => onDismiss(alert.id)}>
            Hide for now
          </button>
        </div>
      </div>
    </article>
  )
}

function buildAlertItems({ orders, serviceRequests, reservations, reviews, stockItems }) {
  const orderAlerts = orders.flatMap((order) => buildOrderAlert(order))
  const serviceAlerts = serviceRequests.map((request) => buildServiceAlert(request))
  const reservationAlerts = reservations.map((reservation) => buildReservationAlert(reservation))
  const reviewAlerts = reviews
    .filter((review) => !String(review.reply || '').trim())
    .map((review) => buildReviewAlert(review))
  const stockAlerts = stockItems
    .filter((item) => Number(item.stock_quantity || 0) <= Number(item.low_stock_quantity || 0))
    .map((item) => buildStockAlert(item))

  return [
    ...orderAlerts,
    ...serviceAlerts,
    ...stockAlerts,
    ...reservationAlerts,
    ...reviewAlerts,
  ].sort((a, b) => {
    const priorityScore = { urgent: 3, high: 2, normal: 1 }
    const priorityDifference =
      (priorityScore[b.priority] || 0) - (priorityScore[a.priority] || 0)

    if (priorityDifference !== 0) return priorityDifference

    return new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()
  })
}

function buildOrderAlert(order) {
  const orderNumber = getPublicOrderNumber(order.public_order_number || order.order_code)
  const base = {
    sourceId: order.id,
    type: 'orders',
    icon: order.order_type === 'delivery' ? ChefHat : Utensils,
    section: 'orders',
    sectionLabel: 'Orders',
    reference: `Order #${orderNumber || 'New'}`,
    customer: order.customer_name || order.customer_phone || '',
    sortDate: order.updated_at || order.created_at,
    searchText: `${order.order_code || ''} ${order.table_name || ''} ${order.notes || ''}`,
  }

  if (order.status === 'bill_requested') {
    return [
      {
        ...base,
        id: `order-bill-${order.id}`,
        priority: 'urgent',
        badge: 'Bill request',
        title: 'Customer requested bill',
        subtitle: `${order.table_name || 'Table order'} is waiting for bill completion and payment collection.`,
        meta: `${order.order_type === 'dine_in' ? 'Dine-in' : 'Delivery'} • ${formatMoney(order.total_amount)}`,
      },
    ]
  }

  if (order.status === 'order_received') {
    return [
      {
        ...base,
        id: `order-new-${order.id}`,
        priority: 'urgent',
        badge: 'New order',
        title: 'New order waiting',
        subtitle: `${order.table_name || formatOrderType(order.order_type)} order needs kitchen action.`,
        meta: `${formatOrderType(order.order_type)} • ${formatMoney(order.total_amount)}`,
      },
    ]
  }

  if (order.status === 'ready') {
    return [
      {
        ...base,
        id: `order-ready-${order.id}`,
        priority: 'high',
        badge: 'Ready',
        title: 'Order ready for next step',
        subtitle:
          order.order_type === 'delivery'
            ? 'Delivery order is ready to dispatch.'
            : 'Dine-in order is ready to serve.',
        meta: `${formatOrderType(order.order_type)} • ${formatMoney(order.total_amount)}`,
      },
    ]
  }

  return []
}

function buildServiceAlert(request) {
  return {
    id: `service-${request.id}-${request.status}`,
    sourceId: request.id,
    type: 'service',
    priority: request.priority === 'urgent' || request.status === 'new' ? 'urgent' : 'high',
    icon: BellRing,
    badge: request.status === 'new' ? 'Service call' : 'In progress',
    title: request.request_title || 'Service request',
    subtitle: request.message || `${request.table_name || 'Table'} needs staff support.`,
    reference: request.request_code || '',
    meta: request.table_name || '',
    customer: request.customer_name || request.customer_phone || '',
    sortDate: request.created_at,
    section: 'service-requests',
    sectionLabel: 'Service Requests',
    rawStatus: request.status,
    searchText: `${request.request_type || ''} ${request.message || ''}`,
  }
}

function buildReservationAlert(reservation) {
  const reservationDateTime = `${reservation.reservation_date || ''} ${reservation.reservation_time || ''}`
  const isDueToday = reservation.reservation_date === getTodayDateKey()

  return {
    id: `reservation-${reservation.id}-${reservation.status}`,
    sourceId: reservation.id,
    type: 'reservations',
    priority: reservation.status === 'pending' || isDueToday ? 'high' : 'normal',
    icon: CalendarCheck,
    badge: reservation.status === 'pending' ? 'Booking request' : 'Today booking',
    title:
      reservation.status === 'pending'
        ? 'New table booking needs confirmation'
        : 'Confirmed booking coming up',
    subtitle: `${reservation.customer_name || 'Customer'} booked for ${reservation.guest_count || 1} guest${Number(reservation.guest_count || 1) === 1 ? '' : 's'}.`,
    reference: reservation.reservation_code || '',
    meta: `${formatPublicDate(reservationDateTime)}${reservation.table_preference ? ` • ${reservation.table_preference}` : ''}`,
    customer: reservation.customer_phone || '',
    sortDate: reservation.created_at,
    section: 'reservations',
    sectionLabel: 'Reservations',
    rawStatus: reservation.status,
    searchText: `${reservation.source || ''} ${reservation.table_preference || ''}`,
  }
}

function buildReviewAlert(review) {
  return {
    id: `review-${review.id}`,
    sourceId: review.id,
    type: 'reviews',
    priority: Number(review.rating || 0) <= 3 ? 'high' : 'normal',
    icon: Star,
    badge: `${review.rating || 0} star review`,
    title:
      Number(review.rating || 0) <= 3
        ? 'Low rating needs attention'
        : 'Customer review needs reply',
    subtitle: review.comment || 'Customer submitted a rating. Reply from Reviews screen.',
    reference: `${review.rating || 0}/5 rating`,
    meta: review.is_visible ? 'Visible review' : 'Hidden review',
    customer: review.customer_name || review.customer_phone || '',
    sortDate: review.created_at,
    section: 'reviews',
    sectionLabel: 'Reviews',
    searchText: review.comment || '',
  }
}

function buildStockAlert(item) {
  const stock = Number(item.stock_quantity || 0)
  const low = Number(item.low_stock_quantity || 0)

  return {
    id: `stock-${item.id}`,
    sourceId: item.id,
    type: 'stock',
    priority: stock <= 0 ? 'urgent' : 'high',
    icon: PackageCheck,
    badge: stock <= 0 ? 'Out of stock' : 'Low stock',
    title: item.name || 'Inventory item',
    subtitle:
      stock <= 0
        ? 'This item is out of stock. Update stock or hide the product.'
        : 'This item reached the low stock alert level.',
    reference: `Current: ${formatNumber(stock)} ${item.stock_unit || 'pcs'}`,
    meta: `Alert level: ${formatNumber(low)} ${item.stock_unit || 'pcs'}`,
    customer: item.is_available === false ? 'Currently hidden' : 'Still visible',
    sortDate: item.updated_at || item.created_at,
    section: 'inventory',
    sectionLabel: 'Inventory',
    searchText: `${item.name || ''} ${item.stock_unit || ''}`,
  }
}

async function safeSelect(builder) {
  try {
    const { data, error } = await builder()

    if (error) return []

    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
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

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}

function formatNumber(value) {
  const numberValue = Number(value || 0)

  if (Number.isInteger(numberValue)) return String(numberValue)

  return numberValue.toFixed(2)
}

function formatRelativeTime(value) {
  if (!value) return 'Just now'

  const date = new Date(value)
  const difference = Date.now() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (difference < minute) return 'Now'
  if (difference < hour) return `${Math.floor(difference / minute)}m ago`
  if (difference < day) return `${Math.floor(difference / hour)}h ago`

  return formatPublicDate(value)
}

function formatPublicDate(value) {
  if (!value) return 'Today'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Today'
  }
}

function getTodayDateKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function isToday(value) {
  if (!value) return false

  try {
    const date = new Date(value)
    const today = new Date()

    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    )
  } catch {
    return false
  }
}

function NotificationToast() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    const handler = (event) => {
      setMessage(event.detail || 'Updated.')

      window.setTimeout(() => setMessage(''), 2600)
    }

    window.addEventListener('spizy-notification-message', handler)

    return () => window.removeEventListener('spizy-notification-message', handler)
  }, [])

  if (!message) return null

  return <div className="notifications-toast">{message}</div>
}

function showNotificationMessage(message) {
  window.dispatchEvent(
    new CustomEvent('spizy-notification-message', {
      detail: message,
    }),
  )
}

export default NotificationsCenter
