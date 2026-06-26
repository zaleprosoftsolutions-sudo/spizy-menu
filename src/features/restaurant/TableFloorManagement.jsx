import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BellRing,
  CalendarCheck,
  CheckCircle2,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './TableFloorManagement.css'

const liveOrderStatuses = [
  'order_received',
  'preparing',
  'ready',
  'served',
  'bill_requested',
]

const serviceLiveStatuses = ['new', 'acknowledged']
const reservationLiveStatuses = ['pending', 'confirmed', 'seated']

function TableFloorManagement({ restaurant, onOpenSection }) {
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [tables, setTables] = useState([])
  const [orders, setOrders] = useState([])
  const [requests, setRequests] = useState([])
  const [reservations, setReservations] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [message, setMessage] = useState('')

  const restaurantId = restaurant?.id
  const currency = restaurant?.currency || 'AED'

  const showMessage = (text) => {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 2800)
  }

  const loadFloor = useCallback(async () => {
    if (!restaurantId) return

    setLoading(true)

    const today = new Date().toISOString().slice(0, 10)

    const [tablesResult, ordersResult, requestsResult, reservationsResult] =
      await Promise.all([
        supabase
          .from('restaurant_tables')
          .select('id, table_name, table_number, qr_token, is_active, created_at')
          .eq('restaurant_id', restaurantId)
          .order('created_at', { ascending: true }),
        supabase
          .from('restaurant_orders')
          .select(
            'id, order_code, public_order_number, table_id, table_name, order_type, status, payment_status, total_amount, customer_name, customer_phone, created_at',
          )
          .eq('restaurant_id', restaurantId)
          .eq('order_type', 'dine_in')
          .in('status', liveOrderStatuses)
          .order('created_at', { ascending: false }),
        supabase
          .from('restaurant_service_requests')
          .select(
            'id, table_id, table_name, request_code, request_type, request_title, message, status, priority, created_at',
          )
          .eq('restaurant_id', restaurantId)
          .eq('is_deleted', false)
          .in('status', serviceLiveStatuses)
          .order('created_at', { ascending: false }),
        supabase
          .from('restaurant_reservations')
          .select(
            'id, reservation_code, customer_name, customer_phone, guest_count, reservation_date, reservation_time, table_preference, status, occasion, created_at',
          )
          .eq('restaurant_id', restaurantId)
          .eq('reservation_date', today)
          .in('status', reservationLiveStatuses)
          .order('reservation_time', { ascending: true }),
      ])

    if (tablesResult.error) {
      showMessage(tablesResult.error.message)
    }

    setTables(tablesResult.data || [])
    setOrders(ordersResult.data || [])
    setRequests(requestsResult.data || [])
    setReservations(reservationsResult.data || [])
    setLoading(false)
  }, [restaurantId])

  useEffect(() => {
    loadFloor()
  }, [loadFloor])

  useEffect(() => {
    if (!restaurantId) return undefined

    const channel = supabase
      .channel(`spizy-floor-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        loadFloor,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_tables',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        loadFloor,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_service_requests',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        loadFloor,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_reservations',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        loadFloor,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadFloor, restaurantId])

  const floorTables = useMemo(() => {
    return tables.map((table) => {
      const tableOrders = orders.filter((order) => {
        if (order.table_id && order.table_id === table.id) return true
        return normalizeName(order.table_name) === normalizeName(table.table_name)
      })

      const activeOrder = tableOrders[0] || null

      const tableRequests = requests.filter((request) => {
        if (request.table_id && request.table_id === table.id) return true
        return normalizeName(request.table_name) === normalizeName(table.table_name)
      })

      const tableReservations = reservations.filter((reservation) => {
        const preference = normalizeName(reservation.table_preference)
        if (!preference) return false

        const tableName = normalizeName(table.table_name)
        const tableNumber = normalizeName(table.table_number)

        return (
          preference === tableName ||
          preference === tableNumber ||
          preference.includes(tableName) ||
          (tableNumber && preference.includes(tableNumber))
        )
      })

      const newRequests = tableRequests.filter((request) => request.status === 'new')
      const status = getTableStatus({
        table,
        activeOrder,
        newRequests,
        tableRequests,
        tableReservations,
      })

      return {
        table,
        activeOrder,
        requests: tableRequests,
        reservations: tableReservations,
        status,
      }
    })
  }, [orders, reservations, requests, tables])

  const filteredTables = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return floorTables.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false

      if (!keyword) return true

      const haystack = [
        item.table.table_name,
        item.table.table_number,
        item.activeOrder?.order_code,
        item.activeOrder?.public_order_number,
        item.activeOrder?.customer_name,
        item.activeOrder?.customer_phone,
        item.requests.map((request) => request.request_title).join(' '),
        item.reservations.map((reservation) => reservation.customer_name).join(' '),
      ]
        .join(' ')
        .toLowerCase()

      return haystack.includes(keyword)
    })
  }, [floorTables, search, statusFilter])

  const stats = useMemo(() => {
    return {
      total: floorTables.length,
      available: floorTables.filter((item) => item.status === 'available').length,
      occupied: floorTables.filter((item) => item.status === 'occupied').length,
      bill: floorTables.filter((item) => item.status === 'bill').length,
      service: floorTables.filter((item) => item.status === 'service').length,
      reserved: floorTables.filter((item) => item.status === 'reserved').length,
    }
  }, [floorTables])

  const handleQuickStatus = async (order, nextStatus) => {
    if (!order?.id) return

    setSavingId(order.id)

    const { error } = await supabase
      .from('restaurant_orders')
      .update({ status: nextStatus })
      .eq('id', order.id)
      .eq('restaurant_id', restaurantId)

    setSavingId('')

    if (error) {
      showMessage(error.message)
      return
    }

    setOrders((current) =>
      current.map((item) =>
        item.id === order.id ? { ...item, status: nextStatus } : item,
      ),
    )
    showMessage(`Order moved to ${formatStatus(nextStatus)}.`)
  }

  return (
    <section className="table-floor-page">
      {message && <div className="table-floor-toast">{message}</div>}

      <div className="table-floor-hero">
        <div>
          <p className="table-floor-kicker">Floor Plan</p>
          <h1>Live table status map</h1>
          <span>
            See occupied tables, bill requests, service calls and today&apos;s
            reservations in one view.
          </span>
        </div>

        <button type="button" onClick={loadFloor} disabled={loading}>
          <RefreshCw size={17} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="table-floor-stats">
        <FloorStatCard label="Tables" value={stats.total} icon={<QrCode size={20} />} />
        <FloorStatCard label="Available" value={stats.available} icon={<CheckCircle2 size={20} />} tone="green" />
        <FloorStatCard label="Occupied" value={stats.occupied} icon={<Users size={20} />} tone="orange" />
        <FloorStatCard label="Bill requests" value={stats.bill} icon={<ReceiptText size={20} />} tone="red" />
        <FloorStatCard label="Service calls" value={stats.service} icon={<BellRing size={20} />} tone="purple" />
      </div>

      <div className="table-floor-toolbar">
        <div className="table-floor-search">
          <Search size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search table, order, customer, service..."
          />
        </div>

        <div className="table-floor-filters">
          {[
            ['all', 'All'],
            ['available', 'Available'],
            ['occupied', 'Occupied'],
            ['bill', 'Bill'],
            ['service', 'Service'],
            ['reserved', 'Reserved'],
            ['inactive', 'Inactive'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={statusFilter === value ? 'active' : ''}
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="table-floor-loading">Loading floor plan...</div>
      ) : filteredTables.length === 0 ? (
        <div className="table-floor-empty">
          <QrCode size={34} />
          <h3>No tables found</h3>
          <p>
            Create tables from Tables & QR first. Then this screen will become
            your live floor map.
          </p>
          <button type="button" onClick={() => onOpenSection?.('qr')}>
            Open Tables & QR
          </button>
        </div>
      ) : (
        <div className="table-floor-grid">
          {filteredTables.map((item) => (
            <TableFloorCard
              key={item.table.id}
              item={item}
              currency={currency}
              savingId={savingId}
              onOpenSection={onOpenSection}
              onQuickStatus={handleQuickStatus}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function FloorStatCard({ label, value, icon, tone = '' }) {
  return (
    <article className={`table-floor-stat ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function TableFloorCard({
  item,
  currency,
  savingId,
  onOpenSection,
  onQuickStatus,
}) {
  const { table, activeOrder, requests, reservations, status } = item
  const statusMeta = getStatusMeta(status)
  const isSaving = activeOrder?.id && savingId === activeOrder.id

  return (
    <article className={`table-floor-card status-${status}`}>
      <div className="table-floor-card-top">
        <div>
          <span className="table-floor-table-number">
            {table.table_number || 'Table'}
          </span>
          <h3>{table.table_name}</h3>
        </div>

        <div className={`table-floor-status-pill ${status}`}>
          {statusMeta.label}
        </div>
      </div>

      <div className="table-floor-visual">
        <div className="table-floor-table-shape">
          <span>{table.table_name?.slice(0, 2)?.toUpperCase() || 'TB'}</span>
        </div>
      </div>

      {activeOrder ? (
        <div className="table-floor-live-box">
          <div>
            <span>Live bill</span>
            <strong>#{getPublicOrderNumber(activeOrder.public_order_number || activeOrder.order_code)}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>
              {currency} {Number(activeOrder.total_amount || 0).toFixed(2)}
            </strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{formatStatus(activeOrder.status)}</strong>
          </div>
        </div>
      ) : (
        <div className="table-floor-soft-note">
          {status === 'reserved'
            ? 'No live order. Reservation expected today.'
            : status === 'inactive'
              ? 'This QR table is inactive.'
              : 'Ready for the next guest.'}
        </div>
      )}

      {requests.length > 0 && (
        <div className="table-floor-request-list">
          {requests.slice(0, 2).map((request) => (
            <div key={request.id}>
              <BellRing size={15} />
              <span>{request.request_title}</span>
            </div>
          ))}
        </div>
      )}

      {reservations.length > 0 && (
        <div className="table-floor-reservation-list">
          {reservations.slice(0, 1).map((reservation) => (
            <div key={reservation.id}>
              <CalendarCheck size={15} />
              <span>
                {reservation.customer_name} • {formatTime(reservation.reservation_time)} • {reservation.guest_count} guests
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="table-floor-actions">
        {activeOrder ? (
          <>
            {activeOrder.status === 'order_received' && (
              <button
                type="button"
                onClick={() => onQuickStatus(activeOrder, 'preparing')}
                disabled={isSaving}
              >
                Start preparing
              </button>
            )}

            {activeOrder.status === 'preparing' && (
              <button
                type="button"
                onClick={() => onQuickStatus(activeOrder, 'ready')}
                disabled={isSaving}
              >
                Mark ready
              </button>
            )}

            {activeOrder.status === 'ready' && (
              <button
                type="button"
                onClick={() => onQuickStatus(activeOrder, 'served')}
                disabled={isSaving}
              >
                Mark served
              </button>
            )}

            <button type="button" className="ghost" onClick={() => onOpenSection?.('orders')}>
              Open bill
            </button>
          </>
        ) : (
          <button type="button" className="ghost" onClick={() => onOpenSection?.('pos')}>
            New POS order
          </button>
        )}

        {requests.length > 0 && (
          <button type="button" className="ghost urgent" onClick={() => onOpenSection?.('service-requests')}>
            View service
          </button>
        )}
      </div>
    </article>
  )
}

function getTableStatus({
  table,
  activeOrder,
  newRequests,
  tableRequests,
  tableReservations,
}) {
  if (table.is_active === false) return 'inactive'
  if (newRequests.length > 0) return 'service'
  if (activeOrder?.status === 'bill_requested') return 'bill'
  if (activeOrder) return 'occupied'
  if (tableRequests.length > 0) return 'service'
  if (tableReservations.length > 0) return 'reserved'
  return 'available'
}

function getStatusMeta(status) {
  if (status === 'service') return { label: 'Service call' }
  if (status === 'bill') return { label: 'Bill request' }
  if (status === 'occupied') return { label: 'Occupied' }
  if (status === 'reserved') return { label: 'Reserved' }
  if (status === 'inactive') return { label: 'Inactive' }
  return { label: 'Available' }
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase()
}

function getPublicOrderNumber(orderCode) {
  const value = String(orderCode || '')

  if (!value.includes('-')) return value || 'Order'

  return value.split('-').pop()
}

function formatStatus(status) {
  if (status === 'preparing') return 'Preparing'
  if (status === 'ready') return 'Ready'
  if (status === 'served') return 'Served'
  if (status === 'bill_requested') return 'Bill requested'
  return 'Order received'
}

function formatTime(value) {
  if (!value) return 'Today'

  const [hours, minutes] = String(value).split(':')
  const date = new Date()
  date.setHours(Number(hours || 0), Number(minutes || 0), 0, 0)

  try {
    return new Intl.DateTimeFormat('en-AE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  } catch {
    return String(value).slice(0, 5)
  }
}

export default TableFloorManagement
