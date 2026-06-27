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
  { value: 'unpaid', label: 'Unpaid / pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'refunded', label: 'Refunded' },
]

const paymentFilterOptions = [
  { value: 'all', label: 'All payments' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'All pending' },
  { value: 'cod_pending', label: 'COD pending' },
  { value: 'online_pending', label: 'Online pending' },
  { value: 'unpaid', label: 'Unpaid only' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'cancelled_unpaid', label: 'Cancelled / unpaid' },
]

const paymentMethodOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'online', label: 'Online' },
  { value: 'cod', label: 'COD' },
]

function OrdersManagement({ restaurant }) {
  const soundEnabledRef = useRef(false)
  const lastKnownStatusRef = useRef(new Map())
  const notificationTimerRef = useRef(null)

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
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [adminPopup, setAdminPopup] = useState(null)
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

  const enableAdminSound = useCallback(async () => {
    soundEnabledRef.current = true
    setSoundEnabled(true)

    await unlockAdminNotificationSound()
    playAdminNotificationSound()
  }, [])

  const showAdminOrderPopup = useCallback((popupData) => {
    if (notificationTimerRef.current) {
      window.clearTimeout(notificationTimerRef.current)
    }

    if (soundEnabledRef.current) {
      playAdminNotificationSound()
    }

    setAdminPopup({
      ...popupData,
      createdAt: Date.now(),
    })

    notificationTimerRef.current = window.setTimeout(() => {
      setAdminPopup(null)
    }, 10000)
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

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        window.clearTimeout(notificationTimerRef.current)
      }
    }
  }, [])

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

          showAdminOrderPopup({
            type: 'new_order',
            title: 'New order received',
            message: `${order.order_code || 'Order'} • ${formatMoney(
              order.total_amount,
              order.currency || restaurant?.currency,
            )}`,
            orderId: order.id,
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
            showAdminOrderPopup({
              type: 'bill_requested',
              title: 'Customer requested bill',
              message: `${order.order_code || 'Order'} • ${
                order.table_name || 'Table order'
              }`,
              orderId: order.id,
            })
          }

          loadOrders()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadOrders, restaurant?.currency, restaurant?.id, showAdminOrderPopup])

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false
      if (typeFilter !== 'all' && order.order_type !== typeFilter) return false
      if (!doesOrderMatchPaymentFilter(order, paymentFilter)) return false

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
        order.payment_gateway,
        order.delivery_payment_type,
        order.payment_reference,
        order.gateway_order_id,
        order.gateway_transaction_id,
        getOrderPaymentMeta(order).label,
        getOrderPaymentMethodLabel(order),
        itemNames,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [orders, paymentFilter, search, statusFilter, typeFilter])

  const stats = useMemo(() => {
    const paidRevenue = orders
      .filter((order) => isOrderPaid(order))
      .reduce((total, order) => total + Number(order.total_amount || 0), 0)

    const unpaidRevenue = orders
      .filter((order) => !isOrderPaid(order) && order.payment_status !== 'refunded')
      .reduce((total, order) => total + Number(order.total_amount || 0), 0)

    const liveOrders = orders.filter(
      (order) => !isFinalRestaurantOrderStatus(order.status),
    ).length

    const billRequested = orders.filter(
      (order) => order.status === 'bill_requested',
    ).length

    const paymentPending = orders.filter((order) => isPaymentPending(order)).length
    const codPending = orders.filter((order) => isCodPaymentPending(order)).length
    const onlinePending = orders.filter((order) => isOnlinePaymentPending(order)).length

    return {
      totalOrders: orders.length,
      liveOrders,
      billRequested,
      paymentPending,
      codPending,
      onlinePending,
      paidRevenue,
      unpaidRevenue,
    }
  }, [orders])

  const replaceOrderInState = (updatedOrder) => {
    setOrders((current) => {
      const exists = current.some((order) => order.id === updatedOrder.id)

      if (!exists) {
        return [updatedOrder, ...current]
      }

      return current.map((order) =>
        order.id === updatedOrder.id ? updatedOrder : order,
      )
    })

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

  const openAdminPopupOrder = async () => {
    if (!adminPopup?.orderId) return

    const orderId = adminPopup.orderId
    setAdminPopup(null)

    const { data: orderData, error: orderError } = await supabase
      .from('restaurant_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle()

    if (orderError || !orderData) return

    const { data: itemData } = await supabase
      .from('restaurant_order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })

    const orderWithItems = {
      ...orderData,
      items: itemData || [],
    }

    replaceOrderInState(orderWithItems)
    setSelectedOrder(orderWithItems)
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
      payment_method:
        completePaymentMethod || getDefaultPaymentMethodForOrder(completeOrder),
    })

    setCompletingOrder(false)

    if (updatedOrder) {
      setCompleteOrder(null)
    }
  }

  const markOrderPaid = async (order, methodOverride = '') => {
    if (!order?.id || isOrderPaid(order)) return

    await updateOrderFields(order, {
      payment_status: 'paid',
      payment_method: methodOverride || getDefaultPaymentMethodForOrder(order),
    })
  }

  const markOrderFailedCancelled = async (order) => {
    if (!order?.id || isOrderPaid(order)) return

    await updateOrderFields(order, {
      status: 'cancelled',
      payment_status: 'unpaid',
      payment_method: getDefaultPaymentMethodForOrder(order),
    })
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

      <div className="orders-stats-grid">
        <MiniOrderStat label="Total orders" value={stats.totalOrders} />
        <MiniOrderStat label="Live orders" value={stats.liveOrders} />
        <MiniOrderStat label="Bill requested" value={stats.billRequested} />
        <MiniOrderStat label="Payment pending" value={stats.paymentPending} />
        <MiniOrderStat label="COD pending" value={stats.codPending} />
        <MiniOrderStat label="Online pending" value={stats.onlinePending} />
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
          {paymentFilterOptions.map((payment) => (
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
                  className={getOrderRowClass(order)}
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
                    <PaymentStatusPill order={order} />
                    <PaymentMethodPill order={order} />
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

                      {!isOrderPaid(order) && (
                        <button
                          type="button"
                          className="tiny-button payment"
                          onClick={() => markOrderPaid(order)}
                          disabled={updatingOrderId === order.id}
                        >
                          <CheckCircle2 size={15} />
                          Mark Paid
                        </button>
                      )}

                      {canMarkPaymentFailedCancelled(order) && (
                        <button
                          type="button"
                          className="tiny-button danger"
                          onClick={() => markOrderFailedCancelled(order)}
                          disabled={updatingOrderId === order.id}
                        >
                          <X size={15} />
                          Fail / Cancel
                        </button>
                      )}

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
          restaurantName={restaurant?.name || 'Restaurant'}
          updatingOrderId={updatingOrderId}
          onClose={() => setSelectedOrder(null)}
          onUpdateField={updateOrderField}
          onComplete={openCompleteModal}
          onAddItem={openAddItemModal}
          onMarkPaid={markOrderPaid}
          onMarkFailedCancelled={markOrderFailedCancelled}
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
          restaurantName={restaurant?.name || 'Restaurant'}
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

      {adminPopup && (
        <AdminOrderPopup
          popup={adminPopup}
          soundEnabled={soundEnabled}
          onClose={() => setAdminPopup(null)}
          onView={openAdminPopupOrder}
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
  restaurantName,
  updatingOrderId,
  onClose,
  onUpdateField,
  onComplete,
  onAddItem,
  onMarkPaid,
  onMarkFailedCancelled,
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
            meta={`${getOrderPaymentMeta(order).label} • ${getOrderPaymentMethodLabel(
              order,
            )}`}
          />

          <InfoCard
            label="Status"
            value={formatStatus(order.status)}
            meta={`Latest: ${formatDateTime(order.updated_at)}`}
          />
        </div>

        <PaymentGuidanceBox order={order} />
        <PaymentGatewayReferenceBox order={order} />

        {order.status === 'bill_requested' && (
          <div className="orders-bill-request-alert">
            Customer requested bill completion. Confirm the payment status first,
            then complete the order when the restaurant is ready to close the bill.
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
                paymentMethod: order.payment_method || getDefaultPaymentMethodForOrder(order),
                restaurantName,
              })
            }
          >
            <Printer size={16} />
            Print
          </button>

          {!isOrderPaid(order) && (
            <button
              type="button"
              className="payment"
              onClick={() => onMarkPaid(order)}
              disabled={updatingOrderId === order.id}
            >
              <CheckCircle2 size={16} />
              Mark Paid
            </button>
          )}

          {canMarkPaymentFailedCancelled(order) && (
            <button
              type="button"
              className="danger"
              onClick={() => onMarkFailedCancelled(order)}
              disabled={updatingOrderId === order.id}
            >
              <X size={16} />
              Fail / Cancel
            </button>
          )}

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
  restaurantName,
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
            <span>Collect payment, print if needed, then close the bill as paid.</span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <PaymentGuidanceBox order={order} compact />

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
            <small>{getOrderPaymentMethodLabel(order)}</small>
          </div>
        </div>

        <div className="completion-receipt">
          <div className="receipt-title">
            <ReceiptText size={18} />
            {restaurantName} Bill Summary
          </div>

          <div className="receipt-line">
            <span>Order</span>
            <strong>{order.order_code || order.public_order_number}</strong>
          </div>

          <div className="receipt-line">
            <span>Type</span>
            <strong>{formatOrderType(order.order_type)}</strong>
          </div>

          <div className="receipt-line">
            <span>Payment</span>
            <strong>{getOrderPaymentMeta(order).label}</strong>
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

function AdminOrderPopup({ popup, soundEnabled, onClose, onView }) {
  return (
    <div className={`admin-order-popup ${popup.type}`}>
      <div className="admin-order-popup-icon">
        <BellRing size={30} />
      </div>

      <div className="admin-order-popup-body">
        <p>{popup.type === 'bill_requested' ? 'Bill Alert' : 'Order Alert'}</p>
        <h2>{popup.title}</h2>
        <span>{popup.message}</span>

        {!soundEnabled && (
          <small>Tip: click “Enable sound” to hear future alerts.</small>
        )}

        <div className="admin-order-popup-actions">
          <button type="button" onClick={onView}>
            View Order
          </button>

          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className="admin-order-popup-timer" />
    </div>
  )
}

function PaymentStatusPill({ order }) {
  const paymentMeta = getOrderPaymentMeta(order)

  return (
    <span className={`orders-payment-chip ${paymentMeta.tone}`}>
      {paymentMeta.label}
    </span>
  )
}

function PaymentMethodPill({ order }) {
  return (
    <small className="orders-payment-method-chip">
      {getOrderPaymentMethodLabel(order)}
    </small>
  )
}


function PaymentGatewayReferenceBox({ order }) {
  const rows = getOrderPaymentReferenceRows(order)

  if (rows.length === 0) return null

  return (
    <div className="orders-payment-reference-box">
      <div>
        <span>Gateway / webhook reference</span>
        <strong>Payment tracking is ready</strong>
      </div>

      <div className="orders-payment-reference-grid">
        {rows.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>

      <p>
        These values connect the order with gateway redirect and webhook flow.
        For Ziina, payment_reference / gateway_order_id should match the Ziina
        Payment Intent ID returned by the checkout API.
      </p>
    </div>
  )
}

function PaymentGuidanceBox({ order, compact = false }) {
  const paymentMeta = getOrderPaymentMeta(order)
  const methodLabel = getOrderPaymentMethodLabel(order)
  const note = getOrderPaymentNote(order)

  return (
    <div className={`orders-payment-note-box ${paymentMeta.tone} ${compact ? 'compact' : ''}`}>
      <div>
        <span>Payment status</span>
        <strong>{paymentMeta.label}</strong>
        <small>{methodLabel}</small>
      </div>
      <p>{note}</p>
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
  if (status === 'failed') return 'Failed'
  if (status === 'cancelled') return 'Cancelled'
  if (['pending', 'payment_pending', 'online_pending'].includes(status)) {
    return 'Pending'
  }
  return 'Unpaid'
}

function formatPaymentMethod(method) {
  if (method === 'cash') return 'Cash'
  if (method === 'card') return 'Card'
  if (method === 'upi') return 'UPI'
  if (method === 'online') return 'Online'
  if (method === 'cod') return 'COD'
  if (method === 'cod_cash') return 'COD Cash'
  if (method === 'cod_card') return 'COD Card Machine'
  return 'Cash'
}

function isOrderPaid(order) {
  return order?.payment_status === 'paid'
}

function isOrderRefunded(order) {
  return order?.payment_status === 'refunded'
}

function getNormalizedGateway(order) {
  return String(order?.payment_gateway || order?.gateway || '').toLowerCase()
}

function getNormalizedDeliveryPaymentType(order) {
  return String(
    order?.delivery_payment_type ||
      order?.deliveryPaymentType ||
      order?.payment_type ||
      '',
  ).toLowerCase()
}

function isOnlinePaymentOrder(order) {
  const gateway = getNormalizedGateway(order)
  const method = String(order?.payment_method || '').toLowerCase()

  return Boolean(gateway && gateway !== 'cod') || method === 'online'
}

function isCodPaymentOrder(order) {
  const gateway = getNormalizedGateway(order)
  const method = String(order?.payment_method || '').toLowerCase()

  return gateway === 'cod' || method === 'cod'
}

function isPaymentPending(order) {
  if (!order || isOrderPaid(order) || isOrderRefunded(order)) return false
  return order.status !== 'cancelled'
}

function isCodPaymentPending(order) {
  return isPaymentPending(order) && isCodPaymentOrder(order)
}

function isOnlinePaymentPending(order) {
  return isPaymentPending(order) && isOnlinePaymentOrder(order)
}

function canMarkPaymentFailedCancelled(order) {
  return isPaymentPending(order) && (isOnlinePaymentOrder(order) || isCodPaymentOrder(order))
}


function getOrderPaymentReferenceRows(order) {
  const rows = []
  const addRow = (label, value) => {
    const cleanedValue = String(value || '').trim()
    if (!cleanedValue) return
    rows.push({ label, value: cleanedValue })
  }

  addRow('Payment reference', order?.payment_reference)
  addRow('Gateway order ID', order?.gateway_order_id)
  addRow('Gateway transaction ID', order?.gateway_transaction_id)
  addRow('Gateway', formatGatewayLabel(getNormalizedGateway(order)))
  addRow('Online status', order?.online_payment_status)

  return rows
}

function getOrderPaymentMeta(order) {
  if (isOrderPaid(order)) {
    return { label: 'Paid', tone: 'paid' }
  }

  if (isOrderRefunded(order)) {
    return { label: 'Refunded', tone: 'refunded' }
  }

  if (order?.status === 'cancelled') {
    return { label: 'Cancelled / unpaid', tone: 'cancelled' }
  }

  const rawStatus = String(order?.payment_status || '').toLowerCase()

  if (rawStatus === 'failed') {
    return { label: 'Payment failed', tone: 'failed' }
  }

  if (isOnlinePaymentOrder(order)) {
    return { label: 'Online payment pending', tone: 'online-pending' }
  }

  if (isCodPaymentOrder(order)) {
    const deliveryType = getNormalizedDeliveryPaymentType(order)

    if (deliveryType === 'card' || deliveryType === 'card_machine') {
      return { label: 'COD card pending', tone: 'cod-pending' }
    }

    if (deliveryType === 'cash') {
      return { label: 'COD cash pending', tone: 'cod-pending' }
    }

    return { label: 'COD collection pending', tone: 'cod-pending' }
  }

  return { label: formatPaymentStatus(order?.payment_status), tone: 'unpaid' }
}

function getOrderPaymentMethodLabel(order) {
  const gateway = getNormalizedGateway(order)
  const deliveryType = getNormalizedDeliveryPaymentType(order)
  const method = String(order?.payment_method || '').toLowerCase()

  if (gateway === 'cod' || method === 'cod') {
    if (deliveryType === 'card' || deliveryType === 'card_machine') {
      return 'COD • Rider card machine'
    }

    if (deliveryType === 'cash') return 'COD • Cash collection'

    return 'COD collection'
  }

  if (gateway) {
    return `${formatGatewayLabel(gateway)} online gateway`
  }

  return formatPaymentMethod(method || 'cash')
}

function getOrderPaymentNote(order) {
  if (isOrderPaid(order)) {
    return 'Payment is marked as collected. You can complete the order when service is finished.'
  }

  if (isOrderRefunded(order)) {
    return 'This order is marked as refunded. Check finance records before closing the bill.'
  }

  if (order?.status === 'cancelled') {
    return 'This order is cancelled and payment is not collected.'
  }

  if (isOnlinePaymentOrder(order)) {
    if (getNormalizedGateway(order) === 'ziina') {
      return 'Ziina checkout is pending. The webhook should mark this paid automatically after successful payment. Mark paid manually only after verifying in Ziina.'
    }

    return 'Online gateway is still pending/foundation mode. Mark paid only after the gateway confirms payment or the restaurant collects manually.'
  }

  if (isCodPaymentOrder(order)) {
    const deliveryType = getNormalizedDeliveryPaymentType(order)

    if (deliveryType === 'card' || deliveryType === 'card_machine') {
      return 'Delivery rider should collect with a card/tap machine. Mark paid after collection.'
    }

    if (deliveryType === 'cash') {
      return 'Delivery rider should collect cash from the customer. Mark paid after collection.'
    }

    return 'COD payment must be collected outside the online gateway flow before marking paid.'
  }

  return 'Payment is not collected yet. Choose Mark Paid after collection, or complete the bill with the correct payment method.'
}

function getDefaultPaymentMethodForOrder(order) {
  const gateway = getNormalizedGateway(order)
  const deliveryType = getNormalizedDeliveryPaymentType(order)
  const method = String(order?.payment_method || '').toLowerCase()

  if (method && ['cash', 'card', 'upi', 'online', 'cod'].includes(method)) {
    return method
  }

  if (gateway === 'cod') {
    if (deliveryType === 'card' || deliveryType === 'card_machine') return 'card'
    if (deliveryType === 'cash') return 'cash'
    return 'cod'
  }

  if (gateway) return 'online'

  return 'cash'
}

function formatGatewayLabel(gateway) {
  if (gateway === 'ziina') return 'Ziina'
  if (gateway === 'stripe') return 'Stripe'
  if (gateway === 'paypal') return 'PayPal'
  if (gateway === 'network') return 'Network / N-Genius'
  if (gateway === 'cashfree') return 'Cashfree'
  if (gateway === 'razorpay') return 'Razorpay'
  if (gateway === 'phonepe') return 'PhonePe'
  return gateway.toUpperCase()
}

function doesOrderMatchPaymentFilter(order, filter) {
  if (filter === 'all') return true
  if (filter === 'paid') return isOrderPaid(order)
  if (filter === 'pending') return isPaymentPending(order)
  if (filter === 'cod_pending') return isCodPaymentPending(order)
  if (filter === 'online_pending') return isOnlinePaymentPending(order)
  if (filter === 'unpaid') {
    return order?.payment_status !== 'paid' && !isCodPaymentOrder(order) && !isOnlinePaymentOrder(order)
  }
  if (filter === 'refunded') return isOrderRefunded(order)
  if (filter === 'cancelled_unpaid') return order?.status === 'cancelled' && !isOrderPaid(order)
  return true
}

function getOrderRowClass(order) {
  const classes = []

  if (order.status === 'bill_requested') classes.push('bill-requested-row')
  if (isOnlinePaymentPending(order)) classes.push('online-payment-pending-row')
  if (isCodPaymentPending(order)) classes.push('cod-payment-pending-row')
  if (order.status === 'cancelled') classes.push('cancelled-order-row')

  return classes.join(' ')
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
        <p>Payment: ${formatPaymentMethod(paymentMethod)} • ${formatPaymentStatus(order.payment_status)}</p>

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

let adminAudioContext = null

function getAdminAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext

  if (!AudioContext) return null

  if (!adminAudioContext) {
    adminAudioContext = new AudioContext()
  }

  return adminAudioContext
}

async function unlockAdminNotificationSound() {
  try {
    const audioContext = getAdminAudioContext()

    if (!audioContext) return

    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
  } catch {
    // Audio unlock failed or browser blocked sound.
  }
}

function playAdminNotificationSound() {
  try {
    const audioContext = getAdminAudioContext()

    if (!audioContext) return

    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }

    const now = audioContext.currentTime

    playBeep(audioContext, now, 880)
    playBeep(audioContext, now + 0.18, 1180)
  } catch {
    // Browser blocked sound or audio context unavailable.
  }
}

function playBeep(audioContext, startTime, frequency) {
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, startTime)

  gain.gain.setValueAtTime(0.001, startTime)
  gain.gain.exponentialRampToValueAtTime(0.22, startTime + 0.03)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.18)

  oscillator.connect(gain)
  gain.connect(audioContext.destination)

  oscillator.start(startTime)
  oscillator.stop(startTime + 0.2)
}

export default OrdersManagement