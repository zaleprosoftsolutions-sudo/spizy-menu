import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  Bike,
  CheckCircle2,
  Clock3,
  CreditCard,
  MapPin,
  Navigation,
  PackageCheck,
  Phone,
  RefreshCcw,
  Search,
  Truck,
  UserRound,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './DeliveryManagement.css'

const deliveryStatuses = [
  'order_received',
  'preparing',
  'ready',
  'out_for_delivery',
]

const filterOptions = [
  { value: 'live', label: 'Live delivery' },
  { value: 'new', label: 'New' },
  { value: 'ready', label: 'Ready' },
  { value: 'out_for_delivery', label: 'On the way' },
  { value: 'cod', label: 'COD' },
  { value: 'card_delivery', label: 'Card machine' },
]

const blankDispatchForm = {
  deliveryAssigneeName: '',
  deliveryAssigneePhone: '',
  deliveryNotes: '',
}

function DeliveryManagement({ restaurant }) {
  const [orders, setOrders] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState('')
  const [filter, setFilter] = useState('live')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [dispatchOrder, setDispatchOrder] = useState(null)
  const [dispatchForm, setDispatchForm] = useState(blankDispatchForm)

  const currency = restaurant?.currency || 'AED'

  const showMessage = useCallback((text) => {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 2800)
  }, [])

  const loadDeliveryOrders = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data: orderData, error: orderError } = await supabase
      .from('restaurant_orders')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('order_type', 'delivery')
      .in('status', deliveryStatuses)
      .order('created_at', { ascending: true })

    if (orderError) {
      setOrders([])
      setItems([])
      setLoading(false)
      showMessage(orderError.message || 'Unable to load delivery orders.')
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
    loadDeliveryOrders()
  }, [loadDeliveryOrders])

  useEffect(() => {
    if (!restaurant?.id) return undefined

    const channel = supabase
      .channel(`spizy-delivery-${restaurant.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurant_orders',
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        () => {
          loadDeliveryOrders()
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
          loadDeliveryOrders()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadDeliveryOrders, restaurant?.id])

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
      const paymentChoice = getDeliveryPaymentChoice(order).toLowerCase()
      const address = extractAddressFromNotes(order.notes)
      const haystack = [
        order.order_code,
        order.public_order_number,
        order.customer_name,
        order.customer_phone,
        order.notes,
        order.delivery_assignee_name,
        order.delivery_assignee_phone,
        paymentChoice,
        address,
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
      if (filter === 'live') return deliveryStatuses.includes(order.status)
      if (filter === 'new') return order.status === 'order_received'
      if (filter === 'ready') return order.status === 'ready'
      if (filter === 'out_for_delivery') return order.status === 'out_for_delivery'
      if (filter === 'cod') return order.payment_method === 'cod'
      if (filter === 'card_delivery') {
        return getDeliveryPaymentChoice(order) === 'card_machine'
      }

      return true
    })
  }, [filter, itemsByOrderId, orders, search])

  const stats = useMemo(() => {
    return {
      newOrders: orders.filter((order) => order.status === 'order_received').length,
      ready: orders.filter((order) => order.status === 'ready').length,
      onTheWay: orders.filter((order) => order.status === 'out_for_delivery').length,
      cod: orders.filter((order) => order.payment_method === 'cod').length,
    }
  }, [orders])

  const updateOrderStatus = async (order, nextStatus, extraFields = {}) => {
    if (!order?.id) return

    setUpdatingId(order.id)

    const payload = {
      status: nextStatus,
      ...extraFields,
    }

    if (nextStatus === 'out_for_delivery') {
      payload.out_for_delivery_at = new Date().toISOString()
    }

    if (nextStatus === 'delivered') {
      payload.delivered_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('restaurant_orders')
      .update(payload)
      .eq('id', order.id)
      .eq('restaurant_id', restaurant.id)

    setUpdatingId('')

    if (error) {
      showMessage(error.message || 'Unable to update delivery order.')
      return
    }

    showMessage(
      `Order #${getPublicOrderNumber(
        order.public_order_number || order.order_code,
      )} moved to ${formatDeliveryStatus(nextStatus)}.`,
    )
    await loadDeliveryOrders()
  }

  const openDispatchModal = (order) => {
    setDispatchOrder(order)
    setDispatchForm({
      deliveryAssigneeName: order.delivery_assignee_name || '',
      deliveryAssigneePhone: order.delivery_assignee_phone || '',
      deliveryNotes: order.delivery_notes || '',
    })
  }

  const handleDispatchSubmit = async () => {
    if (!dispatchOrder) return

    await updateOrderStatus(dispatchOrder, 'out_for_delivery', {
      delivery_assignee_name: dispatchForm.deliveryAssigneeName.trim() || null,
      delivery_assignee_phone: cleanPhone(dispatchForm.deliveryAssigneePhone) || null,
      delivery_notes: dispatchForm.deliveryNotes.trim() || null,
    })

    setDispatchOrder(null)
    setDispatchForm(blankDispatchForm)
  }

  if (loading) {
    return (
      <section className="management-section delivery-screen">
        <div className="delivery-empty-state">
          <Truck size={38} />
          <h2>Loading delivery board...</h2>
          <p>Spizy is collecting active delivery orders.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="management-section delivery-screen">
      {message && <div className="delivery-toast">{message}</div>}

      <div className="management-section-head delivery-head">
        <div>
          <p className="section-eyebrow">Delivery</p>
          <h2>Delivery Dispatch Board</h2>
          <span>
            Track delivery orders, COD cash/card collection and rider dispatch.
          </span>
        </div>

        <button
          type="button"
          className="delivery-refresh-button"
          onClick={loadDeliveryOrders}
        >
          <RefreshCcw size={17} />
          Refresh
        </button>
      </div>

      <div className="delivery-stat-grid">
        <DeliveryStatCard
          icon={<Clock3 size={20} />}
          label="New"
          value={stats.newOrders}
        />
        <DeliveryStatCard
          icon={<PackageCheck size={20} />}
          label="Ready"
          value={stats.ready}
        />
        <DeliveryStatCard
          icon={<Navigation size={20} />}
          label="On the way"
          value={stats.onTheWay}
        />
        <DeliveryStatCard
          icon={<Banknote size={20} />}
          label="COD"
          value={stats.cod}
        />
      </div>

      <div className="delivery-toolbar">
        <div className="delivery-search-box">
          <Search size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search order, phone, address, rider, item..."
          />
        </div>

        <div className="delivery-filter-strip">
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

      {filteredOrders.length === 0 ? (
        <div className="delivery-empty-state compact">
          <Bike size={34} />
          <h3>No delivery orders found</h3>
          <p>New delivery and takeaway dispatch orders will appear here.</p>
        </div>
      ) : (
        <div className="delivery-order-grid">
          {filteredOrders.map((order) => (
            <DeliveryOrderCard
              key={order.id}
              order={order}
              items={itemsByOrderId.get(order.id) || []}
              currency={currency}
              updating={updatingId === order.id}
              onStart={() => updateOrderStatus(order, 'preparing')}
              onReady={() => updateOrderStatus(order, 'ready')}
              onDispatch={() => openDispatchModal(order)}
              onDelivered={() => updateOrderStatus(order, 'delivered')}
            />
          ))}
        </div>
      )}

      {dispatchOrder && (
        <DispatchModal
          order={dispatchOrder}
          form={dispatchForm}
          onChange={(key, value) =>
            setDispatchForm((current) => ({ ...current, [key]: value }))
          }
          onClose={() => {
            setDispatchOrder(null)
            setDispatchForm(blankDispatchForm)
          }}
          onSubmit={handleDispatchSubmit}
          saving={updatingId === dispatchOrder.id}
        />
      )}
    </section>
  )
}

function DeliveryStatCard({ icon, label, value }) {
  return (
    <article className="delivery-stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function DeliveryOrderCard({
  order,
  items,
  currency,
  updating,
  onStart,
  onReady,
  onDispatch,
  onDelivered,
}) {
  const orderNumber = getPublicOrderNumber(order.public_order_number || order.order_code)
  const address = extractAddressFromNotes(order.notes)
  const extraNotes = extractExtraNotes(order.notes)
  const paymentChoice = getDeliveryPaymentChoice(order)
  const mapsUrl = buildMapSearchUrl(address)

  return (
    <article className={`delivery-order-card status-${order.status}`}>
      <div className="delivery-order-card-head">
        <div>
          <span>Order #{orderNumber}</span>
          <strong>
            {currency} {Number(order.total_amount || 0).toFixed(2)}
          </strong>
        </div>

        <div className="delivery-badge-stack">
          <span className={`delivery-status-pill ${order.status}`}>
            {formatDeliveryStatus(order.status)}
          </span>
          <span className={`delivery-payment-pill ${paymentChoice}`}>
            {formatDeliveryPaymentChoice(paymentChoice)}
          </span>
        </div>
      </div>

      <div className="delivery-customer-box">
        <div>
          <UserRound size={16} />
          <span>{order.customer_name || 'Customer'}</span>
        </div>

        {order.customer_phone && (
          <a href={`tel:${order.customer_phone}`}>
            <Phone size={16} />
            {order.customer_phone}
          </a>
        )}
      </div>

      {address && (
        <div className="delivery-address-box">
          <MapPin size={16} />
          <p>{address}</p>
          <a href={mapsUrl} target="_blank" rel="noreferrer">
            Directions
          </a>
        </div>
      )}

      {extraNotes && <div className="delivery-note-box">{extraNotes}</div>}

      <div className="delivery-items-list">
        {items.map((item) => (
          <div className="delivery-item-row" key={item.id}>
            <div>
              <strong>{item.item_name}</strong>
              {item.variation_name && <span>{item.variation_name}</span>}
            </div>
            <small>× {item.quantity}</small>
          </div>
        ))}
      </div>

      {(order.delivery_assignee_name || order.delivery_assignee_phone) && (
        <div className="delivery-rider-box">
          <Bike size={16} />
          <span>
            {order.delivery_assignee_name || 'Delivery staff'}
            {order.delivery_assignee_phone ? ` • ${order.delivery_assignee_phone}` : ''}
          </span>
        </div>
      )}

      <div className="delivery-card-actions">
        {order.status === 'order_received' && (
          <button type="button" onClick={onStart} disabled={updating}>
            Start preparing
          </button>
        )}

        {order.status === 'preparing' && (
          <button type="button" onClick={onReady} disabled={updating}>
            Mark ready
          </button>
        )}

        {order.status === 'ready' && (
          <button type="button" onClick={onDispatch} disabled={updating}>
            Dispatch
          </button>
        )}

        {order.status === 'out_for_delivery' && (
          <button
            type="button"
            className="complete"
            onClick={onDelivered}
            disabled={updating}
          >
            <CheckCircle2 size={16} />
            Delivered
          </button>
        )}
      </div>
    </article>
  )
}

function DispatchModal({ order, form, onChange, onClose, onSubmit, saving }) {
  const paymentChoice = getDeliveryPaymentChoice(order)

  return (
    <div className="delivery-modal-overlay" onClick={onClose}>
      <div
        className="delivery-dispatch-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="delivery-modal-head">
          <div>
            <p className="section-eyebrow">Dispatch order</p>
            <h3>
              Order #{getPublicOrderNumber(order.public_order_number || order.order_code)}
            </h3>
            <span>
              {paymentChoice === 'card_machine'
                ? 'Send card machine with delivery staff.'
                : 'Collect cash on delivery.'}
            </span>
          </div>

          <button type="button" onClick={onClose}>×</button>
        </div>

        <div className="delivery-payment-reminder">
          {paymentChoice === 'card_machine' ? (
            <CreditCard size={20} />
          ) : (
            <Banknote size={20} />
          )}
          <div>
            <strong>{formatDeliveryPaymentChoice(paymentChoice)}</strong>
            <small>
              {paymentChoice === 'card_machine'
                ? 'Rider should carry card tap machine / POS terminal.'
                : 'Rider should collect cash from customer.'}
            </small>
          </div>
        </div>

        <label>
          Delivery staff name
          <input
            type="text"
            value={form.deliveryAssigneeName}
            onChange={(event) =>
              onChange('deliveryAssigneeName', event.target.value)
            }
            placeholder="Example: Ahmed"
          />
        </label>

        <label>
          Delivery staff phone
          <input
            type="tel"
            value={form.deliveryAssigneePhone}
            onChange={(event) =>
              onChange('deliveryAssigneePhone', event.target.value)
            }
            placeholder="Example: 0501234567"
          />
        </label>

        <label>
          Dispatch notes
          <textarea
            value={form.deliveryNotes}
            onChange={(event) => onChange('deliveryNotes', event.target.value)}
            placeholder="Optional notes for delivery staff"
            rows="3"
          />
        </label>

        <div className="delivery-modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={onSubmit} disabled={saving}>
            {saving ? 'Dispatching...' : 'Mark out for delivery'}
          </button>
        </div>
      </div>
    </div>
  )
}

function getDeliveryPaymentChoice(order) {
  const rawValue =
    order?.delivery_payment_collection_method ||
    order?.payment_collection_method ||
    order?.cod_payment_type ||
    order?.metadata?.codPaymentType ||
    ''

  const normalized = String(rawValue || '').toLowerCase()

  if (normalized.includes('card')) return 'card_machine'
  if (order?.payment_method === 'cod') return 'cash'

  return order?.payment_method || 'cash'
}

function formatDeliveryPaymentChoice(value) {
  if (value === 'card_machine') return 'Card machine'
  if (value === 'cash') return 'COD Cash'
  if (value === 'online') return 'Online paid'
  if (value === 'card') return 'Card'
  return String(value || 'Payment').replace(/_/g, ' ')
}

function extractAddressFromNotes(notes) {
  const lines = String(notes || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const addressLine = lines.find((line) =>
    line.toLowerCase().startsWith('address:'),
  )

  return addressLine ? addressLine.replace(/^address:\s*/i, '').trim() : ''
}

function extractExtraNotes(notes) {
  const lines = String(notes || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith('address:'))

  return lines.join('\n')
}

function buildMapSearchUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address || '',
  )}`
}

function getPublicOrderNumber(orderCode) {
  const value = String(orderCode || '')

  if (!value.includes('-')) return value

  return value.split('-').pop()
}

function cleanPhone(value) {
  return String(value || '').replace(/[^0-9+]/g, '')
}

function formatDeliveryStatus(status) {
  if (status === 'preparing') return 'Preparing'
  if (status === 'ready') return 'Ready'
  if (status === 'out_for_delivery') return 'On the way'
  if (status === 'delivered') return 'Delivered'
  if (status === 'cancelled') return 'Cancelled'
  return 'New order'
}

export default DeliveryManagement
