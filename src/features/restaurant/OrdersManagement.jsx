import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BellRing,
  CheckCircle2,
  ClipboardList,
  Eye,
  PackagePlus,
  Printer,
  ReceiptText,
  RefreshCcw,
  Search,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './OrdersManagement.css'

const statusOptions = [
  { value: 'order_received', label: 'Order received' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'served', label: 'Served' },
  { value: 'bill_requested', label: 'Bill requested' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
]

const orderTypeOptions = [
  { value: 'all', label: 'All types' },
  { value: 'counter', label: 'Counter' },
  { value: 'dine_in', label: 'Dine-in' },
  { value: 'delivery', label: 'Delivery' },
]

const paymentOptions = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'refunded', label: 'Refunded' },
]

const paymentMethodOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'online', label: 'Online' },
  { value: 'cod', label: 'COD' },
]

function OrdersManagement({ restaurant }) {
  const [orders, setOrders] = useState([])
  const [menuProducts, setMenuProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [productsLoading, setProductsLoading] = useState(false)
  const [updatingOrderId, setUpdatingOrderId] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [addItemOrder, setAddItemOrder] = useState(null)
  const [completeOrder, setCompleteOrder] = useState(null)
  const [completePaymentMethod, setCompletePaymentMethod] = useState('cash')
  const [completingOrder, setCompletingOrder] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [addItemForm, setAddItemForm] = useState({
    productId: '',
    variationId: '',
    quantity: 1,
    isComplimentary: false,
  })
  const soundEnabledRef = useRef(false)
  const lastKnownStatusRef = useRef(new Map())
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [realtimeNotice, setRealtimeNotice] = useState(null)

  const enableAdminSound = useCallback(() => {
  soundEnabledRef.current = true
  setSoundEnabled(true)
}, [])

  const loadOrders = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data: orderData, error: orderError } = await supabase
      .from('restaurant_orders')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })

    if (orderError) {
      setOrders([])
      setLoading(false)
      return
    }

    const orderIds = (orderData || []).map((order) => order.id)

    let itemData = []

    if (orderIds.length > 0) {
      const { data: orderItems } = await supabase
        .from('restaurant_order_items')
        .select('*')
        .in('order_id', orderIds)
        .order('created_at', { ascending: true })

      itemData = orderItems || []
    }

    const ordersWithItems = (orderData || []).map((order) => ({
      ...order,
      items: itemData.filter((item) => item.order_id === order.id),
    }))

    setOrders(ordersWithItems)

    lastKnownStatusRef.current = new Map(
  ordersWithItems.map((order) => [order.id, order.status]),
)

    setSelectedOrder((current) => {
      if (!current?.id) return current
      return ordersWithItems.find((order) => order.id === current.id) || current
    })

    setAddItemOrder((current) => {
      if (!current?.id) return current
      return ordersWithItems.find((order) => order.id === current.id) || current
    })

    setCompleteOrder((current) => {
      if (!current?.id) return current
      return ordersWithItems.find((order) => order.id === current.id) || current
    })

    setLoading(false)
  }, [restaurant?.id])

  const loadMenuProducts = useCallback(async () => {
    if (!restaurant?.id) return

    setProductsLoading(true)

    const { data } = await supabase
      .from('menu_items')
      .select(
        `
          id,
          name,
          price,
          has_variations,
          is_available,
          is_deleted,
          variations:menu_item_variations (
            id,
            name,
            price,
            is_available,
            sort_order
          )
        `,
      )
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    setMenuProducts(data || [])
    setProductsLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadOrders()
    loadMenuProducts()
  }, [loadOrders, loadMenuProducts])

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false
      if (typeFilter !== 'all' && order.order_type !== typeFilter) return false
      if (paymentFilter !== 'all' && order.payment_status !== paymentFilter) {
        return false
      }

      if (!keyword) return true

      const itemNames = (order.items || [])
        .map((item) => `${item.item_name} ${item.variation_name || ''}`)
        .join(' ')

      return [
        order.order_code,
        order.public_order_number,
        order.customer_name,
        order.customer_phone,
        order.table_name,
        order.status,
        order.order_type,
        order.payment_method,
        itemNames,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [orders, paymentFilter, search, statusFilter, typeFilter])

  useEffect(() => {
  if (!restaurant?.id) return undefined

  const channel = supabase
    .channel(`restaurant-orders-live-${restaurant.id}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'restaurant_orders',
        filter: `restaurant_id=eq.${restaurant.id}`,
      },
      (payload) => {
        const order = payload.new

        lastKnownStatusRef.current.set(order.id, order.status)

        if (soundEnabledRef.current) {
          playAdminNotificationSound()
        }

        setRealtimeNotice({
          type: 'new_order',
          title: 'New order received',
          message: `${order.order_code || 'Order'} • ${formatMoney(
            order.total_amount,
            order.currency || restaurant?.currency,
          )}`,
        })

        loadOrders()
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'restaurant_orders',
        filter: `restaurant_id=eq.${restaurant.id}`,
      },
      (payload) => {
        const order = payload.new
        const previousStatus = lastKnownStatusRef.current.get(order.id)

        lastKnownStatusRef.current.set(order.id, order.status)

        if (
          order.status === 'bill_requested' &&
          previousStatus !== 'bill_requested'
        ) {
          if (soundEnabledRef.current) {
            playAdminNotificationSound()
          }

          setRealtimeNotice({
            type: 'bill_requested',
            title: 'Customer requested bill',
            message: `${order.order_code || 'Order'} • ${
              order.table_name || 'Table order'
            }`,
          })
        }

        loadOrders()
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [loadOrders, restaurant?.currency, restaurant?.id])

  const stats = useMemo(() => {
    const paidRevenue = orders
      .filter((order) => order.payment_status === 'paid')
      .reduce((total, order) => total + Number(order.total_amount || 0), 0)

    const unpaidRevenue = orders
      .filter((order) => order.payment_status !== 'paid')
      .reduce((total, order) => total + Number(order.total_amount || 0), 0)

    const liveOrders = orders.filter(
      (order) => !isFinalRestaurantOrderStatus(order.status),
    ).length

    const billRequested = orders.filter(
      (order) => order.status === 'bill_requested',
    ).length

    return {
      totalOrders: orders.length,
      liveOrders,
      billRequested,
      paidRevenue,
      unpaidRevenue,
    }
  }, [orders])

  const replaceOrderInState = (updatedOrder) => {
    setOrders((current) =>
      current.map((order) =>
        order.id === updatedOrder.id ? updatedOrder : order,
      ),
    )

    setSelectedOrder((current) =>
      current?.id === updatedOrder.id ? updatedOrder : current,
    )

    setAddItemOrder((current) =>
      current?.id === updatedOrder.id ? updatedOrder : current,
    )

    setCompleteOrder((current) =>
      current?.id === updatedOrder.id ? updatedOrder : current,
    )
  }

  const updateOrderFields = async (order, updates) => {
    if (!order?.id) return null

    setUpdatingOrderId(order.id)

    const { data, error } = await supabase
      .from('restaurant_orders')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id)
      .select('*')
      .single()

    setUpdatingOrderId('')

    if (error) return null

    const updatedOrder = {
      ...order,
      ...data,
      items: order.items || [],
    }

    replaceOrderInState(updatedOrder)

    return updatedOrder
  }

  const updateOrderField = (order, field, value) => {
    updateOrderFields(order, {
      [field]: value,
    })
  }

  const openCompleteModal = (order) => {
    setCompleteOrder(order)
    setCompletePaymentMethod(order.payment_method || 'cash')
  }

  const confirmCompleteOrder = async () => {
    if (!completeOrder?.id) return

    setCompletingOrder(true)

    const updatedOrder = await updateOrderFields(completeOrder, {
      status: 'completed',
      payment_status: 'paid',
      payment_method: completePaymentMethod || 'cash',
    })

    setCompletingOrder(false)

    if (updatedOrder) {
      setCompleteOrder(null)
    }
  }

  const openAddItemModal = (order) => {
    setAddItemOrder(order)
    setAddItemForm({
      productId: '',
      variationId: '',
      quantity: 1,
      isComplimentary: false,
    })
  }

  const selectedAddProduct = useMemo(() => {
    return menuProducts.find((product) => product.id === addItemForm.productId)
  }, [addItemForm.productId, menuProducts])

  const selectedAddVariations = useMemo(() => {
    if (!Array.isArray(selectedAddProduct?.variations)) return []

    return [...selectedAddProduct.variations]
      .filter((variation) => variation.is_available !== false)
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
  }, [selectedAddProduct])

  const selectedAddVariation = useMemo(() => {
    return selectedAddVariations.find(
      (variation) => variation.id === addItemForm.variationId,
    )
  }, [addItemForm.variationId, selectedAddVariations])

  const addItemUnitPrice = useMemo(() => {
    if (addItemForm.isComplimentary) return 0
    if (selectedAddVariation) return Number(selectedAddVariation.price || 0)
    return Number(selectedAddProduct?.price || 0)
  }, [addItemForm.isComplimentary, selectedAddProduct, selectedAddVariation])

  const addItemTotal = useMemo(() => {
    return addItemUnitPrice * Number(addItemForm.quantity || 1)
  }, [addItemForm.quantity, addItemUnitPrice])

  const handleAddProductToOrder = async () => {
    if (!addItemOrder?.id || !restaurant?.id || !selectedAddProduct) return

    if (
      selectedAddProduct.has_variations &&
      selectedAddVariations.length > 0 &&
      !selectedAddVariation
    ) {
      return
    }

    const quantity = Math.max(1, Number(addItemForm.quantity || 1))
    const unitPrice = addItemUnitPrice
    const totalPrice = unitPrice * quantity

    setAddingItem(true)

    const { data: insertedItem, error: itemError } = await supabase
      .from('restaurant_order_items')
      .insert({
        order_id: addItemOrder.id,
        restaurant_id: restaurant.id,
        item_id: selectedAddProduct.id,
        variation_id: selectedAddVariation?.id || null,
        item_name: addItemForm.isComplimentary
          ? `${selectedAddProduct.name} (Complimentary)`
          : selectedAddProduct.name,
        variation_name: selectedAddVariation?.name || null,
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
      })
      .select('*')
      .single()

    if (itemError) {
      setAddingItem(false)
      return
    }

    const newSubtotal = Number(addItemOrder.subtotal || 0) + totalPrice
    const newTotal =
      newSubtotal +
      Number(addItemOrder.extra_amount || 0) -
      Number(addItemOrder.discount_amount || 0)

    const { data: updatedOrderData, error: orderError } = await supabase
      .from('restaurant_orders')
      .update({
        subtotal: newSubtotal,
        total_amount: newTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', addItemOrder.id)
      .select('*')
      .single()

    setAddingItem(false)

    if (orderError) return

    const updatedOrder = {
      ...addItemOrder,
      ...updatedOrderData,
      items: [...(addItemOrder.items || []), insertedItem],
    }

    replaceOrderInState(updatedOrder)
    setAddItemOrder(null)
    setAddItemForm({
      productId: '',
      variationId: '',
      quantity: 1,
      isComplimentary: false,
    })
  }

  if (loading) {
    return (
      <section className="management-section orders-screen">
        <div className="orders-empty-state">
          <ClipboardList size={34} />
          <h2>Loading orders...</h2>
          <p>Please wait while we fetch restaurant orders.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="management-section orders-screen">
      <header className="orders-header">
        <div>
          <p className="section-kicker">Orders</p>
          <h2>Restaurant orders</h2>
          <span>
            Manage POS, QR dine-in, delivery orders, bill requests and payments.
          </span>
        </div>

        <div className="orders-header-actions">
  <button
    type="button"
    className={`orders-sound-toggle ${soundEnabled ? 'ready' : ''}`}
    onClick={enableAdminSound}
  >
    <BellRing size={16} />
    {soundEnabled ? 'Sound ready' : 'Enable sound'}
  </button>

  <button type="button" className="orders-refresh" onClick={loadOrders}>
    <RefreshCcw size={16} />
    Refresh
  </button>
</div>
      </header>

      {realtimeNotice && (
  <div className={`orders-live-alert ${realtimeNotice.type}`}>
    <BellRing size={18} />

    <div>
      <strong>{realtimeNotice.title}</strong>
      <span>{realtimeNotice.message}</span>
    </div>

    <button type="button" onClick={() => setRealtimeNotice(null)}>
      <X size={16} />
    </button>
  </div>
)}

      <div className="orders-stats-grid">
        <MiniOrderStat label="Total orders" value={stats.totalOrders} />
        <MiniOrderStat label="Live orders" value={stats.liveOrders} />
        <MiniOrderStat label="Bill requested" value={stats.billRequested} />
        <MiniOrderStat
          label="Paid revenue"
          value={formatMoney(stats.paidRevenue, restaurant?.currency)}
        />
        <MiniOrderStat
          label="Unpaid bills"
          value={formatMoney(stats.unpaidRevenue, restaurant?.currency)}
        />
      </div>

      <div className="orders-toolbar">
        <div className="orders-search">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search order, customer, phone, table or item..."
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All status</option>
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
          {orderTypeOptions.map((type) => (
            <option value={type.value} key={type.value}>
              {type.label}
            </option>
          ))}
        </select>

        <select
          value={paymentFilter}
          onChange={(event) => setPaymentFilter(event.target.value)}
        >
          <option value="all">All payments</option>
          {paymentOptions.map((payment) => (
            <option value={payment.value} key={payment.value}>
              {payment.label}
            </option>
          ))}
        </select>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="orders-empty-state">
          <ClipboardList size={34} />
          <h2>No orders found</h2>
          <p>Orders will appear here after POS or QR menu checkout.</p>
        </div>
      ) : (
        <div className="orders-table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  className={
                    order.status === 'bill_requested'
                      ? 'bill-requested-row'
                      : ''
                  }
                >
                  <td>
                    <strong>{order.order_code || order.public_order_number}</strong>
                    <span>{formatDateTime(order.created_at)}</span>
                    <small>{formatOrderType(order.order_type)}</small>
                    {order.table_name && <small>{order.table_name}</small>}
                  </td>

                  <td>
                    <strong>{order.customer_name || 'Guest customer'}</strong>
                    <span>{order.customer_phone || 'No phone'}</span>
                  </td>

                  <td>
                    <OrderItemsPreview items={order.items} />
                  </td>

                  <td>
                    <strong>
                      {formatMoney(order.total_amount, order.currency)}
                    </strong>
                    <span>{formatPaymentStatus(order.payment_status)}</span>
                    <small>{formatPaymentMethod(order.payment_method)}</small>
                  </td>

                  <td>
                    <select
                      className="orders-inline-select"
                      value={order.status || 'order_received'}
                      disabled={updatingOrderId === order.id}
                      onChange={(event) =>
                        updateOrderField(order, 'status', event.target.value)
                      }
                    >
                      {statusOptions.map((status) => (
                        <option value={status.value} key={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <div className="orders-action-stack">
                      <button
                        type="button"
                        className="tiny-button"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <Eye size={15} />
                        View
                      </button>

                      <button
                        type="button"
                        className="tiny-button"
                        onClick={() => openAddItemModal(order)}
                      >
                        <PackagePlus size={15} />
                        Add Item
                      </button>

                      {!isFinalRestaurantOrderStatus(order.status) && (
                        <button
                          type="button"
                          className="tiny-button success"
                          onClick={() => openCompleteModal(order)}
                          disabled={updatingOrderId === order.id}
                        >
                          <CheckCircle2 size={15} />
                          Complete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          updatingOrderId={updatingOrderId}
          onClose={() => setSelectedOrder(null)}
          onUpdateField={updateOrderField}
          onComplete={openCompleteModal}
          onAddItem={openAddItemModal}
        />
      )}

      {addItemOrder && (
        <AddItemToOrderModal
          order={addItemOrder}
          menuProducts={menuProducts}
          productsLoading={productsLoading}
          addItemForm={addItemForm}
          selectedProduct={selectedAddProduct}
          selectedVariations={selectedAddVariations}
          selectedVariation={selectedAddVariation}
          unitPrice={addItemUnitPrice}
          totalPrice={addItemTotal}
          currency={addItemOrder.currency || restaurant?.currency || 'AED'}
          addingItem={addingItem}
          onClose={() => setAddItemOrder(null)}
          onChange={(key, value) =>
            setAddItemForm((current) => ({
              ...current,
              [key]: value,
              ...(key === 'productId' ? { variationId: '' } : {}),
            }))
          }
          onAdd={handleAddProductToOrder}
        />
      )}

      {completeOrder && (
        <CompleteOrderModal
          order={completeOrder}
          paymentMethod={completePaymentMethod}
          completing={completingOrder}
          onPaymentMethodChange={setCompletePaymentMethod}
          onClose={() => setCompleteOrder(null)}
          onPrint={() =>
            printOrderReceipt({
              order: completeOrder,
              paymentMethod: completePaymentMethod,
              restaurantName: restaurant?.name || 'Restaurant',
            })
          }
          onComplete={confirmCompleteOrder}
        />
      )}
    </section>
  )
}

function MiniOrderStat({ label, value }) {
  return (
    <div className="orders-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function OrderItemsPreview({ items }) {
  if (!items?.length) return <span>No items</span>

  const firstItems = items.slice(0, 2)
  const remainingCount = items.length - firstItems.length

  return (
    <div className="order-items-preview">
      {firstItems.map((item) => (
        <span key={item.id}>
          {item.quantity} × {item.item_name}
          {item.variation_name ? ` (${item.variation_name})` : ''}
        </span>
      ))}

      {remainingCount > 0 && <small>+{remainingCount} more</small>}
    </div>
  )
}

function OrderDetailsModal({
  order,
  updatingOrderId,
  onClose,
  onUpdateField,
  onComplete,
  onAddItem,
}) {
  return (
    <div className="orders-modal-overlay" onClick={onClose}>
      <div
        className="orders-modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="orders-modal-head">
          <div>
            <p className="section-kicker">Order details</p>
            <h2>{order.order_code || order.public_order_number}</h2>
            <span>{formatDateTime(order.created_at)}</span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="orders-detail-grid">
          <InfoCard
            label="Customer"
            value={order.customer_name || 'Guest customer'}
            meta={order.customer_phone || 'No phone'}
          />

          <InfoCard
            label="Order type"
            value={formatOrderType(order.order_type)}
            meta={order.table_name || 'No table'}
          />

          <InfoCard
            label="Total"
            value={formatMoney(order.total_amount, order.currency)}
            meta={`${formatPaymentStatus(order.payment_status)} • ${formatPaymentMethod(
              order.payment_method,
            )}`}
          />

          <InfoCard
            label="Status"
            value={formatStatus(order.status)}
            meta={`Latest: ${formatDateTime(order.updated_at)}`}
          />
        </div>

        {order.status === 'bill_requested' && (
          <div className="orders-bill-request-alert">
            Customer requested bill completion. Confirm payment and complete the
            order.
          </div>
        )}

        <div className="orders-modal-controls">
          <label>
            Status
            <select
              value={order.status || 'order_received'}
              disabled={updatingOrderId === order.id}
              onChange={(event) =>
                onUpdateField(order, 'status', event.target.value)
              }
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
              value={order.payment_status || 'unpaid'}
              disabled={updatingOrderId === order.id}
              onChange={(event) =>
                onUpdateField(order, 'payment_status', event.target.value)
              }
            >
              {paymentOptions.map((payment) => (
                <option value={payment.value} key={payment.value}>
                  {payment.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Payment method
            <select
              value={order.payment_method || 'cash'}
              disabled={updatingOrderId === order.id}
              onChange={(event) =>
                onUpdateField(order, 'payment_method', event.target.value)
              }
            >
              {paymentMethodOptions.map((method) => (
                <option value={method.value} key={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="orders-modal-action-row">
          <button type="button" onClick={() => onAddItem(order)}>
            <PackagePlus size={16} />
            Add product
          </button>

          <button
            type="button"
            onClick={() =>
              printOrderReceipt({
                order,
                paymentMethod: order.payment_method || 'cash',
                restaurantName: 'Restaurant',
              })
            }
          >
            <Printer size={16} />
            Print
          </button>

          {!isFinalRestaurantOrderStatus(order.status) && (
            <button
              type="button"
              className="success"
              onClick={() => onComplete(order)}
              disabled={updatingOrderId === order.id}
            >
              <CheckCircle2 size={16} />
              Complete
            </button>
          )}
        </div>

        <div className="orders-modal-items">
          <h3>Items</h3>

          {(order.items || []).map((item) => (
            <div className="orders-modal-item" key={item.id}>
              <div>
                <strong>{item.item_name}</strong>
                {item.variation_name && <span>{item.variation_name}</span>}
                <small>
                  {item.quantity} × {formatMoney(item.unit_price, order.currency)}
                </small>
              </div>

              <strong>{formatMoney(item.total_price, order.currency)}</strong>
            </div>
          ))}
        </div>

        <div className="orders-total-box">
          <div>
            <span>Subtotal</span>
            <strong>{formatMoney(order.subtotal, order.currency)}</strong>
          </div>

          <div>
            <span>Discount</span>
            <strong>{formatMoney(order.discount_amount, order.currency)}</strong>
          </div>

          <div>
            <span>Extra</span>
            <strong>{formatMoney(order.extra_amount, order.currency)}</strong>
          </div>

          <div className="grand">
            <span>Total</span>
            <strong>{formatMoney(order.total_amount, order.currency)}</strong>
          </div>
        </div>

        {order.notes && (
          <div className="orders-notes-box">
            <span>Notes</span>
            <p>{order.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoCard({ label, value, meta }) {
  return (
    <div className="orders-info-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </div>
  )
}

function AddItemToOrderModal({
  order,
  menuProducts,
  productsLoading,
  addItemForm,
  selectedProduct,
  selectedVariations,
  selectedVariation,
  unitPrice,
  totalPrice,
  currency,
  addingItem,
  onClose,
  onChange,
  onAdd,
}) {
  const requiresVariation =
    selectedProduct?.has_variations && selectedVariations.length > 0

  const canAdd =
    selectedProduct &&
    Number(addItemForm.quantity || 0) > 0 &&
    (!requiresVariation || selectedVariation)

  return (
    <div className="orders-modal-overlay" onClick={onClose}>
      <div
        className="orders-modal-card add-item-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="orders-modal-head">
          <div>
            <p className="section-kicker">Add product</p>
            <h2>{order.order_code || order.public_order_number}</h2>
            <span>Add paid or complimentary items to this bill.</span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="orders-add-item-form">
          <label>
            Product
            <select
              value={addItemForm.productId}
              onChange={(event) => onChange('productId', event.target.value)}
              disabled={productsLoading || addingItem}
            >
              <option value="">
                {productsLoading ? 'Loading products...' : 'Choose product'}
              </option>

              {menuProducts.map((product) => (
                <option value={product.id} key={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>

          {requiresVariation && (
            <label>
              Variation
              <select
                value={addItemForm.variationId}
                onChange={(event) =>
                  onChange('variationId', event.target.value)
                }
                disabled={addingItem}
              >
                <option value="">Choose variation</option>

                {selectedVariations.map((variation) => (
                  <option value={variation.id} key={variation.id}>
                    {variation.name} - {formatMoney(variation.price, currency)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            Quantity
            <input
              type="number"
              min="1"
              value={addItemForm.quantity}
              onChange={(event) => onChange('quantity', event.target.value)}
              disabled={addingItem}
            />
          </label>

          <label className="orders-checkbox-line">
            <input
              type="checkbox"
              checked={Boolean(addItemForm.isComplimentary)}
              onChange={(event) =>
                onChange('isComplimentary', event.target.checked)
              }
              disabled={addingItem}
            />
            Complimentary / free item
          </label>
        </div>

        {selectedProduct && (
          <div className="orders-add-item-summary">
            <div>
              <span>Unit price</span>
              <strong>{formatMoney(unitPrice, currency)}</strong>
            </div>

            <div>
              <span>Total add-on</span>
              <strong>{formatMoney(totalPrice, currency)}</strong>
            </div>
          </div>
        )}

        <button
          type="button"
          className="orders-add-item-submit"
          onClick={onAdd}
          disabled={!canAdd || addingItem}
        >
          {addingItem ? 'Adding product...' : 'Add product to order'}
        </button>
      </div>
    </div>
  )
}

function CompleteOrderModal({
  order,
  paymentMethod,
  completing,
  onPaymentMethodChange,
  onClose,
  onPrint,
  onComplete,
}) {
  return (
    <div className="orders-modal-overlay" onClick={onClose}>
      <div
        className="orders-modal-card complete-order-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="orders-modal-head">
          <div>
            <p className="section-kicker">Complete bill</p>
            <h2>{order.order_code || order.public_order_number}</h2>
            <span>Collect payment, print bill and complete the order.</span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="complete-payment-grid">
          <label>
            Payment method
            <select
              value={paymentMethod}
              onChange={(event) => onPaymentMethodChange(event.target.value)}
            >
              {paymentMethodOptions.map((method) => (
                <option value={method.value} key={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>

          <div className="complete-total-card">
            <span>Bill total</span>
            <strong>{formatMoney(order.total_amount, order.currency)}</strong>
          </div>
        </div>

        <div className="completion-receipt">
          <div className="receipt-title">
            <ReceiptText size={18} />
            Bill Summary
          </div>

          <div className="receipt-line">
            <span>Order</span>
            <strong>{order.order_code || order.public_order_number}</strong>
          </div>

          <div className="receipt-line">
            <span>Type</span>
            <strong>{formatOrderType(order.order_type)}</strong>
          </div>

          {order.table_name && (
            <div className="receipt-line">
              <span>Table</span>
              <strong>{order.table_name}</strong>
            </div>
          )}

          <div className="receipt-items">
            {(order.items || []).map((item) => (
              <div className="receipt-item" key={item.id}>
                <span>
                  {item.quantity} × {item.item_name}
                  {item.variation_name ? ` (${item.variation_name})` : ''}
                </span>
                <strong>{formatMoney(item.total_price, order.currency)}</strong>
              </div>
            ))}
          </div>

          <div className="receipt-line">
            <span>Subtotal</span>
            <strong>{formatMoney(order.subtotal, order.currency)}</strong>
          </div>

          <div className="receipt-line">
            <span>Discount</span>
            <strong>{formatMoney(order.discount_amount, order.currency)}</strong>
          </div>

          <div className="receipt-line">
            <span>Extra</span>
            <strong>{formatMoney(order.extra_amount, order.currency)}</strong>
          </div>

          <div className="receipt-line grand">
            <span>Total</span>
            <strong>{formatMoney(order.total_amount, order.currency)}</strong>
          </div>
        </div>

        <div className="complete-modal-actions">
          <button type="button" onClick={onPrint}>
            <Printer size={16} />
            Print
          </button>

          <button
            type="button"
            className="success"
            onClick={onComplete}
            disabled={completing}
          >
            <CheckCircle2 size={16} />
            {completing ? 'Completing...' : 'Complete & Paid'}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatMoney(value, currency = 'AED') {
  return `${currency || 'AED'} ${Number(value || 0).toFixed(2)}`
}

function formatDateTime(value) {
  if (!value) return 'Just now'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Just now'
  }
}

function formatStatus(status) {
  if (status === 'preparing') return 'Preparing'
  if (status === 'ready') return 'Ready'
  if (status === 'served') return 'Served'
  if (status === 'bill_requested') return 'Bill requested'
  if (status === 'completed') return 'Completed'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'out_for_delivery') return 'Out for delivery'
  if (status === 'delivered') return 'Delivered'
  return 'Order received'
}

function formatOrderType(type) {
  if (type === 'counter') return 'Counter'
  if (type === 'dine_in') return 'Dine-in'
  if (type === 'delivery') return 'Delivery'
  return 'Order'
}

function formatPaymentStatus(status) {
  if (status === 'paid') return 'Paid'
  if (status === 'refunded') return 'Refunded'
  return 'Unpaid'
}

function formatPaymentMethod(method) {
  if (method === 'cash') return 'Cash'
  if (method === 'card') return 'Card'
  if (method === 'upi') return 'UPI'
  if (method === 'online') return 'Online'
  if (method === 'cod') return 'COD'
  return 'Cash'
}

function isFinalRestaurantOrderStatus(status) {
  return ['completed', 'cancelled', 'delivered'].includes(status)
}

function printOrderReceipt({ order, paymentMethod, restaurantName }) {
  const receiptWindow = window.open('', '_blank', 'width=420,height=720')

  if (!receiptWindow) return

  const itemsHtml = (order.items || [])
    .map(
      (item) => `
        <tr>
          <td>
            ${item.item_name}
            ${item.variation_name ? `<br/><small>${item.variation_name}</small>` : ''}
            <br/><small>${item.quantity} × ${formatMoney(item.unit_price, order.currency)}</small>
          </td>
          <td style="text-align:right;">${formatMoney(item.total_price, order.currency)}</td>
        </tr>
      `,
    )
    .join('')

  receiptWindow.document.write(`
    <html>
      <head>
        <title>${order.order_code || 'Receipt'}</title>
        <style>
          body {
            width: 300px;
            margin: 0 auto;
            padding: 14px;
            font-family: Arial, sans-serif;
            color: #111;
          }

          h2, p {
            text-align: center;
            margin: 4px 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
          }

          td {
            padding: 7px 0;
            border-bottom: 1px dashed #999;
            vertical-align: top;
            font-size: 13px;
          }

          .line {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            margin-top: 8px;
            font-size: 14px;
          }

          .grand {
            margin-top: 12px;
            padding-top: 10px;
            border-top: 2px solid #111;
            font-size: 18px;
            font-weight: 800;
          }

          small {
            color: #555;
          }

          @media print {
            button {
              display: none;
            }
          }
        </style>
      </head>

      <body>
        <h2>${restaurantName}</h2>
        <p>Order: ${order.order_code || order.public_order_number}</p>
        <p>${formatDateTime(order.created_at)}</p>
        ${order.table_name ? `<p>Table: ${order.table_name}</p>` : ''}
        <p>Payment: ${formatPaymentMethod(paymentMethod)}</p>

        <table>
          ${itemsHtml}
        </table>

        <div class="line">
          <span>Subtotal</span>
          <strong>${formatMoney(order.subtotal, order.currency)}</strong>
        </div>

        <div class="line">
          <span>Discount</span>
          <strong>${formatMoney(order.discount_amount, order.currency)}</strong>
        </div>

        <div class="line">
          <span>Extra</span>
          <strong>${formatMoney(order.extra_amount, order.currency)}</strong>
        </div>

        <div class="line grand">
          <span>Total</span>
          <strong>${formatMoney(order.total_amount, order.currency)}</strong>
        </div>

        <p style="margin-top:18px;">Thank you!</p>

        <button onclick="window.print()" style="width:100%;padding:10px;margin-top:18px;">
          Print
        </button>
      </body>
    </html>
  `)

  receiptWindow.document.close()
  receiptWindow.focus()
}

function playAdminNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    const audioContext = new AudioContext()
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime)

    gain.gain.setValueAtTime(0.001, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.24)

    oscillator.connect(gain)
    gain.connect(audioContext.destination)

    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.25)

    window.setTimeout(() => {
      audioContext.close()
    }, 350)
  } catch {
    // Browser blocked sound or audio context is unavailable.
  }
}

export default OrdersManagement