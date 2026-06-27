import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  CalendarCheck,
  BellRing,
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
import './PublicReservations.css'
import './PublicServiceRequests.css'
import './PublicModifiers.css'
import './PublicDeliveryZones.css'
import './PublicDeliveryAddress.css'
import './PublicMenuTheme.css'
import './PublicGiftVouchers.css'
import './PublicComboDeals.css'
import './PublicMenuSchedule.css'
import './PublicPaymentGateways.css'
import './PublicPaymentStatusPolish.css'

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
  const [comboDeals, setComboDeals] = useState([])
  const [menuSchedules, setMenuSchedules] = useState([])
  const [activeCampaigns, setActiveCampaigns] = useState([])
  const [deliveryZones, setDeliveryZones] = useState([])
  const [selectedDeliveryZoneId, setSelectedDeliveryZoneId] = useState('')
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
  const [giftVoucherCode, setGiftVoucherCode] = useState('')
  const [appliedGiftVoucher, setAppliedGiftVoucher] = useState(null)
  const [giftVoucherApplying, setGiftVoucherApplying] = useState(false)
  const [deliveryPaymentChoice, setDeliveryPaymentChoice] = useState('')
  const [showCodChoiceModal, setShowCodChoiceModal] = useState(false)
  const [showReservationModal, setShowReservationModal] = useState(false)
  const [reservationSaving, setReservationSaving] = useState(false)
  const [reservationSuccess, setReservationSuccess] = useState(null)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [serviceSaving, setServiceSaving] = useState(false)
  const [serviceSuccess, setServiceSuccess] = useState(null)
  const [serviceForm, setServiceForm] = useState(() => {
    const savedProfile = getSavedCustomerProfile()

    return {
      name: savedProfile?.name || '',
      countryCode: savedProfile?.countryCode || '+971',
      phone: savedProfile?.phone || '',
      requestType: 'waiter',
      message: '',
    }
  })
  const [reservationForm, setReservationForm] = useState(() => {
    const savedProfile = getSavedCustomerProfile()

    return {
      name: savedProfile?.name || '',
      countryCode: savedProfile?.countryCode || '+971',
      phone: savedProfile?.phone || '',
      email: '',
      guestCount: '2',
      date: getDefaultReservationDate(),
      time: getDefaultReservationTime(),
      duration: '90',
      tablePreference: '',
      occasion: '',
      notes: '',
    }
  })
  const [savedCustomer, setSavedCustomer] = useState(() =>
    getSavedCustomerProfile(),
  )
  const [savedDeliveryAddress, setSavedDeliveryAddress] = useState(() =>
    getSavedDeliveryAddress(),
  )
  const [saveDeliveryAddress, setSaveDeliveryAddress] = useState(() =>
    Boolean(getSavedDeliveryAddress()),
  )
  const [customerForm, setCustomerForm] = useState(() => {
    const savedProfile = getSavedCustomerProfile()
    const savedAddress = getSavedDeliveryAddress()

    return {
      name: savedProfile?.name || '',
      countryCode: savedProfile?.countryCode || '+971',
      phone: savedProfile?.phone || '',
      addressLabel: savedAddress?.label || 'Home',
      address: savedAddress?.address || '',
      buildingName: savedAddress?.buildingName || '',
      flatNumber: savedAddress?.flatNumber || '',
      streetName: savedAddress?.streetName || '',
      landmark: savedAddress?.landmark || '',
      mapUrl: savedAddress?.mapUrl || '',
      deliveryLat: savedAddress?.deliveryLat || '',
      deliveryLng: savedAddress?.deliveryLng || '',
      notes: '',
    }
  })

  const isTableOrder = Boolean(tableToken && table?.id)
  const orderType = isTableOrder ? 'dine_in' : 'delivery'
  const currency = restaurant?.currency || 'AED'
  const acceptsOrders = restaurant?.accept_outside_orders !== false
  const reservationEnabled = restaurant?.reservations_enabled !== false
  const restaurantDirectionUrl = useMemo(
    () => getRestaurantDirectionUrl(restaurant),
    [restaurant],
  )
  const customerSessionId = useMemo(() => getOrCreateCustomerSessionId(), [])

  const selectedDeliveryZone = useMemo(() => {
    if (isTableOrder) return null

    return deliveryZones.find((zone) => zone.id === selectedDeliveryZoneId) || null
  }, [deliveryZones, isTableOrder, selectedDeliveryZoneId])

  const publicDeliveryPaymentOptions = useMemo(
    () => getPublicDeliveryPaymentOptions(restaurant),
    [restaurant],
  )

  const activeMenuScheduleNotices = useMemo(
    () => getPublicActiveMenuScheduleNotices(menuSchedules),
    [menuSchedules],
  )

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
        public_cover_url,
        public_menu_theme,
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
        reservations_enabled,
        reservation_min_guests,
        reservation_max_guests,
        reservation_default_duration_minutes,
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

    const modifierGroupsByItem = await loadPublicModifierGroupsByItem(
      restaurantData.id,
    )

    const enrichedProducts = (productData || []).map((product) => ({
      ...product,
      modifierGroups: modifierGroupsByItem[product.id] || [],
    }))

    const { data: comboData } = await supabase
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
      .eq('restaurant_id', restaurantData.id)
      .eq('is_deleted', false)
      .eq('is_active', true)
      .eq('is_public', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(12)

    const visibleComboDeals = normalizePublicComboDeals(comboData)

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

    const { data: scheduleData } = await supabase
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
      .eq('restaurant_id', restaurantData.id)
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    const enrichedScheduledProducts = applyPublicMenuSchedulesToProducts(
      enrichedProducts,
      scheduleData || [],
    )

    const { data: zoneData } = await supabase
      .from('restaurant_delivery_zones')
      .select(`
        id,
        zone_name,
        city,
        area_name,
        delivery_fee,
        minimum_order_amount,
        packaging_fee,
        free_delivery_above,
        estimated_delivery_minutes,
        radius_km,
        maps_url,
        is_active
      `)
      .eq('restaurant_id', restaurantData.id)
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('zone_name', { ascending: true })
      .order('area_name', { ascending: true })

    setDeliveryZones(zoneData || [])

    setCategories(categoryData || [])
    setProducts(enrichedScheduledProducts)
    setMenuSchedules(scheduleData || [])
    setComboDeals(visibleComboDeals)
    setActiveCampaigns(visibleCampaigns.slice(0, 3))
    setLoading(false)
  }, [restaurantSlug, tableToken])

  useEffect(() => {
    loadPublicMenu()
  }, [loadPublicMenu])

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return products.filter((product) => {
      if (product.publicSchedule?.isHidden) return false

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
                ...(group.options || []).map((option) => option.name),
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

  const deliveryMinimumAmount = useMemo(() => {
    if (isTableOrder || !selectedDeliveryZone) return 0

    return getSafePublicAmount(selectedDeliveryZone.minimum_order_amount)
  }, [isTableOrder, selectedDeliveryZone])

  const shippingFeeAmount = useMemo(() => {
    if (isTableOrder) return 0

    if (selectedDeliveryZone) {
      const freeAbove = getSafePublicAmount(selectedDeliveryZone.free_delivery_above)

      if (freeAbove > 0 && Number(discountedCartTotal || 0) >= freeAbove) {
        return 0
      }

      return getSafePublicAmount(selectedDeliveryZone.delivery_fee)
    }

    return getSafePublicAmount(restaurant?.shipping_fee ?? restaurant?.delivery_fee)
  }, [discountedCartTotal, isTableOrder, restaurant?.delivery_fee, restaurant?.shipping_fee, selectedDeliveryZone])

  const packagingFeeAmount = useMemo(() => {
    if (isTableOrder) return 0

    if (selectedDeliveryZone) {
      return getSafePublicAmount(selectedDeliveryZone.packaging_fee)
    }

    return getSafePublicAmount(restaurant?.packaging_fee)
  }, [isTableOrder, restaurant?.packaging_fee, selectedDeliveryZone])

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

  const giftVoucherBaseTotal = useMemo(() => {
    return Math.max(
      Number(discountedCartTotal || 0) +
        Number(shippingFeeAmount || 0) +
        Number(packagingFeeAmount || 0) +
        Number(taxAmount || 0),
      0,
    )
  }, [discountedCartTotal, packagingFeeAmount, shippingFeeAmount, taxAmount])

  const giftVoucherDiscountAmount = useMemo(() => {
    if (!appliedGiftVoucher) return 0

    return Math.min(
      Number(
        appliedGiftVoucher.balanceAmount || appliedGiftVoucher.discountAmount || 0,
      ),
      Number(giftVoucherBaseTotal || 0),
    )
  }, [appliedGiftVoucher, giftVoucherBaseTotal])

  const cartPayableTotal = useMemo(() => {
    return Math.max(
      Number(giftVoucherBaseTotal || 0) - Number(giftVoucherDiscountAmount || 0),
      0,
    )
  }, [giftVoucherBaseTotal, giftVoucherDiscountAmount])

  useEffect(() => {
    if (cart.length === 0) {
      if (appliedReward) setAppliedReward(null)
      if (appliedCoupon) setAppliedCoupon(null)
      if (appliedGiftVoucher) setAppliedGiftVoucher(null)
    }
  }, [appliedCoupon, appliedGiftVoucher, appliedReward, cart.length])

  useEffect(() => {
    if (isTableOrder) {
      if (selectedDeliveryZoneId) setSelectedDeliveryZoneId('')
      return
    }

    if (
      selectedDeliveryZoneId &&
      !deliveryZones.some((zone) => zone.id === selectedDeliveryZoneId)
    ) {
      setSelectedDeliveryZoneId('')
    }
  }, [deliveryZones, isTableOrder, selectedDeliveryZoneId])

  useEffect(() => {
    if (isTableOrder) {
      if (deliveryPaymentChoice) setDeliveryPaymentChoice('')
      return
    }

    if (!deliveryPaymentChoice) return

    const resolvedChoice = resolvePublicDeliveryPaymentChoice(
      deliveryPaymentChoice,
      publicDeliveryPaymentOptions,
    )

    if (!resolvedChoice) {
      setDeliveryPaymentChoice('')
    }
  }, [deliveryPaymentChoice, isTableOrder, publicDeliveryPaymentOptions])

  const updateCustomerForm = (key, value) => {
    setCustomerForm((current) => ({ ...current, [key]: value }))
  }

  const applySavedDeliveryAddress = () => {
    if (!savedDeliveryAddress) {
      showPublicMessage('No saved delivery address found yet.')
      return
    }

    setCustomerForm((current) => ({
      ...current,
      addressLabel: savedDeliveryAddress.label || 'Home',
      address: savedDeliveryAddress.address || '',
      buildingName: savedDeliveryAddress.buildingName || '',
      flatNumber: savedDeliveryAddress.flatNumber || '',
      streetName: savedDeliveryAddress.streetName || '',
      landmark: savedDeliveryAddress.landmark || '',
      mapUrl: savedDeliveryAddress.mapUrl || '',
      deliveryLat: savedDeliveryAddress.deliveryLat || '',
      deliveryLng: savedDeliveryAddress.deliveryLng || '',
    }))

    showPublicMessage('Saved address applied.')
  }

  const clearSavedDeliveryAddress = () => {
    localStorage.removeItem('spizy_customer_delivery_address')
    setSavedDeliveryAddress(null)
    setSaveDeliveryAddress(false)
    showPublicMessage('Saved delivery address removed.')
  }

  const handleUseCurrentDeliveryLocation = () => {
    if (!navigator.geolocation) {
      showPublicMessage('Location is not supported on this device.')
      return
    }

    showPublicMessage('Getting your current location...')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude || 0).toFixed(7)
        const lng = Number(position.coords.longitude || 0).toFixed(7)
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

        setCustomerForm((current) => ({
          ...current,
          deliveryLat: lat,
          deliveryLng: lng,
          mapUrl,
        }))

        showPublicMessage('Location added to delivery address.')
      },
      () => {
        showPublicMessage('Location permission denied or unavailable.')
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      },
    )
  }

  const getCartProductQuantity = (productId) => {
    return cart
      .filter((item) => item.itemId === productId)
      .reduce((total, item) => total + item.quantity, 0)
  }

  const getBaseCartItem = (product) => {
    return cart.find((item) => item.lineKey === `${product.id}-base-noaddons`)
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

    if (!isProductPubliclyOrderable(product)) {
      showPublicMessage(getPublicScheduleUnavailableMessage(product))
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
      unitPrice: Number(product.price || 0),
      modifiers: [],
    })
  }

  const addToCart = ({ product, variation, unitPrice, modifiers = [] }) => {
    if (!acceptsOrders) {
      showPublicMessage('This menu is currently view-only. Ordering is turned off.')
      return
    }

    if (!isProductPubliclyOrderable(product)) {
      showPublicMessage(getPublicScheduleUnavailableMessage(product))
      return
    }

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
    const scheduledUnitPrice = getPublicScheduledPrice(
      product,
      Number(unitPrice || 0),
    )
    const finalUnitPrice = roundPublicMoney(scheduledUnitPrice + modifierTotal)
    const modifierSummary = safeModifiers.map((modifier) => modifier.name).join(', ')

    setCart((current) => {
      const existingLine = current.find((item) => item.lineKey === lineKey)

      if (existingLine) {
        return current.map((item) =>
          item.lineKey === lineKey
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: roundPublicMoney((item.quantity + 1) * item.unitPrice),
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
          baseUnitPrice: scheduledUnitPrice,
          scheduleOriginalUnitPrice: Number(unitPrice || 0),
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
    if (!acceptsOrders) {
      showPublicMessage('This menu is currently view-only. Ordering is turned off.')
      return
    }

    const comboItems = getAvailablePublicComboItems(combo)

    if (comboItems.length === 0) {
      showPublicMessage('This combo is not available right now.')
      return
    }

    const lineKey = `combo-${combo.id}`
    const unitPrice = roundPublicMoney(Number(combo.bundle_price || 0))
    const comboSummary = buildPublicComboSummary(comboItems)

    setCart((current) => {
      const existingLine = current.find((item) => item.lineKey === lineKey)

      if (existingLine) {
        return current.map((item) =>
          item.lineKey === lineKey
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: roundPublicMoney((item.quantity + 1) * item.unitPrice),
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

    showPublicMessage(`${combo.combo_name} added to cart.`)
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
              totalPrice: roundPublicMoney(quantity * item.unitPrice),
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

  const handleApplyGiftVoucher = async () => {
    if (!restaurant?.id) return

    const cleanCode = giftVoucherCode.trim().toUpperCase()

    if (!cleanCode) {
      showPublicMessage('Enter gift voucher code.')
      return
    }

    if (cart.length === 0) {
      showPublicMessage('Add items to cart before using a gift voucher.')
      return
    }

    if (Number(giftVoucherBaseTotal || 0) <= 0) {
      showPublicMessage('Gift voucher cannot be applied to zero total.')
      return
    }

    setGiftVoucherApplying(true)

    const activeCustomerPhone = savedCustomer?.fullPhone || customerFullPhone

    const { data, error } = await supabase.rpc('validate_public_gift_voucher', {
      p_restaurant_id: restaurant.id,
      p_voucher_code: cleanCode,
      p_order_total: giftVoucherBaseTotal,
      p_customer_phone: activeCustomerPhone || null,
    })

    setGiftVoucherApplying(false)

    if (error) {
      showPublicMessage(error.message)
      return
    }

    setAppliedGiftVoucher({
      id: data?.voucher_id || null,
      title: data?.title || 'Gift Voucher',
      code: data?.voucher_code || cleanCode,
      discountAmount: Number(data?.discount_amount || 0),
      balanceAmount: Number(data?.balance_amount || 0),
      remainingAfterUse: Number(data?.remaining_after_use || 0),
      message: data?.message || 'Gift voucher applied successfully.',
    })

    setGiftVoucherCode(data?.voucher_code || cleanCode)
    showPublicMessage(data?.message || 'Gift voucher applied successfully.')
  }

  const handleRemoveGiftVoucher = () => {
    setAppliedGiftVoucher(null)
    setGiftVoucherCode('')
  }


  const handlePlaceOrder = async () => {
    if (!acceptsOrders) {
      showPublicMessage('This restaurant is showing a view-only menu right now.')
      return
    }

    if (!isTableOrder && publicDeliveryPaymentOptions.length === 0) {
      showPublicMessage('No delivery payment option is active for this restaurant yet.')
      return
    }

    if (!isTableOrder && deliveryZones.length > 0 && !selectedDeliveryZone) {
      setShowCart(true)
      showPublicMessage('Choose your delivery area before placing the order.')
      return
    }

    if (
      !isTableOrder &&
      selectedDeliveryZone &&
      Number(deliveryMinimumAmount || 0) > 0 &&
      Number(cartTotal || 0) < Number(deliveryMinimumAmount || 0)
    ) {
      setShowCart(true)
      showPublicMessage(
        `Minimum order for ${selectedDeliveryZone.zone_name} is ${currency} ${Number(deliveryMinimumAmount || 0).toFixed(2)}.`,
      )
      return
    }

    const selectedPublicPayment = resolvePublicDeliveryPaymentChoice(
      deliveryPaymentChoice,
      publicDeliveryPaymentOptions,
    )

    if (!isTableOrder && !selectedPublicPayment) {
      if (publicDeliveryPaymentOptions.length === 1) {
        const onlyPaymentOption = publicDeliveryPaymentOptions[0]

        setDeliveryPaymentChoice(onlyPaymentOption.value)
        await submitOrderWithPayment(onlyPaymentOption.value)
        return
      }

      setShowCodChoiceModal(true)
      return
    }

    await submitOrderWithPayment(deliveryPaymentChoice)
  }

  const submitOrderWithPayment = async (selectedDeliveryPayment = '') => {
    if (!restaurant?.id) return

    if (cart.length === 0) return

    const selectedPublicPayment = isTableOrder
      ? null
      : resolvePublicDeliveryPaymentChoice(
          selectedDeliveryPayment || deliveryPaymentChoice,
          publicDeliveryPaymentOptions,
        )

    if (!isTableOrder && !selectedPublicPayment) {
      setSavingOrder(false)
      setShowCodChoiceModal(true)
      showPublicMessage('Choose an active delivery payment option.')
      return
    }

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

    if (!isTableOrder && !hasCustomerDeliveryAddress(customerForm)) {
      setShowCart(true)
      showPublicMessage('Add your delivery address before placing the order.')
      return
    }

    if (!isTableOrder && saveDeliveryAddress) {
      const addressPayload = buildDeliveryAddressPayload(customerForm)

      if (addressPayload) {
        localStorage.setItem(
          'spizy_customer_delivery_address',
          JSON.stringify(addressPayload),
        )
        setSavedDeliveryAddress(addressPayload)
      }
    }

    setSavingOrder(true)

    const { data, error } = await supabase.rpc(
      'place_public_menu_order_with_rewards_coupon_charges_voucher',
      {
        p_restaurant_id: restaurant.id,
        p_order_type: orderType,
        p_customer_session_id: customerSessionId,
        p_table_id: isTableOrder ? table?.id || null : null,
        p_table_name: isTableOrder ? table?.table_name || null : null,
        p_customer_name: activeCustomerName || null,
        p_customer_phone: activeCustomerPhone || null,
        p_currency: currency,
        p_notes: buildCustomerNotes(customerForm, isTableOrder, selectedDeliveryZone),
        p_reward_points_to_redeem: appliedReward
          ? Number(appliedReward.points || 0)
          : 0,
        p_reward_discount_amount: rewardDiscountAmount,
        p_coupon_code: appliedCoupon?.code || null,
        p_shipping_fee: isTableOrder ? 0 : shippingFeeAmount,
        p_packaging_fee: isTableOrder ? 0 : packagingFeeAmount,
        p_tax_rate: getSafePublicAmount(restaurant?.tax_rate),
        p_tax_amount: taxAmount,
        p_payment_gateway: isTableOrder ? null : selectedPublicPayment?.gateway || null,
        p_delivery_payment_type: isTableOrder
          ? null
          : selectedPublicPayment?.deliveryPaymentType || null,
        p_gift_voucher_code: appliedGiftVoucher?.code || null,
        p_gift_voucher_amount: giftVoucherDiscountAmount,
        p_items: expandPublicCartItemsForOrder(cart),
      },
    )

    if (error) {
      setSavingOrder(false)
      showPublicMessage(error.message)
      return
    }

    const orderResult = Array.isArray(data) ? data[0] : data

    if (!savedCustomer?.phone && cleanPhoneNumber(customerForm.phone)) {
      saveCustomerProfileFromForm()
    }

    const paymentResultReference =
      orderResult?.payment_reference ||
      orderResult?.gateway_order_id ||
      orderResult?.id ||
      orderResult?.order_code ||
      ''

    const orderSuccessPayload = {
      orderId: orderResult?.id || '',
      orderCode: orderResult?.order_code || 'Order placed',
      orderReference: paymentResultReference,
      restaurantSlug,
      total: cartPayableTotal,
      currency,
      orderType,
      isExistingBill: Boolean(orderResult?.is_existing_bill),
      rewardDiscount: rewardDiscountAmount,
      rewardPoints: appliedReward ? Number(appliedReward.points || 0) : 0,
      couponDiscount: couponDiscountAmount,
      couponCode: appliedCoupon?.code || '',
      giftVoucherDiscount: giftVoucherDiscountAmount,
      giftVoucherCode: appliedGiftVoucher?.code || '',
      shippingFee: shippingFeeAmount,
      packagingFee: packagingFeeAmount,
      taxAmount,
      deliveryPaymentChoice: selectedPublicPayment?.value || '',
      deliveryPaymentLabel: selectedPublicPayment?.label || '',
      paymentGateway: selectedPublicPayment?.gateway || '',
      deliveryPaymentType: selectedPublicPayment?.deliveryPaymentType || '',
      isOnlinePayment: Boolean(selectedPublicPayment?.isOnline),
      paymentStatus: selectedPublicPayment?.isOnline
        ? 'pending_online'
        : selectedPublicPayment
          ? 'collection_pending'
          : 'unpaid',
      paymentInstruction: getPublicPaymentInstructionFromChoice(selectedPublicPayment),
      deliveryZoneName: selectedDeliveryZone?.zone_name || '',
      createdAt: new Date().toISOString(),
    }

    if (isZiinaPublicPaymentChoice(selectedPublicPayment)) {
      try {
        const ziinaCheckout = await createPublicZiinaCheckoutSession({
          restaurantId: restaurant.id,
          restaurantSlug,
          orderId: orderResult?.id || '',
          orderCode: orderResult?.order_code || '',
          orderReference: paymentResultReference,
          customerSessionId,
        })

        const ziinaPaymentReference =
          ziinaCheckout?.payment_reference ||
          ziinaCheckout?.payment_intent_id ||
          ziinaCheckout?.gateway_order_id ||
          paymentResultReference

        const ziinaOrderSuccessPayload = {
          ...orderSuccessPayload,
          orderReference: ziinaPaymentReference || orderSuccessPayload.orderReference,
          paymentReference: ziinaPaymentReference || orderSuccessPayload.orderReference,
          paymentGateway: 'ziina',
          deliveryPaymentLabel: 'Ziina',
          paymentStatus: 'pending_online',
          paymentInstruction:
            ziinaCheckout?.message ||
            'Redirecting to Ziina secure checkout. Your order will remain pending until payment is completed.',
          gatewayRedirectUrl: ziinaCheckout?.redirect_url || '',
          gatewayOrderId: ziinaCheckout?.gateway_order_id || ziinaPaymentReference || '',
        }

        storePublicPaymentResultSnapshot(ziinaOrderSuccessPayload)

        if (ziinaCheckout?.redirect_url) {
          clearPublicCartAfterOrder({
            setCart,
            setAppliedReward,
            setAppliedCoupon,
            setCouponCode,
            setAppliedGiftVoucher,
            setGiftVoucherCode,
            setDeliveryPaymentChoice,
            setShowCart,
            setShowCodChoiceModal,
            setCustomerForm,
          })

          setSavingOrder(false)
          window.location.assign(ziinaCheckout.redirect_url)
          return
        }

        setOrderSuccess(ziinaOrderSuccessPayload)
      } catch (checkoutError) {
        const fallbackPayload = {
          ...orderSuccessPayload,
          paymentGateway: 'ziina',
          deliveryPaymentLabel: 'Ziina',
          paymentStatus: 'pending_online',
          paymentInstruction:
            checkoutError?.message ||
            'Ziina checkout could not be opened. The order is saved as unpaid/pending. Restaurant admin can retry or collect another way.',
        }

        storePublicPaymentResultSnapshot(fallbackPayload)
        setOrderSuccess(fallbackPayload)
        showPublicMessage(
          checkoutError?.message ||
            'Ziina checkout could not be opened. The order was saved as pending.',
        )
      }
    } else if (isStripePublicPaymentChoice(selectedPublicPayment)) {
      try {
        const stripeCheckout = await createPublicStripeCheckoutSession({
          restaurantId: restaurant.id,
          restaurantSlug,
          orderId: orderResult?.id || '',
          orderCode: orderResult?.order_code || '',
          orderReference: paymentResultReference,
          customerSessionId,
        })

        const stripePaymentReference =
          stripeCheckout?.payment_reference ||
          stripeCheckout?.checkout_session_id ||
          stripeCheckout?.gateway_order_id ||
          paymentResultReference

        const stripeOrderSuccessPayload = {
          ...orderSuccessPayload,
          orderReference: stripePaymentReference || orderSuccessPayload.orderReference,
          paymentReference: stripePaymentReference || orderSuccessPayload.orderReference,
          paymentGateway: 'stripe',
          deliveryPaymentLabel: 'Stripe',
          paymentStatus: 'pending_online',
          paymentInstruction:
            stripeCheckout?.message ||
            'Redirecting to Stripe secure checkout. Your order will remain pending until payment is completed.',
          gatewayRedirectUrl: stripeCheckout?.checkout_url || stripeCheckout?.redirect_url || '',
          gatewayOrderId: stripeCheckout?.checkout_session_id || stripePaymentReference || '',
        }

        storePublicPaymentResultSnapshot(stripeOrderSuccessPayload)

        if (stripeCheckout?.checkout_url || stripeCheckout?.redirect_url) {
          clearPublicCartAfterOrder({
            setCart,
            setAppliedReward,
            setAppliedCoupon,
            setCouponCode,
            setAppliedGiftVoucher,
            setGiftVoucherCode,
            setDeliveryPaymentChoice,
            setShowCart,
            setShowCodChoiceModal,
            setCustomerForm,
          })

          setSavingOrder(false)
          window.location.assign(stripeCheckout.checkout_url || stripeCheckout.redirect_url)
          return
        }

        setOrderSuccess(stripeOrderSuccessPayload)
      } catch (checkoutError) {
        const fallbackPayload = {
          ...orderSuccessPayload,
          paymentGateway: 'stripe',
          deliveryPaymentLabel: 'Stripe',
          paymentStatus: 'pending_online',
          paymentInstruction:
            checkoutError?.message ||
            'Stripe checkout could not be opened. The order is saved as unpaid/pending. Restaurant admin can retry or collect another way.',
        }

        storePublicPaymentResultSnapshot(fallbackPayload)
        setOrderSuccess(fallbackPayload)
        showPublicMessage(
          checkoutError?.message ||
            'Stripe checkout could not be opened. The order was saved as pending.',
        )
      }
    } else if (isPayPalPublicPaymentChoice(selectedPublicPayment)) {
      try {
        const paypalCheckout = await createPublicPayPalCheckoutOrder({
          restaurantId: restaurant.id,
          restaurantSlug,
          orderId: orderResult?.id || '',
          orderCode: orderResult?.order_code || '',
          orderReference: paymentResultReference,
          customerSessionId,
        })

        const paypalPaymentReference =
          paypalCheckout?.payment_reference ||
          paypalCheckout?.paypal_order_id ||
          paypalCheckout?.gateway_order_id ||
          paymentResultReference

        const paypalOrderSuccessPayload = {
          ...orderSuccessPayload,
          orderReference: paypalPaymentReference || orderSuccessPayload.orderReference,
          paymentReference: paypalPaymentReference || orderSuccessPayload.orderReference,
          paymentGateway: 'paypal',
          deliveryPaymentLabel: 'PayPal',
          paymentStatus: 'pending_online',
          paymentInstruction:
            paypalCheckout?.message ||
            'Redirecting to PayPal secure checkout. Your order will remain pending until payment is approved and captured.',
          gatewayRedirectUrl: paypalCheckout?.approval_url || paypalCheckout?.redirect_url || '',
          gatewayOrderId: paypalCheckout?.paypal_order_id || paypalPaymentReference || '',
        }

        storePublicPaymentResultSnapshot(paypalOrderSuccessPayload)

        if (paypalCheckout?.approval_url || paypalCheckout?.redirect_url) {
          clearPublicCartAfterOrder({
            setCart,
            setAppliedReward,
            setAppliedCoupon,
            setCouponCode,
            setAppliedGiftVoucher,
            setGiftVoucherCode,
            setDeliveryPaymentChoice,
            setShowCart,
            setShowCodChoiceModal,
            setCustomerForm,
          })

          setSavingOrder(false)
          window.location.assign(paypalCheckout.approval_url || paypalCheckout.redirect_url)
          return
        }

        setOrderSuccess(paypalOrderSuccessPayload)
      } catch (checkoutError) {
        const fallbackPayload = {
          ...orderSuccessPayload,
          paymentGateway: 'paypal',
          deliveryPaymentLabel: 'PayPal',
          paymentStatus: 'pending_online',
          paymentInstruction:
            checkoutError?.message ||
            'PayPal checkout could not be opened. The order is saved as unpaid/pending. Restaurant admin can retry or collect another way.',
        }

        storePublicPaymentResultSnapshot(fallbackPayload)
        setOrderSuccess(fallbackPayload)
        showPublicMessage(
          checkoutError?.message ||
            'PayPal checkout could not be opened. The order was saved as pending.',
        )
      }
    } else if (isRazorpayPublicPaymentChoice(selectedPublicPayment)) {
      try {
        const razorpayCheckout = await createPublicRazorpayPaymentLink({
          restaurantId: restaurant.id,
          restaurantSlug,
          orderId: orderResult?.id || '',
          orderCode: orderResult?.order_code || '',
          orderReference: paymentResultReference,
          customerSessionId,
        })

        const razorpayPaymentReference =
          razorpayCheckout?.payment_reference ||
          razorpayCheckout?.payment_link_id ||
          razorpayCheckout?.gateway_order_id ||
          paymentResultReference

        const razorpayOrderSuccessPayload = {
          ...orderSuccessPayload,
          orderReference: razorpayPaymentReference || orderSuccessPayload.orderReference,
          paymentReference: razorpayPaymentReference || orderSuccessPayload.orderReference,
          paymentGateway: 'razorpay',
          deliveryPaymentLabel: 'Razorpay',
          paymentStatus: 'pending_online',
          paymentInstruction:
            razorpayCheckout?.message ||
            'Redirecting to Razorpay secure payment link. Your order will remain pending until payment is completed.',
          gatewayRedirectUrl: razorpayCheckout?.payment_link_url || razorpayCheckout?.short_url || razorpayCheckout?.redirect_url || '',
          gatewayOrderId: razorpayCheckout?.payment_link_id || razorpayPaymentReference || '',
        }

        storePublicPaymentResultSnapshot(razorpayOrderSuccessPayload)

        if (razorpayCheckout?.payment_link_url || razorpayCheckout?.short_url || razorpayCheckout?.redirect_url) {
          clearPublicCartAfterOrder({
            setCart,
            setAppliedReward,
            setAppliedCoupon,
            setCouponCode,
            setAppliedGiftVoucher,
            setGiftVoucherCode,
            setDeliveryPaymentChoice,
            setShowCart,
            setShowCodChoiceModal,
            setCustomerForm,
          })

          setSavingOrder(false)
          window.location.assign(razorpayCheckout.payment_link_url || razorpayCheckout.short_url || razorpayCheckout.redirect_url)
          return
        }

        setOrderSuccess(razorpayOrderSuccessPayload)
      } catch (checkoutError) {
        const fallbackPayload = {
          ...orderSuccessPayload,
          paymentGateway: 'razorpay',
          deliveryPaymentLabel: 'Razorpay',
          paymentStatus: 'pending_online',
          paymentInstruction:
            checkoutError?.message ||
            'Razorpay payment link could not be opened. The order is saved as unpaid/pending. Restaurant admin can retry or collect another way.',
        }

        storePublicPaymentResultSnapshot(fallbackPayload)
        setOrderSuccess(fallbackPayload)
        showPublicMessage(
          checkoutError?.message ||
            'Razorpay payment link could not be opened. The order was saved as pending.',
        )
      }
    } else if (isCashfreePublicPaymentChoice(selectedPublicPayment)) {
      try {
        const cashfreeCheckout = await createPublicCashfreePaymentLink({
          restaurantId: restaurant.id,
          restaurantSlug,
          orderId: orderResult?.id || '',
          orderCode: orderResult?.order_code || '',
          orderReference: paymentResultReference,
          customerSessionId,
        })

        const cashfreePaymentReference =
          cashfreeCheckout?.payment_reference ||
          cashfreeCheckout?.payment_link_id ||
          cashfreeCheckout?.gateway_order_id ||
          paymentResultReference

        const cashfreeOrderSuccessPayload = {
          ...orderSuccessPayload,
          orderReference: cashfreePaymentReference || orderSuccessPayload.orderReference,
          paymentReference: cashfreePaymentReference || orderSuccessPayload.orderReference,
          paymentGateway: 'cashfree',
          deliveryPaymentLabel: 'Cashfree',
          paymentStatus: 'pending_online',
          paymentInstruction:
            cashfreeCheckout?.message ||
            'Redirecting to Cashfree secure payment link. Your order will remain pending until payment is completed.',
          gatewayRedirectUrl: cashfreeCheckout?.payment_link_url || cashfreeCheckout?.link_url || cashfreeCheckout?.redirect_url || '',
          gatewayOrderId: cashfreeCheckout?.payment_link_id || cashfreePaymentReference || '',
        }

        storePublicPaymentResultSnapshot(cashfreeOrderSuccessPayload)

        if (cashfreeCheckout?.payment_link_url || cashfreeCheckout?.link_url || cashfreeCheckout?.redirect_url) {
          clearPublicCartAfterOrder({
            setCart,
            setAppliedReward,
            setAppliedCoupon,
            setCouponCode,
            setAppliedGiftVoucher,
            setGiftVoucherCode,
            setDeliveryPaymentChoice,
            setShowCart,
            setShowCodChoiceModal,
            setCustomerForm,
          })

          setSavingOrder(false)
          window.location.assign(cashfreeCheckout.payment_link_url || cashfreeCheckout.link_url || cashfreeCheckout.redirect_url)
          return
        }

        setOrderSuccess(cashfreeOrderSuccessPayload)
      } catch (checkoutError) {
        const fallbackPayload = {
          ...orderSuccessPayload,
          paymentGateway: 'cashfree',
          deliveryPaymentLabel: 'Cashfree',
          paymentStatus: 'pending_online',
          paymentInstruction:
            checkoutError?.message ||
            'Cashfree payment link could not be opened. The order is saved as unpaid/pending. Restaurant admin can retry or collect another way.',
        }

        storePublicPaymentResultSnapshot(fallbackPayload)
        setOrderSuccess(fallbackPayload)
        showPublicMessage(
          checkoutError?.message ||
            'Cashfree payment link could not be opened. The order was saved as pending.',
        )
      }
    } else if (isNetworkPublicPaymentChoice(selectedPublicPayment)) {
      try {
        const networkCheckout = await createPublicNetworkCheckoutSession({
          restaurantId: restaurant.id,
          restaurantSlug,
          orderId: orderResult?.id || '',
          orderCode: orderResult?.order_code || '',
          orderReference: paymentResultReference,
          customerSessionId,
        })

        const networkPaymentReference =
          networkCheckout?.payment_reference ||
          networkCheckout?.ngenius_order_reference ||
          networkCheckout?.gateway_order_id ||
          paymentResultReference

        const networkOrderSuccessPayload = {
          ...orderSuccessPayload,
          orderReference: networkPaymentReference || orderSuccessPayload.orderReference,
          paymentReference: networkPaymentReference || orderSuccessPayload.orderReference,
          paymentGateway: 'network',
          deliveryPaymentLabel: 'Network / N-Genius',
          paymentStatus: 'pending_online',
          paymentInstruction:
            networkCheckout?.message ||
            'Redirecting to Network / N-Genius secure checkout. Your order will remain pending until payment is completed.',
          gatewayRedirectUrl: networkCheckout?.redirect_url || networkCheckout?.payment_url || '',
          gatewayOrderId: networkCheckout?.gateway_order_id || networkPaymentReference || '',
        }

        storePublicPaymentResultSnapshot(networkOrderSuccessPayload)

        if (networkCheckout?.redirect_url || networkCheckout?.payment_url) {
          clearPublicCartAfterOrder({
            setCart,
            setAppliedReward,
            setAppliedCoupon,
            setCouponCode,
            setAppliedGiftVoucher,
            setGiftVoucherCode,
            setDeliveryPaymentChoice,
            setShowCart,
            setShowCodChoiceModal,
            setCustomerForm,
          })

          setSavingOrder(false)
          window.location.assign(networkCheckout.redirect_url || networkCheckout.payment_url)
          return
        }

        setOrderSuccess(networkOrderSuccessPayload)
      } catch (checkoutError) {
        const fallbackPayload = {
          ...orderSuccessPayload,
          paymentGateway: 'network',
          deliveryPaymentLabel: 'Network / N-Genius',
          paymentStatus: 'pending_online',
          paymentInstruction:
            checkoutError?.message ||
            'Network / N-Genius checkout could not be opened. The order is saved as unpaid/pending. Restaurant admin can retry or collect another way.',
        }

        storePublicPaymentResultSnapshot(fallbackPayload)
        setOrderSuccess(fallbackPayload)
        showPublicMessage(
          checkoutError?.message ||
            'Network / N-Genius checkout could not be opened. The order was saved as pending.',
        )
      }
    } else if (isPhonePePublicPaymentChoice(selectedPublicPayment)) {
      try {
        const phonepeCheckout = await createPublicPhonePeCheckoutSession({
          restaurantId: restaurant.id,
          restaurantSlug,
          orderId: orderResult?.id || '',
          orderCode: orderResult?.order_code || '',
          orderReference: paymentResultReference,
          customerSessionId,
        })

        const phonepePaymentReference =
          phonepeCheckout?.payment_reference ||
          phonepeCheckout?.merchant_order_id ||
          phonepeCheckout?.gateway_order_id ||
          paymentResultReference

        const phonepeOrderSuccessPayload = {
          ...orderSuccessPayload,
          orderReference: phonepePaymentReference || orderSuccessPayload.orderReference,
          paymentReference: phonepePaymentReference || orderSuccessPayload.orderReference,
          paymentGateway: 'phonepe',
          deliveryPaymentLabel: 'PhonePe',
          paymentStatus: 'pending_online',
          paymentInstruction:
            phonepeCheckout?.message ||
            'Redirecting to PhonePe secure checkout. Your order will remain pending until payment is completed.',
          gatewayRedirectUrl: phonepeCheckout?.redirect_url || phonepeCheckout?.payment_link_url || '',
          gatewayOrderId: phonepeCheckout?.gateway_order_id || phonepePaymentReference || '',
        }

        storePublicPaymentResultSnapshot(phonepeOrderSuccessPayload)

        if (phonepeCheckout?.redirect_url || phonepeCheckout?.payment_link_url) {
          clearPublicCartAfterOrder({
            setCart,
            setAppliedReward,
            setAppliedCoupon,
            setCouponCode,
            setAppliedGiftVoucher,
            setGiftVoucherCode,
            setDeliveryPaymentChoice,
            setShowCart,
            setShowCodChoiceModal,
            setCustomerForm,
          })

          setSavingOrder(false)
          window.location.assign(phonepeCheckout.redirect_url || phonepeCheckout.payment_link_url)
          return
        }

        setOrderSuccess(phonepeOrderSuccessPayload)
      } catch (checkoutError) {
        const fallbackPayload = {
          ...orderSuccessPayload,
          paymentGateway: 'phonepe',
          deliveryPaymentLabel: 'PhonePe',
          paymentStatus: 'pending_online',
          paymentInstruction:
            checkoutError?.message ||
            'PhonePe checkout could not be opened. The order is saved as unpaid/pending. Restaurant admin can retry or collect another way.',
        }

        storePublicPaymentResultSnapshot(fallbackPayload)
        setOrderSuccess(fallbackPayload)
        showPublicMessage(
          checkoutError?.message ||
            'PhonePe checkout could not be opened. The order was saved as pending.',
        )
      }
    } else {
      storePublicPaymentResultSnapshot(orderSuccessPayload)
      setOrderSuccess(orderSuccessPayload)
    }

    setSavingOrder(false)

    clearPublicCartAfterOrder({
      setCart,
      setAppliedReward,
      setAppliedCoupon,
      setCouponCode,
      setAppliedGiftVoucher,
      setGiftVoucherCode,
      setDeliveryPaymentChoice,
      setShowCart,
      setShowCodChoiceModal,
      setCustomerForm,
    })

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

  const handleOpenServiceRequest = () => {
    if (!restaurant?.id) {
      showPublicMessage('Restaurant not ready.')
      return
    }

    if (!isTableOrder) {
      showPublicMessage('Service request is available after scanning a table QR.')
      return
    }

    setServiceForm((current) => ({
      ...current,
      name: savedCustomer?.name || current.name || customerForm.name,
      countryCode:
        savedCustomer?.countryCode ||
        current.countryCode ||
        customerForm.countryCode ||
        '+971',
      phone: savedCustomer?.phone || current.phone || customerForm.phone,
    }))
    setShowServiceModal(true)
  }

  const updateServiceForm = (key, value) => {
    setServiceForm((current) => ({ ...current, [key]: value }))
  }

  const handleSubmitServiceRequest = async () => {
    if (!restaurant?.id || !table?.id) return

    const cleanPhone = cleanPhoneNumber(serviceForm.phone)
    const fullPhone = getFullPhoneNumber({
      countryCode: serviceForm.countryCode,
      phone: cleanPhone,
    })

    setServiceSaving(true)

    const { data, error } = await supabase.rpc('create_public_service_request', {
      p_restaurant_id: restaurant.id,
      p_table_id: table.id,
      p_table_name: table.table_name || null,
      p_customer_session_id: customerSessionId,
      p_customer_name: serviceForm.name.trim() || null,
      p_customer_phone: fullPhone || null,
      p_request_type: serviceForm.requestType || 'waiter',
      p_message: serviceForm.message.trim() || null,
    })

    setServiceSaving(false)

    if (error) {
      showPublicMessage(error.message)
      return
    }

    if (cleanPhone) {
      const profile = {
        name: serviceForm.name.trim(),
        countryCode: serviceForm.countryCode || '+971',
        phone: cleanPhone,
        fullPhone,
      }
      localStorage.setItem('spizy_customer_profile', JSON.stringify(profile))
      setSavedCustomer(profile)
    }

    const requestResult = Array.isArray(data) ? data[0] : data

    setServiceSuccess({
      code: requestResult?.request_code || 'Request sent',
      type: serviceForm.requestType,
      tableName: table.table_name || 'Table',
    })
    setServiceForm((current) => ({
      ...current,
      requestType: 'waiter',
      message: '',
    }))
    setShowServiceModal(false)
    showPublicMessage('Service request sent to restaurant.')
  }

  const handleOpenReservation = () => {
    if (!restaurant?.id) {
      showPublicMessage('Restaurant not ready.')
      return
    }

    if (!reservationEnabled) {
      showPublicMessage('Table booking is not active for this restaurant.')
      return
    }

    setReservationForm((current) => ({
      ...current,
      name: savedCustomer?.name || current.name || customerForm.name,
      countryCode:
        savedCustomer?.countryCode ||
        current.countryCode ||
        customerForm.countryCode ||
        '+971',
      phone: savedCustomer?.phone || current.phone || customerForm.phone,
      duration:
        current.duration ||
        String(restaurant?.reservation_default_duration_minutes || 90),
    }))
    setShowReservationModal(true)
  }

  const updateReservationForm = (key, value) => {
    setReservationForm((current) => ({ ...current, [key]: value }))
  }

  const handleSubmitReservation = async () => {
    if (!restaurant?.id) return

    const cleanName = reservationForm.name.trim()
    const cleanPhone = cleanPhoneNumber(reservationForm.phone)
    const fullPhone = getFullPhoneNumber({
      countryCode: reservationForm.countryCode,
      phone: cleanPhone,
    })
    const guestCount = Number(reservationForm.guestCount || 0)
    const minGuests = Number(restaurant?.reservation_min_guests || 1)
    const maxGuests = Number(restaurant?.reservation_max_guests || 30)

    if (!cleanName) {
      showPublicMessage('Enter your name for table booking.')
      return
    }

    if (!cleanPhone) {
      showPublicMessage('Enter your phone number for booking updates.')
      return
    }

    if (!reservationForm.date || !reservationForm.time) {
      showPublicMessage('Choose reservation date and time.')
      return
    }

    if (guestCount < minGuests || guestCount > maxGuests) {
      showPublicMessage(`Guest count should be between ${minGuests} and ${maxGuests}.`)
      return
    }

    setReservationSaving(true)

    const { data, error } = await supabase.rpc('create_public_reservation', {
      p_restaurant_id: restaurant.id,
      p_customer_session_id: customerSessionId,
      p_customer_name: cleanName,
      p_customer_phone: fullPhone,
      p_customer_email: reservationForm.email.trim() || null,
      p_guest_count: guestCount,
      p_reservation_date: reservationForm.date,
      p_reservation_time: reservationForm.time,
      p_expected_duration_minutes: Number(reservationForm.duration || 90),
      p_table_preference: reservationForm.tablePreference.trim() || null,
      p_occasion: reservationForm.occasion.trim() || null,
      p_notes: reservationForm.notes.trim() || null,
    })

    setReservationSaving(false)

    if (error) {
      showPublicMessage(error.message)
      return
    }

    const reservationResult = Array.isArray(data) ? data[0] : data
    const profile = {
      name: cleanName,
      countryCode: reservationForm.countryCode || '+971',
      phone: cleanPhone,
      fullPhone,
    }

    localStorage.setItem('spizy_customer_profile', JSON.stringify(profile))
    setSavedCustomer(profile)

    setReservationSuccess({
      code: reservationResult?.reservation_code || 'Booking received',
      date: reservationResult?.reservation_date || reservationForm.date,
      time: reservationResult?.reservation_time || reservationForm.time,
      guests: guestCount,
      status: reservationResult?.status || 'pending',
    })
    setShowReservationModal(false)
    showPublicMessage('Table booking request sent.')
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

  const publicTheme = normalizePublicMenuTheme(restaurant.public_menu_theme)

  return (
    <main
      className={`public-menu-page theme-${publicTheme.header_style} products-${publicTheme.product_card_style}`}
      style={getPublicThemeStyle(publicTheme)}
    >
      <PublicWarningListener />

      <header className="public-menu-header">
        <div className="public-restaurant-brand">
          {publicTheme.show_logo && (
          <div className="public-menu-logo">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt={restaurant.name} />
            ) : (
              restaurant.name.slice(0, 2).toUpperCase()
            )}
          </div>
          )}

          <div>
            <p className="public-menu-label">Spizy Menu</p>
            <h1>{restaurant.name}</h1>
            <span>{restaurant.address || 'Fresh menu. Easy ordering.'}</span>
          </div>
        </div>

        <div className="public-header-side-actions">
          {reservationEnabled && (
            <button
              type="button"
              className="public-book-table-button compact"
              onClick={handleOpenReservation}
            >
              <CalendarCheck size={16} />
              Book Table
            </button>
          )}

          {isTableOrder && (
            <button
              type="button"
              className="public-service-call-button compact"
              onClick={handleOpenServiceRequest}
            >
              <BellRing size={16} />
              Call Waiter
            </button>
          )}

          {publicTheme.show_directions && restaurantDirectionUrl && (
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

      {publicTheme.show_cover_image && restaurant.public_cover_url && (
        <section className="public-menu-cover-card">
          <img src={restaurant.public_cover_url} alt={`${restaurant.name} cover`} />
        </section>
      )}

      {publicTheme.show_social_links && <PublicSocialLinks restaurant={restaurant} />}

      {isTableOrder && (
        <section className="public-service-quick-card">
          <div>
            <span>Need help at your table?</span>
            <strong>Call waiter, water, tissue or quick support</strong>
            <small>Your request goes directly to the restaurant team.</small>
          </div>

          <button type="button" onClick={handleOpenServiceRequest}>
            <BellRing size={17} />
            Call Service
          </button>
        </section>
      )}

      {reservationEnabled && (
        <section className="public-reservation-quick-card">
          <div>
            <span>Planning a visit?</span>
            <strong>Reserve your table in seconds</strong>
            <small>Choose date, time, guest count and special occasion.</small>
          </div>

          <button type="button" onClick={handleOpenReservation}>
            <CalendarCheck size={17} />
            Book Table
          </button>
        </section>
      )}

      {!acceptsOrders && (
        <section className="public-view-only-notice">
          <strong>View-only menu</strong>
          <span>Ordering is temporarily turned off by this restaurant. You can still browse the menu and use directions.</span>
        </section>
      )}

      {activeMenuScheduleNotices.length > 0 && (
        <PublicMenuScheduleNotice notices={activeMenuScheduleNotices} />
      )}

      {publicTheme.show_campaigns && activeCampaigns.length > 0 && (
        <PublicCampaignStrip
          campaigns={activeCampaigns}
          currency={currency}
          onCampaignAction={handleCampaignAction}
          onCopyCoupon={handleCopyCampaignCoupon}
        />
      )}

      {comboDeals.length > 0 && (
        <PublicComboDealsSection
          combos={comboDeals}
          currency={currency}
          acceptsOrders={acceptsOrders}
          onAddCombo={addComboToCart}
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
        <section className="public-product-grid" id="public-menu-items">
          {filteredProducts.map((product) => {
            const variations = getAvailableVariations(product)
            const modifierGroups = getAvailableModifierGroups(product)
            const hasOptions = product.has_variations && variations.length > 0
            const hasModifiers = modifierGroups.length > 0
            const shouldCustomize = hasOptions || hasModifiers
            const scheduleState = product.publicSchedule || {}
            const isScheduleUnavailable = scheduleState.isUnavailable === true
            const displayPrice = getPublicScheduledPrice(
              product,
              Number(product.price || 0),
            )
            const showOriginalPrice =
              Number(displayPrice || 0) < Number(product.price || 0)
            const productQuantity = getCartProductQuantity(product.id)
            const baseCartItem = getBaseCartItem(product)

            return (
              <article
                className={`public-product-card ${
                  isScheduleUnavailable ? 'schedule-unavailable' : ''
                }`}
                key={product.id}
              >
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
                    {scheduleState.badge && (
                      <span className={`public-schedule-product-badge ${scheduleState.badgeType || ''}`}>
                        {scheduleState.badge}
                      </span>
                    )}
                    <h3>{product.name}</h3>
                    <p>{product.description || 'Tap to add this item.'}</p>

                    <div className="public-product-price-row">
                      <strong>
                        {shouldCustomize ? 'From ' : ''}
                        {currency} {Number(displayPrice || 0).toFixed(2)}
                        {showOriginalPrice && (
                          <small className="public-schedule-original-price">
                            {currency} {Number(product.price || 0).toFixed(2)}
                          </small>
                        )}
                      </strong>

                      {shouldCustomize && productQuantity > 0 && (
                        <small>{productQuantity} in cart</small>
                      )}
                    </div>
                  </div>
                </button>

                <div className="public-product-action-area">
                  {!acceptsOrders ? (
                    <div className="public-view-only-pill">View only</div>
                  ) : isScheduleUnavailable ? (
                    <div className="public-view-only-pill schedule">
                      {scheduleState.shortLabel || 'Not now'}
                    </div>
                  ) : shouldCustomize ? (
                    <button
                      type="button"
                      className="public-add-button option"
                      onClick={() => setVariationProduct(product)}
                    >
                      {productQuantity > 0
                        ? 'Customize'
                        : hasOptions
                          ? 'Choose'
                          : 'Customize'}
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
                          modifiers: [],
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

      {showServiceModal && (
        <PublicServiceRequestModal
          form={serviceForm}
          table={table}
          saving={serviceSaving}
          phoneCountryOptions={phoneCountryOptions}
          onClose={() => setShowServiceModal(false)}
          onUpdate={updateServiceForm}
          onSubmit={handleSubmitServiceRequest}
        />
      )}

      {serviceSuccess && (
        <PublicServiceRequestSuccessModal
          request={serviceSuccess}
          onClose={() => setServiceSuccess(null)}
        />
      )}

      {showReservationModal && (
        <PublicReservationModal
          restaurant={restaurant}
          form={reservationForm}
          saving={reservationSaving}
          phoneCountryOptions={phoneCountryOptions}
          onClose={() => setShowReservationModal(false)}
          onUpdate={updateReservationForm}
          onSubmit={handleSubmitReservation}
        />
      )}

      {reservationSuccess && (
        <PublicReservationSuccessModal
          reservation={reservationSuccess}
          restaurantName={restaurant?.name || 'Restaurant'}
          onClose={() => setReservationSuccess(null)}
        />
      )}

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
          deliveryPaymentOptions={publicDeliveryPaymentOptions}
          deliveryZones={deliveryZones}
          selectedDeliveryZoneId={selectedDeliveryZoneId}
          selectedDeliveryZone={selectedDeliveryZone}
          deliveryMinimumAmount={deliveryMinimumAmount}
          savedDeliveryAddress={savedDeliveryAddress}
          saveDeliveryAddress={saveDeliveryAddress}
          rewardDiscountAmount={rewardDiscountAmount}
          couponDiscountAmount={couponDiscountAmount}
          couponCode={couponCode}
          appliedCoupon={appliedCoupon}
          couponApplying={couponApplying}
          giftVoucherDiscountAmount={giftVoucherDiscountAmount}
          giftVoucherCode={giftVoucherCode}
          appliedGiftVoucher={appliedGiftVoucher}
          giftVoucherApplying={giftVoucherApplying}
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
          onGiftVoucherCodeChange={setGiftVoucherCode}
          onApplyGiftVoucher={handleApplyGiftVoucher}
          onRemoveGiftVoucher={handleRemoveGiftVoucher}
          onOpenRewards={() => loadCustomerRewards()}
          onRemoveReward={() => setAppliedReward(null)}
          onDeliveryZoneChange={setSelectedDeliveryZoneId}
          onDeliveryPaymentChoiceChange={setDeliveryPaymentChoice}
          onSaveDeliveryAddressChange={setSaveDeliveryAddress}
          onUseSavedDeliveryAddress={applySavedDeliveryAddress}
          onClearSavedDeliveryAddress={clearSavedDeliveryAddress}
          onUseCurrentLocation={handleUseCurrentDeliveryLocation}
          onPlaceOrder={handlePlaceOrder}
        />
      )}

      {showCodChoiceModal && (
        <PublicPaymentChoiceModal
          currency={currency}
          total={cartPayableTotal}
          options={publicDeliveryPaymentOptions}
          selectedValue={deliveryPaymentChoice}
          saving={savingOrder}
          onClose={() => setShowCodChoiceModal(false)}
          onChoose={(choice) => {
            setDeliveryPaymentChoice(choice)
            submitOrderWithPayment(choice)
          }}
        />
      )}

      {variationProduct && (
        <PublicCustomizeItemModal
          product={variationProduct}
          currency={currency}
          onClose={() => setVariationProduct(null)}
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
          onReviewOrder={publicTheme.show_reviews ? handleOpenReview : null}
        />
      )}

      {publicTheme.show_reviews && reviewOrder && (
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




function PublicMenuScheduleNotice({ notices }) {
  if (!Array.isArray(notices) || notices.length === 0) return null

  return (
    <section className="public-menu-schedule-notice">
      <div className="public-menu-schedule-notice-icon">⏱</div>
      <div>
        <span>Live menu timing</span>
        <strong>{notices[0].title}</strong>
        {notices[0].text && <small>{notices[0].text}</small>}
      </div>

      {notices.length > 1 && (
        <div className="public-menu-schedule-extra">
          +{notices.length - 1} more rule{notices.length - 1 === 1 ? '' : 's'}
        </div>
      )}
    </section>
  )
}

function PublicComboDealsSection({ combos, currency, acceptsOrders, onAddCombo }) {
  return (
    <section className="public-combo-deals-section">
      <div className="public-combo-head">
        <div>
          <p className="public-menu-label">Combo Deals</p>
          <h2>Meal bundles and family offers</h2>
          <span>Pick ready-made combos and save more on your order.</span>
        </div>
      </div>

      <div className="public-combo-scroll-row">
        {combos.map((combo) => (
          <PublicComboDealCard
            combo={combo}
            currency={currency}
            acceptsOrders={acceptsOrders}
            onAddCombo={onAddCombo}
            key={combo.id}
          />
        ))}
      </div>
    </section>
  )
}

function PublicComboDealCard({ combo, currency, acceptsOrders, onAddCombo }) {
  const comboItems = getAvailablePublicComboItems(combo)
  const menuValue = getPublicComboMenuValue(comboItems)
  const bundlePrice = Number(combo.bundle_price || 0)
  const savings = Math.max(menuValue - bundlePrice, 0)
  const firstImage = comboItems.find((item) => item.imageUrl)?.imageUrl

  return (
    <article className="public-combo-card">
      <div className="public-combo-card-top">
        <div className="public-combo-image">
          {firstImage ? (
            <img src={firstImage} alt={combo.combo_name} />
          ) : (
            <Sparkles size={24} />
          )}
        </div>

        <div className="public-combo-title-area">
          <span>{combo.combo_code || 'COMBO'}</span>
          <h3>{combo.combo_name}</h3>
          {combo.description && <p>{combo.description}</p>}
        </div>
      </div>

      <div className="public-combo-items-list">
        {comboItems.slice(0, 4).map((item) => (
          <div key={`${combo.id}-${item.itemId}-${item.variationId || 'base'}`}>
            <span>{Number(item.quantity || 1)} × {item.itemName}</span>
            {item.variationName && <small>{item.variationName}</small>}
          </div>
        ))}
        {comboItems.length > 4 && (
          <div>
            <span>+ {comboItems.length - 4} more item{comboItems.length - 4 === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>

      <div className="public-combo-price-row">
        <div>
          <span>Combo price</span>
          <strong>{currency} {bundlePrice.toFixed(2)}</strong>
        </div>

        {savings > 0 && (
          <small>Save {currency} {savings.toFixed(2)}</small>
        )}
      </div>

      <button
        type="button"
        className="public-combo-add-button"
        onClick={() => onAddCombo(combo)}
        disabled={!acceptsOrders || comboItems.length === 0}
      >
        {acceptsOrders ? '+ Add Combo' : 'View only'}
      </button>
    </article>
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

function PublicPaymentChoiceModal({
  currency,
  total,
  options,
  selectedValue,
  saving,
  onClose,
  onChoose,
}) {
  const paymentOptions = Array.isArray(options) ? options : []

  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-payment-choice-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-cart-head">
          <div>
            <p className="public-menu-label">Delivery Payment</p>
            <h2>Choose payment option</h2>
            <span>
              Total: {currency} {Number(total || 0).toFixed(2)}
            </span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {paymentOptions.length === 0 ? (
          <div className="public-payment-empty">
            No delivery payment option is active for this restaurant yet.
          </div>
        ) : (
          <div className="public-payment-choice-grid">
            {paymentOptions.map((option) => (
              <button
                type="button"
                className={selectedValue === option.value ? 'active' : ''}
                onClick={() => onChoose(option.value)}
                disabled={saving}
                key={option.value}
              >
                <span className="public-payment-logo">
                  {option.gateway === 'cod' ? (
                    option.deliveryPaymentType === 'card' ? (
                      <CreditCard size={24} />
                    ) : (
                      <Banknote size={24} />
                    )
                  ) : (
                    <img
                      src={`/payment-gateways/${option.gateway}.png`}
                      alt={option.label}
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                    />
                  )}
                </span>
                <strong>{option.label}</strong>
                <span>{option.text}</span>
                <small className={option.isOnline ? 'online' : 'offline'}>
                  {option.statusText}
                </small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PublicDeliveryPaymentSelector({ options, selectedValue, onChange }) {
  const paymentOptions = Array.isArray(options) ? options : []
  const selectedPayment = resolvePublicDeliveryPaymentChoice(
    selectedValue,
    paymentOptions,
  )

  return (
    <div className="public-delivery-payment-preview payment-gateway-selector">
      <div>
        <span>Delivery payment</span>
        <strong>{selectedPayment?.label || 'Choose payment option'}</strong>
        <small>Only payment options activated by the restaurant are shown here.</small>
      </div>

      {paymentOptions.length === 0 ? (
        <div className="public-payment-empty compact">
          No delivery payment option is active.
        </div>
      ) : (
        <div className="public-delivery-payment-buttons gateway-buttons">
          {paymentOptions.map((option) => (
            <button
              type="button"
              className={[
                selectedValue === option.value ? 'active' : '',
                option.isHighlighted ? 'recommended' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onChange(option.value)}
              key={option.value}
            >
              {option.gateway === 'cod' ? (
                option.deliveryPaymentType === 'card' ? (
                  <CreditCard size={15} />
                ) : (
                  <Banknote size={15} />
                )
              ) : (
                <span className="public-inline-gateway-logo">
                  <img
                    src={`/payment-gateways/${option.gateway}.png`}
                    alt={option.label}
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                </span>
              )}
              <span>{option.shortLabel || option.label}</span>
              {option.isHighlighted && (
                <small className="public-payment-recommended">Recommended</small>
              )}
            </button>
          ))}
        </div>
      )}

      {selectedPayment && (
        <div className={`public-online-payment-note ${selectedPayment.isOnline ? 'online' : 'cod'}`}>
          {selectedPayment.statusText}
        </div>
      )}
    </div>
  )
}


function PublicServiceRequestModal({
  form,
  table,
  saving,
  phoneCountryOptions,
  onClose,
  onUpdate,
  onSubmit,
}) {
  const requestTypes = [
    { value: 'waiter', label: 'Call waiter', text: 'Need staff assistance' },
    { value: 'water', label: 'Water', text: 'Request drinking water' },
    { value: 'tissue', label: 'Tissue', text: 'Need tissue or napkins' },
    { value: 'cutlery', label: 'Cutlery', text: 'Spoon, fork or plates' },
    { value: 'cleaning', label: 'Clean table', text: 'Table cleaning help' },
    { value: 'bill', label: 'Bill help', text: 'Ask for bill/payment help' },
    { value: 'custom', label: 'Other', text: 'Write your request' },
  ]

  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-service-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-cart-head public-service-head">
          <div>
            <p className="public-menu-label">Table Service</p>
            <h2>{table?.table_name || 'Your table'}</h2>
            <span>Send a quick help request to the restaurant team.</span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="public-service-type-grid">
          {requestTypes.map((type) => (
            <button
              type="button"
              key={type.value}
              className={form.requestType === type.value ? 'active' : ''}
              onClick={() => onUpdate('requestType', type.value)}
            >
              <strong>{type.label}</strong>
              <span>{type.text}</span>
            </button>
          ))}
        </div>

        <div className="public-customer-fields public-service-fields">
          <input
            type="text"
            value={form.name}
            onChange={(event) => onUpdate('name', event.target.value)}
            placeholder="Your name optional"
          />

          <div className="public-phone-row">
            <select
              value={form.countryCode}
              onChange={(event) => onUpdate('countryCode', event.target.value)}
            >
              {phoneCountryOptions.map((country) => (
                <option value={country.code} key={country.code}>
                  {country.label} {country.code}
                </option>
              ))}
            </select>

            <input
              type="tel"
              value={form.phone}
              onChange={(event) => onUpdate('phone', event.target.value)}
              placeholder="Phone optional"
            />
          </div>

          <textarea
            value={form.message}
            onChange={(event) => onUpdate('message', event.target.value)}
            placeholder="Extra note optional"
            rows="3"
          />
        </div>

        <button
          type="button"
          className="public-service-send-button"
          onClick={onSubmit}
          disabled={saving}
        >
          {saving ? 'Sending...' : 'Send Request'}
        </button>
      </div>
    </div>
  )
}

function PublicServiceRequestSuccessModal({ request, onClose }) {
  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-service-success-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-service-success-icon">✓</div>
        <p className="public-menu-label">Request Sent</p>
        <h2>{request.code}</h2>
        <p>
          Your service request was sent to the restaurant team. Please stay near{' '}
          {request.tableName || 'your table'}.
        </p>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

function PublicReservationModal({
  restaurant,
  form,
  saving,
  phoneCountryOptions,
  onClose,
  onUpdate,
  onSubmit,
}) {
  const minGuests = Number(restaurant?.reservation_min_guests || 1)
  const maxGuests = Number(restaurant?.reservation_max_guests || 30)

  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-reservation-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-cart-head public-reservation-head">
          <div>
            <p className="public-menu-label">Table Booking</p>
            <h2>Reserve a table</h2>
            <span>{restaurant?.name || 'Restaurant'} will confirm your booking.</span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="public-reservation-grid">
          <label className="public-reservation-field full">
            <span>Your name</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => onUpdate('name', event.target.value)}
              placeholder="Full name"
            />
          </label>

          <label className="public-reservation-field full">
            <span>Phone number</span>
            <div className="public-phone-row reservation-phone-row">
              <select
                value={form.countryCode}
                onChange={(event) => onUpdate('countryCode', event.target.value)}
              >
                {phoneCountryOptions.map((country) => (
                  <option value={country.code} key={country.code}>
                    {country.label} {country.code}
                  </option>
                ))}
              </select>

              <input
                type="tel"
                value={form.phone}
                onChange={(event) => onUpdate('phone', event.target.value)}
                placeholder="Phone for confirmation"
              />
            </div>
          </label>

          <label className="public-reservation-field full">
            <span>Email optional</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => onUpdate('email', event.target.value)}
              placeholder="email@example.com"
            />
          </label>

          <label className="public-reservation-field">
            <span>Guests</span>
            <input
              type="number"
              min={minGuests}
              max={maxGuests}
              value={form.guestCount}
              onChange={(event) => onUpdate('guestCount', event.target.value)}
            />
            <small>{minGuests} to {maxGuests} guests</small>
          </label>

          <label className="public-reservation-field">
            <span>Date</span>
            <input
              type="date"
              value={form.date}
              min={getTodayDateInput()}
              onChange={(event) => onUpdate('date', event.target.value)}
            />
          </label>

          <label className="public-reservation-field">
            <span>Time</span>
            <input
              type="time"
              value={form.time}
              step="900"
              onChange={(event) => onUpdate('time', event.target.value)}
            />
          </label>

          <label className="public-reservation-field">
            <span>Duration</span>
            <select
              value={form.duration}
              onChange={(event) => onUpdate('duration', event.target.value)}
            >
              <option value="60">1 hour</option>
              <option value="90">1 hour 30 minutes</option>
              <option value="120">2 hours</option>
              <option value="150">2 hours 30 minutes</option>
              <option value="180">3 hours</option>
            </select>
          </label>

          <label className="public-reservation-field full">
            <span>Table preference</span>
            <input
              type="text"
              value={form.tablePreference}
              onChange={(event) => onUpdate('tablePreference', event.target.value)}
              placeholder="Family area, outdoor, window side..."
            />
          </label>

          <label className="public-reservation-field full">
            <span>Occasion optional</span>
            <input
              type="text"
              value={form.occasion}
              onChange={(event) => onUpdate('occasion', event.target.value)}
              placeholder="Birthday, anniversary, meeting..."
            />
          </label>

          <label className="public-reservation-field full">
            <span>Special notes</span>
            <textarea
              value={form.notes}
              onChange={(event) => onUpdate('notes', event.target.value)}
              placeholder="Any special request for the restaurant"
              rows="3"
            />
          </label>
        </div>

        <div className="public-reservation-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>

          <button type="button" onClick={onSubmit} disabled={saving}>
            {saving ? 'Sending booking...' : 'Request Booking'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PublicReservationSuccessModal({ reservation, restaurantName, onClose }) {
  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-reservation-success-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="success-icon">✓</div>
        <p className="public-menu-label">Booking Request Sent</p>
        <h2>{reservation.code}</h2>
        <p>
          {restaurantName} received your table booking request. The restaurant
          can confirm it from their reservation dashboard.
        </p>

        <div className="public-reservation-success-details">
          <span>{formatPublicReservationDate(reservation.date)}</span>
          <span>{formatPublicReservationTime(reservation.time)}</span>
          <span>{reservation.guests} guest{Number(reservation.guests) === 1 ? '' : 's'}</span>
          <span>{formatPublicReservationStatus(reservation.status)}</span>
        </div>

        <button type="button" onClick={onClose}>
          Close
        </button>
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
  deliveryPaymentOptions,
  deliveryZones,
  selectedDeliveryZoneId,
  selectedDeliveryZone,
  deliveryMinimumAmount,
  savedDeliveryAddress,
  saveDeliveryAddress,
  rewardDiscountAmount,
  couponDiscountAmount,
  couponCode,
  appliedCoupon,
  couponApplying,
  giftVoucherDiscountAmount,
  giftVoucherCode,
  appliedGiftVoucher,
  giftVoucherApplying,
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
  onGiftVoucherCodeChange,
  onApplyGiftVoucher,
  onRemoveGiftVoucher,
  onOpenRewards,
  onRemoveReward,
  onDeliveryZoneChange,
  onDeliveryPaymentChoiceChange,
  onSaveDeliveryAddressChange,
  onUseSavedDeliveryAddress,
  onClearSavedDeliveryAddress,
  onUseCurrentLocation,
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
                {item.modifierSummary && (
                  <span className="public-cart-modifier-summary">
                    Add-ons: {item.modifierSummary}
                  </span>
                )}
                {item.comboSummary && (
                  <span className="public-cart-modifier-summary combo">
                    Includes: {item.comboSummary}
                  </span>
                )}
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

          {!isTableOrder && deliveryZones.length > 0 && (
            <div className="public-delivery-zone-selector">
              <label>
                <span>Delivery area</span>
                <select
                  value={selectedDeliveryZoneId}
                  onChange={(event) => onDeliveryZoneChange(event.target.value)}
                >
                  <option value="">Choose your area</option>
                  {deliveryZones.map((zone) => (
                    <option value={zone.id} key={zone.id}>
                      {formatDeliveryZoneOption(zone, currency)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedDeliveryZone ? (
                <div className="public-delivery-zone-card">
                  <div>
                    <strong>{selectedDeliveryZone.zone_name}</strong>
                    <span>
                      {[selectedDeliveryZone.area_name, selectedDeliveryZone.city]
                        .filter(Boolean)
                        .join(' • ') || 'Selected delivery area'}
                    </span>
                  </div>

                  <div className="public-delivery-zone-meta">
                    {Number(deliveryMinimumAmount || 0) > 0 && (
                      <small>
                        Minimum: {currency} {Number(deliveryMinimumAmount || 0).toFixed(2)}
                      </small>
                    )}
                    <small>
                      Delivery: {currency} {Number(shippingFeeAmount || 0).toFixed(2)}
                    </small>
                    {Number(selectedDeliveryZone.estimated_delivery_minutes || 0) > 0 && (
                      <small>{selectedDeliveryZone.estimated_delivery_minutes} mins approx.</small>
                    )}
                  </div>
                </div>
              ) : (
                <div className="public-delivery-zone-hint">
                  Select your area to calculate delivery fee and minimum order.
                </div>
              )}
            </div>
          )}

          {!isTableOrder && (
            <PublicDeliveryAddressFields
              customerForm={customerForm}
              savedDeliveryAddress={savedDeliveryAddress}
              saveDeliveryAddress={saveDeliveryAddress}
              onUpdateCustomerForm={onUpdateCustomerForm}
              onSaveDeliveryAddressChange={onSaveDeliveryAddressChange}
              onUseSavedDeliveryAddress={onUseSavedDeliveryAddress}
              onClearSavedDeliveryAddress={onClearSavedDeliveryAddress}
              onUseCurrentLocation={onUseCurrentLocation}
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
          <PublicDeliveryPaymentSelector
            options={deliveryPaymentOptions}
            selectedValue={deliveryPaymentChoice}
            onChange={onDeliveryPaymentChoiceChange}
          />
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

        <div className="public-cart-gift-voucher-area">
          {appliedGiftVoucher ? (
            <div className="public-cart-gift-voucher-applied">
              <div>
                <span>Gift voucher applied</span>
                <strong>{appliedGiftVoucher.code}</strong>
                <small>
                  {appliedGiftVoucher.title} • -{currency}{' '}
                  {Number(giftVoucherDiscountAmount || 0).toFixed(2)}
                </small>
              </div>

              <button type="button" onClick={onRemoveGiftVoucher}>
                Remove
              </button>
            </div>
          ) : (
            <div className="public-cart-gift-voucher-form">
              <input
                type="text"
                value={giftVoucherCode}
                onChange={(event) =>
                  onGiftVoucherCodeChange(event.target.value.toUpperCase())
                }
                placeholder="Gift voucher code"
              />

              <button
                type="button"
                onClick={onApplyGiftVoucher}
                disabled={giftVoucherApplying}
              >
                {giftVoucherApplying ? 'Checking...' : 'Use'}
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

        {!isTableOrder && selectedDeliveryZone && Number(deliveryMinimumAmount || 0) > 0 && Number(cartTotal || 0) < Number(deliveryMinimumAmount || 0) && (
          <div className="public-delivery-minimum-warning">
            Add {currency} {Number(deliveryMinimumAmount - cartTotal).toFixed(2)} more to place order in this area.
          </div>
        )}

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

          {giftVoucherDiscountAmount > 0 && (
            <div className="discount gift-voucher">
              <span>Gift voucher</span>
              <strong>
                -{currency} {Number(giftVoucherDiscountAmount || 0).toFixed(2)}
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

function PublicDeliveryAddressFields({
  customerForm,
  savedDeliveryAddress,
  saveDeliveryAddress,
  onUpdateCustomerForm,
  onSaveDeliveryAddressChange,
  onUseSavedDeliveryAddress,
  onClearSavedDeliveryAddress,
  onUseCurrentLocation,
}) {
  const hasMapLocation = Boolean(customerForm.mapUrl || (customerForm.deliveryLat && customerForm.deliveryLng))

  return (
    <div className="public-delivery-address-card">
      <div className="public-delivery-address-head">
        <div>
          <span>Delivery address</span>
          <strong>Where should we deliver?</strong>
        </div>

        {savedDeliveryAddress ? (
          <div className="public-delivery-address-actions">
            <button type="button" onClick={onUseSavedDeliveryAddress}>
              Use saved
            </button>
            <button type="button" className="muted" onClick={onClearSavedDeliveryAddress}>
              Clear
            </button>
          </div>
        ) : (
          <small>No saved address yet</small>
        )}
      </div>

      <div className="public-delivery-address-grid">
        <input
          type="text"
          value={customerForm.addressLabel}
          onChange={(event) =>
            onUpdateCustomerForm('addressLabel', event.target.value)
          }
          placeholder="Label: Home, Office, Villa..."
        />

        <input
          type="text"
          value={customerForm.buildingName}
          onChange={(event) =>
            onUpdateCustomerForm('buildingName', event.target.value)
          }
          placeholder="Building / villa name"
        />

        <input
          type="text"
          value={customerForm.flatNumber}
          onChange={(event) =>
            onUpdateCustomerForm('flatNumber', event.target.value)
          }
          placeholder="Flat / floor / villa no."
        />

        <input
          type="text"
          value={customerForm.streetName}
          onChange={(event) =>
            onUpdateCustomerForm('streetName', event.target.value)
          }
          placeholder="Street / community"
        />
      </div>

      <textarea
        value={customerForm.address}
        onChange={(event) => onUpdateCustomerForm('address', event.target.value)}
        placeholder="Full delivery address"
        rows="3"
      />

      <div className="public-delivery-address-grid two">
        <input
          type="text"
          value={customerForm.landmark}
          onChange={(event) => onUpdateCustomerForm('landmark', event.target.value)}
          placeholder="Nearby landmark"
        />

        <input
          type="url"
          value={customerForm.mapUrl}
          onChange={(event) => onUpdateCustomerForm('mapUrl', event.target.value)}
          placeholder="Google Maps link optional"
        />
      </div>

      <div className="public-delivery-location-row">
        <button type="button" onClick={onUseCurrentLocation}>
          <MapPin size={15} />
          Use current location
        </button>

        {hasMapLocation && (
          <a
            href={getDeliveryMapUrl(customerForm)}
            target="_blank"
            rel="noreferrer"
          >
            View pin
          </a>
        )}
      </div>

      <label className="public-save-address-toggle">
        <input
          type="checkbox"
          checked={saveDeliveryAddress}
          onChange={(event) => onSaveDeliveryAddressChange(event.target.checked)}
        />
        <span>Save this address on this device for faster checkout next time</span>
      </label>
    </div>
  )
}

function PublicCustomizeItemModal({ product, currency, onClose, onAdd }) {
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
  const scheduledBaseUnitPrice = getPublicScheduledPrice(product, baseUnitPrice)
  const selectedModifierOptions = getSelectedModifierOptions(
    modifierGroups,
    selectedModifiers,
  )
  const modifierTotal = selectedModifierOptions.reduce(
    (total, option) => total + Number(option.priceDelta || 0),
    0,
  )
  const finalUnitPrice = roundPublicMoney(scheduledBaseUnitPrice + modifierTotal)

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
        showPublicMessage(`You can choose only ${maxSelect} option${maxSelect === 1 ? '' : 's'} for ${group.name}.`)
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
      showPublicMessage(validationMessage)
      return
    }

    onAdd({
      variation: selectedVariation || null,
      unitPrice: baseUnitPrice,
      modifiers: selectedModifierOptions,
    })
  }

  return (
    <div className="public-modal-overlay" onClick={onClose}>
      <div
        className="public-variation-modal public-customize-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="public-cart-head">
          <div>
            <p className="public-menu-label">Customize Item</p>
            <h2>{product.name}</h2>
            <span>
              Choose size, spice level, sauces or extra toppings before adding.
            </span>
            {product.publicSchedule?.badge && (
              <small className="public-schedule-modal-hint">
                {product.publicSchedule.badge}
              </small>
            )}
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {variations.length > 0 && (
          <section className="public-customize-section">
            <div className="public-customize-section-head">
              <div>
                <strong>Choose option</strong>
                <span>Select one</span>
              </div>
            </div>

            <div className="public-variation-list public-option-choice-list">
              {variations.map((variation) => (
                <button
                  type="button"
                  key={variation.id}
                  className={
                    selectedVariationId === variation.id ? 'selected' : ''
                  }
                  onClick={() => setSelectedVariationId(variation.id)}
                >
                  <span>{variation.name}</span>
                  <strong>
                    {currency} {Number(getPublicScheduledPrice(product, Number(variation.price || 0))).toFixed(2)}
                  </strong>
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
            <section className="public-customize-section" key={group.id}>
              <div className="public-customize-section-head">
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

              <div className="public-modifier-option-list">
                {(group.options || []).map((option) => {
                  const isSelected =
                    group.selectionType === 'single'
                      ? selectedValue === option.id
                      : Array.isArray(selectedValue) && selectedValue.includes(option.id)

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
                            +{currency} {Number(option.priceDelta || 0).toFixed(2)}
                          </small>
                        ) : (
                          <small>Included</small>
                        )}
                      </span>

                      <i>{isSelected ? '✓' : group.selectionType === 'single' ? '○' : '+'}</i>
                    </button>
                  )
                })}
              </div>

              {minSelect > 0 && selectedCount < minSelect && (
                <p className="public-modifier-hint">
                  Choose at least {minSelect} option{minSelect === 1 ? '' : 's'}.
                </p>
              )}
            </section>
          )
        })}

        <div className="public-customize-footer">
          <div>
            <span>Total per item</span>
            <strong>
              {currency} {Number(finalUnitPrice || 0).toFixed(2)}
            </strong>
          </div>

          <button type="button" onClick={handleAddCustomizedItem}>
            Add to Cart
          </button>
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
  const paymentDetails = getPublicOrderPaymentDetails(order)

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
        <span className={`public-payment-status-chip ${paymentDetails.className}`}>
          {paymentDetails.label}
        </span>
      </div>

      {paymentDetails.note && (
        <div className={`public-payment-status-note ${paymentDetails.className}`}>
          {paymentDetails.note}
        </div>
      )}

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

      {onReviewOrder && ['completed', 'delivered'].includes(order.status) && (
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
  const paymentDetails = getPublicSuccessPaymentDetails(order)
  const paymentResultPath = buildPublicPaymentResultPath({
    status: order?.isOnlinePayment ? 'success' : 'success',
    restaurantSlug: order?.restaurantSlug,
    order,
  })

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

        {order.deliveryZoneName && (
          <div className="public-success-reward zone">
            Delivery area: {order.deliveryZoneName}
          </div>
        )}

        {order.deliveryPaymentChoice && (
          <div className="public-success-reward payment">
            Delivery payment: {order.deliveryPaymentLabel || order.deliveryPaymentChoice}
          </div>
        )}

        {paymentDetails.label && (
          <div className={`public-success-payment-status ${paymentDetails.className}`}>
            <span>Payment status</span>
            <strong>{paymentDetails.label}</strong>
            {paymentDetails.note && <small>{paymentDetails.note}</small>}
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

        {paymentResultPath && (
          <Link className="public-success-action-link" to={paymentResultPath}>
            View payment status
          </Link>
        )}

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



function isZiinaPublicPaymentChoice(paymentChoice) {
  return Boolean(paymentChoice?.isOnline && paymentChoice?.gateway === 'ziina')
}

function isStripePublicPaymentChoice(paymentChoice) {
  return Boolean(paymentChoice?.isOnline && paymentChoice?.gateway === 'stripe')
}

function isPayPalPublicPaymentChoice(paymentChoice) {
  return Boolean(paymentChoice?.isOnline && paymentChoice?.gateway === 'paypal')
}

function isRazorpayPublicPaymentChoice(paymentChoice) {
  return Boolean(paymentChoice?.isOnline && paymentChoice?.gateway === 'razorpay')
}

function isCashfreePublicPaymentChoice(paymentChoice) {
  return Boolean(paymentChoice?.isOnline && paymentChoice?.gateway === 'cashfree')
}

function isPhonePePublicPaymentChoice(paymentChoice) {
  return Boolean(paymentChoice?.isOnline && paymentChoice?.gateway === 'phonepe')
}

function isNetworkPublicPaymentChoice(paymentChoice) {
  return Boolean(paymentChoice?.isOnline && paymentChoice?.gateway === 'network')
}

async function createPublicZiinaCheckoutSession({
  restaurantId,
  restaurantSlug,
  orderId,
  orderCode,
  orderReference,
  customerSessionId,
}) {
  const { data, error } = await supabase.functions.invoke(
    'create-ziina-payment-intent',
    {
      body: {
        restaurant_id: restaurantId,
        restaurant_slug: restaurantSlug,
        order_id: orderId || null,
        order_code: orderCode || null,
        order_reference: orderReference || null,
        customer_session_id: customerSessionId || null,
        origin: window.location.origin,
      },
    },
  )

  if (error) {
    throw new Error(error.message || 'Unable to open Ziina checkout.')
  }

  if (!data?.success) {
    throw new Error(data?.message || data?.error || 'Unable to open Ziina checkout.')
  }

  return data
}

async function createPublicStripeCheckoutSession({
  restaurantId,
  restaurantSlug,
  orderId,
  orderCode,
  orderReference,
  customerSessionId,
}) {
  const { data, error } = await supabase.functions.invoke(
    'create-stripe-checkout-session',
    {
      body: {
        restaurant_id: restaurantId,
        restaurant_slug: restaurantSlug,
        order_id: orderId || null,
        order_code: orderCode || null,
        order_reference: orderReference || null,
        customer_session_id: customerSessionId || null,
        origin: window.location.origin,
      },
    },
  )

  if (error) {
    throw new Error(error.message || 'Unable to open Stripe checkout.')
  }

  if (!data?.success) {
    throw new Error(data?.message || data?.error || 'Unable to open Stripe checkout.')
  }

  return data
}

async function createPublicRazorpayPaymentLink({
  restaurantId,
  restaurantSlug,
  orderId,
  orderCode,
  orderReference,
  customerSessionId,
}) {
  const { data, error } = await supabase.functions.invoke(
    'create-razorpay-payment-link',
    {
      body: {
        restaurant_id: restaurantId,
        restaurant_slug: restaurantSlug,
        order_id: orderId || null,
        order_code: orderCode || null,
        order_reference: orderReference || null,
        customer_session_id: customerSessionId || null,
        origin: window.location.origin,
      },
    },
  )

  if (error) {
    throw new Error(error.message || 'Unable to open Razorpay payment link.')
  }

  if (!data?.success) {
    throw new Error(data?.message || data?.error || 'Unable to open Razorpay payment link.')
  }

  return data
}

async function createPublicCashfreePaymentLink({
  restaurantId,
  restaurantSlug,
  orderId,
  orderCode,
  orderReference,
  customerSessionId,
}) {
  const { data, error } = await supabase.functions.invoke(
    'create-cashfree-payment-link',
    {
      body: {
        restaurant_id: restaurantId,
        restaurant_slug: restaurantSlug,
        order_id: orderId || null,
        order_code: orderCode || null,
        order_reference: orderReference || null,
        customer_session_id: customerSessionId || null,
        origin: window.location.origin,
      },
    },
  )

  if (error) {
    throw new Error(error.message || 'Unable to open Cashfree payment link.')
  }

  if (!data?.success) {
    throw new Error(data?.message || data?.error || 'Unable to open Cashfree payment link.')
  }

  return data
}

async function createPublicPhonePeCheckoutSession({
  restaurantId,
  restaurantSlug,
  orderId,
  orderCode,
  orderReference,
  customerSessionId,
}) {
  const { data, error } = await supabase.functions.invoke(
    'create-phonepe-checkout-session',
    {
      body: {
        restaurant_id: restaurantId,
        restaurant_slug: restaurantSlug,
        order_id: orderId || null,
        order_code: orderCode || null,
        order_reference: orderReference || null,
        customer_session_id: customerSessionId || null,
        origin: window.location.origin,
      },
    },
  )

  if (error) {
    throw new Error(error.message || 'Unable to open PhonePe checkout.')
  }

  if (!data?.success) {
    throw new Error(data?.message || data?.error || 'Unable to open PhonePe checkout.')
  }

  return data
}

async function createPublicNetworkCheckoutSession({
  restaurantId,
  restaurantSlug,
  orderId,
  orderCode,
  orderReference,
  customerSessionId,
}) {
  const { data, error } = await supabase.functions.invoke(
    'create-network-checkout-session',
    {
      body: {
        restaurant_id: restaurantId,
        restaurant_slug: restaurantSlug,
        order_id: orderId || null,
        order_code: orderCode || null,
        order_reference: orderReference || null,
        customer_session_id: customerSessionId || null,
        origin: window.location.origin,
      },
    },
  )

  if (error) {
    throw new Error(error.message || 'Unable to open Network / N-Genius checkout.')
  }

  if (!data?.success) {
    throw new Error(data?.message || data?.error || 'Unable to open Network / N-Genius checkout.')
  }

  return data
}

function clearPublicCartAfterOrder({
  setCart,
  setAppliedReward,
  setAppliedCoupon,
  setCouponCode,
  setAppliedGiftVoucher,
  setGiftVoucherCode,
  setDeliveryPaymentChoice,
  setShowCart,
  setShowCodChoiceModal,
  setCustomerForm,
}) {
  setCart([])
  setAppliedReward(null)
  setAppliedCoupon(null)
  setCouponCode('')
  setAppliedGiftVoucher(null)
  setGiftVoucherCode('')
  setDeliveryPaymentChoice('')
  setShowCart(false)
  setShowCodChoiceModal(false)
  setCustomerForm((current) => ({
    ...current,
    notes: '',
  }))
}

function normalizePublicComboDeals(comboData) {
  return (comboData || [])
    .filter((combo) => isPublicComboLive(combo))
    .map((combo) => ({
      ...combo,
      items: getAvailablePublicComboItems(combo),
    }))
    .filter((combo) => combo.items.length > 0 && Number(combo.bundle_price || 0) > 0)
    .sort(
      (first, second) =>
        Number(first.sort_order || 0) - Number(second.sort_order || 0) ||
        String(first.combo_name || '').localeCompare(String(second.combo_name || '')),
    )
}

function isPublicComboLive(combo) {
  if (!combo || combo.is_active === false || combo.is_public === false) return false

  const now = Date.now()
  const startsAt = combo.start_at ? new Date(combo.start_at).getTime() : null
  const endsAt = combo.end_at ? new Date(combo.end_at).getTime() : null

  if (startsAt && startsAt > now) return false
  if (endsAt && endsAt < now) return false

  return true
}

function getAvailablePublicComboItems(combo) {
  if (!Array.isArray(combo?.items)) return []

  return combo.items
    .filter((comboItem) => {
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

function getPublicComboMenuValue(comboItems) {
  return roundPublicMoney(
    (comboItems || []).reduce(
      (total, item) => total + Number(item.quantity || 1) * Number(item.unitPrice || 0),
      0,
    ),
  )
}

function buildPublicComboSummary(comboItems) {
  return (comboItems || [])
    .slice(0, 4)
    .map((item) => {
      const quantity = Number(item.quantity || 1)
      const quantityText = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2)
      return `${quantityText}× ${item.itemName}${item.variationName ? ` (${item.variationName})` : ''}`
    })
    .join(', ')
}

function expandPublicCartItemsForOrder(cart) {
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
        baseUnitPrice: item.baseUnitPrice || item.unitPrice,
        modifierTotal: item.modifierTotal || 0,
        modifiers: item.modifiers || [],
      }]
    }

    const comboQuantity = Math.max(Number(item.quantity || 1), 1)
    const comboItems = getAvailablePublicComboItems({ items: item.comboItems })

    return comboItems.map((comboItem, index) => {
      const quantity = roundPublicQuantity(Number(comboItem.quantity || 1) * comboQuantity)
      const lineTotal = index === 0 ? Number(item.totalPrice || 0) : 0
      const unitPrice = quantity > 0 ? roundPublicMoney(lineTotal / quantity) : 0

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
        baseUnitPrice: unitPrice,
        modifierTotal: 0,
        modifiers: [],
      }
    })
  })
}

function roundPublicQuantity(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

async function loadPublicModifierGroupsByItem(restaurantId) {
  if (!restaurantId) return {}

  const { data: linkData, error: linkError } = await supabase
    .from('restaurant_item_modifier_groups')
    .select('item_id, group_id, sort_order')
    .eq('restaurant_id', restaurantId)
    .order('sort_order', { ascending: true })

  if (linkError || !Array.isArray(linkData) || linkData.length === 0) {
    return {}
  }

  const groupIds = [...new Set(linkData.map((link) => link.group_id).filter(Boolean))]

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
    const defaultOptions = (group.options || []).filter((option) => option.isDefault)

    if (group.selectionType === 'single') {
      selection[group.id] = defaultOptions[0]?.id || ''
      return selection
    }

    const maxSelect = Number(group.maxSelect || 0)
    const selectedDefaults = defaultOptions.map((option) => option.id)

    selection[group.id] = maxSelect > 0
      ? selectedDefaults.slice(0, maxSelect)
      : selectedDefaults

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

    return (group.options || []).filter((option) => selectedIds.includes(option.id))
  })
}

function getModifierMinSelect(group) {
  return Math.max(
    group.isRequired ? 1 : 0,
    Number(group.minSelect || 0),
  )
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
  return [item.variationName, item.modifierSummary]
    .filter(Boolean)
    .join(' • ')
}

function buildCustomerNotes(customerForm, isTableOrder, deliveryZone) {
  const notes = []

  if (!isTableOrder && deliveryZone) {
    notes.push(`Delivery Zone: ${deliveryZone.zone_name}`)

    const zoneArea = [deliveryZone.area_name, deliveryZone.city]
      .filter(Boolean)
      .join(' / ')

    if (zoneArea) notes.push(`Delivery Area: ${zoneArea}`)

    if (deliveryZone.estimated_delivery_minutes) {
      notes.push(`Estimated Delivery: ${deliveryZone.estimated_delivery_minutes} minutes`)
    }
  }

  if (!isTableOrder) {
    const addressLines = buildDeliveryAddressLines(customerForm)

    if (addressLines.length > 0) {
      notes.push('--- Delivery Address ---')
      notes.push(...addressLines)
    }
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

function getSavedDeliveryAddress() {
  try {
    const storedValue = localStorage.getItem('spizy_customer_delivery_address')

    if (!storedValue) return null

    return JSON.parse(storedValue)
  } catch {
    return null
  }
}

function buildDeliveryAddressPayload(customerForm) {
  const payload = {
    label: String(customerForm.addressLabel || '').trim() || 'Saved address',
    address: String(customerForm.address || '').trim(),
    buildingName: String(customerForm.buildingName || '').trim(),
    flatNumber: String(customerForm.flatNumber || '').trim(),
    streetName: String(customerForm.streetName || '').trim(),
    landmark: String(customerForm.landmark || '').trim(),
    mapUrl: normalizePublicExternalUrl(customerForm.mapUrl),
    deliveryLat: String(customerForm.deliveryLat || '').trim(),
    deliveryLng: String(customerForm.deliveryLng || '').trim(),
  }

  if (!payload.address && !payload.buildingName && !payload.streetName && !payload.mapUrl) {
    return null
  }

  return payload
}

function hasCustomerDeliveryAddress(customerForm) {
  return Boolean(buildDeliveryAddressPayload(customerForm))
}

function buildDeliveryAddressLines(customerForm) {
  const address = buildDeliveryAddressPayload(customerForm)

  if (!address) return []

  const lines = []

  if (address.label) lines.push(`Address Label: ${address.label}`)
  if (address.address) lines.push(`Address: ${address.address}`)
  if (address.buildingName) lines.push(`Building/Villa: ${address.buildingName}`)
  if (address.flatNumber) lines.push(`Flat/Floor/Villa No: ${address.flatNumber}`)
  if (address.streetName) lines.push(`Street/Community: ${address.streetName}`)
  if (address.landmark) lines.push(`Landmark: ${address.landmark}`)

  const mapUrl = getDeliveryMapUrl(address)
  if (mapUrl) lines.push(`Map: ${mapUrl}`)

  return lines
}

function getDeliveryMapUrl(value) {
  const cleanMapUrl = normalizePublicExternalUrl(value?.mapUrl)

  if (cleanMapUrl) return cleanMapUrl

  if (value?.deliveryLat && value?.deliveryLng) {
    return `https://www.google.com/maps/search/?api=1&query=${value.deliveryLat},${value.deliveryLng}`
  }

  return ''
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
  const normalizedStatus = String(status || '').trim().toLowerCase()

  if (normalizedStatus === 'paid') return 'Paid'
  if (normalizedStatus === 'refunded') return 'Refunded'
  if (['failed', 'payment_failed'].includes(normalizedStatus)) return 'Payment failed'
  if (['pending_online', 'online_pending', 'pending'].includes(normalizedStatus)) {
    return 'Payment pending'
  }

  return 'Unpaid'
}


function buildPublicPaymentResultPath({ status = 'success', restaurantSlug = '', order = {} }) {
  const orderReference =
    order?.orderReference ||
    order?.paymentReference ||
    order?.orderId ||
    order?.orderCode ||
    ''

  if (!orderReference && !restaurantSlug) return ''

  const params = new URLSearchParams()

  if (restaurantSlug) params.set('restaurant', restaurantSlug)
  if (orderReference) params.set('order', orderReference)
  if (order?.paymentGateway) params.set('gateway', order.paymentGateway)

  return `/payment/${status === 'failed' ? 'failed' : 'success'}?${params.toString()}`
}

function storePublicPaymentResultSnapshot(order) {
  if (!order) return

  try {
    const orderReference =
      order.orderReference || order.paymentReference || order.orderId || order.orderCode

    const snapshot = {
      restaurant_slug: order.restaurantSlug || '',
      order_id: order.orderId || '',
      order_code: order.orderCode || '',
      order_reference: orderReference || '',
      payment_reference: orderReference || '',
      payment_gateway: order.paymentGateway || '',
      gateway_order_id: order.gatewayOrderId || '',
      gateway_redirect_url: order.gatewayRedirectUrl || '',
      delivery_payment_type: order.deliveryPaymentType || '',
      payment_status: order.paymentStatus || 'unpaid',
      payment_method_label: order.deliveryPaymentLabel || '',
      payment_status_note: order.paymentInstruction || '',
      total_amount: Number(order.total || 0),
      currency: order.currency || '',
      order_type: order.orderType || '',
      created_at: order.createdAt || new Date().toISOString(),
    }

    localStorage.setItem('spizy_last_payment_result', JSON.stringify(snapshot))

    if (orderReference) {
      localStorage.setItem(
        `spizy_payment_result_${String(orderReference).toLowerCase()}`,
        JSON.stringify(snapshot),
      )
    }
  } catch {
    // Local storage is optional. The database/RPC remains the source of truth.
  }
}

function getPublicPaymentInstructionFromChoice(paymentChoice) {
  if (!paymentChoice) return ''

  if (paymentChoice.gateway === 'cod') {
    if (paymentChoice.deliveryPaymentType === 'card') {
      return 'Card amount will be collected by delivery staff using a tap/card POS machine.'
    }

    return 'Cash amount will be collected by delivery staff when the order is delivered.'
  }

  if (paymentChoice.gateway === 'ziina') {
    return 'You will be redirected to Ziina secure checkout. The order stays pending until Ziina confirms payment.'
  }

  if (paymentChoice.gateway === 'paypal') {
    return 'You will be redirected to PayPal secure checkout. The order stays pending until PayPal approves and captures the payment.'
  }

  if (paymentChoice.gateway === 'network') {
    return 'You will be redirected to Network / N-Genius secure checkout. The order stays pending until Network confirms payment.'
  }

  if (paymentChoice.isOnline) {
    return 'Online gateway checkout is saved as pending in this foundation. Secure redirect and webhook will be connected in the next gateway phase.'
  }

  return paymentChoice.text || ''
}

function getPublicOrderPaymentDetails(order) {
  const status = String(order?.payment_status || order?.paymentStatus || '').trim().toLowerCase()
  const gateway = String(order?.payment_gateway || order?.paymentGateway || '').trim().toLowerCase()
  const paymentStatusNote = order?.payment_status_note || order?.paymentInstruction || ''
  const deliveryPaymentType = String(
    order?.delivery_payment_type || order?.deliveryPaymentType || '',
  )
    .trim()
    .toLowerCase()
  const isOnlinePayment = Boolean(order?.is_online_payment || order?.isOnlinePayment) ||
    (gateway && gateway !== 'cod')

  if (status === 'paid') {
    return {
      label: 'Paid',
      className: 'paid',
      note: paymentStatusNote || order?.payment_method_label || '',
    }
  }

  if (status === 'refunded') {
    return {
      label: 'Refunded',
      className: 'refunded',
      note: 'Payment was refunded.',
    }
  }

  if (['failed', 'payment_failed'].includes(status)) {
    return {
      label: 'Payment failed',
      className: 'failed',
      note: 'Payment was not successful. Please contact the restaurant or choose another method.',
    }
  }

  if (gateway === 'cod') {
    if (deliveryPaymentType === 'card') {
      return {
        label: 'Card on delivery pending',
        className: 'cod',
        note: paymentStatusNote || 'Delivery staff should collect payment using a tap/card POS machine.',
      }
    }

    return {
      label: 'Cash on delivery pending',
      className: 'cod',
      note: paymentStatusNote || 'Delivery staff should collect cash when the order is delivered.',
    }
  }

  if (isOnlinePayment) {
    return {
      label: `${getPublicGatewayLabel(gateway)} payment pending`,
      className: 'online',
      note: paymentStatusNote || 'Online checkout/webhook is pending. Keep this order unpaid until gateway success is verified.',
    }
  }

  return {
    label: formatPublicPayment(status),
    className: status || 'unpaid',
    note: '',
  }
}

function getPublicSuccessPaymentDetails(order) {
  if (!order?.deliveryPaymentChoice && !order?.paymentStatus) {
    return { label: '', className: '', note: '' }
  }

  return getPublicOrderPaymentDetails({
    payment_status: order.paymentStatus,
    payment_gateway: order.paymentGateway,
    delivery_payment_type: order.deliveryPaymentType,
    is_online_payment: order.isOnlinePayment,
    payment_method_label: order.deliveryPaymentLabel,
    payment_status_note: order.paymentInstruction,
  })
}

function getPublicGatewayLabel(gateway) {
  if (!gateway) return 'Online'

  return publicGatewayLabels[gateway] || gateway.charAt(0).toUpperCase() + gateway.slice(1)
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


function normalizePublicMenuTheme(value) {
  const incoming = value && typeof value === 'object' ? value : {}

  return {
    accent_color: incoming.accent_color || '#ff7a18',
    secondary_color: incoming.secondary_color || '#ffbf4d',
    header_style: incoming.header_style || 'premium',
    product_card_style: incoming.product_card_style || 'compact',
    show_cover_image: incoming.show_cover_image !== false,
    show_logo: incoming.show_logo !== false,
    show_social_links: incoming.show_social_links !== false,
    show_directions: incoming.show_directions !== false,
    show_campaigns: incoming.show_campaigns !== false,
    show_reviews: incoming.show_reviews !== false,
  }
}

function getPublicThemeStyle(theme) {
  const publicTheme = normalizePublicMenuTheme(theme)

  return {
    '--spizy-public-accent': publicTheme.accent_color,
    '--spizy-public-accent-soft': `${publicTheme.accent_color}24`,
    '--spizy-public-secondary': publicTheme.secondary_color || '#ffbf4d',
  }
}

function formatRewardNumber(value) {
  const numberValue = Number(value || 0)

  if (Number.isInteger(numberValue)) return String(numberValue)

  return numberValue.toFixed(2)
}

function getTodayDateInput() {
  return new Date().toISOString().slice(0, 10)
}

function getDefaultReservationDate() {
  const nextDate = new Date()
  nextDate.setDate(nextDate.getDate() + 1)

  return nextDate.toISOString().slice(0, 10)
}

function getDefaultReservationTime() {
  const date = new Date()
  date.setHours(date.getHours() + 2)
  const minutes = date.getMinutes()
  const roundedMinutes = Math.ceil(minutes / 15) * 15
  date.setMinutes(roundedMinutes === 60 ? 0 : roundedMinutes)

  if (roundedMinutes === 60) {
    date.setHours(date.getHours() + 1)
  }

  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`
}

function formatPublicReservationDate(value) {
  if (!value) return 'Selected date'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${value}T00:00:00`))
  } catch {
    return value
  }
}

function formatPublicReservationTime(value) {
  if (!value) return 'Selected time'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(`2026-01-01T${String(value).slice(0, 5)}:00`))
  } catch {
    return String(value).slice(0, 5)
  }
}

function formatPublicReservationStatus(status) {
  if (status === 'confirmed') return 'Confirmation pending'
  if (status === 'seated') return 'Seated'
  if (status === 'completed') return 'Completed'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'no_show') return 'No-show'
  return 'Pending confirmation'
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


function formatDeliveryZoneOption(zone, currency) {
  const parts = [zone.zone_name, zone.area_name, zone.city]
    .filter(Boolean)
    .join(' • ')
  const fee = getSafePublicAmount(zone.delivery_fee)
  const minimum = getSafePublicAmount(zone.minimum_order_amount)
  const feeLabel = fee > 0 ? `${currency} ${fee.toFixed(2)} delivery` : 'Free delivery'
  const minimumLabel = minimum > 0 ? `min ${currency} ${minimum.toFixed(2)}` : 'no minimum'

  return `${parts} — ${feeLabel}, ${minimumLabel}`
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


function applyPublicMenuSchedulesToProducts(products, schedules) {
  const now = new Date()
  const safeSchedules = Array.isArray(schedules) ? schedules : []

  return (products || []).map((product) => {
    const matchingSchedules = safeSchedules.filter((schedule) =>
      publicScheduleAppliesToProduct(schedule, product),
    )

    const liveSchedules = matchingSchedules.filter((schedule) =>
      isPublicScheduleLiveNow(schedule, now),
    )

    const liveHideRule = liveSchedules.find(
      (schedule) => schedule.schedule_type === 'hide_item',
    )

    if (liveHideRule) {
      return {
        ...product,
        publicSchedule: {
          isHidden: true,
          isUnavailable: true,
          isOrderable: false,
          badge: liveHideRule.banner_note || 'Currently unavailable',
          badgeType: 'hidden',
          shortLabel: 'Hidden now',
        },
      }
    }

    const availabilityRules = matchingSchedules.filter(
      (schedule) =>
        schedule.schedule_type === 'availability' &&
        isPublicScheduleDateRelevant(schedule, now),
    )
    const liveAvailabilityRule = availabilityRules.find((schedule) =>
      isPublicScheduleLiveNow(schedule, now),
    )

    if (availabilityRules.length > 0 && !liveAvailabilityRule) {
      const nextRule = availabilityRules[0]
      return {
        ...product,
        publicSchedule: {
          isHidden: false,
          isUnavailable: true,
          isOrderable: false,
          badge:
            nextRule.banner_note ||
            `Available ${getPublicScheduleTimeText(nextRule)}`,
          badgeType: 'time',
          shortLabel: 'Not now',
          unavailableMessage:
            nextRule.banner_note ||
            `${product.name} is available only ${getPublicScheduleDaysText(nextRule)} ${getPublicScheduleTimeText(nextRule)}.`,
        },
      }
    }

    const liveSpecialPriceRules = liveSchedules
      .filter(
        (schedule) =>
          schedule.schedule_type === 'special_price' &&
          Number(schedule.special_price || 0) >= 0,
      )
      .sort(
        (a, b) => Number(a.special_price || 0) - Number(b.special_price || 0),
      )
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
        publicSchedule: {
          isHidden: false,
          isUnavailable: false,
          isOrderable: true,
          badge:
            specialRule.banner_note ||
            `Special price ${getPublicScheduleTimeText(specialRule)}`,
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
        publicSchedule: {
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
        publicSchedule: {
          isHidden: false,
          isUnavailable: false,
          isOrderable: true,
          badge: timingRule.banner_note || `Available now until ${normalizePublicScheduleTime(timingRule.end_time)}`,
          badgeType: 'available',
          shortLabel: 'Available now',
        },
      }
    }

    return {
      ...product,
      publicSchedule: {
        isHidden: false,
        isUnavailable: false,
        isOrderable: true,
      },
    }
  })
}

function getPublicActiveMenuScheduleNotices(schedules) {
  const now = new Date()

  return (Array.isArray(schedules) ? schedules : [])
    .filter((schedule) => isPublicScheduleLiveNow(schedule, now))
    .filter((schedule) =>
      ['all_menu', 'category'].includes(String(schedule.applies_to || '')),
    )
    .slice(0, 3)
    .map((schedule) => ({
      title:
        schedule.banner_note ||
        schedule.schedule_name ||
        getPublicScheduleTypeLabel(schedule.schedule_type),
      text: `${getPublicScheduleTypeLabel(schedule.schedule_type)} • ${getPublicScheduleTimeText(schedule)}`,
    }))
}

function isProductPubliclyOrderable(product) {
  if (!product?.publicSchedule) return true
  return product.publicSchedule.isOrderable !== false
}

function getPublicScheduleUnavailableMessage(product) {
  return (
    product?.publicSchedule?.unavailableMessage ||
    product?.publicSchedule?.badge ||
    'This item is not available right now.'
  )
}

function getPublicScheduledPrice(product, unitPrice) {
  const normalPrice = Number(unitPrice || 0)
  const schedule = product?.publicSchedule || {}

  if (schedule.pricingRuleType === 'special_price') {
    return roundPublicMoney(Number(schedule.specialPrice || 0))
  }

  if (schedule.pricingRuleType === 'happy_hour') {
    const discountPercent = Math.min(
      100,
      Math.max(0, Number(schedule.discountPercent || 0)),
    )
    return roundPublicMoney(normalPrice * (1 - discountPercent / 100))
  }

  return roundPublicMoney(normalPrice)
}

function publicScheduleAppliesToProduct(schedule, product) {
  if (!schedule || !product) return false

  if (schedule.applies_to === 'all_menu') return true
  if (schedule.applies_to === 'item') return schedule.item_id === product.id
  if (schedule.applies_to === 'category') {
    return Boolean(product.category_id && schedule.category_id === product.category_id)
  }

  return false
}

function isPublicScheduleDateRelevant(schedule, now = new Date()) {
  if (!schedule?.is_active) return false

  const today = getPublicScheduleDateKey(now)

  if (schedule.start_date && today < schedule.start_date) return false
  if (schedule.end_date && today > schedule.end_date) return false

  return true
}

function isPublicScheduleLiveNow(schedule, now = new Date()) {
  if (!isPublicScheduleDateRelevant(schedule, now)) return false

  const days = Array.isArray(schedule.days_of_week) ? schedule.days_of_week : []
  if (days.length > 0 && !days.includes(now.getDay())) return false

  return isPublicScheduleTimeLive(schedule, now)
}

function isPublicScheduleTimeLive(schedule, now = new Date()) {
  const startMinutes = getPublicScheduleMinutes(schedule.start_time, 0)
  const endMinutes = getPublicScheduleMinutes(schedule.end_time, 1439)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  if (startMinutes === endMinutes) return true

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes
  }

  return currentMinutes >= startMinutes || currentMinutes <= endMinutes
}

function getPublicScheduleMinutes(value, fallback) {
  const parts = String(value || '').split(':')
  const hours = Number(parts[0])
  const minutes = Number(parts[1])

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback

  return Math.min(1439, Math.max(0, hours * 60 + minutes))
}

function normalizePublicScheduleTime(value) {
  const parts = String(value || '').split(':')
  const hours = Number(parts[0])
  const minutes = Number(parts[1])

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '--:--'

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function getPublicScheduleTimeText(schedule) {
  return `${normalizePublicScheduleTime(schedule.start_time)} - ${normalizePublicScheduleTime(schedule.end_time)}`
}

function getPublicScheduleDaysText(schedule) {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const days = Array.isArray(schedule.days_of_week) ? schedule.days_of_week : []

  if (days.length === 0 || days.length === 7) return 'daily'

  return days.map((day) => labels[day]).filter(Boolean).join(', ')
}

function getPublicScheduleDateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getPublicScheduleTypeLabel(type) {
  if (type === 'availability') return 'Menu timing'
  if (type === 'happy_hour') return 'Happy hour'
  if (type === 'special_price') return 'Special price'
  if (type === 'hide_item') return 'Hidden now'
  return 'Menu schedule'
}


const publicGatewayLabels = {
  ziina: 'Ziina',
  stripe: 'Stripe',
  paypal: 'PayPal',
  network: 'Network',
  cashfree: 'Cashfree',
  razorpay: 'Razorpay',
  phonepe: 'PhonePe',
}

function getPublicDeliveryPaymentOptions(restaurant) {
  if (!restaurant || restaurant.delivery_enabled === false) return []

  const settings = normalizePublicPaymentGatewaySettings(
    restaurant.payment_gateway_settings,
  )
  const options = []

  if (restaurant.accepts_cod !== false && settings.cod?.enabled !== false) {
    if (settings.cod?.cash_enabled !== false) {
      options.push({
        value: 'cod_cash',
        gateway: 'cod',
        deliveryPaymentType: 'cash',
        label: 'Cash on Delivery',
        shortLabel: 'Cash',
        text: 'Pay cash to the delivery staff.',
        statusText: 'Order will stay unpaid until cash is collected by the delivery staff.',
        isOnline: false,
      })
    }

    if (settings.cod?.card_enabled !== false) {
      options.push({
        value: 'cod_card',
        gateway: 'cod',
        deliveryPaymentType: 'card',
        label: 'Card on Delivery',
        shortLabel: 'Card machine',
        text: 'Delivery staff will bring tap/card POS machine.',
        statusText: 'Order will stay unpaid until card payment is collected by the delivery staff.',
        isOnline: false,
      })
    }
  }

  const sortedPublicGatewayEntries = Object.entries(publicGatewayLabels).sort(
    ([gatewayA], [gatewayB]) =>
      getPublicGatewaySortOrder(settings[gatewayA]) -
      getPublicGatewaySortOrder(settings[gatewayB]),
  )

  sortedPublicGatewayEntries.forEach(([gateway, label]) => {
    const gatewaySettings = settings[gateway] || {}

    if (!gatewaySettings.enabled) return

    if (gatewaySettings.requiresConnection && !gatewaySettings.isConnected) {
      return
    }

    if (
      gatewaySettings.require_successful_test &&
      gatewaySettings.last_test_status !== 'success'
    ) {
      return
    }

    const textMap = {
      ziina: 'Pay online using Ziina secure checkout.',
      stripe: 'Pay online using Stripe secure checkout.',
      paypal: 'Pay online using this restaurant’s PayPal checkout.',
      razorpay: 'Pay online using this restaurant’s Razorpay payment link.',
      cashfree: 'Pay online using this restaurant’s Cashfree payment link.',
      phonepe: 'Pay online using this restaurant’s PhonePe checkout.',
      network: 'Pay online using this restaurant’s Network / N-Genius checkout.',
    }

    const statusMap = {
      ziina: 'Ziina checkout will open after your order is saved. The restaurant receives confirmation after payment succeeds.',
      stripe: 'Stripe checkout will open after your order is saved. The restaurant receives confirmation after payment succeeds.',
      paypal: 'PayPal checkout will open after your order is saved. The restaurant receives confirmation after PayPal approves and captures payment.',
      razorpay: 'Razorpay payment link will open after your order is saved. The restaurant receives confirmation after payment succeeds.',
      cashfree: 'Cashfree payment link will open after your order is saved. The restaurant receives confirmation after payment succeeds.',
      phonepe: 'PhonePe checkout will open after your order is saved. The restaurant receives confirmation after payment succeeds.',
      network: 'Network / N-Genius checkout will open after your order is saved. The restaurant receives confirmation after payment succeeds.',
    }

    const checkoutLabel = String(gatewaySettings.display_label || '').trim() || label

    options.push({
      value: gateway,
      gateway,
      deliveryPaymentType: null,
      label: checkoutLabel,
      shortLabel: checkoutLabel,
      text: textMap[gateway] || `Pay online using ${checkoutLabel}.`,
      statusText:
        statusMap[gateway] ||
        'Order is saved as unpaid/pending until secure checkout and webhook confirmation are completed.',
      isOnline: true,
      isHighlighted: Boolean(gatewaySettings.highlighted),
      sortOrder: getPublicGatewaySortOrder(gatewaySettings),
    })
  })

  return options
}

function normalizePublicPaymentGatewaySettings(value) {
  const incoming = value && typeof value === 'object' ? value : {}

  return {
    cod: {
      enabled: incoming.cod?.enabled !== false,
      cash_enabled: incoming.cod?.cash_enabled !== false,
      card_enabled: incoming.cod?.card_enabled !== false,
    },
    ziina: normalizePublicOnlineGateway(incoming.ziina, true),
    stripe: normalizePublicOnlineGateway(incoming.stripe, true),
    paypal: normalizePublicOnlineGateway(incoming.paypal, true),
    network: normalizePublicOnlineGateway(incoming.network, true),
    cashfree: normalizePublicOnlineGateway(incoming.cashfree, true),
    razorpay: normalizePublicOnlineGateway(incoming.razorpay, true),
    phonepe: normalizePublicOnlineGateway(incoming.phonepe, true),
  }
}

function normalizePublicOnlineGateway(value, requiresConnection = false) {
  const incoming = value && typeof value === 'object' ? value : {}
  const connectionStatus = String(incoming.connection_status || '').toLowerCase()
  const credentialStatus = String(incoming.credential_status || '').toLowerCase()
  const isConnected = ['connected', 'tested'].includes(connectionStatus) || credentialStatus === 'saved'

  return {
    enabled: Boolean(incoming.enabled),
    requiresConnection,
    isConnected: requiresConnection ? isConnected : true,
    connection_status: connectionStatus,
    last_test_status: String(incoming.last_test_status || '').toLowerCase(),
    display_label: String(incoming.display_label || '').trim(),
    sort_order: Number.isFinite(Number(incoming.sort_order))
      ? Number(incoming.sort_order)
      : 50,
    highlighted: Boolean(incoming.highlighted),
    require_successful_test: Boolean(incoming.require_successful_test),
  }
}

function getPublicGatewaySortOrder(gatewayValue) {
  const numericOrder = Number(gatewayValue?.sort_order)

  if (Number.isFinite(numericOrder)) return numericOrder

  return 50
}

function resolvePublicDeliveryPaymentChoice(value, options) {
  const paymentOptions = Array.isArray(options) ? options : []
  const normalizedValue = String(value || '').trim().toLowerCase()

  if (!normalizedValue) return null

  if (normalizedValue === 'cash') {
    return paymentOptions.find((option) => option.value === 'cod_cash') || null
  }

  if (normalizedValue === 'card') {
    return paymentOptions.find((option) => option.value === 'cod_card') || null
  }

  return paymentOptions.find((option) => option.value === normalizedValue) || null
}

export default PublicMenuPage