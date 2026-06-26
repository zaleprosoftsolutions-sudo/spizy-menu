import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './NewOrderPOS.css'
import './POSModifiers.css'

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
  const [lastOrderSummary, setLastOrderSummary] = useState(null)

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

    const modifierGroupsByItem = await loadPOSModifierGroupsByItem(restaurant.id)

    const enrichedProducts = (productData || []).map((product) => ({
      ...product,
      modifierGroups: modifierGroupsByItem[product.id] || [],
    }))

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
    setProducts(enrichedProducts)
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
      const modifierNames = Array.isArray(product.modifierGroups)
        ? product.modifierGroups
            .map((group) =>
              [
                group.name,
                ...(Array.isArray(group.options)
                  ? group.options.map((option) => option.name)
                  : []),
              ].join(' '),
            )
            .join(' ')
        : ''

      return [
        product.name,
        product.description,
        product.category?.name,
        variationNames,
        modifierNames,
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
    const modifierGroups = getAvailableModifierGroups(product)

    if (
      (product.has_variations && variations.length > 0) ||
      modifierGroups.length > 0
    ) {
      setVariationProduct(product)
      return
    }

    addToCart({
      product,
      variation: null,
      unitPrice: Number(product.price || 0),
      modifiers: [],
    })
  }

  const addToCart = ({ product, variation, unitPrice, modifiers = [] }) => {
    const safeModifiers = Array.isArray(modifiers) ? modifiers : []
    const modifierKey = safeModifiers.length
      ? safeModifiers
          .map((modifier) => modifier.id)
          .sort()
          .join('-')
      : 'noaddons'
    const lineKey = `${product.id}-${variation?.id || 'base'}-${modifierKey}`
    const modifierTotal = safeModifiers.reduce(
      (total, modifier) => total + Number(modifier.priceDelta || 0),
      0,
    )
    const finalUnitPrice = roundPOSMoney(Number(unitPrice || 0) + modifierTotal)
    const modifierSummary = safeModifiers
      .map((modifier) => modifier.name)
      .join(', ')

    setCart((current) => {
      const existingLine = current.find((item) => item.lineKey === lineKey)

      if (existingLine) {
        return current.map((item) =>
          item.lineKey === lineKey
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: roundPOSMoney((item.quantity + 1) * item.unitPrice),
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
          modifierSummary,
          modifiers: safeModifiers,
          baseUnitPrice: Number(unitPrice || 0),
          modifierTotal,
          imageUrl: product.image_url,
          unitPrice: finalUnitPrice,
          quantity: 1,
          totalPrice: finalUnitPrice,
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
              totalPrice: roundPOSMoney(quantity * item.unitPrice),
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
          variation_name: buildOrderVariationName(item) || null,
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

    setLastOrderSummary({
      id: orderData.id,
      orderCode: orderData.order_code,
      restaurantName: restaurant.name,
      currency: restaurant.currency || 'AED',
      orderType,
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'unpaid' : 'paid',
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      tableName: tableName.trim(),
      notes: notes.trim(),
      items: cart.map((item) => ({ ...item })),
      subtotal: cartTotals.subtotal,
      discount: cartTotals.discount,
      extra: cartTotals.extra,
      total: cartTotals.total,
      received: 0,
      change: 0,
      balance: 0,
      createdAt: new Date().toISOString(),
    })

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

                {(product.has_variations ||
                  getAvailableModifierGroups(product).length > 0) && (
                  <small>
                    {product.has_variations &&
                    getAvailableModifierGroups(product).length > 0
                      ? 'Customize'
                      : product.has_variations
                        ? 'Choose variation'
                        : 'Add-ons available'}
                  </small>
                )}
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
          <select
            value={orderType}
            onChange={(event) => setOrderType(event.target.value)}
          >
            <option value="counter">Counter</option>
            <option value="dine_in">Dine-in</option>
            <option value="delivery">Delivery</option>
          </select>

          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
          >
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
                  {item.modifierSummary && (
                    <span className="pos-cart-addons">Add-ons: {item.modifierSummary}</span>
                  )}
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
  <label className="pos-adjust-field discount-field">
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

  <label className="pos-adjust-field extra-field">
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
        <POSCustomizeItemModal
          product={variationProduct}
          currency={restaurant.currency || 'AED'}
          onClose={() => setVariationProduct(null)}
          onWarning={(message) =>
            showToast({
              type: 'warning',
              title: 'Customize item',
              message,
            })
          }
          onAdd={({ variation, unitPrice, modifiers }) =>
            addToCart({
              product: variationProduct,
              variation,
              unitPrice,
              modifiers,
            })
          }
        />
      )}

      {lastOrderSummary && (
        <OrderSummaryModal
          order={lastOrderSummary}
          onClose={() => setLastOrderSummary(null)}
          onNewOrder={() => setLastOrderSummary(null)}
        />
      )}
    </section>
  )
}

async function loadPOSModifierGroupsByItem(restaurantId) {
  if (!restaurantId) return {}

  const { data: linkData, error: linkError } = await supabase
    .from('restaurant_item_modifier_groups')
    .select('item_id, group_id, sort_order')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })

  if (linkError || !Array.isArray(linkData) || linkData.length === 0) {
    return {}
  }

  const groupIds = [
    ...new Set(linkData.map((link) => link.group_id).filter(Boolean)),
  ]

  if (groupIds.length === 0) return {}

  const { data: groupData } = await supabase
    .from('restaurant_modifier_groups')
    .select(
      'id, name, description, selection_type, is_required, min_select, max_select, sort_order',
    )
    .eq('restaurant_id', restaurantId)
    .eq('is_deleted', false)
    .eq('is_active', true)
    .in('id', groupIds)
    .order('sort_order', { ascending: true })

  const { data: optionData } = await supabase
    .from('restaurant_modifier_options')
    .select('id, group_id, name, price_delta, is_default, is_available, sort_order')
    .eq('restaurant_id', restaurantId)
    .eq('is_deleted', false)
    .eq('is_available', true)
    .in('group_id', groupIds)
    .order('sort_order', { ascending: true })

  const optionsByGroup = (optionData || []).reduce((map, option) => {
    const optionGroupId = option.group_id

    if (!map[optionGroupId]) map[optionGroupId] = []

    map[optionGroupId].push({
      id: option.id,
      name: option.name,
      priceDelta: Number(option.price_delta || 0),
      isDefault: Boolean(option.is_default),
      sortOrder: Number(option.sort_order || 0),
    })

    return map
  }, {})

  const groupsById = (groupData || []).reduce((map, group) => {
    map[group.id] = {
      id: group.id,
      name: group.name,
      description: group.description || '',
      selectionType: group.selection_type || 'single',
      isRequired: Boolean(group.is_required),
      minSelect: Number(group.min_select || 0),
      maxSelect: Number(group.max_select || 1),
      sortOrder: Number(group.sort_order || 0),
      options: optionsByGroup[group.id] || [],
    }

    return map
  }, {})

  return linkData.reduce((map, link) => {
    const group = groupsById[link.group_id]

    if (!group || group.options.length === 0) return map

    if (!map[link.item_id]) map[link.item_id] = []

    map[link.item_id].push({
      ...group,
      itemSortOrder: Number(link.sort_order || 0),
    })

    map[link.item_id].sort(
      (first, second) =>
        Number(first.itemSortOrder || 0) - Number(second.itemSortOrder || 0),
    )

    return map
  }, {})
}

