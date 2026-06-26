import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CreditCard,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'

function NewOrderPOS({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [checkoutSaving, setCheckoutSaving] = useState(false)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [cart, setCart] = useState([])
  const [variationProduct, setVariationProduct] = useState(null)
  const [orderType, setOrderType] = useState('counter')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [tableName, setTableName] = useState('')
  const [discountAmount, setDiscountAmount] = useState('')
  const [extraAmount, setExtraAmount] = useState('')
  const [notes, setNotes] = useState('')

  const loadPOSData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data: categoryData, error: categoryError } = await supabase
      .from('menu_categories')
      .select('id, name')
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    const { data: productData, error: productError } = await supabase
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
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .eq('is_available', true)
      .order('created_at', { ascending: false })

    if (categoryError) {
      showToast({
        type: 'error',
        title: 'Categories loading failed',
        message: categoryError.message,
      })
    }

    if (productError) {
      showToast({
        type: 'error',
        title: 'Products loading failed',
        message: productError.message,
      })
    }

    setCategories(categoryData || [])
    setProducts(productData || [])
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadPOSData()
  }, [loadPOSData])

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

  const cartTotals = useMemo(() => {
    const subtotal = cart.reduce(
      (total, item) => total + Number(item.totalPrice || 0),
      0,
    )
    const discount = Number(discountAmount || 0)
    const extra = Number(extraAmount || 0)
    const total = Math.max(subtotal - discount + extra, 0)

    return {
      subtotal,
      discount,
      extra,
      total,
    }
  }, [cart, discountAmount, extraAmount])

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

  const clearCart = async () => {
    if (cart.length === 0) return

    const confirmed = await confirmAction({
      title: 'Clear cart?',
      message: 'All selected products will be removed from this order.',
      confirmText: 'Clear',
      cancelText: 'Keep',
      danger: true,
    })

    if (!confirmed) return

    setCart([])
  }

  const resetOrder = () => {
    setCart([])
    setOrderType('counter')
    setPaymentMethod('cash')
    setCustomerName('')
    setCustomerPhone('')
    setTableName('')
    setDiscountAmount('')
    setExtraAmount('')
    setNotes('')
  }

  const handleCheckout = async () => {
    if (!restaurant?.id) {
      showToast({
        type: 'warning',
        title: 'Restaurant missing',
        message: 'Restaurant profile is required before checkout.',
      })
      return
    }

    if (cart.length === 0) {
      showToast({
        type: 'warning',
        title: 'Cart is empty',
        message: 'Add at least one product before checkout.',
      })
      return
    }

    setCheckoutSaving(true)

    const { data: userData } = await supabase.auth.getUser()

    const { data: orderData, error: orderError } = await supabase
      .from('restaurant_orders')
      .insert({
        restaurant_id: restaurant.id,
        order_type: orderType,
        status: 'completed',
        payment_method: paymentMethod,
        payment_status: paymentMethod === 'cod' ? 'unpaid' : 'paid',
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        table_name: tableName.trim() || null,
        subtotal: cartTotals.subtotal,
        discount_amount: cartTotals.discount,
        extra_amount: cartTotals.extra,
        total_amount: cartTotals.total,
        currency: restaurant.currency || 'AED',
        notes: notes.trim() || null,
        created_by: userData?.user?.id || null,
      })
      .select('id, order_code')
      .single()

    if (orderError) {
      setCheckoutSaving(false)
      showToast({
        type: 'error',
        title: 'Checkout failed',
        message: orderError.message,
      })
      return
    }

    const { error: itemError } = await supabase
      .from('restaurant_order_items')
      .insert(
        cart.map((item) => ({
          order_id: orderData.id,
          restaurant_id: restaurant.id,
          item_id: item.itemId,
          variation_id: item.variationId,
          item_name: item.name,
          variation_name: item.variationName || null,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
        })),
      )

    setCheckoutSaving(false)

    if (itemError) {
      showToast({
        type: 'error',
        title: 'Order items failed',
        message: itemError.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Order completed',
      message: `${orderData.order_code} saved successfully.`,
    })

    resetOrder()
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
    <section className="pos-screen">
      <div className="pos-products-panel">
        <div className="pos-header">
          <div>
            <p className="pricing-label">New Order / POS</p>
            <h2>Counter order</h2>
            <span>
              Add products, choose variations, prepare the bill and checkout.
            </span>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={loadPOSData}
            disabled={loading}
          >
            <RefreshCw size={18} />
            Refresh
          </button>
        </div>

        <div className="pos-toolbar">
          <div className="search-box">
            <Search size={18} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, category, variation..."
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="all">All categories</option>
            <option value="none">No category</option>
            {categories.map((category) => (
              <option value={category.id} key={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="pos-category-strip">
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

        {loading ? (
          <div className="empty-state">Loading POS products...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state">
            No available products found. Enable products from Products / Items.
          </div>
        ) : (
          <div className="pos-product-grid">
            {filteredProducts.map((product) => (
              <button
                type="button"
                className="pos-product-card"
                key={product.id}
                onClick={() => handleProductClick(product)}
              >
                <div className="pos-product-image">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} />
                  ) : (
                    product.name.slice(0, 2).toUpperCase()
                  )}
                </div>

                <div>
                  <strong>{product.name}</strong>
                  <span>{product.category?.name || 'No category'}</span>
                </div>

                <p>
                  {product.has_variations ? 'From ' : ''}
                  {restaurant.currency || product.currency || 'AED'}{' '}
                  {Number(product.price || 0).toFixed(2)}
                </p>

                {product.has_variations && <small>Choose variation</small>}
              </button>
            ))}
          </div>
        )}
      </div>

      <aside className="pos-cart-panel">
        <div className="pos-cart-head">
          <div>
            <p className="pricing-label">Cart</p>
            <h3>Current order</h3>
          </div>

          <button type="button" className="tiny-button danger" onClick={clearCart}>
            <Trash2 size={15} />
            Clear
          </button>
        </div>

        <div className="pos-order-fields">
          <select value={orderType} onChange={(event) => setOrderType(event.target.value)}>
            <option value="counter">Counter</option>
            <option value="dine_in">Dine-in</option>
            <option value="delivery">Delivery</option>
          </select>

          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="cod">COD</option>
            <option value="online">Online</option>
          </select>

          {orderType === 'dine_in' && (
            <input
              type="text"
              value={tableName}
              onChange={(event) => setTableName(event.target.value)}
              placeholder="Table name / number"
            />
          )}

          {orderType !== 'counter' && (
            <>
              <input
                type="text"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Customer name"
              />
              <input
                type="tel"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="Customer phone"
              />
            </>
          )}
        </div>

        <div className="pos-cart-list">
          {cart.length === 0 ? (
            <div className="empty-state compact">Cart is empty.</div>
          ) : (
            cart.map((item) => (
              <div className="pos-cart-item" key={item.lineKey}>
                <div>
                  <strong>{item.name}</strong>
                  {item.variationName && <span>{item.variationName}</span>}
                  <p>
                    {restaurant.currency || 'AED'} {item.unitPrice.toFixed(2)}
                  </p>
                </div>

                <div className="pos-qty-control">
                  <button
                    type="button"
                    onClick={() =>
                      updateCartQuantity(item.lineKey, item.quantity - 1)
                    }
                  >
                    <Minus size={14} />
                  </button>

                  <strong>{item.quantity}</strong>

                  <button
                    type="button"
                    onClick={() =>
                      updateCartQuantity(item.lineKey, item.quantity + 1)
                    }
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pos-bill-adjustments">
          <label>
            Discount
            <input
              type="number"
              min="0"
              step="0.01"
              value={discountAmount}
              onChange={(event) => setDiscountAmount(event.target.value)}
              placeholder="0.00"
            />
          </label>

          <label>
            Extra amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={extraAmount}
              onChange={(event) => setExtraAmount(event.target.value)}
              placeholder="0.00"
            />
          </label>
        </div>

        <textarea
          className="pos-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Order notes"
          rows="3"
        />

        <div className="pos-total-box">
          <div>
            <span>Subtotal</span>
            <strong>
              {restaurant.currency || 'AED'} {cartTotals.subtotal.toFixed(2)}
            </strong>
          </div>

          <div>
            <span>Discount</span>
            <strong>- {cartTotals.discount.toFixed(2)}</strong>
          </div>

          <div>
            <span>Extra</span>
            <strong>+ {cartTotals.extra.toFixed(2)}</strong>
          </div>

          <div className="grand-total">
            <span>Total</span>
            <strong>
              {restaurant.currency || 'AED'} {cartTotals.total.toFixed(2)}
            </strong>
          </div>
        </div>

        <button
          type="button"
          className="primary-button pos-checkout-button"
          onClick={handleCheckout}
          disabled={checkoutSaving || cart.length === 0}
        >
          <CreditCard size={18} />
          {checkoutSaving ? 'Saving order...' : 'Checkout'}
        </button>
      </aside>

      {variationProduct && (
        <VariationModal
          product={variationProduct}
          currency={restaurant.currency || 'AED'}
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
    </section>
  )
}

function getAvailableVariations(product) {
  if (!Array.isArray(product.variations)) return []

  return [...product.variations]
    .filter((variation) => variation.is_available !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
}

function VariationModal({ product, currency, onClose, onChoose }) {
  const variations = getAvailableVariations(product)

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-variation-modal" onClick={(event) => event.stopPropagation()}>
        <div className="pos-modal-head">
          <div>
            <p className="pricing-label">Choose Variation</p>
            <h3>{product.name}</h3>
            <span>Select one option before adding to cart.</span>
          </div>

          <button type="button" className="tiny-button danger" onClick={onClose}>
            <X size={15} />
            Close
          </button>
        </div>

        <div className="variation-choice-grid">
          {variations.map((variation) => (
            <button
              type="button"
              key={variation.id}
              onClick={() => onChoose(variation)}
            >
              <strong>{variation.name}</strong>
              <span>
                {currency} {Number(variation.price || 0).toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default NewOrderPOS