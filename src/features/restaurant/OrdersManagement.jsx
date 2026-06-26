import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CreditCard,
  Eye,
  Filter,
  RefreshCw,
  ReceiptText,
  Search,
  X,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './OrdersManagement.css'

const statusOptions = [
  { value: 'order_received', label: 'Order received' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'served', label: 'Served' },
  { value: 'completed', label: 'Completed' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

const paymentStatusOptions = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'refunded', label: 'Refunded' },
]

function OrdersManagement({ restaurant }) {
  const { showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [updatingOrderId, setUpdatingOrderId] = useState(null)

  const loadOrders = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data, error } = await supabase
      .from('restaurant_orders')
      .select(
        `
          *,
          items:restaurant_order_items (
            id,
            item_id,
            variation_id,
            item_name,
            variation_name,
            quantity,
            unit_price,
            total_price,
            notes
          )
        `,
      )
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })

    if (error) {
      showToast({
        type: 'error',
        title: 'Orders loading failed',
        message: error.message,
      })
      setOrders([])
      setLoading(false)
      return
    }

    setOrders(data || [])
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return orders.filter((order) => {
      const matchesStatus =
        statusFilter === 'all' || order.status === statusFilter

      const matchesType = typeFilter === 'all' || order.order_type === typeFilter

      const matchesPayment =
        paymentFilter === 'all' || order.payment_status === paymentFilter

      if (!matchesStatus || !matchesType || !matchesPayment) return false

      if (!keyword) return true

      const itemNames = Array.isArray(order.items)
        ? order.items.map((item) => item.item_name).join(' ')
        : ''

      return [
        order.order_code,
        order.customer_name,
        order.customer_phone,
        order.table_name,
        order.payment_method,
        order.payment_status,
        order.status,
        itemNames,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [orders, paymentFilter, search, statusFilter, typeFilter])

  const orderStats = useMemo(() => {
    return {
      total: filteredOrders.length,
      paid: filteredOrders.filter((order) => order.payment_status === 'paid')
        .length,
      unpaid: filteredOrders.filter((order) => order.payment_status === 'unpaid')
        .length,
      revenue: filteredOrders
        .filter((order) => order.payment_status === 'paid')
        .reduce((total, order) => total + Number(order.total_amount || 0), 0),
    }
  }, [filteredOrders])

  const updateOrderField = async (order, field, value) => {
    setUpdatingOrderId(order.id)

    const { error } = await supabase
      .from('restaurant_orders')
      .update({
        [field]: value,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    setUpdatingOrderId(null)

    if (error) {
      showToast({
        type: 'error',
        title: 'Order update failed',
        message: error.message,
      })
      return
    }

    setOrders((current) =>
      current.map((currentOrder) =>
        currentOrder.id === order.id
          ? {
              ...currentOrder,
              [field]: value,
            }
          : currentOrder,
      ),
    )

    setSelectedOrder((current) =>
      current?.id === order.id
        ? {
            ...current,
            [field]: value,
          }
        : current,
    )

    showToast({
      type: 'success',
      title: 'Order updated',
      message: `${order.order_code} has been updated.`,
    })
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
    <section className="orders-screen">
      <div className="orders-header">
        <div>
          <p className="pricing-label">Orders</p>
          <h2>Order management</h2>
          <span>
            View POS, table and delivery orders. Update order and payment
            statuses from one place.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadOrders}
          disabled={loading}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="orders-stats-grid">
        <OrderStatCard label="Orders" value={orderStats.total} />
        <OrderStatCard label="Paid" value={orderStats.paid} />
        <OrderStatCard label="Unpaid" value={orderStats.unpaid} />
        <OrderStatCard
          label="Paid Revenue"
          value={`${restaurant.currency || 'AED'} ${orderStats.revenue.toFixed(
            2,
          )}`}
        />
      </div>

      <div className="orders-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search order code, customer, item..."
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          {statusOptions.map((status) => (
            <option value={status.value} key={status.value}>
              {status.label}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
        >
          <option value="all">All types</option>
          <option value="counter">Counter</option>
          <option value="dine_in">Dine-in</option>
          <option value="delivery">Delivery</option>
        </select>

        <select
          value={paymentFilter}
          onChange={(event) => setPaymentFilter(event.target.value)}
        >
          <option value="all">All payments</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      <div className="orders-table-wrap">
        {loading ? (
          <div className="empty-state">Loading orders...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="empty-state">
            No orders found. Create an order from New Order / POS.
          </div>
        ) : (
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Type</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.order_code}</strong>
                    <span>{formatDateTime(order.created_at)}</span>
                    {order.customer_name && <small>{order.customer_name}</small>}
                  </td>

                  <td>
                    <strong>{formatOrderType(order.order_type)}</strong>
                    <span>{order.table_name || order.customer_phone || '—'}</span>
                  </td>

                  <td>
                    <strong>{order.items?.length || 0} item(s)</strong>
                    <span>{getItemPreview(order.items)}</span>
                  </td>

                  <td>
                    <strong>
                      {order.currency || restaurant.currency || 'AED'}{' '}
                      {Number(order.total_amount || 0).toFixed(2)}
                    </strong>
                    <span>{formatPaymentMethod(order.payment_method)}</span>
                  </td>

                  <td>
                    <select
                      className="orders-inline-select"
                      value={order.status}
                      onChange={(event) =>
                        updateOrderField(order, 'status', event.target.value)
                      }
                      disabled={updatingOrderId === order.id}
                    >
                      {statusOptions.map((status) => (
                        <option value={status.value} key={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <select
                      className={`orders-inline-select payment-${order.payment_status}`}
                      value={order.payment_status}
                      onChange={(event) =>
                        updateOrderField(
                          order,
                          'payment_status',
                          event.target.value,
                        )
                      }
                      disabled={updatingOrderId === order.id}
                    >
                      {paymentStatusOptions.map((status) => (
                        <option value={status.value} key={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <button
                      type="button"
                      className="tiny-button"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <Eye size={15} />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          restaurant={restaurant}
          updatingOrderId={updatingOrderId}
          onClose={() => setSelectedOrder(null)}
          onUpdate={updateOrderField}
        />
      )}
    </section>
  )
}

function OrderStatCard({ label, value }) {
  return (
    <article className="orders-stat-card">
      <ReceiptText size={22} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function OrderDetailsModal({
  order,
  restaurant,
  updatingOrderId,
  onClose,
  onUpdate,
}) {
  return (
    <div className="orders-modal-overlay" onClick={onClose}>
      <div
        className="orders-modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="orders-modal-head">
          <div>
            <p className="pricing-label">Order Details</p>
            <h3>{order.order_code}</h3>
            <span>
              {formatOrderType(order.order_type)} •{' '}
              {formatPaymentMethod(order.payment_method)}
            </span>
          </div>

          <button type="button" className="tiny-button danger" onClick={onClose}>
            <X size={15} />
            Close
          </button>
        </div>

        <div className="orders-detail-grid">
          <InfoBox label="Created" value={formatDateTime(order.created_at)} />
          <InfoBox label="Order type" value={formatOrderType(order.order_type)} />
          <InfoBox
            label="Payment method"
            value={formatPaymentMethod(order.payment_method)}
          />
          <InfoBox
            label="Total"
            value={`${order.currency || restaurant.currency || 'AED'} ${Number(
              order.total_amount || 0,
            ).toFixed(2)}`}
          />
        </div>

        <div className="orders-status-editor">
          <label>
            Order status
            <select
              value={order.status}
              onChange={(event) =>
                onUpdate(order, 'status', event.target.value)
              }
              disabled={updatingOrderId === order.id}
            >
              {statusOptions.map((status) => (
                <option value={status.value} key={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Payment status
            <select
              value={order.payment_status}
              onChange={(event) =>
                onUpdate(order, 'payment_status', event.target.value)
              }
              disabled={updatingOrderId === order.id}
            >
              {paymentStatusOptions.map((status) => (
                <option value={status.value} key={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(order.customer_name || order.customer_phone || order.table_name) && (
          <div className="orders-customer-box">
            {order.customer_name && (
              <InfoLine label="Customer" value={order.customer_name} />
            )}
            {order.customer_phone && (
              <InfoLine label="Phone" value={order.customer_phone} />
            )}
            {order.table_name && <InfoLine label="Table" value={order.table_name} />}
          </div>
        )}

        <div className="orders-items-list">
          {order.items?.map((item) => (
            <div className="orders-item-row" key={item.id}>
              <div>
                <strong>{item.item_name}</strong>
                {item.variation_name && <span>{item.variation_name}</span>}
                <small>
                  {item.quantity} ×{' '}
                  {order.currency || restaurant.currency || 'AED'}{' '}
                  {Number(item.unit_price || 0).toFixed(2)}
                </small>
              </div>

              <strong>
                {order.currency || restaurant.currency || 'AED'}{' '}
                {Number(item.total_price || 0).toFixed(2)}
              </strong>
            </div>
          ))}
        </div>

        <div className="orders-total-box">
          <InfoLine
            label="Subtotal"
            value={`${order.currency || restaurant.currency || 'AED'} ${Number(
              order.subtotal || 0,
            ).toFixed(2)}`}
          />
          <InfoLine
            label="Discount"
            value={`- ${Number(order.discount_amount || 0).toFixed(2)}`}
          />
          <InfoLine
            label="Extra"
            value={`+ ${Number(order.extra_amount || 0).toFixed(2)}`}
          />
          <InfoLine
            label="Total"
            value={`${order.currency || restaurant.currency || 'AED'} ${Number(
              order.total_amount || 0,
            ).toFixed(2)}`}
            strong
          />
        </div>

        {order.notes && (
          <div className="orders-notes">
            <Filter size={16} />
            <span>{order.notes}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoBox({ label, value }) {
  return (
    <div className="orders-info-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function InfoLine({ label, value, strong = false }) {
  return (
    <div className={`orders-info-line ${strong ? 'strong' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function getItemPreview(items = []) {
  if (!items.length) return 'No items'

  return items
    .slice(0, 2)
    .map((item) => item.item_name)
    .join(', ')
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('en-AE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatOrderType(value) {
  if (value === 'dine_in') return 'Dine-in'
  if (value === 'delivery') return 'Delivery'
  return 'Counter'
}

function formatPaymentMethod(value) {
  if (value === 'cod') return 'COD'
  return String(value || 'cash').toUpperCase()
}

export default OrdersManagement