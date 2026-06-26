import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ClipboardList,
  Copy,
  Banknote,
  CreditCard,
  Gift,
  Home,
  Sparkles,
  Star,
  MapPin,
  Minus,
  Plus,
  QrCode,
  Search,
  ShoppingCart,
  Store,
  UserRound,
  WalletCards,
  TicketPercent,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import './PublicMenuPage.css'
import './PublicCampaignBanner.css'
import './PublicReviews.css'
import './PublicSettingsAddons.css'

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
  const [activeCampaigns, setActiveCampaigns] = useState([])
  const [customerOrders, setCustomerOrders] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [cart, setCart] = useState([])
  const [variationProduct, setVariationProduct] = useState(null)
  const [showCart, setShowCart] = useState(false)
  const [showOrdersModal, setShowOrdersModal] = useState(false)
  const [showRewardsModal, setShowRewardsModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState(null)
  const [reviewOrder, setReviewOrder] = useState(null)
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    comment: '',
  })
  const [rewardsLoading, setRewardsLoading] = useState(false)
  const [customerRewards, setCustomerRewards] = useState(null)
  const [appliedReward, setAppliedReward] = useState(null)
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const [couponApplying, setCouponApplying] = useState(false)
  const [deliveryPaymentChoice, setDeliveryPaymentChoice] = useState('')
  const [showCodChoiceModal, setShowCodChoiceModal] = useState(false)
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
  const acceptsOrders = restaurant?.accept_outside_orders !== false
  const restaurantDirectionUrl = useMemo(
    () => getRestaurantDirectionUrl(restaurant),
    [restaurant],
  )
  const customerSessionId = useMemo(() => getOrCreateCustomerSessionId(), [])

  const customerFullPhone = getFullPhoneNumber({
    countryCode: customerForm.countryCode,
    phone: customerForm.phone,
  })

  const loadPublicMenu = useCallback(async () => {
    setLoading(true)

    const { data: restaurantData, error: restaurantError } = await supabase
      .from('restaurants')
      .select(`
        id,
        name,
        slug,
        logo_url,
        phone,
        address,
        whatsapp_phone,
        website_url,
        facebook_url,
        instagram_url,
        tiktok_url,
        youtube_url,
        x_url,
        custom_social_links,
        map_latitude,
        map_longitude,
        map_url,
        currency,
        accept_outside_orders,
        accepts_cash,
        accepts_card,
        accepts_cod,
        accepts_online,
        accepts_upi,
        payment_gateway_settings,
        shipping_fee,
        delivery_fee,
        packaging_fee,
        tax_rate,
        is_active,
        rewards_enabled,
        reward_amount_unit,
        reward_points_per_amount,
        reward_redeem_points,
        reward_redeem_discount_amount,
        reward_expiration_enabled,
        reward_expiry_value,
        reward_expiry_unit
      `)
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

    const { data: campaignData } = await supabase
      .from('restaurant_campaigns')
      .select(
        `
          id,
          title,
          subtitle,
          banner_image_url,
          button_text,
          button_target,
          coupon_code,
          link_url,
          start_at,
          end_at,
          sort_order,
          is_active
        `,
      )
      .eq('restaurant_id', restaurantData.id)
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(10)

    const visibleCampaigns = (campaignData || []).filter((campaign) =>
      isPublicCampaignLive(campaign),
    )

    setCategories(categoryData || [])
    setProducts(productData || [])
    setActiveCampaigns(visibleCampaigns.slice(0, 3))
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

  const rewardDiscountAmount = useMemo(() => {
    if (!appliedReward) return 0

    return Math.min(
      Number(appliedReward.discountAmount || 0),
      Number(cartTotal || 0),
    )
  }, [appliedReward, cartTotal])

  const couponBaseTotal = useMemo(() => {
    return Math.max(Number(cartTotal || 0) - Number(rewardDiscountAmount || 0), 0)
  }, [cartTotal, rewardDiscountAmount])

  const couponDiscountAmount = useMemo(() => {
    if (!appliedCoupon) return 0

    return Math.min(
      Number(appliedCoupon.discountAmount || 0),
      Number(couponBaseTotal || 0),
    )
  }, [appliedCoupon, couponBaseTotal])

  const discountedCartTotal = useMemo(() => {
    return Math.max(
      Number(cartTotal || 0) -
        Number(rewardDiscountAmount || 0) -
        Number(couponDiscountAmount || 0),
      0,
    )
  }, [cartTotal, rewardDiscountAmount, couponDiscountAmount])

  const shippingFeeAmount = useMemo(() => {
    if (isTableOrder) return 0

    return getSafePublicAmount(restaurant?.shipping_fee ?? restaurant?.delivery_fee)
  }, [isTableOrder, restaurant?.delivery_fee, restaurant?.shipping_fee])

  const packagingFeeAmount = useMemo(() => {
    if (isTableOrder) return 0

    return getSafePublicAmount(restaurant?.packaging_fee)
  }, [isTableOrder, restaurant?.packaging_fee])

  const taxAmount = useMemo(() => {
    const taxRate = getSafePublicAmount(restaurant?.tax_rate)

    if (taxRate <= 0) return 0

    return roundPublicMoney(
      (Number(discountedCartTotal || 0) +
        Number(shippingFeeAmount || 0) +
        Number(packagingFeeAmount || 0)) *
        (taxRate / 100),
    )
  }, [discountedCartTotal, packagingFeeAmount, restaurant?.tax_rate, shippingFeeAmount])

  const cartPayableTotal = useMemo(() => {
    return Math.max(
      Number(discountedCartTotal || 0) +
        Number(shippingFeeAmount || 0) +
        Number(packagingFeeAmount || 0) +
        Number(taxAmount || 0),
      0,
    )
  }, [discountedCartTotal, packagingFeeAmount, shippingFeeAmount, taxAmount])

  useEffect(() => {
    if (cart.length === 0) {
      if (appliedReward) setAppliedReward(null)
      if (appliedCoupon) setAppliedCoupon(null)
    }
  }, [appliedCoupon, appliedReward, cart.length])

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
    if (!acceptsOrders) {
      showPublicMessage('This menu is currently view-only. Ordering is turned off.')
      return
    }

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
    if (!acceptsOrders) {
      showPublicMessage('This menu is currently view-only. Ordering is turned off.')
      return
    }

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

  const handleApplyCouponCode = async () => {
    if (!restaurant?.id) return

    const cleanCode = couponCode.trim().toUpperCase()

    if (!cleanCode) {
      showPublicMessage('Enter coupon code.')
      return
    }

    if (cart.length === 0) {
      showPublicMessage('Add items to cart before applying coupon.')
      return
    }

    if (Number(couponBaseTotal || 0) <= 0) {
      showPublicMessage('Coupon cannot be applied to zero total.')
      return
    }

    setCouponApplying(true)

    const activeCustomerPhone = savedCustomer?.fullPhone || customerFullPhone

    const { data, error } = await supabase.rpc('validate_public_discount_coupon', {
      p_restaurant_id: restaurant.id,
      p_coupon_code: cleanCode,
      p_order_subtotal: couponBaseTotal,
      p_customer_phone: activeCustomerPhone || null,
      p_customer_session_id: customerSessionId,
    })

    setCouponApplying(false)

    if (error) {
      showPublicMessage(error.message)
      return
    }

    setAppliedCoupon({
      id: data?.discount_id || null,
      title: data?.title || cleanCode,
      code: data?.code || cleanCode,
      discountAmount: Number(data?.discount_amount || 0),
      finalTotal: Number(data?.final_total || 0),
      message: data?.message || 'Coupon applied successfully.',
    })

    setCouponCode(data?.code || cleanCode)
    showPublicMessage(data?.message || 'Coupon applied successfully.')
  }

  const handleRemoveCouponCode = () => {
    setAppliedCoupon(null)
    setCouponCode('')
  }


  const handlePlaceOrder = async () => {
    if (!acceptsOrders) {
      showPublicMessage('This restaurant is showing a view-only menu right now.')
      return
    }

    if (!isTableOrder && restaurant?.accepts_cod === false) {
      showPublicMessage('Delivery payment is not active for this restaurant yet.')
      return
    }

    if (!isTableOrder && !deliveryPaymentChoice) {
      setShowCodChoiceModal(true)
      return
    }

    await submitOrderWithPayment(deliveryPaymentChoice)
  }

  const submitOrderWithPayment = async (selectedDeliveryPayment = '') => {
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

    const { data, error } = await supabase.rpc(
      'place_public_menu_order_with_rewards_coupon_charges',
      {
        p_restaurant_id: restaurant.id,
        p_order_type: orderType,
        p_customer_session_id: customerSessionId,
        p_table_id: isTableOrder ? table?.id || null : null,
        p_table_name: isTableOrder ? table?.table_name || null : null,
        p_customer_name: activeCustomerName || null,
        p_customer_phone: activeCustomerPhone || null,
        p_currency: currency,
        p_notes: buildCustomerNotes(customerForm, isTableOrder),
        p_reward_points_to_redeem: appliedReward
          ? Number(appliedReward.points || 0)
          : 0,
        p_reward_discount_amount: rewardDiscountAmount,
        p_coupon_code: appliedCoupon?.code || null,
        p_shipping_fee: isTableOrder ? 0 : shippingFeeAmount,
        p_packaging_fee: isTableOrder ? 0 : packagingFeeAmount,
        p_tax_rate: getSafePublicAmount(restaurant?.tax_rate),
        p_tax_amount: taxAmount,
        p_payment_gateway: isTableOrder ? null : 'cod',
        p_delivery_payment_type: isTableOrder
          ? null
          : selectedDeliveryPayment || deliveryPaymentChoice || null,
        p_items: cart.map((item) => ({
          itemId: item.itemId,
          variationId: item.variationId,
          name: item.name,
          variationName: item.variationName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
      },
    )

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
      total: cartPayableTotal,
      orderType,
      isExistingBill: Boolean(orderResult?.is_existing_bill),
      rewardDiscount: rewardDiscountAmount,
      rewardPoints: appliedReward ? Number(appliedReward.points || 0) : 0,
      couponDiscount: couponDiscountAmount,
      couponCode: appliedCoupon?.code || '',
      shippingFee: shippingFeeAmount,
      packagingFee: packagingFeeAmount,
      taxAmount,
      deliveryPaymentChoice: selectedDeliveryPayment || deliveryPaymentChoice || '',
    })

    setCart([])
    setAppliedReward(null)
    setAppliedCoupon(null)
    setCouponCode('')
    setDeliveryPaymentChoice('')
    setShowCart(false)
    setShowCodChoiceModal(false)
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

  const loadCustomerRewards = async (phoneOverride = '') => {
    if (!restaurant?.id) {
      showPublicMessage('Restaurant not ready.')
      return
    }

    const activeCustomerPhone =
      phoneOverride || savedCustomer?.fullPhone || customerFullPhone

    setRewardsLoading(true)
    setShowRewardsModal(true)

    const { data, error } = await supabase.rpc('get_public_customer_rewards', {
      p_restaurant_id: restaurant.id,
      p_customer_session_id: customerSessionId,
      p_customer_phone: activeCustomerPhone || null,
    })

    setRewardsLoading(false)

    if (error) {
      showPublicMessage(error.message)
      setCustomerRewards({
        rewards_enabled: false,
        error: error.message,
      })
      return
    }

    setCustomerRewards(normalizePublicRewards(data))
  }

  const handleSaveProfileAndLoadRewards = async () => {
    const profile = saveCustomerProfileFromForm()

    if (!profile) {
      showPublicMessage('Please enter a valid phone number.')
      return
    }

    showPublicMessage('Profile saved.')
    await loadCustomerRewards(profile.fullPhone)
  }

  const handleApplyRewardCoupon = (rewardData) => {
    const redeemPoints = Number(rewardData?.reward_redeem_points || 0)
    const redeemDiscount = Number(
      rewardData?.reward_redeem_discount_amount || 0,
    )
    const availablePoints = Number(rewardData?.reward_points || 0)

    if (!rewardData?.rewards_enabled) {
      showPublicMessage('Rewards are not active for this restaurant yet.')
      return
    }

    if (!savedCustomer?.phone && !cleanPhoneNumber(customerForm.phone)) {
      showPublicMessage('Save your phone number to use rewards.')
      return
    }

    if (cart.length === 0) {
      showPublicMessage('Add items to cart before using a reward coupon.')
      return
    }

    if (redeemPoints <= 0 || redeemDiscount <= 0) {
      showPublicMessage('Reward redemption is not configured yet.')
      return
    }

    if (availablePoints < redeemPoints) {
      showPublicMessage('You need more points to redeem this coupon.')
      return
    }

    setAppliedReward({
      points: redeemPoints,
      discountAmount: redeemDiscount,
      currency: rewardData.currency || currency,
    })
    setShowRewardsModal(false)
    setShowCart(true)
    showPublicMessage('Reward coupon applied to your cart.')
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

  const handleOpenReview = (order) => {
    setReviewOrder(order)
    setReviewForm({
      rating: 5,
      comment: '',
    })
  }

  const handleSubmitReview = async () => {
    if (!restaurant?.id || !reviewOrder?.id) return

    const ratingValue = Math.min(5, Math.max(1, Number(reviewForm.rating || 5)))
    const activeCustomerPhone = savedCustomer?.fullPhone || customerFullPhone
    const activeCustomerName = savedCustomer?.name || customerForm.name.trim()

    setReviewSubmitting(true)

    const { error } = await supabase.rpc('submit_public_restaurant_review', {
      p_restaurant_id: restaurant.id,
      p_order_id: reviewOrder.id,
      p_customer_session_id: customerSessionId,
      p_customer_phone: activeCustomerPhone || null,
      p_customer_name: activeCustomerName || null,
      p_rating: ratingValue,
      p_comment: reviewForm.comment.trim() || null,
    })

    setReviewSubmitting(false)

    if (error) {
      showPublicMessage(error.message)
      return
    }

    setReviewOrder(null)
    setReviewForm({
      rating: 5,
      comment: '',
    })
    showPublicMessage('Thank you for your review.')
  }

  const handleBottomHome = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  const handleBottomCart = () => {
    if (!acceptsOrders) {
      showPublicMessage('This menu is currently view-only. Ordering is turned off.')
      return
    }

    if (cart.length === 0) {
      showPublicMessage('Your cart is empty.')
      return
    }

    setShowCart(true)
  }

  const handleComingSoon = (label) => {
    showPublicMessage(`${label} will be available soon.`)
  }

  const handleCopyCampaignCoupon = async (campaign) => {
    const cleanCode = String(campaign?.coupon_code || '').trim().toUpperCase()

    if (!cleanCode) return

    setCouponCode(cleanCode)

    try {
      await navigator.clipboard?.writeText(cleanCode)
      showPublicMessage(`${cleanCode} copied. Apply it in your cart.`)
    } catch {
      showPublicMessage(`${cleanCode} saved. Apply it in your cart.`)
    }
  }

  const handleCampaignAction = (campaign) => {
    if (!campaign) return

    if (campaign.button_target === 'cart') {
      if (cart.length === 0) {
        showPublicMessage('Add items first, then open cart.')
        return
      }

      setShowCart(true)
      return
    }

    if (campaign.button_target === 'recipes') {
      document.querySelector('.public-menu-tools')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      showPublicMessage('Showing today’s recipes and menu items.')
      return
    }

    if (campaign.button_target === 'link' && campaign.link_url) {
      window.open(campaign.link_url, '_blank', 'noopener,noreferrer')
      return
    }

    if (campaign.coupon_code) {
      setCouponCode(campaign.coupon_code.toUpperCase())

      if (cart.length > 0) {
        setShowCart(true)
        showPublicMessage('Coupon added. Tap Apply in cart.')
      } else {
        showPublicMessage('Coupon saved. Add items and apply at checkout.')
      }

      return
    }

    showPublicMessage('Offer details will be available soon.')
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

        <div className="public-header-side-actions">
          {restaurantDirectionUrl && (
            <a
              className="public-direction-button"
              href={restaurantDirectionUrl}
              target="_blank"
              rel="noreferrer"
            >
              <MapPin size={16} />
              Directions
            </a>
          )}

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
        </div>
      </header>

      <PublicSocialLinks restaurant={restaurant} />

      {!acceptsOrders && (
        <section className="public-view-only-notice">
          <strong>View-only menu</strong>
          <span>Ordering is temporarily turned off by this restaurant. You can still browse the menu and use directions.</span>
        </section>
      )}

      {activeCampaigns.length > 0 && (
        <PublicCampaignStrip
          campaigns={activeCampaigns}
          currency={currency}
          onCampaignAction={handleCampaignAction}
          onCopyCoupon={handleCopyCampaignCoupon}
        />
      )}

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
                  {!acceptsOrders ? (
                    <div className="public-view-only-pill">View only</div>
                  ) : hasOptions ? (
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

      {acceptsOrders && cart.length > 0 && (
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
        onRewards={() => loadCustomerRewards()}
        onProfile={() => setShowProfileModal(true)}
      />

      {showCart && (
        <PublicCartSheet
          cart={cart}
          currency={currency}
          cartTotal={cartTotal}
          cartPayableTotal={cartPayableTotal}
          shippingFeeAmount={shippingFeeAmount}
          packagingFeeAmount={packagingFeeAmount}
          taxAmount={taxAmount}
          deliveryPaymentChoice={deliveryPaymentChoice}
          rewardDiscountAmount={rewardDiscountAmount}
          couponDiscountAmount={couponDiscountAmount}
          couponCode={couponCode}
          appliedCoupon={appliedCoupon}
          couponApplying={couponApplying}
          appliedReward={appliedReward}
          isTableOrder={isTableOrder}
          table={table}
          customerForm={customerForm}
          savedCustomer={savedCustomer}
          phoneCountryOptions={phoneCountryOptions}
          savingOrder={savingOrder}
          acceptsOrders={acceptsOrders}
          onClose={() => setShowCart(false)}
          onUpdateCustomerForm={updateCustomerForm}
          onUpdateQuantity={updateCartQuantity}
          onCouponCodeChange={setCouponCode}
          onApplyCoupon={handleApplyCouponCode}
          onRemoveCoupon={handleRemoveCouponCode}
          onOpenRewards={() => loadCustomerRewards()}
          onRemoveReward={() => setAppliedReward(null)}
          onDeliveryPaymentChoiceChange={setDeliveryPaymentChoice}
          onPlaceOrder={handlePlaceOrder}
        />
      )}

      {showCodChoiceModal && (
        <PublicCodChoiceModal
          currency={currency}
          total={cartPayableTotal}
          saving={savingOrder}
          onClose={() => setShowCodChoiceModal(false)}
          onChoose={(choice) => {
            setDeliveryPaymentChoice(choice)
            submitOrderWithPayment(choice)
          }}
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
          onReviewOrder={handleOpenReview}
        />
      )}

      {reviewOrder && (
        <PublicReviewModal
          order={reviewOrder}
          currency={currency}
          reviewForm={reviewForm}
          submitting={reviewSubmitting}
          onClose={() => setReviewOrder(null)}
          onChange={(key, value) =>
            setReviewForm((current) => ({ ...current, [key]: value }))
          }
          onSubmit={handleSubmitReview}
        />
      )}

      {showRewardsModal && (
        <PublicRewardsModal
          rewards={customerRewards}
          loading={rewardsLoading}
          currency={currency}
          restaurantName={restaurant?.name || 'Restaurant'}
          customerForm={customerForm}
          savedCustomer={savedCustomer}
          phoneCountryOptions={phoneCountryOptions}
          cartTotal={cartTotal}
          appliedReward={appliedReward}
          onApplyReward={handleApplyRewardCoupon}
          onClose={() => setShowRewardsModal(false)}
          onUpdateCustomerForm={updateCustomerForm}
          onSaveAndRefresh={handleSaveProfileAndLoadRewards}
          onRefresh={() => loadCustomerRewards()}
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


function PublicCampaignStrip({ campaigns, currency, onCampaignAction, onCopyCoupon }) {
  return (
    <section className="public-campaign-strip">
      {campaigns.map((campaign) => (
        <PublicCampaignCard
          campaign={campaign}
          currency={currency}
          onCampaignAction={onCampaignAction}
          onCopyCoupon={onCopyCoupon}
          key={campaign.id}
        />
      ))}
    </section>
  )
}

function PublicCampaignCard({ campaign, currency, onCampaignAction, onCopyCoupon }) {
  const hasButton = campaign.button_target !== 'none'
  const countdownText = getPublicCampaignCountdown(campaign.end_at)

  return (
    <article className="public-campaign-card">
      {campaign.banner_image_url && (
        <div className="public-campaign-image">
          <img src={campaign.banner_image_url} alt={campaign.title} />
        </div>
      )}

      <div className="public-campaign-content">
        <p className="public-menu-label">Special offer</p>
        <h2>{campaign.title}</h2>
        {campaign.subtitle && <span>{campaign.subtitle}</span>}

        <div className="public-campaign-meta-row">
          {campaign.coupon_code && (
            <div className="public-campaign-coupon-pill">
              <strong>{campaign.coupon_code}</strong>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onCopyCoupon?.(campaign)
                }}
              >
                <Copy size={13} />
                Copy
              </button>
            </div>
          )}
          {countdownText && <small>{countdownText}</small>}
        </div>
      </div>

      {hasButton && (
        <button type="button" onClick={() => onCampaignAction(campaign)}>
          {campaign.button_text || getCampaignDefaultButton(campaign, currency)}
        </button>
      )}
    </article>
  )
}

function PublicSocialLinks({ restaurant }) {
  const links = getPublicSocialLinks(restaurant)

  if (links.length === 0) return null

  return (
    <section className="public-social-links-row">
      {links.map((link) => (
        <a href={link.url} target="_blank" rel="noreferrer" key={`${link.label}-${link.url}`}>
          {link.label}
        </a>
      ))}
    </section>
  )
}

function PublicCodChoiceModal({ currency, total, saving, onClose, onChoose }) {
  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-cod-choice-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-cart-head">
          <div>
            <p className="public-menu-label">Payment on delivery</p>
            <h2>How will you pay?</h2>
            <span>
              Total: {currency} {Number(total || 0).toFixed(2)}
            </span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="public-cod-choice-grid">
          <button type="button" onClick={() => onChoose('cash')} disabled={saving}>
            <Banknote size={24} />
            <strong>Cash on delivery</strong>
            <span>Pay cash to the delivery staff.</span>
          </button>

          <button type="button" onClick={() => onChoose('card')} disabled={saving}>
            <CreditCard size={24} />
            <strong>Card on delivery</strong>
            <span>Delivery staff will bring tap/card POS machine.</span>
          </button>
        </div>
      </div>
    </div>
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
  cartPayableTotal,
  shippingFeeAmount,
  packagingFeeAmount,
  taxAmount,
  deliveryPaymentChoice,
  rewardDiscountAmount,
  couponDiscountAmount,
  couponCode,
  appliedCoupon,
  couponApplying,
  appliedReward,
  isTableOrder,
  table,
  customerForm,
  savedCustomer,
  phoneCountryOptions,
  savingOrder,
  acceptsOrders,
  onClose,
  onUpdateCustomerForm,
  onUpdateQuantity,
  onCouponCodeChange,
  onApplyCoupon,
  onRemoveCoupon,
  onOpenRewards,
  onRemoveReward,
  onDeliveryPaymentChoiceChange,
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

        {!isTableOrder && (
          <div className="public-delivery-payment-preview">
            <div>
              <span>Delivery payment</span>
              <strong>COD - {deliveryPaymentChoice === 'card' ? 'Card machine' : deliveryPaymentChoice === 'cash' ? 'Cash' : 'Choose on place order'}</strong>
              <small>For card selection, delivery staff will bring a tap/card POS machine.</small>
            </div>

            <div className="public-delivery-payment-buttons">
              <button
                type="button"
                className={deliveryPaymentChoice === 'cash' ? 'active' : ''}
                onClick={() => onDeliveryPaymentChoiceChange('cash')}
              >
                <Banknote size={15} />
                Cash
              </button>
              <button
                type="button"
                className={deliveryPaymentChoice === 'card' ? 'active' : ''}
                onClick={() => onDeliveryPaymentChoiceChange('card')}
              >
                <CreditCard size={15} />
                Card
              </button>
            </div>
          </div>
        )}

        <div className="public-cart-coupon-area">
          {appliedCoupon ? (
            <div className="public-cart-coupon-applied">
              <div>
                <span>Coupon applied</span>
                <strong>{appliedCoupon.code}</strong>
                <small>
                  {appliedCoupon.title} • -{currency}{' '}
                  {Number(couponDiscountAmount || 0).toFixed(2)}
                </small>
              </div>

              <button type="button" onClick={onRemoveCoupon}>
                Remove
              </button>
            </div>
          ) : (
            <div className="public-cart-coupon-form">
              <input
                type="text"
                value={couponCode}
                onChange={(event) =>
                  onCouponCodeChange(event.target.value.toUpperCase())
                }
                placeholder="Coupon code"
              />

              <button
                type="button"
                onClick={onApplyCoupon}
                disabled={couponApplying}
              >
                {couponApplying ? 'Checking...' : 'Apply'}
              </button>
            </div>
          )}
        </div>

        <div className="public-cart-reward-area">
          {appliedReward ? (
            <div className="public-cart-reward-discount">
              <div>
                <span>Reward coupon applied</span>
                <strong>
                  -{currency} {Number(rewardDiscountAmount || 0).toFixed(2)}
                </strong>
                <small>
                  {formatRewardNumber(appliedReward.points)} points will be used
                  after order placement.
                </small>
              </div>

              <button type="button" onClick={onRemoveReward}>
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="public-cart-reward-link"
              onClick={onOpenRewards}
            >
              <TicketPercent size={17} />
              Use rewards coupon
            </button>
          )}
        </div>

        <div className="public-cart-total public-cart-total-split">
          <div>
            <span>Subtotal</span>
            <strong>
              {currency} {Number(cartTotal || 0).toFixed(2)}
            </strong>
          </div>

          {rewardDiscountAmount > 0 && (
            <div className="discount">
              <span>Reward discount</span>
              <strong>
                -{currency} {Number(rewardDiscountAmount || 0).toFixed(2)}
              </strong>
            </div>
          )}

          {couponDiscountAmount > 0 && (
            <div className="discount">
              <span>Coupon discount</span>
              <strong>
                -{currency} {Number(couponDiscountAmount || 0).toFixed(2)}
              </strong>
            </div>
          )}

          {shippingFeeAmount > 0 && (
            <div>
              <span>Shipping fee</span>
              <strong>
                {currency} {Number(shippingFeeAmount || 0).toFixed(2)}
              </strong>
            </div>
          )}

          {packagingFeeAmount > 0 && (
            <div>
              <span>Packaging / extra</span>
              <strong>
                {currency} {Number(packagingFeeAmount || 0).toFixed(2)}
              </strong>
            </div>
          )}

          {taxAmount > 0 && (
            <div>
              <span>Tax</span>
              <strong>
                {currency} {Number(taxAmount || 0).toFixed(2)}
              </strong>
            </div>
          )}

          <div className="grand">
            <span>Total</span>
            <strong>
              {currency} {Number(cartPayableTotal || 0).toFixed(2)}
            </strong>
          </div>
        </div>

        <button
          type="button"
          className="public-place-order-button"
          onClick={onPlaceOrder}
          disabled={savingOrder || !acceptsOrders}
        >
          {!acceptsOrders ? 'View-only menu' : savingOrder ? 'Placing order...' : 'Place Order'}
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
  onReviewOrder,
}) {
  const normalizedOrders = Array.isArray(orders) ? orders : []
  const ongoingOrders = normalizedOrders.filter(isPublicOngoingOrder)
  const completedOrders = normalizedOrders.filter(
    (order) => !isPublicOngoingOrder(order),
  )

  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-orders-modal polished-orders-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-cart-head public-orders-head">
          <div>
            <p className="public-menu-label">My Orders</p>
            <h2>Order history</h2>
            <span>
              Track live table bills, bill requests and completed orders.
            </span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="public-orders-summary-row">
          <div className="public-orders-summary-card live">
            <span>Live</span>
            <strong>{ongoingOrders.length}</strong>
          </div>

          <div className="public-orders-summary-card">
            <span>Past</span>
            <strong>{completedOrders.length}</strong>
          </div>

          <button
            type="button"
            className="public-refresh-orders-button compact"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="public-orders-loading-stack">
            <div className="public-orders-skeleton" />
            <div className="public-orders-skeleton small" />
          </div>
        ) : normalizedOrders.length === 0 ? (
          <PublicOrdersEmptyState />
        ) : (
          <div className="public-orders-polished-list">
            {ongoingOrders.length > 0 && (
              <PublicOrdersSection
                title="Live table orders"
                subtitle="Ongoing bills from this device/session."
                orders={ongoingOrders}
                currency={currency}
                onRequestBill={onRequestBill}
                onReviewOrder={onReviewOrder}
                loading={loading}
              />
            )}

            {completedOrders.length > 0 && (
              <PublicOrdersSection
                title="Completed / past orders"
                subtitle="Finished, cancelled or delivered orders."
                orders={completedOrders}
                currency={currency}
                onRequestBill={onRequestBill}
                onReviewOrder={onReviewOrder}
                loading={loading}
                isPastSection
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PublicOrdersSection({
  title,
  subtitle,
  orders,
  currency,
  onRequestBill,
  onReviewOrder,
  loading,
  isPastSection = false,
}) {
  return (
    <section className={`public-orders-section ${isPastSection ? 'past' : ''}`}>
      <div className="public-orders-section-title">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>

        <span>{orders.length}</span>
      </div>

      <div className="public-orders-list">
        {orders.map((order) => (
          <PublicOrderCard
            order={order}
            currency={currency}
            onRequestBill={onRequestBill}
            onReviewOrder={onReviewOrder}
            loading={loading}
            key={order.id}
          />
        ))}
      </div>
    </section>
  )
}

function PublicOrderCard({
  order,
  currency,
  onRequestBill,
  onReviewOrder,
  loading,
}) {
  const isLive = isPublicOngoingOrder(order)
  const isFinal = ['completed', 'cancelled', 'delivered'].includes(order.status)
  const orderCurrency = order.currency || currency

  return (
    <article
      className={`public-order-card polished ${
        isLive ? 'live' : 'past'
      } ${order.status === 'bill_requested' ? 'bill-requested' : ''}`}
    >
      <div className="public-order-card-head">
        <div>
          <span>
            Order #
            {getPublicOrderNumber(order.public_order_number || order.order_code)}
          </span>
          <strong>
            {orderCurrency} {Number(order.total_amount || 0).toFixed(2)}
          </strong>
        </div>

        <div className="public-order-badge-stack">
          {isLive && (
            <div className="public-live-order-badge">
              <span />
              {order.status === 'bill_requested' ? 'Bill requested' : 'Live order'}
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
              {item.variation_name && <span>{item.variation_name}</span>}
              <small>
                {item.quantity} × {orderCurrency}{' '}
                {Number(item.unit_price || 0).toFixed(2)}
              </small>
            </div>

            <strong>
              {orderCurrency} {Number(item.total_price || 0).toFixed(2)}
            </strong>
          </div>
        ))}
      </div>

      {order.order_type === 'dine_in' &&
        isLive &&
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
          Bill request sent. Restaurant will complete the bill after payment.
        </div>
      )}

      {isFinal && (
        <div className="public-order-finished-note">
          {order.status === 'completed'
            ? 'This bill is completed.'
            : `This order is ${formatPublicStatus(order.status).toLowerCase()}.`}
        </div>
      )}

      {['completed', 'delivered'].includes(order.status) && (
        <button
          type="button"
          className="public-review-order-button"
          onClick={() => onReviewOrder(order)}
        >
          <Star size={16} />
          Rate this order
        </button>
      )}
    </article>
  )
}

function PublicOrdersEmptyState() {
  return (
    <div className="public-orders-empty polished">
      <div className="public-orders-empty-icon">
        <ClipboardList size={30} />
      </div>

      <h3>No orders yet</h3>
      <p>
        Your live table bills and past orders from this device will appear here.
      </p>
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

function PublicReviewModal({
  order,
  currency,
  reviewForm,
  submitting,
  onClose,
  onChange,
  onSubmit,
}) {
  const ratingValue = Number(reviewForm.rating || 5)

  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-review-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-cart-head public-review-head">
          <div>
            <p className="public-menu-label">Review</p>
            <h2>Rate your order</h2>
            <span>
              Order #{getPublicOrderNumber(order.public_order_number || order.order_code)}
            </span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="public-review-stars" aria-label="Choose rating">
          {[1, 2, 3, 4, 5].map((rating) => (
            <button
              type="button"
              key={rating}
              className={rating <= ratingValue ? 'active' : ''}
              onClick={() => onChange('rating', rating)}
            >
              <Star size={30} />
            </button>
          ))}
        </div>

        <div className="public-review-order-box">
          <span>Order total</span>
          <strong>
            {order.currency || currency} {Number(order.total_amount || 0).toFixed(2)}
          </strong>
        </div>

        <label className="public-review-comment">
          Tell us about your experience
          <textarea
            value={reviewForm.comment}
            onChange={(event) => onChange('comment', event.target.value)}
            placeholder="Food taste, service, packing, delivery experience..."
            rows="4"
          />
        </label>

        <button
          type="button"
          className="public-review-submit"
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? 'Submitting...' : 'Submit review'}
        </button>
      </div>
    </div>
  )
}

function PublicRewardsModal({
  rewards,
  loading,
  currency,
  restaurantName,
  customerForm,
  savedCustomer,
  phoneCountryOptions,
  cartTotal,
  appliedReward,
  onApplyReward,
  onClose,
  onUpdateCustomerForm,
  onSaveAndRefresh,
  onRefresh,
}) {
  const rewardData = rewards || {}
  const rewardsEnabled = Boolean(rewardData.rewards_enabled)
  const hasCustomerPhone = Boolean(
    savedCustomer?.phone || cleanPhoneNumber(customerForm.phone),
  )
  const rewardPoints = Number(rewardData.reward_points || 0)
  const redeemPoints = Number(rewardData.reward_redeem_points || 0)
  const redeemDiscount = Number(rewardData.reward_redeem_discount_amount || 0)
  const availableCoupons =
    redeemPoints > 0 ? Math.floor(rewardPoints / redeemPoints) : 0
  const canRedeemCoupon =
    rewardsEnabled &&
    hasCustomerPhone &&
    redeemPoints > 0 &&
    redeemDiscount > 0 &&
    rewardPoints >= redeemPoints
  const cartHasItems = Number(cartTotal || 0) > 0
  const couponAlreadyApplied = Boolean(appliedReward)

  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-rewards-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-cart-head public-rewards-head">
          <div>
            <p className="public-menu-label">Rewards</p>
            <h2>{restaurantName} Rewards</h2>
            <span>Check points, earning rules and redemption offers.</span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="public-rewards-loading">
            <div />
            <div />
            <div />
          </div>
        ) : !rewardsEnabled ? (
          <div className="public-rewards-coming-soon">
            <div className="public-rewards-coming-icon">
              <Gift size={34} />
            </div>
            <h3>Rewards coming soon</h3>
            <p>
              This restaurant has not activated rewards yet. Once they turn it
              on, your points and offers will appear here.
            </p>
          </div>
        ) : !hasCustomerPhone ? (
          <div className="public-rewards-profile-needed">
            <div className="public-rewards-coming-icon active">
              <UserRound size={34} />
            </div>
            <h3>Save your phone to view rewards</h3>
            <p>
              Rewards are linked to your phone number, so you can collect points
              from paid orders.
            </p>

            <div className="public-customer-fields rewards-profile-fields">
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

            <button
              type="button"
              className="public-rewards-primary-button"
              onClick={onSaveAndRefresh}
            >
              Save & Check Rewards
            </button>
          </div>
        ) : (
          <div className="public-rewards-active-view">
            <section className="public-rewards-points-card">
              <div>
                <span>Your points</span>
                <strong>{formatRewardNumber(rewardPoints)}</strong>
                <small>
                  {rewardData.customer_found
                    ? `${rewardData.total_orders || 0} completed orders • ${
                        rewardData.currency || currency
                      } ${Number(rewardData.total_spend || 0).toFixed(2)} spent`
                    : 'No completed paid orders found for this phone yet.'}
                </small>
              </div>

              <div className="public-rewards-medal">
                <Star size={30} />
              </div>
            </section>

            <div className="public-rewards-rule-grid">
              <RewardRuleCard
                icon={<Sparkles size={19} />}
                title="Earn points"
                value={`${rewardData.currency || currency} ${Number(
                  rewardData.reward_amount_unit || 10,
                ).toFixed(2)} = ${formatRewardNumber(
                  rewardData.reward_points_per_amount || 1,
                )} point${
                  Number(rewardData.reward_points_per_amount || 1) === 1
                    ? ''
                    : 's'
                }`}
                text="Points are added after the restaurant completes and marks your order as paid."
              />

              <RewardRuleCard
                icon={<WalletCards size={19} />}
                title="Redeem discount"
                value={`${formatRewardNumber(redeemPoints || 100)} points = ${
                  rewardData.currency || currency
                } ${Number(redeemDiscount || 0).toFixed(2)}`}
                text={
                  availableCoupons > 0
                    ? `You can redeem up to ${availableCoupons} discount coupon${
                        availableCoupons === 1 ? '' : 's'
                      } when redemption is enabled.`
                    : 'Collect more points to unlock discount coupons.'
                }
              />

              <RewardRuleCard
                icon={<Gift size={19} />}
                title="Expiry rule"
                value={formatRewardExpiry(rewardData)}
                text="Expiry depends on the restaurant reward settings."
              />
            </div>

            <div className="public-rewards-redeem-note active">
              <div>
                <strong>Redeem reward coupon</strong>
                <span>
                  {formatRewardNumber(redeemPoints || 100)} points gives you{' '}
                  {rewardData.currency || currency}{' '}
                  {Number(redeemDiscount || 0).toFixed(2)} discount on your
                  cart.
                </span>
              </div>

              {couponAlreadyApplied ? (
                <div className="public-reward-applied-pill">
                  Coupon already applied to cart
                </div>
              ) : (
                <button
                  type="button"
                  className="public-rewards-primary-button redeem"
                  onClick={() => onApplyReward(rewardData)}
                  disabled={!canRedeemCoupon || !cartHasItems}
                >
                  {!cartHasItems
                    ? 'Add items to use coupon'
                    : canRedeemCoupon
                      ? `Apply ${rewardData.currency || currency} ${Number(
                          redeemDiscount || 0,
                        ).toFixed(2)} coupon`
                      : 'Collect more points'}
                </button>
              )}
            </div>

            <PublicRewardsActivity
              transactions={rewardData.transactions || []}
              currency={rewardData.currency || currency}
            />

            <button
              type="button"
              className="public-refresh-orders-button compact rewards-refresh"
              onClick={onRefresh}
              disabled={loading}
            >
              Refresh Rewards
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


function PublicRewardsActivity({ transactions, currency }) {
  const recentTransactions = Array.isArray(transactions)
    ? transactions.slice(0, 8)
    : []

  return (
    <section className="public-rewards-activity">
      <div className="public-rewards-activity-head">
        <strong>Points activity</strong>
        <span>Earned, redeemed and adjustment history</span>
      </div>

      {recentTransactions.length === 0 ? (
        <div className="public-rewards-activity-empty">
          No reward activity yet. Points will appear after paid completed orders.
        </div>
      ) : (
        <div className="public-rewards-activity-list">
          {recentTransactions.map((transaction) => (
            <PublicRewardActivityRow
              key={transaction.id}
              transaction={transaction}
              currency={currency}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function PublicRewardActivityRow({ transaction, currency }) {
  const points = Number(transaction.points || 0)
  const positive = points >= 0
  const expired = Boolean(transaction.is_expired)

  return (
    <article
      className={`public-rewards-activity-row ${positive ? 'positive' : 'negative'} ${
        expired ? 'expired' : ''
      }`}
    >
      <div>
        <strong>{transaction.description || formatRewardActivityType(transaction.transaction_type)}</strong>
        <span>{formatPublicDate(transaction.created_at)}</span>
        {transaction.order_total_amount_snapshot !== null &&
          transaction.order_total_amount_snapshot !== undefined && (
            <small>
              Order value: {currency} {Number(transaction.order_total_amount_snapshot || 0).toFixed(2)}
            </small>
          )}
        {transaction.expires_at && (
          <small className={expired ? 'expired-text' : ''}>
            {expired
              ? `Expired ${formatPublicDate(transaction.expires_at)}`
              : `Expires ${formatPublicDate(transaction.expires_at)}`}
          </small>
        )}
      </div>

      <strong>{positive ? '+' : ''}{formatRewardNumber(points)} pts</strong>
    </article>
  )
}

function RewardRuleCard({ icon, title, value, text }) {
  return (
    <div className="public-reward-rule-card">
      <div className="public-reward-rule-icon">{icon}</div>
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{text}</p>
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

        {Number(order.rewardDiscount || 0) > 0 && (
          <div className="public-success-reward">
            Reward discount applied: -{currency}{' '}
            {Number(order.rewardDiscount || 0).toFixed(2)} using{' '}
            {formatRewardNumber(order.rewardPoints || 0)} points
          </div>
        )}

        {Number(order.couponDiscount || 0) > 0 && (
          <div className="public-success-reward coupon">
            Coupon {order.couponCode} applied: -{currency}{' '}
            {Number(order.couponDiscount || 0).toFixed(2)}
          </div>
        )}

        {order.deliveryPaymentChoice && (
          <div className="public-success-reward payment">
            Delivery payment: COD - {order.deliveryPaymentChoice === 'card' ? 'Card machine' : 'Cash'}
          </div>
        )}

        {Number(order.shippingFee || 0) > 0 && (
          <div className="public-success-reward fee">
            Shipping fee: {currency} {Number(order.shippingFee || 0).toFixed(2)}
          </div>
        )}

        {Number(order.packagingFee || 0) > 0 && (
          <div className="public-success-reward fee">
            Packaging / extra: {currency} {Number(order.packagingFee || 0).toFixed(2)}
          </div>
        )}

        {Number(order.taxAmount || 0) > 0 && (
          <div className="public-success-reward fee">
            Tax: {currency} {Number(order.taxAmount || 0).toFixed(2)}
          </div>
        )}

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

function formatRewardActivityType(type) {
  if (type === 'earn') return 'Points earned'
  if (type === 'redeem') return 'Points redeemed'
  if (type === 'adjust') return 'Manual adjustment'
  return 'Reward activity'
}

function normalizePublicRewards(data) {
  if (!data) return null

  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  return data
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


function formatRewardNumber(value) {
  const numberValue = Number(value || 0)

  if (Number.isInteger(numberValue)) return String(numberValue)

  return numberValue.toFixed(2)
}

function formatRewardExpiry(rewards) {
  if (!rewards?.reward_expiration_enabled) return 'Lifetime'

  const expiryValue = Number(rewards.reward_expiry_value || 0)
  const expiryUnit = String(rewards.reward_expiry_unit || 'months')

  if (expiryValue <= 0 || expiryUnit === 'lifetime') return 'Lifetime'

  const singularUnit = expiryUnit.endsWith('s')
    ? expiryUnit.slice(0, -1)
    : expiryUnit

  return `${expiryValue} ${expiryValue === 1 ? singularUnit : expiryUnit}`
}


function isPublicCampaignLive(campaign) {
  const now = Date.now()
  const startOk = !campaign.start_at || new Date(campaign.start_at).getTime() <= now
  const endOk = !campaign.end_at || new Date(campaign.end_at).getTime() >= now

  return Boolean(campaign.is_active !== false && startOk && endOk)
}

function getPublicCampaignCountdown(endAt) {
  if (!endAt) return ''

  const diff = new Date(endAt).getTime() - Date.now()

  if (diff <= 0) return 'Ends soon'

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days} day${days === 1 ? '' : 's'} left`
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} left`

  return `${Math.max(minutes, 1)} minute${minutes === 1 ? '' : 's'} left`
}

function getCampaignDefaultButton(campaign) {
  if (campaign.button_target === 'cart') return 'Open cart'
  if (campaign.button_target === 'recipes') return 'View recipes'
  if (campaign.button_target === 'link') return 'View offer'
  if (campaign.coupon_code) return 'Use coupon'
  return 'View offer'
}

function getSafePublicAmount(value) {
  const numberValue = Number(value || 0)

  if (Number.isNaN(numberValue)) return 0

  return Math.max(0, numberValue)
}

function roundPublicMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function getRestaurantDirectionUrl(restaurant) {
  if (!restaurant) return ''

  if (restaurant.map_url) return restaurant.map_url

  if (restaurant.map_latitude && restaurant.map_longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${restaurant.map_latitude},${restaurant.map_longitude}`
  }

  if (restaurant.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurant.address)}`
  }

  return ''
}

function getPublicSocialLinks(restaurant) {
  const baseLinks = [
    ['Website', restaurant?.website_url],
    ['Facebook', restaurant?.facebook_url],
    ['Instagram', restaurant?.instagram_url],
    ['TikTok', restaurant?.tiktok_url],
    ['YouTube', restaurant?.youtube_url],
    ['X', restaurant?.x_url],
  ]

  const customLinks = Array.isArray(restaurant?.custom_social_links)
    ? restaurant.custom_social_links.map((link) => [link.label, link.url])
    : []

  return [...baseLinks, ...customLinks]
    .map(([label, url]) => {
      const cleanUrl = normalizePublicExternalUrl(url)

      return {
        label: String(label || '').trim() || getPublicLabelFromUrl(cleanUrl),
        url: cleanUrl,
      }
    })
    .filter((link) => link.label && link.url)
}

function normalizePublicExternalUrl(value) {
  const cleanValue = String(value || '').trim()

  if (!cleanValue) return ''

  if (/^https?:\/\//i.test(cleanValue)) return cleanValue

  return `https://${cleanValue.replace(/^\/+/, '')}`
}

function getPublicLabelFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '') || 'Link'
  } catch {
    return 'Link'
  }
}

export default PublicMenuPage