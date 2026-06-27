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
import './POSGiftVoucher.css'
import './POSComboDeals.css'
import './POSMenuSchedule.css'

function NewOrderPOS({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [checkoutSaving, setCheckoutSaving] = useState(false)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [comboDeals, setComboDeals] = useState([])
  const [menuSchedules, setMenuSchedules] = useState([])
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
  const [giftVoucherCode, setGiftVoucherCode] = useState('')
  const [appliedGiftVoucher, setAppliedGiftVoucher] = useState(null)
  const [giftVoucherApplying, setGiftVoucherApplying] = useState(false)
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

    const { data: comboData, error: comboError } = await supabase
      .from('restaurant_combo_deals')
      .select(`
        id,
        combo_name,
        combo_code,
        description,
        bundle_price,
        discount_percentage,
        discount_amount,
        start_at,
        end_at,
        sort_order,
        is_active,
        is_public,
        items:restaurant_combo_deal_items (
          id,
          menu_item_id,
          variation_id,
          quantity,
          group_name,
          sort_order,
          item:menu_items (
            id,
            name,
            image_url,
            price,
            category_id,
            is_available,
            is_deleted
          ),
          variation:menu_item_variations (
            id,
            name,
            price,
            is_available
          )
        )
      `)
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(20)

    const { data: scheduleData, error: scheduleError } = await supabase
      .from('restaurant_menu_schedules')
      .select(`
        id,
        schedule_name,
        schedule_type,
        applies_to,
        item_id,
        category_id,
        days_of_week,
        start_time,
        end_time,
        start_date,
        end_date,
        special_price,
        discount_percent,
        banner_note,
        is_active
      `)
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    const modifierGroupsByItem = await loadPOSModifierGroupsByItem(restaurant.id)

    const productsWithModifiers = (productData || []).map((product) => ({
      ...product,
      modifierGroups: modifierGroupsByItem[product.id] || [],
    }))

    const enrichedProducts = applyPOSMenuSchedulesToProducts(
      productsWithModifiers,
      scheduleData || [],
    )

    const enrichedComboDeals = normalizePOSComboDeals(
      applyPOSMenuSchedulesToCombos(comboData || [], scheduleData || []),
    )

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

    if (comboError) {
      showToast({
        type: 'error',
        title: 'Combo deals loading failed',
        message: comboError.message,
      })
    }

    if (scheduleError) {
      showToast({
        type: 'error',
        title: 'Menu schedule loading failed',
        message: scheduleError.message,
      })
    }

    setCategories(categoryData || [])
    setProducts(enrichedProducts)
    setComboDeals(enrichedComboDeals)
    setMenuSchedules(scheduleData || [])
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadPOSData()
  }, [loadPOSData])

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return products.filter((product) => {
      if (product.posSchedule?.isHidden) return false

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

  const filteredComboDeals = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return comboDeals

    return comboDeals.filter((combo) => {
      const comboItems = getAvailablePOSComboItems(combo)
      const comboItemNames = comboItems
        .map((item) => [item.itemName, item.variationName, item.groupName].join(' '))
        .join(' ')

      return [
        combo.combo_name,
        combo.combo_code,
        combo.description,
        comboItemNames,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [comboDeals, search])

  const activeMenuScheduleNotices = useMemo(
    () => getPOSActiveMenuScheduleNotices(menuSchedules),
    [menuSchedules],
  )

  const cartTotals = useMemo(() => {
    const subtotal = cart.reduce(
      (total, item) => total + Number(item.totalPrice || 0),
      0,
    )
    const discount = Number(discountAmount || 0)
    const extra = Number(extraAmount || 0)
    const totalBeforeVoucher = Math.max(subtotal - discount + extra, 0)
    const giftVoucherDiscount = appliedGiftVoucher
      ? Math.min(
          Number(appliedGiftVoucher.discountAmount || 0),
          Number(totalBeforeVoucher || 0),
        )
      : 0
    const total = Math.max(totalBeforeVoucher - giftVoucherDiscount, 0)

    return {
      subtotal,
      discount,
      extra,
      totalBeforeVoucher,
      giftVoucherDiscount,
      total,
    }
  }, [appliedGiftVoucher, cart, discountAmount, extraAmount])

  useEffect(() => {
    if (cart.length === 0 && appliedGiftVoucher) {
      setAppliedGiftVoucher(null)
      setGiftVoucherCode('')
    }
  }, [appliedGiftVoucher, cart.length])

  const handleProductClick = (product) => {
    if (!isPOSProductScheduleOrderable(product)) {
      showToast({
        type: 'warning',
        title: 'Item not available now',
        message: getPOSScheduleUnavailableMessage(product),
      })
      return
    }

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
      unitPrice: getPOSScheduledPrice(product, Number(product.price || 0)),
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

  const addComboToCart = (combo) => {
    const comboItems = getAvailablePOSComboItems(combo)

    if (comboItems.length === 0) {
      showToast({
        type: 'warning',
        title: 'Combo unavailable',
        message: 'This combo has no available items right now.',
      })
      return
    }

    const lineKey = `combo-${combo.id}`
    const unitPrice = roundPOSMoney(Number(combo.bundle_price || 0))
    const comboSummary = buildPOSComboSummary(comboItems)

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
          isCombo: true,
          comboId: combo.id,
          comboCode: combo.combo_code || '',
          itemId: comboItems[0]?.itemId || null,
          variationId: comboItems[0]?.variationId || null,
          name: combo.combo_name,
          variationName: combo.combo_code ? `Combo ${combo.combo_code}` : 'Combo deal',
          comboSummary,
          comboItems,
          modifierSummary: '',
          modifiers: [],
          baseUnitPrice: unitPrice,
          modifierTotal: 0,
          imageUrl: comboItems[0]?.imageUrl || '',
          unitPrice,
          quantity: 1,
          totalPrice: unitPrice,
        },
      ]
    })

    showToast({
      type: 'success',
      title: 'Combo added',
      message: `${combo.combo_name} added to POS cart.`,
    })
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

  const handleApplyGiftVoucher = async () => {
    if (!restaurant?.id) return

    const cleanCode = giftVoucherCode.trim().toUpperCase()

    if (!cleanCode) {
      showToast({
        type: 'warning',
        title: 'Gift voucher',
        message: 'Enter gift voucher code.',
      })
      return
    }

    if (cart.length === 0) {
      showToast({
        type: 'warning',
        title: 'Cart is empty',
        message: 'Add items before applying a gift voucher.',
      })
      return
    }

    if (Number(cartTotals.totalBeforeVoucher || 0) <= 0) {
      showToast({
        type: 'warning',
        title: 'Gift voucher',
        message: 'Gift voucher cannot be applied to a zero total.',
      })
      return
    }

    setGiftVoucherApplying(true)

    const { data, error } = await supabase.rpc('validate_pos_gift_voucher', {
      p_restaurant_id: restaurant.id,
      p_voucher_code: cleanCode,
      p_order_total: cartTotals.totalBeforeVoucher,
      p_customer_phone: customerPhone.trim() || null,
    })

    setGiftVoucherApplying(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Gift voucher failed',
        message: error.message,
      })
      return
    }

    setAppliedGiftVoucher({
      id: data?.voucher_id || null,
      code: data?.voucher_code || cleanCode,
      title: data?.title || 'Gift Voucher',
      balanceAmount: Number(data?.balance_amount || 0),
      discountAmount: Number(data?.discount_amount || 0),
      remainingAfterUse: Number(data?.remaining_after_use || 0),
    })
    setGiftVoucherCode(data?.voucher_code || cleanCode)

    showToast({
      type: 'success',
      title: 'Gift voucher applied',
      message: data?.message || 'Gift voucher applied successfully.',
    })
  }

  const handleRemoveGiftVoucher = () => {
    setAppliedGiftVoucher(null)
    setGiftVoucherCode('')
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
    setGiftVoucherCode('')
    setAppliedGiftVoucher(null)
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

    const { data, error } = await supabase.rpc('create_pos_order_with_gift_voucher', {
      p_restaurant_id: restaurant.id,
      p_order_type: orderType,
      p_payment_method: paymentMethod,
      p_customer_name: customerName.trim() || null,
      p_customer_phone: customerPhone.trim() || null,
      p_table_name: tableName.trim() || null,
      p_currency: restaurant.currency || 'AED',
      p_notes: notes.trim() || null,
      p_subtotal: cartTotals.subtotal,
      p_discount_amount: cartTotals.discount,
      p_extra_amount: cartTotals.extra,
      p_total_before_voucher: cartTotals.totalBeforeVoucher,
      p_gift_voucher_code: appliedGiftVoucher?.code || null,
      p_items: expandPOSCartItemsForOrder(cart),
    })

    setCheckoutSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Checkout failed',
        message: error.message,
      })
      return
    }

    const orderResult = Array.isArray(data) ? data[0] : data

    setLastOrderSummary({
      id: orderResult?.order_id,
      orderCode: orderResult?.order_code || 'Order saved',
      restaurantName: restaurant.name,
      currency: restaurant.currency || 'AED',
      orderType,
      paymentMethod,
      paymentStatus: orderResult?.payment_status || (paymentMethod === 'cod' ? 'unpaid' : 'paid'),
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      tableName: tableName.trim(),
      notes: notes.trim(),
      items: cart.map((item) => ({ ...item })),
      subtotal: cartTotals.subtotal,
      discount: cartTotals.discount,
      extra: cartTotals.extra,
      giftVoucherCode: orderResult?.gift_voucher_code || appliedGiftVoucher?.code || '',
      giftVoucherDiscount: Number(orderResult?.gift_voucher_discount_amount ?? cartTotals.giftVoucherDiscount ?? 0),
      totalBeforeVoucher: cartTotals.totalBeforeVoucher,
      total: Number(orderResult?.total_amount ?? cartTotals.total),
      received: 0,
      change: 0,
      balance: 0,
      createdAt: new Date().toISOString(),
    })

    showToast({
      type: 'success',
      title: 'Order completed',
      message: `${orderResult?.order_code || 'Order'} saved successfully.`,
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
              placeholder="Search product, combo, category, variation..."
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

        {!loading && activeMenuScheduleNotices.length > 0 && (
          <POSMenuScheduleNotice notices={activeMenuScheduleNotices} />
        )}

        {!loading && filteredComboDeals.length > 0 && (
          <POSComboDealsSection
            combos={filteredComboDeals}
            currency={restaurant.currency || 'AED'}
            onAddCombo={addComboToCart}
          />
        )}

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
                className={`pos-product-card ${
                  product.posSchedule?.isUnavailable ? 'schedule-unavailable' : ''
                }`}
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

                <p className={product.posSchedule?.pricingRuleType ? 'pos-scheduled-price-row' : ''}>
                  {product.has_variations ? 'From ' : ''}
                  {restaurant.currency || product.currency || 'AED'}{' '}
                  {Number(getPOSScheduledPrice(product, Number(product.price || 0))).toFixed(2)}
                  {product.posSchedule?.pricingRuleType && (
                    <small>{Number(product.price || 0).toFixed(2)}</small>
                  )}
                </p>

                {product.posSchedule?.badge && (
                  <span className={`pos-schedule-product-badge ${product.posSchedule.badgeType || ''}`}>
                    {product.posSchedule.badge}
                  </span>
                )}

                {product.posSchedule?.isUnavailable ? (
                  <small>Not available now</small>
                ) : (product.has_variations ||
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
                  {item.comboSummary && (
                    <span className="pos-cart-addons combo">Includes: {item.comboSummary}</span>
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

        <POSGiftVoucherBox
          currency={restaurant.currency || 'AED'}
          code={giftVoucherCode}
          appliedVoucher={appliedGiftVoucher}
          applying={giftVoucherApplying}
          voucherDiscountAmount={cartTotals.giftVoucherDiscount}
          totalBeforeVoucher={cartTotals.totalBeforeVoucher}
          onCodeChange={(value) => setGiftVoucherCode(value.toUpperCase())}
          onApply={handleApplyGiftVoucher}
          onRemove={handleRemoveGiftVoucher}
        />

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


          {cartTotals.giftVoucherDiscount > 0 && (
            <div className="pos-voucher-total-row">
              <span>Gift voucher</span>
              <strong>- {restaurant.currency || 'AED'} {cartTotals.giftVoucherDiscount.toFixed(2)}</strong>
            </div>
          )}

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


function applyPOSMenuSchedulesToProducts(products, schedules) {
  const now = new Date()
  const safeSchedules = Array.isArray(schedules) ? schedules : []

  return (products || []).map((product) => {
    const matchingSchedules = safeSchedules.filter((schedule) =>
      posScheduleAppliesToProduct(schedule, product),
    )

    const liveSchedules = matchingSchedules.filter((schedule) =>
      isPOSScheduleLiveNow(schedule, now),
    )

    const liveHideRule = liveSchedules.find(
      (schedule) => schedule.schedule_type === 'hide_item',
    )

    if (liveHideRule) {
      return {
        ...product,
        posSchedule: {
          isHidden: true,
          isUnavailable: true,
          isOrderable: false,
          badge: liveHideRule.banner_note || 'Hidden now',
          badgeType: 'hidden',
          shortLabel: 'Hidden now',
          unavailableMessage: liveHideRule.banner_note || 'This item is hidden by menu schedule.',
        },
      }
    }

    const availabilityRules = matchingSchedules.filter(
      (schedule) =>
        schedule.schedule_type === 'availability' &&
        isPOSScheduleDateRelevant(schedule, now),
    )
    const liveAvailabilityRule = availabilityRules.find((schedule) =>
      isPOSScheduleLiveNow(schedule, now),
    )

    if (availabilityRules.length > 0 && !liveAvailabilityRule) {
      const nextRule = availabilityRules[0]
      return {
        ...product,
        posSchedule: {
          isHidden: false,
          isUnavailable: true,
          isOrderable: false,
          badge:
            nextRule.banner_note ||
            `Available ${getPOSScheduleTimeText(nextRule)}`,
          badgeType: 'time',
          shortLabel: 'Not now',
          unavailableMessage:
            nextRule.banner_note ||
            `${product.name} is available only ${getPOSScheduleDaysText(nextRule)} ${getPOSScheduleTimeText(nextRule)}.`,
        },
      }
    }

    const liveSpecialPriceRules = liveSchedules
      .filter(
        (schedule) =>
          schedule.schedule_type === 'special_price' &&
          Number(schedule.special_price || 0) >= 0,
      )
      .sort((a, b) => Number(a.special_price || 0) - Number(b.special_price || 0))
    const liveHappyHourRules = liveSchedules
      .filter(
        (schedule) =>
          schedule.schedule_type === 'happy_hour' &&
          Number(schedule.discount_percent || 0) > 0,
      )
      .sort(
        (a, b) =>
          Number(b.discount_percent || 0) - Number(a.discount_percent || 0),
      )

    const specialRule = liveSpecialPriceRules[0]
    const happyRule = liveHappyHourRules[0]
    const timingRule = liveAvailabilityRule

    if (specialRule) {
      return {
        ...product,
        posSchedule: {
          isHidden: false,
          isUnavailable: false,
          isOrderable: true,
          badge:
            specialRule.banner_note ||
            `Special price ${getPOSScheduleTimeText(specialRule)}`,
          badgeType: 'special',
          shortLabel: 'Special price',
          specialPrice: Number(specialRule.special_price || 0),
          pricingRuleType: 'special_price',
        },
      }
    }

    if (happyRule) {
      return {
        ...product,
        posSchedule: {
          isHidden: false,
          isUnavailable: false,
          isOrderable: true,
          badge:
            happyRule.banner_note ||
            `${Number(happyRule.discount_percent || 0).toFixed(0)}% happy hour`,
          badgeType: 'discount',
          shortLabel: 'Happy hour',
          discountPercent: Number(happyRule.discount_percent || 0),
          pricingRuleType: 'happy_hour',
        },
      }
    }

    if (timingRule) {
      return {
        ...product,
        posSchedule: {
          isHidden: false,
          isUnavailable: false,
          isOrderable: true,
          badge: timingRule.banner_note || `Available now until ${normalizePOSScheduleTime(timingRule.end_time)}`,
          badgeType: 'available',
          shortLabel: 'Available now',
        },
      }
    }

    return {
      ...product,
      posSchedule: {
        isHidden: false,
        isUnavailable: false,
        isOrderable: true,
      },
    }
  })
}

function applyPOSMenuSchedulesToCombos(combos, schedules) {
  return (combos || []).map((combo) => ({
    ...combo,
    items: (combo.items || []).map((comboItem) => {
      if (!comboItem.item) return comboItem

      const scheduledItem = applyPOSMenuSchedulesToProducts(
        [comboItem.item],
        schedules,
      )[0]

      return {
        ...comboItem,
        item: scheduledItem,
        scheduleUnavailable: !isPOSProductScheduleOrderable(scheduledItem),
      }
    }),
  }))
}

function getPOSActiveMenuScheduleNotices(schedules) {
  const now = new Date()

  return (Array.isArray(schedules) ? schedules : [])
    .filter((schedule) => isPOSScheduleLiveNow(schedule, now))
    .filter((schedule) =>
      ['all_menu', 'category'].includes(String(schedule.applies_to || '')),
    )
    .slice(0, 3)
    .map((schedule) => ({
      title:
        schedule.banner_note ||
        schedule.schedule_name ||
        getPOSScheduleTypeLabel(schedule.schedule_type),
      text: `${getPOSScheduleTypeLabel(schedule.schedule_type)} • ${getPOSScheduleTimeText(schedule)}`,
    }))
}

function isPOSProductScheduleOrderable(product) {
  if (!product?.posSchedule) return true
  return product.posSchedule.isOrderable !== false
}

function getPOSScheduleUnavailableMessage(product) {
  return (
    product?.posSchedule?.unavailableMessage ||
    product?.posSchedule?.badge ||
    'This item is not available right now.'
  )
}

function getPOSScheduledPrice(product, unitPrice) {
  const normalPrice = Number(unitPrice || 0)
  const schedule = product?.posSchedule || {}

  if (schedule.pricingRuleType === 'special_price') {
    return roundPOSMoney(Number(schedule.specialPrice || 0))
  }

  if (schedule.pricingRuleType === 'happy_hour') {
    const discountPercent = Math.min(
      100,
      Math.max(0, Number(schedule.discountPercent || 0)),
    )
    return roundPOSMoney(normalPrice * (1 - discountPercent / 100))
  }

  return roundPOSMoney(normalPrice)
}

function posScheduleAppliesToProduct(schedule, product) {
  if (!schedule || !product) return false

  if (schedule.applies_to === 'all_menu') return true
  if (schedule.applies_to === 'item') return schedule.item_id === product.id
  if (schedule.applies_to === 'category') {
    return Boolean(product.category_id && schedule.category_id === product.category_id)
  }

  return false
}

function isPOSScheduleDateRelevant(schedule, now = new Date()) {
  if (!schedule?.is_active) return false

  const today = getPOSScheduleDateKey(now)

  if (schedule.start_date && today < schedule.start_date) return false
  if (schedule.end_date && today > schedule.end_date) return false

  return true
}

function isPOSScheduleLiveNow(schedule, now = new Date()) {
  if (!isPOSScheduleDateRelevant(schedule, now)) return false

  const days = Array.isArray(schedule.days_of_week) ? schedule.days_of_week : []
  if (days.length > 0 && !days.includes(now.getDay())) return false

  return isPOSScheduleTimeLive(schedule, now)
}

function isPOSScheduleTimeLive(schedule, now = new Date()) {
  const startMinutes = getPOSScheduleMinutes(schedule.start_time, 0)
  const endMinutes = getPOSScheduleMinutes(schedule.end_time, 1439)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  if (startMinutes === endMinutes) return true

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes
  }

  return currentMinutes >= startMinutes || currentMinutes <= endMinutes
}

function getPOSScheduleMinutes(value, fallback) {
  const parts = String(value || '').split(':')
  const hours = Number(parts[0])
  const minutes = Number(parts[1])

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback

  return Math.min(1439, Math.max(0, hours * 60 + minutes))
}

function normalizePOSScheduleTime(value) {
  const parts = String(value || '').split(':')
  const hours = Number(parts[0])
  const minutes = Number(parts[1])

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '--:--'

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function getPOSScheduleTimeText(schedule) {
  return `${normalizePOSScheduleTime(schedule.start_time)} - ${normalizePOSScheduleTime(schedule.end_time)}`
}

function getPOSScheduleDaysText(schedule) {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const days = Array.isArray(schedule.days_of_week) ? schedule.days_of_week : []

  if (days.length === 0 || days.length === 7) return 'daily'

  return days.map((day) => labels[day]).filter(Boolean).join(', ')
}

function getPOSScheduleDateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getPOSScheduleTypeLabel(type) {
  if (type === 'availability') return 'Menu timing'
  if (type === 'happy_hour') return 'Happy hour'
  if (type === 'special_price') return 'Special price'
  if (type === 'hide_item') return 'Hidden now'
  return 'Menu schedule'
}

function POSMenuScheduleNotice({ notices }) {
  return (
    <section className="pos-menu-schedule-notice">
      <div className="pos-menu-schedule-icon">⏱</div>
      <div>
        <strong>Active menu schedule</strong>
        {notices.map((notice, index) => (
          <span key={`${notice.title}-${index}`}>
            {notice.title} — {notice.text}
          </span>
        ))}
      </div>
    </section>
  )
}

function normalizePOSComboDeals(comboData) {
  return (comboData || [])
    .filter((combo) => isPOSComboLive(combo))
    .map((combo) => ({
      ...combo,
      items: getAvailablePOSComboItems(combo),
    }))
    .filter((combo) => combo.items.length > 0 && Number(combo.bundle_price || 0) > 0)
    .sort(
      (first, second) =>
        Number(first.sort_order || 0) - Number(second.sort_order || 0) ||
        String(first.combo_name || '').localeCompare(String(second.combo_name || '')),
    )
}

function isPOSComboLive(combo) {
  if (!combo || combo.is_active === false) return false

  const now = Date.now()
  const startsAt = combo.start_at ? new Date(combo.start_at).getTime() : null
  const endsAt = combo.end_at ? new Date(combo.end_at).getTime() : null

  if (startsAt && startsAt > now) return false
  if (endsAt && endsAt < now) return false

  return true
}

function getAvailablePOSComboItems(combo) {
  if (!Array.isArray(combo?.items)) return []

  return combo.items
    .filter((comboItem) => {
      if (comboItem.scheduleUnavailable) return false
      if (comboItem.item?.posSchedule?.isOrderable === false) return false
      if (comboItem.itemId && comboItem.itemName) return true

      const item = comboItem.item
      const variation = comboItem.variation

      if (!item || item.is_deleted === true || item.is_available === false) {
        return false
      }

      if (comboItem.variation_id && (!variation || variation.is_available === false)) {
        return false
      }

      return true
    })
    .map((comboItem) => {
      if (comboItem.itemId && comboItem.itemName) {
        return {
          ...comboItem,
          quantity: Math.max(Number(comboItem.quantity || 1), 0.001),
          unitPrice: Number(comboItem.unitPrice || 0),
          sortOrder: Number(comboItem.sortOrder || 0),
        }
      }

      const item = comboItem.item || {}
      const variation = comboItem.variation || null
      const basePrice = variation ? variation.price : item.price

      return {
        id: comboItem.id,
        itemId: comboItem.menu_item_id || item.id,
        variationId: comboItem.variation_id || null,
        itemName: item.name || 'Combo item',
        variationName: variation?.name || '',
        imageUrl: item.image_url || '',
        quantity: Math.max(Number(comboItem.quantity || 1), 0.001),
        unitPrice: Number(basePrice || 0),
        groupName: comboItem.group_name || '',
        sortOrder: Number(comboItem.sort_order || 0),
      }
    })
    .sort((first, second) => Number(first.sortOrder || 0) - Number(second.sortOrder || 0))
}

function getPOSComboMenuValue(comboItems) {
  return roundPOSMoney(
    (comboItems || []).reduce(
      (total, item) => total + Number(item.quantity || 1) * Number(item.unitPrice || 0),
      0,
    ),
  )
}

function buildPOSComboSummary(comboItems) {
  return (comboItems || [])
    .slice(0, 4)
    .map((item) => {
      const quantity = Number(item.quantity || 1)
      const quantityText = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2)
      return `${quantityText}× ${item.itemName}${item.variationName ? ` (${item.variationName})` : ''}`
    })
    .join(', ')
}

function expandPOSCartItemsForOrder(cart) {
  return cart.flatMap((item) => {
    if (!item.isCombo || !Array.isArray(item.comboItems) || item.comboItems.length === 0) {
      return [{
        itemId: item.itemId,
        variationId: item.variationId,
        name: item.name,
        variationName: buildOrderVariationName(item),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      }]
    }

    const comboQuantity = Math.max(Number(item.quantity || 1), 1)
    const comboItems = getAvailablePOSComboItems({ items: item.comboItems })

    return comboItems.map((comboItem, index) => {
      const quantity = roundPOSQuantity(Number(comboItem.quantity || 1) * comboQuantity)
      const lineTotal = index === 0 ? Number(item.totalPrice || 0) : 0
      const unitPrice = quantity > 0 ? roundPOSMoney(lineTotal / quantity) : 0

      return {
        itemId: comboItem.itemId,
        variationId: comboItem.variationId,
        name: comboItem.itemName,
        variationName: [
          item.comboCode ? `Combo ${item.comboCode}` : item.name,
          comboItem.variationName,
        ]
          .filter(Boolean)
          .join(' • '),
        quantity,
        unitPrice,
        totalPrice: lineTotal,
      }
    })
  })
}

function roundPOSQuantity(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
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
  const normalBaseUnitPrice = Number(selectedVariation?.price ?? product.price ?? 0)
  const baseUnitPrice = getPOSScheduledPrice(product, normalBaseUnitPrice)
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

        {product.posSchedule?.badge && (
          <div className={`pos-customize-schedule-note ${product.posSchedule.badgeType || ''}`}>
            {product.posSchedule.badge}
          </div>
        )}

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
                    {currency} {Number(getPOSScheduledPrice(product, Number(variation.price || 0))).toFixed(2)}
                    {product.posSchedule?.pricingRuleType && (
                      <small className="pos-schedule-original-price">
                        {Number(variation.price || 0).toFixed(2)}
                      </small>
                    )}
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

function POSComboDealsSection({ combos, currency, onAddCombo }) {
  return (
    <section className="pos-combo-deals-section">
      <div className="pos-combo-head">
        <div>
          <p className="pricing-label">Combo Deals</p>
          <h3>Ready meal bundles</h3>
          <span>Add family meals, lunch sets or offers directly to POS cart.</span>
        </div>
      </div>

      <div className="pos-combo-scroll-row">
        {combos.map((combo) => (
          <POSComboDealCard
            combo={combo}
            currency={currency}
            onAddCombo={onAddCombo}
            key={combo.id}
          />
        ))}
      </div>
    </section>
  )
}

function POSComboDealCard({ combo, currency, onAddCombo }) {
  const comboItems = getAvailablePOSComboItems(combo)
  const menuValue = getPOSComboMenuValue(comboItems)
  const bundlePrice = Number(combo.bundle_price || 0)
  const savings = Math.max(menuValue - bundlePrice, 0)
  const firstImage = comboItems.find((item) => item.imageUrl)?.imageUrl

  return (
    <article className="pos-combo-card">
      <div className="pos-combo-card-top">
        <div className="pos-combo-image">
          {firstImage ? <img src={firstImage} alt={combo.combo_name} /> : 'CB'}
        </div>

        <div className="pos-combo-title-area">
          <span>{combo.combo_code || 'COMBO'}</span>
          <h4>{combo.combo_name}</h4>
          {combo.description && <p>{combo.description}</p>}
        </div>
      </div>

      <div className="pos-combo-items-list">
        {comboItems.slice(0, 3).map((item) => (
          <div key={`${combo.id}-${item.itemId}-${item.variationId || 'base'}`}>
            <span>
              {item.quantity}× {item.itemName}
              {item.variationName ? ` (${item.variationName})` : ''}
            </span>
          </div>
        ))}

        {comboItems.length > 3 && (
          <small>+ {comboItems.length - 3} more item{comboItems.length - 3 === 1 ? '' : 's'}</small>
        )}
      </div>

      <div className="pos-combo-price-row">
        <div>
          <span>Combo price</span>
          <strong>
            {currency} {bundlePrice.toFixed(2)}
          </strong>
        </div>

        {savings > 0 && <small>Save {currency} {savings.toFixed(2)}</small>}
      </div>

      <button type="button" className="pos-combo-add-button" onClick={() => onAddCombo(combo)}>
        Add Combo
      </button>
    </article>
  )
}

function POSGiftVoucherBox({
  currency,
  code,
  appliedVoucher,
  applying,
  voucherDiscountAmount,
  totalBeforeVoucher,
  onCodeChange,
  onApply,
  onRemove,
}) {
  return (
    <div className="pos-gift-voucher-box">
      <div className="pos-gift-voucher-head">
        <div>
          <strong>Gift voucher / store credit</strong>
          <span>Redeem customer voucher balance at POS checkout.</span>
        </div>

        {appliedVoucher && <small>Applied</small>}
      </div>

      {appliedVoucher ? (
        <div className="pos-gift-voucher-applied">
          <div>
            <span>{appliedVoucher.title || 'Gift Voucher'}</span>
            <strong>{appliedVoucher.code}</strong>
            <small>
              -{currency} {Number(voucherDiscountAmount || 0).toFixed(2)} • Balance after use {currency}{' '}
              {Number(appliedVoucher.remainingAfterUse || 0).toFixed(2)}
            </small>
          </div>

          <button type="button" onClick={onRemove}>
            Remove
          </button>
        </div>
      ) : (
        <div className="pos-gift-voucher-form">
          <input
            type="text"
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
            placeholder="Enter voucher code"
          />

          <button
            type="button"
            onClick={onApply}
            disabled={applying || Number(totalBeforeVoucher || 0) <= 0}
          >
            {applying ? 'Checking...' : 'Apply'}
          </button>
        </div>
      )}
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
                  {item.comboSummary && <span>Includes: {item.comboSummary}</span>}
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

          {Number(order.giftVoucherDiscount || 0) > 0 && (
            <div className="receipt-row">
              <span>Gift voucher {order.giftVoucherCode ? `(${order.giftVoucherCode})` : ''}</span>
              <strong>- {formatMoney(order.currency, order.giftVoucherDiscount)}</strong>
            </div>
          )}

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
            ${
              item.comboSummary
                ? `<span>Includes: ${escapeHtml(item.comboSummary)}</span>`
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

          ${Number(order.giftVoucherDiscount || 0) > 0 ? `
            <div class="row">
              <span>Gift voucher ${order.giftVoucherCode ? `(${escapeHtml(order.giftVoucherCode)})` : ''}</span>
              <strong>- ${formatMoney(order.currency, order.giftVoucherDiscount)}</strong>
            </div>
          ` : ''}

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