function getAvailableVariations(product) {
  if (!Array.isArray(product.variations)) return []

  return [...product.variations]
    .filter((variation) => variation.is_available !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
}

function getAvailableModifierGroups(product) {
  if (!Array.isArray(product.modifierGroups)) return []

  return [...product.modifierGroups]
    .filter((group) => Array.isArray(group.options) && group.options.length > 0)
    .sort(
      (first, second) =>
        Number(first.itemSortOrder ?? first.sortOrder ?? 0) -
        Number(second.itemSortOrder ?? second.sortOrder ?? 0),
    )
}

function buildDefaultModifierSelection(groups) {
  return groups.reduce((selection, group) => {
    const defaultOptions = (group.options || []).filter(
      (option) => option.isDefault,
    )

    if (group.selectionType === 'single') {
      selection[group.id] = defaultOptions[0]?.id || ''
      return selection
    }

    const maxSelect = Number(group.maxSelect || 0)
    const selectedDefaults = defaultOptions.map((option) => option.id)

    selection[group.id] =
      maxSelect > 0 ? selectedDefaults.slice(0, maxSelect) : selectedDefaults

    return selection
  }, {})
}

function getSelectedModifierOptions(groups, selection) {
  return groups.flatMap((group) => {
    const selectedValue = selection[group.id]

    if (group.selectionType === 'single') {
      const selectedOption = (group.options || []).find(
        (option) => option.id === selectedValue,
      )

      return selectedOption ? [selectedOption] : []
    }

    const selectedIds = Array.isArray(selectedValue) ? selectedValue : []

    return (group.options || []).filter((option) =>
      selectedIds.includes(option.id),
    )
  })
}

function getModifierMinSelect(group) {
  return Math.max(group.isRequired ? 1 : 0, Number(group.minSelect || 0))
}

function validateModifierSelection(groups, selection) {
  for (const group of groups) {
    const selectedValue = selection[group.id]
    const selectedCount = Array.isArray(selectedValue)
      ? selectedValue.length
      : selectedValue
        ? 1
        : 0
    const minSelect = getModifierMinSelect(group)
    const maxSelect = Number(group.maxSelect || 0)

    if (selectedCount < minSelect) {
      return `Please choose ${group.name}.`
    }

    if (maxSelect > 0 && selectedCount > maxSelect) {
      return `Choose only ${maxSelect} option${maxSelect === 1 ? '' : 's'} for ${group.name}.`
    }
  }

  return ''
}

function buildOrderVariationName(item) {
  return [item.variationName, item.modifierSummary].filter(Boolean).join(' • ')
}

function roundPOSMoney(value) {
  return Number(Number(value || 0).toFixed(2))
}

function POSCustomizeItemModal({ product, currency, onClose, onAdd, onWarning }) {
  const variations = getAvailableVariations(product)
  const modifierGroups = getAvailableModifierGroups(product)
  const [selectedVariationId, setSelectedVariationId] = useState(
    variations[0]?.id || null,
  )
  const [selectedModifiers, setSelectedModifiers] = useState(() =>
    buildDefaultModifierSelection(modifierGroups),
  )

  const selectedVariation = variations.find(
    (variation) => variation.id === selectedVariationId,
  )
  const baseUnitPrice = Number(selectedVariation?.price ?? product.price ?? 0)
  const selectedModifierOptions = getSelectedModifierOptions(
    modifierGroups,
    selectedModifiers,
  )
  const modifierTotal = selectedModifierOptions.reduce(
    (total, option) => total + Number(option.priceDelta || 0),
    0,
  )
  const finalUnitPrice = roundPOSMoney(baseUnitPrice + modifierTotal)

  const toggleModifierOption = (group, option) => {
    setSelectedModifiers((current) => {
      if (group.selectionType === 'single') {
        return {
          ...current,
          [group.id]: current[group.id] === option.id ? '' : option.id,
        }
      }

      const currentValues = Array.isArray(current[group.id])
        ? current[group.id]
        : []
      const alreadySelected = currentValues.includes(option.id)

      if (alreadySelected) {
        return {
          ...current,
          [group.id]: currentValues.filter((optionId) => optionId !== option.id),
        }
      }

      const maxSelect = Number(group.maxSelect || 0)

      if (maxSelect > 0 && currentValues.length >= maxSelect) {
        onWarning?.(
          `You can choose only ${maxSelect} option${
            maxSelect === 1 ? '' : 's'
          } for ${group.name}.`,
        )
        return current
      }

      return {
        ...current,
        [group.id]: [...currentValues, option.id],
      }
    })
  }

  const handleAddCustomizedItem = () => {
    const validationMessage = validateModifierSelection(
      modifierGroups,
      selectedModifiers,
    )

    if (validationMessage) {
      onWarning?.(validationMessage)
      return
    }

    onAdd({
      variation: selectedVariation || null,
      unitPrice: baseUnitPrice,
      modifiers: selectedModifierOptions,
    })
  }

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div
        className="pos-variation-modal pos-customize-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pos-modal-head">
          <div>
            <p className="pricing-label">Customize Item</p>
            <h3>{product.name}</h3>
            <span>
              Choose variation, spice level, sauces, toppings or extras.
            </span>
          </div>

          <button type="button" className="tiny-button danger" onClick={onClose}>
            <X size={15} />
            Close
          </button>
        </div>

        {variations.length > 0 && (
          <section className="pos-customize-section">
            <div className="pos-customize-section-head">
              <div>
                <strong>Choose option</strong>
                <span>Select one variation</span>
              </div>
            </div>

            <div className="variation-choice-grid pos-option-choice-grid">
              {variations.map((variation) => (
                <button
                  type="button"
                  key={variation.id}
                  className={
                    selectedVariationId === variation.id ? 'selected' : ''
                  }
                  onClick={() => setSelectedVariationId(variation.id)}
                >
                  <strong>{variation.name}</strong>
                  <span>
                    {currency} {Number(variation.price || 0).toFixed(2)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {modifierGroups.map((group) => {
          const selectedValue = selectedModifiers[group.id]
          const selectedCount = Array.isArray(selectedValue)
            ? selectedValue.length
            : selectedValue
              ? 1
              : 0
          const minSelect = getModifierMinSelect(group)
          const maxSelect = Number(group.maxSelect || 0)

          return (
            <section className="pos-customize-section" key={group.id}>
              <div className="pos-customize-section-head">
                <div>
                  <strong>{group.name}</strong>
                  {group.description && <span>{group.description}</span>}
                </div>

                <small>
                  {group.selectionType === 'single'
                    ? group.isRequired
                      ? 'Required'
                      : 'Optional'
                    : `${selectedCount}/${maxSelect || '∞'} selected`}
                </small>
              </div>

              <div className="pos-modifier-option-list">
                {(group.options || []).map((option) => {
                  const isSelected =
                    group.selectionType === 'single'
                      ? selectedValue === option.id
                      : Array.isArray(selectedValue) &&
                        selectedValue.includes(option.id)

                  return (
                    <button
                      type="button"
                      key={option.id}
                      className={isSelected ? 'selected' : ''}
                      onClick={() => toggleModifierOption(group, option)}
                    >
                      <span>
                        <strong>{option.name}</strong>
                        {option.priceDelta > 0 ? (
                          <small>
                            +{currency}{' '}
                            {Number(option.priceDelta || 0).toFixed(2)}
                          </small>
                        ) : (
                          <small>Included</small>
                        )}
                      </span>

                      <i>
                        {isSelected
                          ? '✓'
                          : group.selectionType === 'single'
                            ? '○'
                            : '+'}
                      </i>
                    </button>
                  )
                })}
              </div>

              {minSelect > 0 && selectedCount < minSelect && (
                <p className="pos-modifier-hint">
                  Choose at least {minSelect} option{minSelect === 1 ? '' : 's'}.
                </p>
              )}
            </section>
          )
        })}

        <div className="pos-customize-footer">
          <div>
            <span>Total per item</span>
            <strong>
              {currency} {Number(finalUnitPrice || 0).toFixed(2)}
            </strong>
          </div>

          <button type="button" className="primary-button" onClick={handleAddCustomizedItem}>
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  )
}

function OrderSummaryModal({ order, onClose, onNewOrder }) {
  const [summaryReceivedAmount, setSummaryReceivedAmount] = useState('')

  const summaryCash = useMemo(() => {
    const received = Number(summaryReceivedAmount || 0)
    const change = Math.max(received - Number(order.total || 0), 0)
    const balance = Math.max(Number(order.total || 0) - received, 0)

    return {
      received,
      change,
      balance,
    }
  }, [order.total, summaryReceivedAmount])

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=420,height=720')

    if (!printWindow) return

    printWindow.document.write(buildReceiptHtml(order))
    printWindow.document.close()
    printWindow.focus()

    setTimeout(() => {
      printWindow.print()
    }, 250)
  }

  return (
    <div className="order-summary-overlay" onClick={onClose}>
      <div
        className="order-summary-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="order-summary-head">
          <div>
            <p className="pricing-label">Order Summary</p>
            <h3>{order.orderCode}</h3>
            <span>
              {formatOrderType(order.orderType)} •{' '}
              {formatPaymentMethod(order.paymentMethod)}
            </span>
          </div>

          <div
            className={`payment-status-pill ${
              order.paymentStatus === 'paid' ? 'paid' : 'unpaid'
            }`}
          >
            <CheckCircle2 size={18} />
            {order.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
          </div>
        </div>

        <div className="receipt-preview">
          <div className="receipt-center">
            <strong>{order.restaurantName || 'Spizy Restaurant'}</strong>
            <span>Thermal Receipt Preview</span>
          </div>

          <div className="receipt-dashed-line" />

          <div className="receipt-row">
            <span>Order</span>
            <strong>{order.orderCode}</strong>
          </div>

          <div className="receipt-row">
            <span>Date</span>
            <strong>{formatDateTime(order.createdAt)}</strong>
          </div>

          <div className="receipt-row">
            <span>Payment</span>
            <strong>{formatPaymentMethod(order.paymentMethod)}</strong>
          </div>

          {order.tableName && (
            <div className="receipt-row">
              <span>Table</span>
              <strong>{order.tableName}</strong>
            </div>
          )}

          {order.customerName && (
            <div className="receipt-row">
              <span>Customer</span>
              <strong>{order.customerName}</strong>
            </div>
          )}

          <div className="receipt-dashed-line" />

          <div className="receipt-items">
            {order.items.map((item) => (
              <div className="receipt-item" key={item.lineKey}>
                <div>
                  <strong>{item.name}</strong>
                  {item.variationName && <span>{item.variationName}</span>}
                  {item.modifierSummary && <span>Add-ons: {item.modifierSummary}</span>}
                  <small>
                    {item.quantity} × {formatMoney(order.currency, item.unitPrice)}
                  </small>
                </div>

                <strong>{formatMoney(order.currency, item.totalPrice)}</strong>
              </div>
            ))}
          </div>

          <div className="receipt-dashed-line" />

          <div className="receipt-row">
            <span>Subtotal</span>
            <strong>{formatMoney(order.currency, order.subtotal)}</strong>
          </div>

          <div className="receipt-row">
            <span>Discount</span>
            <strong>- {formatMoney(order.currency, order.discount)}</strong>
          </div>

          <div className="receipt-row">
            <span>Extra</span>
            <strong>+ {formatMoney(order.currency, order.extra)}</strong>
          </div>

          <div className="receipt-total-row">
            <span>Total</span>
            <strong>{formatMoney(order.currency, order.total)}</strong>
          </div>

          <div className="receipt-dashed-line" />

          <div className="receipt-center">
            <span>Thank you. Powered by Spizy Menu.</span>
          </div>
        </div>

        {order.paymentMethod === 'cash' && (
          <div className="cash-helper-card">
            <div>
              <p className="pricing-label">Cashier Helper</p>
              <h4>Balance calculation</h4>
              <span>
                This is only for staff calculation. It will not print on the customer bill.
              </span>
            </div>

            <label>
              Cash received
              <input
                type="number"
                min="0"
                step="0.01"
                value={summaryReceivedAmount}
                onChange={(event) => setSummaryReceivedAmount(event.target.value)}
                placeholder="Example: 100.00"
              />
            </label>

            {summaryCash.received > 0 && (
              <div
                className={`cash-helper-result ${
                  summaryCash.balance > 0 ? 'balance' : 'change'
                }`}
              >
                <span>
                  {summaryCash.balance > 0 ? 'Balance due' : 'Change to give'}
                </span>
                <strong>
                  {formatMoney(
                    order.currency,
                    summaryCash.balance > 0
                      ? summaryCash.balance
                      : summaryCash.change,
                  )}
                </strong>
              </div>
            )}
          </div>
        )}

        <div className="order-summary-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            <X size={18} />
            Close
          </button>

          <button type="button" className="secondary-button" onClick={handlePrint}>
            <Printer size={18} />
            Print
          </button>

          <button type="button" className="primary-button" onClick={onNewOrder}>
            <ReceiptText size={18} />
            New Order
          </button>
        </div>
      </div>
    </div>
  )
}

function formatMoney(currency, amount) {
  return `${currency || 'AED'} ${Number(amount || 0).toFixed(2)}`
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('en-AE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
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

function buildReceiptHtml(order) {
  const itemsHtml = order.items
    .map(
      (item) => `
        <div class="item">
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            ${
              item.variationName
                ? `<span>${escapeHtml(item.variationName)}</span>`
                : ''
            }
            ${
              item.modifierSummary
                ? `<span>Add-ons: ${escapeHtml(item.modifierSummary)}</span>`
                : ''
            }
            <small>${item.quantity} x ${formatMoney(
              order.currency,
              item.unitPrice,
            )}</small>
          </div>
          <strong>${formatMoney(order.currency, item.totalPrice)}</strong>
        </div>
      `,
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(order.orderCode)}</title>
        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 12px;
            background: #ffffff;
            color: #000000;
            font-family: Arial, sans-serif;
          }

          .receipt {
            width: 80mm;
            max-width: 100%;
            margin: 0 auto;
            font-size: 12px;
          }

          .center {
            text-align: center;
          }

          .center strong {
            display: block;
            font-size: 16px;
          }

          .line {
            border-top: 1px dashed #000;
            margin: 10px 0;
          }

          .row,
          .item,
          .total {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            margin: 6px 0;
          }

          .item span,
          .item small {
            display: block;
            margin-top: 2px;
          }

          .total {
            border-top: 1px solid #000;
            padding-top: 8px;
            font-size: 16px;
            font-weight: 800;
          }

          @media print {
            body {
              padding: 0;
            }

            .receipt {
              width: 80mm;
            }
          }
        </style>
      </head>

      <body>
        <div class="receipt">
          <div class="center">
            <strong>${escapeHtml(order.restaurantName || 'Spizy Restaurant')}</strong>
            <span>${escapeHtml(order.orderCode)}</span>
          </div>

          <div class="line"></div>

          <div class="row">
            <span>Date</span>
            <strong>${formatDateTime(order.createdAt)}</strong>
          </div>

          <div class="row">
            <span>Type</span>
            <strong>${formatOrderType(order.orderType)}</strong>
          </div>

          <div class="row">
            <span>Payment</span>
            <strong>${formatPaymentMethod(order.paymentMethod)}</strong>
          </div>

          <div class="row">
            <span>Status</span>
            <strong>${order.paymentStatus === 'paid' ? 'PAID' : 'UNPAID'}</strong>
          </div>

          <div class="line"></div>

          ${itemsHtml}

          <div class="line"></div>

          <div class="row">
            <span>Subtotal</span>
            <strong>${formatMoney(order.currency, order.subtotal)}</strong>
          </div>

          <div class="row">
            <span>Discount</span>
            <strong>- ${formatMoney(order.currency, order.discount)}</strong>
          </div>

          <div class="row">
            <span>Extra</span>
            <strong>+ ${formatMoney(order.currency, order.extra)}</strong>
          </div>

          <div class="total">
            <span>Total</span>
            <strong>${formatMoney(order.currency, order.total)}</strong>
          </div>


          <div class="line"></div>

          <div class="center">
            <span>Thank you</span><br />
            <span>Powered by Spizy Menu</span>
          </div>
        </div>
      </body>
    </html>
  `
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export default NewOrderPOS