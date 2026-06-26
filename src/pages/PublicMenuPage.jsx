import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ClipboardList,
  Gift,
  Home,
  Minus,
  Plus,
  QrCode,
  Search,
  ShoppingCart,
  Store,
  UserRound,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import './PublicMenuPage.css'

const phoneCountryOptions = [
  { code: '+971', label: 'UAE' },
  { code: '+966', label: 'Saudi Arabia' },
  { code: '+974', label: 'Qatar' },
  { code: '+973', label: 'Bahrain' },
  { code: '+965', label: 'Kuwait' },
  { code: '+968', label: 'Oman' },
  { code: '+91', label: 'India' },
]

function PublicMenuPage() {
  const { restaurantSlug } = useParams()
  const [searchParams] = useSearchParams()
  const tableToken = searchParams.get('table')
  const [loading, setLoading] = useState(true)
  const [savingOrder, setSavingOrder] = useState(false)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [restaurant, setRestaurant] = useState(null)
  const [table, setTable] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [customerOrders, setCustomerOrders] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [cart, setCart] = useState([])
  const [variationProduct, setVariationProduct] = useState(null)
  const [showCart, setShowCart] = useState(false)
  const [showOrdersModal, setShowOrdersModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState(null)
  const [savedCustomer, setSavedCustomer] = useState(() =>
    getSavedCustomerProfile(),
  )
  const [customerForm, setCustomerForm] = useState(() => {
    const savedProfile = getSavedCustomerProfile()

    return {
      name: savedProfile?.name || '',
      countryCode: savedProfile?.countryCode || '+971',
      phone: savedProfile?.phone || '',
      address: '',
      notes: '',
    }
  })

  const isTableOrder = Boolean(tableToken && table?.id)
  const orderType = isTableOrder ? 'dine_in' : 'delivery'
  const currency = restaurant?.currency || 'AED'
  const customerSessionId = useMemo(() => getOrCreateCustomerSessionId(), [])

  const customerFullPhone = getFullPhoneNumber({
    countryCode: customerForm.countryCode,
    phone: customerForm.phone,
  })

  const loadPublicMenu = useCallback(async () => {
    setLoading(true)

    const { data: restaurantData, error: restaurantError } = await supabase
      .from('restaurants')
      .select('id, name, slug, logo_url, phone, address, currency, is_active')
      .eq('slug', restaurantSlug)
      .eq('is_active', true)
      .maybeSingle()

    if (restaurantError || !restaurantData) {
      setRestaurant(null)
      setLoading(false)
      return
    }

    setRestaurant(restaurantData)

    if (tableToken) {
      const { data: tableData } = await supabase
        .from('restaurant_tables')
        .select('id, table_name, table_number, qr_token, is_active')
        .eq('restaurant_id', restaurantData.id)
        .eq('qr_token', tableToken)
        .eq('is_active', true)
        .maybeSingle()

      setTable(tableData || null)
    } else {
      setTable(null)
    }

    const { data: categoryData } = await supabase
      .from('menu_categories')
      .select('id, name, description')
      .eq('restaurant_id', restaurantData.id)
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    const { data: productData } = await supabase
      .from('menu_items')
      .select(
        `
          *,
          category:menu_categories (
            id,
            name
          ),
          variations:menu_item_variations (
            id,
            name,
            price,
            compare_price,
            is_available,
            sort_order
          )
        `,
      )
      .eq('restaurant_id', restaurantData.id)
      .eq('is_deleted', false)
      .eq('is_available', true)
      .order('created_at', { ascending: false })

    setCategories(categoryData || [])
    setProducts(productData || [])
    setLoading(false)
  }, [restaurantSlug, tableToken])

  useEffect(() => {
    loadPublicMenu()
  }, [loadPublicMenu])

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return products.filter((product) => {
      const matchesCategory =
        categoryFilter === 'all' ||
        (categoryFilter === 'none' && !product.category_id) ||
        product.category_id === categoryFilter

      if (!matchesCategory) return false

      if (!keyword) return true

      const variationNames = Array.isArray(product.variations)
        ? product.variations.map((variation) => variation.name).join(' ')
        : ''

      return [
        product.name,
        product.description,
        product.category?.name,
        variationNames,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [categoryFilter, products, search])

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => total + Number(item.totalPrice || 0), 0)
  }, [cart])

  const updateCustomerForm = (key, value) => {
    setCustomerForm((current) => ({ ...current, [key]: value }))
  }

  const getCartProductQuantity = (productId) => {
    return cart
      .filter((item) => item.itemId === productId)
      .reduce((total, item) => total + item.quantity, 0)
  }

  const getBaseCartItem = (product) => {
    return cart.find((item) => item.lineKey === `${product.id}-base`)
  }

  const saveCustomerProfileFromForm = () => {
    const cleanedPhone = cleanPhoneNumber(customerForm.phone)

    if (!cleanedPhone) return null

    const profile = {
      name: customerForm.name.trim(),
      countryCode: customerForm.countryCode || '+971',
      phone: cleanedPhone,
      fullPhone: getFullPhoneNumber({
        countryCode: customerForm.countryCode || '+971',
        phone: cleanedPhone,
      }),
    }

    localStorage.setItem('spizy_customer_profile', JSON.stringify(profile))
    setSavedCustomer(profile)

    return profile
  }

  const handleLogoutCustomer = () => {
    localStorage.removeItem('spizy_customer_profile')
    setSavedCustomer(null)
    setCustomerForm((current) => ({
      ...current,
      name: '',
      countryCode: '+971',
      phone: '',
    }))
    setShowProfileModal(false)
    showPublicMessage('Customer profile cleared.')
  }

  const handleProductClick = (product) => {
    const variations = getAvailableVariations(product)

    if (product.has_variations && variations.length > 0) {
      setVariationProduct(product)
      return
    }

    addToCart({
      product,
      variation: null,
      unitPrice: Number(product.price || 0),
    })
  }

  const addToCart = ({ product, variation, unitPrice }) => {
    const lineKey = `${product.id}-${variation?.id || 'base'}`

    setCart((current) => {
      const existingLine = current.find((item) => item.lineKey === lineKey)

      if (existingLine) {
        return current.map((item) =>
          item.lineKey === lineKey
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: (item.quantity + 1) * item.unitPrice,
              }
            : item,
        )
      }

      return [
        ...current,
        {
          lineKey,
          itemId: product.id,
          variationId: variation?.id || null,
          name: product.name,
          variationName: variation?.name || '',
          imageUrl: product.image_url,
          unitPrice,
          quantity: 1,
          totalPrice: unitPrice,
        },
      ]
    })

    setVariationProduct(null)
  }

  const updateCartQuantity = (lineKey, quantity) => {
    if (quantity <= 0) {
      setCart((current) => current.filter((item) => item.lineKey !== lineKey))
      return
    }

    setCart((current) =>
      current.map((item) =>
        item.lineKey === lineKey
          ? {
              ...item,
              quantity,
              totalPrice: quantity * item.unitPrice,
            }
          : item,
      ),
    )
  }

  const handlePlaceOrder = async () => {
    if (!restaurant?.id) return

    if (cart.length === 0) return

    const activeCustomerPhone = savedCustomer?.fullPhone || customerFullPhone
    const activeCustomerName = savedCustomer?.name || customerForm.name.trim()

    if (
      !savedCustomer?.phone &&
      !isTableOrder &&
      !cleanPhoneNumber(customerForm.phone)
    ) {
      showPublicMessage('Phone number is required for delivery order.')
      return
    }

    setSavingOrder(true)

    const { data, error } = await supabase.rpc('place_public_menu_order', {
      p_restaurant_id: restaurant.id,
      p_order_type: orderType,
      p_customer_session_id: customerSessionId,
      p_table_id: isTableOrder ? table?.id || null : null,
      p_table_name: isTableOrder ? table?.table_name || null : null,
      p_customer_name: activeCustomerName || null,
      p_customer_phone: activeCustomerPhone || null,
      p_currency: currency,
      p_notes: buildCustomerNotes(customerForm, isTableOrder),
      p_items: cart.map((item) => ({
        itemId: item.itemId,
        variationId: item.variationId,
        name: item.name,
        variationName: item.variationName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
    })

    setSavingOrder(false)

    if (error) {
      showPublicMessage(error.message)
      return
    }

    const orderResult = Array.isArray(data) ? data[0] : data

    if (!savedCustomer?.phone && cleanPhoneNumber(customerForm.phone)) {
      saveCustomerProfileFromForm()
    }

    setOrderSuccess({
      orderCode: orderResult?.order_code || 'Order placed',
      total: cartTotal,
      orderType,
      isExistingBill: Boolean(orderResult?.is_existing_bill),
    })

    setCart([])
    setShowCart(false)
    setCustomerForm((current) => ({
      ...current,
      address: '',
      notes: '',
    }))

    if (showOrdersModal) {
      await loadCustomerOrders()
    }
  }

  const loadCustomerOrders = async () => {
    if (!restaurant?.id) {
      showPublicMessage('Restaurant not ready.')
      return
    }

    const activeCustomerPhone = savedCustomer?.fullPhone || customerFullPhone

    setOrdersLoading(true)
    setShowOrdersModal(true)

    const { data, error } = await supabase.rpc('get_public_customer_orders', {
      p_restaurant_id: restaurant.id,
      p_customer_session_id: customerSessionId,
      p_customer_phone: activeCustomerPhone || null,
    })

    setOrdersLoading(false)

    if (error) {
      showPublicMessage(error.message)
      setCustomerOrders([])
      return
    }

    setCustomerOrders(normalizePublicOrders(data))
  }

  const handleCustomerRequestBill = async (order) => {
    if (!order?.id) return

    const activeCustomerPhone = savedCustomer?.fullPhone || customerFullPhone

    setOrdersLoading(true)

    const { error } = await supabase.rpc('request_public_order_completion', {
      p_order_id: order.id,
      p_customer_session_id: customerSessionId,
      p_customer_phone: activeCustomerPhone || null,
    })

    if (error) {
      setOrdersLoading(false)
      showPublicMessage(error.message)
      return
    }

    showPublicMessage('Bill request sent to restaurant.')
    await loadCustomerOrders()
  }

  const handleBottomHome = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  const handleBottomCart = () => {
    if (cart.length === 0) {
      showPublicMessage('Your cart is empty.')
      return
    }

    setShowCart(true)
  }

  const handleComingSoon = (label) => {
    showPublicMessage(`${label} will be available soon.`)
  }

  if (loading) {
    return (
      <main className="public-menu-page">
        <div className="public-menu-card">
          <div className="public-menu-loader">Loading menu...</div>
        </div>
      </main>
    )
  }

  if (!restaurant) {
    return (
      <main className="public-menu-page">
        <div className="public-menu-card">
          <Store size={42} />
          <h1>Menu not available</h1>
          <p>This restaurant menu is not active right now.</p>
          <Link to="/">Back to Spizy</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="public-menu-page">
      <PublicWarningListener />

      <header className="public-menu-header">
        <div className="public-restaurant-brand">
          <div className="public-menu-logo">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt={restaurant.name} />
            ) : (
              restaurant.name.slice(0, 2).toUpperCase()
            )}
          </div>

          <div>
            <p className="public-menu-label">Spizy Menu</p>
            <h1>{restaurant.name}</h1>
            <span>{restaurant.address || 'Fresh menu. Easy ordering.'}</span>
          </div>
        </div>

        {isTableOrder ? (
          <div className="public-table-pill">
            <QrCode size={18} />
            {table.table_name}
            {table.table_number ? ` • ${table.table_number}` : ''}
          </div>
        ) : (
          <div className="public-table-pill delivery">
            Delivery / Takeaway
          </div>
        )}
      </header>

      <section className="public-menu-tools">
        <div className="public-search-box">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search food, drinks, categories..."
          />
        </div>

        <div className="public-category-strip">
          <button
            type="button"
            className={categoryFilter === 'all' ? 'active' : ''}
            onClick={() => setCategoryFilter('all')}
          >
            All
          </button>

          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              className={categoryFilter === category.id ? 'active' : ''}
              onClick={() => setCategoryFilter(category.id)}
            >
              {category.name}
            </button>
          ))}
        </div>
      </section>

      {filteredProducts.length === 0 ? (
        <section className="public-empty-menu">
          No available products found.
        </section>
      ) : (
        <section className="public-product-grid">
          {filteredProducts.map((product) => {
            const variations = getAvailableVariations(product)
            const hasOptions = product.has_variations && variations.length > 0
            const productQuantity = getCartProductQuantity(product.id)
            const baseCartItem = getBaseCartItem(product)

            return (
              <article className="public-product-card" key={product.id}>
                <button
                  type="button"
                  className="public-product-main"
                  onClick={() => handleProductClick(product)}
                >
                  <div className="public-product-image">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} />
                    ) : (
                      product.name.slice(0, 2).toUpperCase()
                    )}
                  </div>

                  <div className="public-product-info">
                    <span>{product.category?.name || 'Special'}</span>
                    <h3>{product.name}</h3>
                    <p>{product.description || 'Tap to add this item.'}</p>

                    <div className="public-product-price-row">
                      <strong>
                        {hasOptions ? 'From ' : ''}
                        {currency} {Number(product.price || 0).toFixed(2)}
                      </strong>

                      {hasOptions && productQuantity > 0 && (
                        <small>{productQuantity} in cart</small>
                      )}
                    </div>
                  </div>
                </button>

                <div className="public-product-action-area">
                  {hasOptions ? (
                    <button
                      type="button"
                      className="public-add-button option"
                      onClick={() => setVariationProduct(product)}
                    >
                      {productQuantity > 0 ? 'Options' : 'Choose'}
                    </button>
                  ) : baseCartItem ? (
                    <div className="public-row-qty">
                      <button
                        type="button"
                        onClick={() =>
                          updateCartQuantity(
                            baseCartItem.lineKey,
                            baseCartItem.quantity - 1,
                          )
                        }
                      >
                        <Minus size={14} />
                      </button>

                      <strong>{baseCartItem.quantity}</strong>

                      <button
                        type="button"
                        onClick={() =>
                          updateCartQuantity(
                            baseCartItem.lineKey,
                            baseCartItem.quantity + 1,
                          )
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="public-add-button"
                      onClick={() =>
                        addToCart({
                          product,
                          variation: null,
                          unitPrice: Number(product.price || 0),
                        })
                      }
                    >
                      + Add
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </section>
      )}

      {cart.length > 0 && (
        <button
          type="button"
          className="floating-cart-button"
          onClick={() => setShowCart(true)}
        >
          <ShoppingCart size={18} />
          {cart.length} item{cart.length === 1 ? '' : 's'} • {currency}{' '}
          {cartTotal.toFixed(2)}
        </button>
      )}

      <PublicMobileBottomBar
        cartCount={cart.length}
        onHome={handleBottomHome}
        onOrders={loadCustomerOrders}
        onCart={handleBottomCart}
        onRewards={() => handleComingSoon('Rewards')}
        onProfile={() => setShowProfileModal(true)}
      />

      {showCart && (
        <PublicCartSheet
          cart={cart}
          currency={currency}
          cartTotal={cartTotal}
          isTableOrder={isTableOrder}
          table={table}
          customerForm={customerForm}
          savedCustomer={savedCustomer}
          phoneCountryOptions={phoneCountryOptions}
          savingOrder={savingOrder}
          onClose={() => setShowCart(false)}
          onUpdateCustomerForm={updateCustomerForm}
          onUpdateQuantity={updateCartQuantity}
          onPlaceOrder={handlePlaceOrder}
        />
      )}

      {variationProduct && (
        <PublicVariationModal
          product={variationProduct}
          currency={currency}
          onClose={() => setVariationProduct(null)}
          onChoose={(variation) =>
            addToCart({
              product: variationProduct,
              variation,
              unitPrice: Number(variation.price || 0),
            })
          }
        />
      )}

      {orderSuccess && (
        <OrderSuccessModal
          order={orderSuccess}
          currency={currency}
          onClose={() => setOrderSuccess(null)}
        />
      )}

      {showOrdersModal && (
        <PublicOrdersModal
          orders={customerOrders}
          loading={ordersLoading}
          currency={currency}
          onClose={() => setShowOrdersModal(false)}
          onRefresh={loadCustomerOrders}
          onRequestBill={handleCustomerRequestBill}
        />
      )}

      {showProfileModal && (
        <PublicProfileModal
          savedCustomer={savedCustomer}
          customerForm={customerForm}
          phoneCountryOptions={phoneCountryOptions}
          onClose={() => setShowProfileModal(false)}
          onUpdateCustomerForm={updateCustomerForm}
          onSave={() => {
            const profile = saveCustomerProfileFromForm()

            if (!profile) {
              showPublicMessage('Please enter a valid phone number.')
              return
            }

            setShowProfileModal(false)
            showPublicMessage('Profile saved.')
          }}
          onLogout={handleLogoutCustomer}
        />
      )}
    </main>
  )
}

function PublicMobileBottomBar({
  cartCount,
  onHome,
  onOrders,
  onCart,
  onRewards,
  onProfile,
}) {
  return (
    <nav className="public-mobile-bottom-bar">
      <button type="button" className="active" onClick={onHome}>
        <Home size={20} />
        <span>Home</span>
      </button>

      <button type="button" onClick={onOrders}>
        <ClipboardList size={20} />
        <span>Orders</span>
      </button>

      <button type="button" className="cart-tab" onClick={onCart}>
        <ShoppingCart size={20} />
        {cartCount > 0 && <strong>{cartCount}</strong>}
        <span>Cart</span>
      </button>

      <button type="button" onClick={onRewards}>
        <Gift size={20} />
        <span>Rewards</span>
      </button>

      <button type="button" onClick={onProfile}>
        <UserRound size={20} />
        <span>Profile</span>
      </button>
    </nav>
  )
}

function PublicCartSheet({
  cart,
  currency,
  cartTotal,
  isTableOrder,
  table,
  customerForm,
  savedCustomer,
  phoneCountryOptions,
  savingOrder,
  onClose,
  onUpdateCustomerForm,
  onUpdateQuantity,
  onPlaceOrder,
}) {
  return (
    <div className="public-cart-overlay" onClick={onClose}>
      <aside
        className="public-cart-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-cart-head">
          <div>
            <p className="public-menu-label">Your Order</p>
            <h2>{isTableOrder ? table?.table_name : 'Delivery order'}</h2>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="public-cart-list">
          {cart.map((item) => (
            <div className="public-cart-item" key={item.lineKey}>
              <div>
                <strong>{item.name}</strong>
                {item.variationName && <span>{item.variationName}</span>}
                <small>
                  {currency} {item.unitPrice.toFixed(2)}
                </small>
              </div>

              <div className="public-qty">
                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.lineKey, item.quantity - 1)}
                >
                  <Minus size={14} />
                </button>

                <strong>{item.quantity}</strong>

                <button
                  type="button"
                  onClick={() => onUpdateQuantity(item.lineKey, item.quantity + 1)}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="public-customer-fields">
          {savedCustomer?.phone ? (
            <div className="public-saved-customer-box">
              <span>Ordering as</span>
              <strong>{savedCustomer.name || 'Customer'}</strong>
              <small>{savedCustomer.fullPhone}</small>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={customerForm.name}
                onChange={(event) =>
                  onUpdateCustomerForm('name', event.target.value)
                }
                placeholder="Your name"
              />

              <div className="public-phone-row">
                <select
                  value={customerForm.countryCode}
                  onChange={(event) =>
                    onUpdateCustomerForm('countryCode', event.target.value)
                  }
                >
                  {phoneCountryOptions.map((country) => (
                    <option value={country.code} key={country.code}>
                      {country.label} {country.code}
                    </option>
                  ))}
                </select>

                <input
                  type="tel"
                  value={customerForm.phone}
                  onChange={(event) =>
                    onUpdateCustomerForm('phone', event.target.value)
                  }
                  placeholder={
                    isTableOrder ? 'Phone optional' : 'Phone number required'
                  }
                />
              </div>
            </>
          )}

          {!isTableOrder && (
            <textarea
              value={customerForm.address}
              onChange={(event) =>
                onUpdateCustomerForm('address', event.target.value)
              }
              placeholder="Delivery address"
              rows="3"
            />
          )}

          <textarea
            value={customerForm.notes}
            onChange={(event) =>
              onUpdateCustomerForm('notes', event.target.value)
            }
            placeholder="Special notes"
            rows="3"
          />
        </div>

        <div className="public-cart-total">
          <span>Total</span>
          <strong>
            {currency} {cartTotal.toFixed(2)}
          </strong>
        </div>

        <button
          type="button"
          className="public-place-order-button"
          onClick={onPlaceOrder}
          disabled={savingOrder}
        >
          {savingOrder ? 'Placing order...' : 'Place Order'}
        </button>
      </aside>
    </div>
  )
}

function PublicVariationModal({ product, currency, onClose, onChoose }) {
  const variations = getAvailableVariations(product)

  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-variation-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-cart-head">
          <div>
            <p className="public-menu-label">Choose Option</p>
            <h2>{product.name}</h2>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="public-variation-list">
          {variations.map((variation) => (
            <button
              type="button"
              key={variation.id}
              onClick={() => onChoose(variation)}
            >
              <span>{variation.name}</span>
              <strong>
                {currency} {Number(variation.price || 0).toFixed(2)}
              </strong>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function PublicOrdersModal({
  orders,
  loading,
  currency,
  onClose,
  onRefresh,
  onRequestBill,
}) {
  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-orders-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-cart-head">
          <div>
            <p className="public-menu-label">My Orders</p>
            <h2>Order history</h2>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <button
          type="button"
          className="public-refresh-orders-button"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : 'Refresh Orders'}
        </button>

        {loading ? (
          <div className="public-orders-empty">Loading your orders...</div>
        ) : orders.length === 0 ? (
          <div className="public-orders-empty">
            No orders found from this device yet.
          </div>
        ) : (
          <div className="public-orders-list">
            {orders.map((order) => (
              <article className="public-order-card" key={order.id}>
                <div className="public-order-card-head">
                  <div>
                    <span>
                      Order #
                      {getPublicOrderNumber(
                        order.public_order_number || order.order_code,
                      )}
                    </span>
                    <strong>
                      {order.currency || currency}{' '}
                      {Number(order.total_amount || 0).toFixed(2)}
                    </strong>
                  </div>

                  <div className="public-order-badge-stack">
                    {isPublicOngoingOrder(order) && (
                      <div className="public-live-order-badge">
                        <span />
                        {order.status === 'bill_requested'
                          ? 'Bill requested'
                          : 'Live order'}
                      </div>
                    )}

                    <OrderStatusPill status={order.status} />
                  </div>
                </div>

                <div className="public-order-meta">
                  <span>{formatPublicOrderType(order.order_type)}</span>
                  <span>{formatPublicDate(order.created_at)}</span>
                  <span>{formatPublicPayment(order.payment_status)}</span>
                </div>

                {order.table_name && (
                  <div className="public-order-table">{order.table_name}</div>
                )}

                <div className="public-order-items">
                  {(order.items || []).map((item) => (
                    <div className="public-order-item" key={item.id}>
                      <div>
                        <strong>{item.item_name}</strong>
                        {item.variation_name && (
                          <span>{item.variation_name}</span>
                        )}
                        <small>
                          {item.quantity} × {order.currency || currency}{' '}
                          {Number(item.unit_price || 0).toFixed(2)}
                        </small>
                      </div>

                      <strong>
                        {order.currency || currency}{' '}
                        {Number(item.total_price || 0).toFixed(2)}
                      </strong>
                    </div>
                  ))}
                </div>

                {order.order_type === 'dine_in' &&
                  isPublicOngoingOrder(order) &&
                  order.status !== 'bill_requested' && (
                    <button
                      type="button"
                      className="public-request-bill-button"
                      onClick={() => onRequestBill(order)}
                      disabled={loading}
                    >
                      Complete Order / Request Bill
                    </button>
                  )}

                {order.status === 'bill_requested' && (
                  <div className="public-bill-requested-note">
                    Bill request sent. Restaurant will complete the bill after
                    payment.
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function OrderStatusPill({ status }) {
  return (
    <div className={`public-order-status status-${status || 'order_received'}`}>
      {formatPublicStatus(status)}
    </div>
  )
}

function PublicProfileModal({
  savedCustomer,
  customerForm,
  phoneCountryOptions,
  onClose,
  onUpdateCustomerForm,
  onSave,
  onLogout,
}) {
  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-profile-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-cart-head">
          <div>
            <p className="public-menu-label">Profile</p>
            <h2>Customer profile</h2>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {savedCustomer?.phone && (
          <div className="public-saved-customer-box large">
            <span>Logged in as</span>
            <strong>{savedCustomer.name || 'Customer'}</strong>
            <small>{savedCustomer.fullPhone}</small>
          </div>
        )}

        <div className="public-customer-fields">
          <input
            type="text"
            value={customerForm.name}
            onChange={(event) =>
              onUpdateCustomerForm('name', event.target.value)
            }
            placeholder="Your name"
          />

          <div className="public-phone-row">
            <select
              value={customerForm.countryCode}
              onChange={(event) =>
                onUpdateCustomerForm('countryCode', event.target.value)
              }
            >
              {phoneCountryOptions.map((country) => (
                <option value={country.code} key={country.code}>
                  {country.label} {country.code}
                </option>
              ))}
            </select>

            <input
              type="tel"
              value={customerForm.phone}
              onChange={(event) =>
                onUpdateCustomerForm('phone', event.target.value)
              }
              placeholder="Phone number"
            />
          </div>
        </div>

        <div className="public-profile-actions">
          <button type="button" onClick={onSave}>
            Save Profile
          </button>

          {savedCustomer?.phone && (
            <button type="button" className="danger" onClick={onLogout}>
              Logout / Switch User
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function OrderSuccessModal({ order, currency, onClose }) {
  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-success-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="success-icon">✓</div>
        <p className="public-menu-label">Order Placed</p>
        <h2>{getPublicOrderNumber(order.orderCode)}</h2>

        <p>
          {order.isExistingBill
            ? 'Your additional items have been added to your current table bill.'
            : 'Your order has been sent to the restaurant. Please wait for confirmation.'}
        </p>

        <strong>
          {currency} {Number(order.total || 0).toFixed(2)}
        </strong>

        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

function PublicWarningListener() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    const handler = (event) => {
      setMessage(event.detail || 'Something went wrong.')

      window.setTimeout(() => {
        setMessage('')
      }, 3200)
    }

    window.addEventListener('spizy-public-warning', handler)

    return () => window.removeEventListener('spizy-public-warning', handler)
  }, [])

  if (!message) return null

  return <div className="public-warning-toast">{message}</div>
}

function showPublicMessage(message) {
  window.dispatchEvent(
    new CustomEvent('spizy-public-warning', {
      detail: message,
    }),
  )
}

function getAvailableVariations(product) {
  if (!Array.isArray(product.variations)) return []

  return [...product.variations]
    .filter((variation) => variation.is_available !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
}

function buildCustomerNotes(customerForm, isTableOrder) {
  const notes = []

  if (!isTableOrder && customerForm.address.trim()) {
    notes.push(`Address: ${customerForm.address.trim()}`)
  }

  if (customerForm.notes.trim()) {
    notes.push(`Notes: ${customerForm.notes.trim()}`)
  }

  return notes.join('\n') || null
}

function getOrCreateCustomerSessionId() {
  const storageKey = 'spizy_customer_session_id'

  try {
    const existingSessionId = localStorage.getItem(storageKey)

    if (existingSessionId) return existingSessionId

    const sessionId =
      window.crypto?.randomUUID?.() ||
      `session-${Date.now()}-${Math.random().toString(16).slice(2)}`

    localStorage.setItem(storageKey, sessionId)

    return sessionId
  } catch {
    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

function getSavedCustomerProfile() {
  try {
    const storedValue = localStorage.getItem('spizy_customer_profile')

    if (!storedValue) return null

    return JSON.parse(storedValue)
  } catch {
    return null
  }
}

function cleanPhoneNumber(value) {
  return String(value || '').replace(/\D/g, '')
}

function getFullPhoneNumber({ countryCode, phone }) {
  const cleanedPhone = cleanPhoneNumber(phone)

  if (!cleanedPhone) return ''

  return `${countryCode || '+971'}${cleanedPhone}`
}

function getPublicOrderNumber(orderCode) {
  const value = String(orderCode || '')

  if (!value.includes('-')) return value

  return value.split('-').pop()
}

function normalizePublicOrders(data) {
  if (Array.isArray(data)) return data

  if (typeof data === 'string') {
    try {
      const parsedValue = JSON.parse(data)
      return Array.isArray(parsedValue) ? parsedValue : []
    } catch {
      return []
    }
  }

  return []
}

function isPublicOngoingOrder(order) {
  if (order?.order_type !== 'dine_in') return false

  return !['completed', 'cancelled', 'delivered'].includes(order?.status)
}

function formatPublicStatus(status) {
  if (status === 'preparing') return 'Preparing'
  if (status === 'ready') return 'Ready'
  if (status === 'served') return 'Served'
  if (status === 'bill_requested') return 'Bill requested'
  if (status === 'completed') return 'Completed'
  if (status === 'out_for_delivery') return 'Out for delivery'
  if (status === 'delivered') return 'Delivered'
  if (status === 'cancelled') return 'Cancelled'
  return 'Order received'
}

function formatPublicOrderType(type) {
  if (type === 'dine_in') return 'Dine-in'
  if (type === 'delivery') return 'Delivery'
  return 'Order'
}

function formatPublicPayment(status) {
  if (status === 'paid') return 'Paid'
  if (status === 'refunded') return 'Refunded'
  return 'Unpaid'
}

function formatPublicDate(value) {
  if (!value) return 'Just now'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Just now'
  }
}

export default PublicMenuPage