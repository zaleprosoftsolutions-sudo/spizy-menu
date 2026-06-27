import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  Clock3,
  CreditCard,
  Globe2,
  ImagePlus,
  Palette,
  Link2,
  LocateFixed,
  MapPin,
  RefreshCcw,
  Save,
  Settings,
  Store,
  ToggleLeft,
  ToggleRight,
  Truck,
  UploadCloud,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { uploadProductImageToR2 } from '../../lib/r2Upload'
import './SettingsManagement.css'

const currencyOptions = [
  { code: 'AED', label: 'AED - UAE Dirham' },
  { code: 'SAR', label: 'SAR - Saudi Riyal' },
  { code: 'QAR', label: 'QAR - Qatari Riyal' },
  { code: 'BHD', label: 'BHD - Bahraini Dinar' },
  { code: 'KWD', label: 'KWD - Kuwaiti Dinar' },
  { code: 'OMR', label: 'OMR - Omani Rial' },
  { code: 'INR', label: 'INR - Indian Rupee' },
]

const paymentGateways = [
  {
    key: 'cod',
    label: 'COD',
    text: 'Cash/card on delivery collection by rider.',
  },
  {
    key: 'ziina',
    label: 'Ziina',
    text: 'Restaurant-owned Ziina checkout. Customer payments go directly to the restaurant account.',
  },
  {
    key: 'stripe',
    label: 'Stripe',
    text: 'Global card checkout foundation.',
  },
  {
    key: 'paypal',
    label: 'PayPal',
    text: 'Restaurant-owned PayPal checkout using this restaurant’s own PayPal business/API credentials.',
  },
  {
    key: 'network',
    label: 'Network',
    text: 'UAE/MENA card gateway foundation.',
  },
  {
    key: 'cashfree',
    label: 'Cashfree',
    text: 'India card / UPI checkout foundation.',
  },
  {
    key: 'razorpay',
    label: 'Razorpay',
    text: 'India card / UPI checkout foundation.',
  },
  {
    key: 'phonepe',
    label: 'PhonePe',
    text: 'India PhonePe checkout using this restaurant’s own PhonePe PG credentials.',
  },
]

const socialFields = [
  { key: 'website_url', label: 'Website', placeholder: 'https://yourrestaurant.com' },
  { key: 'facebook_url', label: 'Facebook', placeholder: 'https://facebook.com/...' },
  { key: 'instagram_url', label: 'Instagram', placeholder: 'https://instagram.com/...' },
  { key: 'tiktok_url', label: 'TikTok', placeholder: 'https://tiktok.com/@...' },
  { key: 'youtube_url', label: 'YouTube', placeholder: 'https://youtube.com/@...' },
  { key: 'x_url', label: 'X / Twitter', placeholder: 'https://x.com/...' },
]

const weekDays = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
]

const defaultOpeningHours = weekDays.reduce((hours, day) => {
  hours[day.key] = {
    enabled: true,
    open: '09:00',
    close: '23:00',
  }

  return hours
}, {})

const defaultPaymentGatewaySettings = {
  cod: {
    enabled: true,
    cash_enabled: true,
    card_enabled: true,
  },
  ziina: {
    enabled: false,
    test_mode: true,
    merchant_label: '',
    public_key: '',
    checkout_mode: 'redirect',
    connection_status: 'not_connected',
    credential_status: 'missing',
    last_test_status: '',
    last_test_message: '',
    last_tested_at: '',
  },
  stripe: {
    enabled: false,
    test_mode: true,
    merchant_label: '',
    public_key: '',
    checkout_mode: 'redirect',
    connection_status: 'not_connected',
    credential_status: 'missing',
    last_test_status: '',
    last_test_message: '',
    last_tested_at: '',
  },
  paypal: {
    enabled: false,
    test_mode: true,
    merchant_label: '',
    public_key: '',
    checkout_mode: 'redirect',
    connection_status: 'not_connected',
    credential_status: 'missing',
    last_test_status: '',
    last_test_message: '',
    last_tested_at: '',
  },
  network: {
    enabled: false,
    test_mode: true,
    merchant_label: '',
    public_key: '',
    checkout_mode: 'redirect',
    connection_status: 'not_connected',
    credential_status: 'missing',
    last_test_status: '',
    last_test_message: '',
    last_tested_at: '',
  },
  cashfree: {
    enabled: false,
    test_mode: true,
    merchant_label: '',
    public_key: '',
    checkout_mode: 'payment_link',
    connection_status: 'not_connected',
    credential_status: 'missing',
    last_test_status: '',
    last_test_message: '',
    last_tested_at: '',
  },
  razorpay: {
    enabled: false,
    test_mode: true,
    merchant_label: '',
    public_key: '',
    checkout_mode: 'payment_link',
    connection_status: 'not_connected',
    credential_status: 'missing',
    last_test_status: '',
    last_test_message: '',
    last_tested_at: '',
  },
  phonepe: {
    enabled: false,
    test_mode: true,
    merchant_label: '',
    public_key: '',
    checkout_mode: 'redirect',
    connection_status: 'not_connected',
    credential_status: 'missing',
    last_test_status: '',
    last_test_message: '',
    last_tested_at: '',
  },
}

const defaultPublicMenuTheme = {
  accent_color: '#ff7a18',
  secondary_color: '#ffbf4d',
  background_style: 'dark',
  header_style: 'premium',
  product_card_style: 'compact',
  show_cover_image: true,
  show_logo: true,
  show_social_links: true,
  show_directions: true,
  show_campaigns: true,
  show_reviews: true,
}

const themeAccentOptions = [
  { value: '#ff7a18', label: 'Spizy Orange' },
  { value: '#f59e0b', label: 'Gold' },
  { value: '#22c55e', label: 'Fresh Green' },
  { value: '#38bdf8', label: 'Sky Blue' },
  { value: '#a855f7', label: 'Royal Purple' },
  { value: '#ef4444', label: 'Hot Red' },
]

const defaultSettings = {
  name: '',
  slug: '',
  phone: '',
  whatsapp_phone: '',
  address: '',
  website_url: '',
  facebook_url: '',
  instagram_url: '',
  tiktok_url: '',
  youtube_url: '',
  x_url: '',
  custom_social_links: [],
  logo_url: '',
  public_cover_url: '',
  public_menu_theme: defaultPublicMenuTheme,
  map_latitude: '',
  map_longitude: '',
  map_url: '',
  currency: 'AED',
  dine_in_enabled: true,
  takeaway_enabled: true,
  delivery_enabled: true,
  accept_outside_orders: true,
  auto_accept_orders: false,
  accepts_cash: true,
  accepts_card: true,
  accepts_upi: false,
  accepts_online: false,
  accepts_cod: true,
  minimum_order_amount: 0,
  delivery_fee: 0,
  shipping_fee: 0,
  packaging_fee: 0,
  estimated_delivery_minutes: 30,
  tax_rate: 0,
  service_charge: 0,
  opening_hours: defaultOpeningHours,
  payment_gateway_settings: defaultPaymentGatewaySettings,
}

function SettingsManagement({ restaurant }) {
  const [form, setForm] = useState(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState('')
  const [gatewayTesting, setGatewayTesting] = useState('')
  const [gatewayDisconnecting, setGatewayDisconnecting] = useState('')
  const [gatewayDisconnectConfirm, setGatewayDisconnectConfirm] = useState('')
  const [gatewayTestResult, setGatewayTestResult] = useState(null)
  const [gatewayAuditLoading, setGatewayAuditLoading] = useState(false)
  const [gatewayAuditLogs, setGatewayAuditLogs] = useState([])
  const [gatewayCredentialInputs, setGatewayCredentialInputs] = useState({
    ziina: { accessToken: '', webhookSecret: '' },
    stripe: { accessToken: '', webhookSecret: '' },
    paypal: { accessToken: '', webhookSecret: '' },
    razorpay: { accessToken: '', webhookSecret: '' },
    cashfree: { accessToken: '', webhookSecret: '' },
    network: { accessToken: '', webhookSecret: '' },
    phonepe: {
      accessToken: '',
      webhookSecret: '',
      clientVersion: '',
      webhookUsername: '',
      webhookPassword: '',
    },
  })

  const loadSettings = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data, error } = await supabase
      .from('restaurants')
      .select(
        `
          id,
          name,
          slug,
          phone,
          whatsapp_phone,
          address,
          website_url,
          facebook_url,
          instagram_url,
          tiktok_url,
          youtube_url,
          x_url,
          custom_social_links,
          logo_url,
          public_cover_url,
          public_menu_theme,
          map_latitude,
          map_longitude,
          map_url,
          currency,
          dine_in_enabled,
          takeaway_enabled,
          delivery_enabled,
          accept_outside_orders,
          auto_accept_orders,
          accepts_cash,
          accepts_card,
          accepts_upi,
          accepts_online,
          accepts_cod,
          minimum_order_amount,
          delivery_fee,
          shipping_fee,
          packaging_fee,
          estimated_delivery_minutes,
          tax_rate,
          service_charge,
          opening_hours,
          payment_gateway_settings
        `,
      )
      .eq('id', restaurant.id)
      .maybeSingle()

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    if (data) {
      setForm({
        ...defaultSettings,
        ...data,
        opening_hours: normalizeOpeningHours(data.opening_hours),
        custom_social_links: normalizeEditableCustomSocialLinks(data.custom_social_links),
        payment_gateway_settings: normalizePaymentGatewaySettings(
          data.payment_gateway_settings,
        ),
        currency: data.currency || restaurant.currency || 'AED',
        public_menu_theme: normalizePublicMenuTheme(data.public_menu_theme),
        shipping_fee: Number(data.shipping_fee ?? data.delivery_fee ?? 0),
      })
    }

    setLoading(false)
  }, [restaurant?.currency, restaurant?.id])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const publicMenuUrl = useMemo(() => {
    if (!form.slug) return ''

    const appUrl = (import.meta.env.VITE_APP_URL || window.location.origin).replace(
      /\/$/,
      '',
    )

    return `${appUrl}/menu/${encodeURIComponent(form.slug)}`
  }, [form.slug])

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  const updateTheme = (key, value) => {
    setForm((current) => ({
      ...current,
      public_menu_theme: {
        ...normalizePublicMenuTheme(current.public_menu_theme),
        [key]: value,
      },
    }))
    setMessage('')
  }

  const toggleTheme = (key) => {
    setForm((current) => {
      const currentTheme = normalizePublicMenuTheme(current.public_menu_theme)

      return {
        ...current,
        public_menu_theme: {
          ...currentTheme,
          [key]: !currentTheme[key],
        },
      }
    })
    setMessage('')
  }

  const toggleField = (key) => {
    setForm((current) => ({ ...current, [key]: !current[key] }))
    setMessage('')
  }

  const updateGateway = (gatewayKey, patch) => {
    setForm((current) => ({
      ...current,
      payment_gateway_settings: {
        ...normalizePaymentGatewaySettings(current.payment_gateway_settings),
        [gatewayKey]: {
          ...normalizePaymentGatewaySettings(current.payment_gateway_settings)[gatewayKey],
          ...patch,
        },
      },
    }))
    setMessage('')
  }

  const updateGatewayCredentialInput = (gatewayKey, key, value) => {
    setGatewayCredentialInputs((current) => ({
      ...current,
      [gatewayKey]: {
        ...(current[gatewayKey] || {}),
        [key]: value,
      },
    }))
    setMessage('')
  }

  const testGatewayConnection = async (gatewayKey) => {
    if (!restaurant?.id || !gatewayKey) return

    setGatewayTesting(gatewayKey)
    setGatewayTestResult(null)
    setMessage('')

    const { data, error } = await supabase.functions.invoke(
      'test-restaurant-gateway-connection',
      {
        body: {
          restaurant_id: restaurant.id,
          gateway: gatewayKey,
        },
      },
    )

    setGatewayTesting('')

    if (error || !data?.success) {
      const result = {
        gateway: gatewayKey,
        success: false,
        message: data?.message || error?.message || 'Gateway connection test failed.',
      }

      setGatewayTestResult(result)
      setMessage(result.message)
      await loadSettings()
      await loadGatewayAuditLogs(gatewayKey)
      return
    }

    const result = {
      gateway: gatewayKey,
      success: true,
      message: data.message || 'Gateway connection test passed.',
      reference: data.test_reference || '',
      mode: data.mode || '',
    }

    setGatewayTestResult(result)
    setMessage(result.message)
    await loadSettings()
    await loadGatewayAuditLogs(gatewayKey)
  }

  const disconnectGatewayConnection = async (gatewayKey) => {
    if (!restaurant?.id || !gatewayKey) return

    const gatewayName = formatGatewayName(gatewayKey)

    if (gatewayDisconnectConfirm !== gatewayKey) {
      setGatewayDisconnectConfirm(gatewayKey)
      setMessage(
        `Tap Disconnect ${gatewayName} again to confirm. Customers will no longer see this online payment option until the restaurant reconnects credentials.`,
      )
      return
    }

    setGatewayDisconnecting(gatewayKey)
    setGatewayDisconnectConfirm('')
    setGatewayTestResult(null)
    setMessage('')

    const { data, error } = await supabase.functions.invoke(
      'disconnect-restaurant-gateway-credentials',
      {
        body: {
          restaurant_id: restaurant.id,
          gateway: gatewayKey,
        },
      },
    )

    setGatewayDisconnecting('')

    if (error || !data?.success) {
      setMessage(data?.message || error?.message || 'Gateway disconnect failed.')
      await loadSettings()
      return
    }

    setGatewayCredentialInputs((current) => ({
      ...current,
      [gatewayKey]: { accessToken: '', webhookSecret: '' },
    }))
    setMessage(data.message || `${gatewayName} disconnected for this restaurant.`)
    setGatewayDisconnectConfirm('')
    await loadSettings()
    await loadGatewayAuditLogs(gatewayKey)
  }

  const loadGatewayAuditLogs = useCallback(async (gatewayKey = 'ziina') => {
    if (!restaurant?.id || !gatewayKey) return

    setGatewayAuditLoading(true)

    const { data, error } = await supabase.functions.invoke(
      'list-restaurant-gateway-audit-logs',
      {
        body: {
          restaurant_id: restaurant.id,
          gateway: gatewayKey,
          limit: 12,
        },
      },
    )

    setGatewayAuditLoading(false)

    if (error || !data?.success) {
      setGatewayAuditLogs([])
      return
    }

    setGatewayAuditLogs(Array.isArray(data.logs) ? data.logs : [])
  }, [restaurant?.id])

  useEffect(() => {
    if (!restaurant?.id) return

    loadGatewayAuditLogs('ziina')
  }, [loadGatewayAuditLogs, restaurant?.id])

  const updateOpeningHour = (dayKey, field, value) => {
    setForm((current) => ({
      ...current,
      opening_hours: {
        ...normalizeOpeningHours(current.opening_hours),
        [dayKey]: {
          ...normalizeOpeningHours(current.opening_hours)[dayKey],
          [field]: value,
        },
      },
    }))
    setMessage('')
  }

  const updateCustomLink = (index, key, value) => {
    setForm((current) => {
      const nextLinks = normalizeEditableCustomSocialLinks(
        current.custom_social_links,
      )

      nextLinks[index] = {
        ...(nextLinks[index] || { label: '', url: '' }),
        [key]: value,
      }

      return {
        ...current,
        custom_social_links: nextLinks,
      }
    })
    setMessage('')
  }

  const addCustomLink = () => {
    setForm((current) => ({
      ...current,
      custom_social_links: [
        ...normalizeEditableCustomSocialLinks(current.custom_social_links),
        { label: '', url: '' },
      ],
    }))
    setMessage('')
  }

  const removeCustomLink = (index) => {
    setForm((current) => ({
      ...current,
      custom_social_links: normalizeEditableCustomSocialLinks(
        current.custom_social_links,
      ).filter((_, linkIndex) => linkIndex !== index),
    }))
    setMessage('')
  }

  const handleLogoUpload = async (file) => {
    if (!restaurant?.id || !file) return

    if (!file.type.startsWith('image/')) {
      setMessage('Please upload a valid image file.')
      return
    }

    if (file.size > 4 * 1024 * 1024) {
      setMessage('Logo source image should be below 4 MB.')
      return
    }

    try {
      setUploadingLogo(true)
      setMessage('')

      const logoDataUrl = await cropImageToDataUrl({
        file,
        width: 512,
        height: 512,
        quality: 0.86,
      })

      const imageUrl = await uploadProductImageToR2({
        restaurantId: restaurant.id,
        imageDataUrl: logoDataUrl,
        fileName: `${makeSafeSlug(form.slug || form.name || 'restaurant')}-logo.jpg`,
      })

      updateField('logo_url', imageUrl)
      setMessage('Logo uploaded and optimized to 512 × 512 px.')
    } catch (error) {
      setMessage(error.message || 'Logo upload failed.')
    } finally {
      setUploadingLogo(false)
    }
  }


  const handleCoverUpload = async (file) => {
    if (!restaurant?.id || !file) return

    if (!file.type.startsWith('image/')) {
      setMessage('Please upload a valid cover image file.')
      return
    }

    if (file.size > 6 * 1024 * 1024) {
      setMessage('Cover source image should be below 6 MB.')
      return
    }

    try {
      setUploadingCover(true)
      setMessage('')

      const coverDataUrl = await cropImageToDataUrl({
        file,
        width: 1600,
        height: 640,
        quality: 0.84,
      })

      const imageUrl = await uploadProductImageToR2({
        restaurantId: restaurant.id,
        imageDataUrl: coverDataUrl,
        fileName: `${makeSafeSlug(form.slug || form.name || 'restaurant')}-menu-cover.jpg`,
      })

      updateField('public_cover_url', imageUrl)
      updateTheme('show_cover_image', true)
      setMessage('Public menu cover uploaded and cropped to 1600 × 640 px.')
    } catch (error) {
      setMessage(error.message || 'Cover upload failed.')
    } finally {
      setUploadingCover(false)
    }
  }

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Location picker is not available in this browser.')
      return
    }

    setLocating(true)
    setMessage('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude).toFixed(7)
        const longitude = Number(position.coords.longitude).toFixed(7)

        setForm((current) => ({
          ...current,
          map_latitude: latitude,
          map_longitude: longitude,
          map_url:
            current.map_url ||
            `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
        }))
        setMessage('Map location selected from this device.')
        setLocating(false)
      },
      () => {
        setMessage('Unable to access location. Paste a Google Maps link instead.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const saveSettings = async () => {
    if (!restaurant?.id) return

    const cleanName = form.name.trim()
    const cleanSlug = makeSafeSlug(form.slug)

    if (!cleanName) {
      setMessage('Restaurant name is required.')
      return
    }

    if (!cleanSlug) {
      setMessage('Restaurant slug is required.')
      return
    }

    const normalizedGatewaySettings = normalizePaymentGatewaySettings(
      form.payment_gateway_settings,
    )
    const codHasCollectionMethod =
      Boolean(normalizedGatewaySettings.cod?.enabled) &&
      (normalizedGatewaySettings.cod?.cash_enabled !== false ||
        normalizedGatewaySettings.cod?.card_enabled !== false)
    const sanitizedGatewaySettings = {
      ...normalizedGatewaySettings,
      cod: {
        ...normalizedGatewaySettings.cod,
        enabled: codHasCollectionMethod,
      },
    }
    const hasOnlinePaymentGateway = Object.entries(sanitizedGatewaySettings).some(
      ([gatewayKey, gatewayValue]) =>
        gatewayKey !== 'cod' && Boolean(gatewayValue?.enabled),
    )

    setSaving(true)

    const { error } = await supabase
      .from('restaurants')
      .update({
        name: cleanName,
        slug: cleanSlug,
        phone: nullIfEmpty(form.phone),
        whatsapp_phone: nullIfEmpty(form.whatsapp_phone),
        address: nullIfEmpty(form.address),
        website_url: nullIfEmpty(form.website_url),
        facebook_url: nullIfEmpty(form.facebook_url),
        instagram_url: nullIfEmpty(form.instagram_url),
        tiktok_url: nullIfEmpty(form.tiktok_url),
        youtube_url: nullIfEmpty(form.youtube_url),
        x_url: nullIfEmpty(form.x_url),
        custom_social_links: cleanCustomSocialLinks(form.custom_social_links),
        logo_url: nullIfEmpty(form.logo_url),
        public_cover_url: nullIfEmpty(form.public_cover_url),
        public_menu_theme: normalizePublicMenuTheme(form.public_menu_theme),
        map_latitude: getNullableNumber(form.map_latitude),
        map_longitude: getNullableNumber(form.map_longitude),
        map_url: nullIfEmpty(form.map_url),
        currency: form.currency || 'AED',
        dine_in_enabled: Boolean(form.dine_in_enabled),
        takeaway_enabled: Boolean(form.takeaway_enabled),
        delivery_enabled: Boolean(form.delivery_enabled),
        accept_outside_orders: Boolean(form.accept_outside_orders),
        auto_accept_orders: Boolean(form.auto_accept_orders),
        accepts_cash: Boolean(form.accepts_cash),
        accepts_card: Boolean(form.accepts_card),
        accepts_upi: Boolean(form.accepts_upi),
        accepts_online: Boolean(form.accepts_online || hasOnlinePaymentGateway),
        accepts_cod: codHasCollectionMethod,
        minimum_order_amount: getSafeNumber(form.minimum_order_amount),
        delivery_fee: getSafeNumber(form.shipping_fee || form.delivery_fee),
        shipping_fee: getSafeNumber(form.shipping_fee),
        packaging_fee: getSafeNumber(form.packaging_fee),
        estimated_delivery_minutes: Math.max(
          0,
          Number(form.estimated_delivery_minutes || 0),
        ),
        tax_rate: getSafeNumber(form.tax_rate),
        service_charge: getSafeNumber(form.service_charge),
        opening_hours: normalizeOpeningHours(form.opening_hours),
        payment_gateway_settings: sanitizedGatewaySettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', restaurant.id)

    if (error) {
      setSaving(false)
      setMessage(error.message)
      return
    }

    const credentialSaveError = await savePendingGatewayCredentials({
      restaurantId: restaurant.id,
      gatewaySettings: sanitizedGatewaySettings,
      credentialInputs: gatewayCredentialInputs,
      setMessage,
    })

    setSaving(false)

    if (credentialSaveError) {
      setMessage(`Restaurant settings saved, but gateway credential was not saved: ${credentialSaveError}`)
      return
    }

    setGatewayCredentialInputs({
      ziina: { accessToken: '', webhookSecret: '' },
      stripe: { accessToken: '', webhookSecret: '' },
      razorpay: { accessToken: '', webhookSecret: '' },
      cashfree: { accessToken: '', webhookSecret: '' },
      phonepe: {
        accessToken: '',
        webhookSecret: '',
        clientVersion: '',
        webhookUsername: '',
        webhookPassword: '',
      },
    })
    setForm((current) => ({
      ...current,
      slug: cleanSlug,
      payment_gateway_settings: sanitizedGatewaySettings,
    }))
    setMessage('Restaurant settings saved successfully. Restaurant-owned gateway settings are ready.')
    await loadSettings()
    await loadGatewayAuditLogs('ziina')
  }

  if (loading) {
    return (
      <section className="management-section settings-screen">
        <div className="settings-empty-state">
          <Settings size={36} />
          <h2>Loading settings...</h2>
          <p>Please wait while Spizy loads restaurant settings.</p>
        </div>
      </section>
    )
  }

  const gatewaySettings = normalizePaymentGatewaySettings(
    form.payment_gateway_settings,
  )
  const editableCustomLinks = normalizeEditableCustomSocialLinks(
    form.custom_social_links,
  )
  const publicMenuTheme = normalizePublicMenuTheme(form.public_menu_theme)

  return (
    <section className="management-section settings-screen">
      <header className="settings-header">
        <div>
          <p className="section-kicker">Settings</p>
          <h2>Restaurant settings</h2>
          <span>
            Manage profile, public menu URL, logo, social links, currency,
            payments, public menu appearance, delivery charges, tax, map location and opening hours.
          </span>
        </div>

        <div className="settings-header-actions">
          <button type="button" className="settings-secondary-button" onClick={loadSettings}>
            <RefreshCcw size={16} />
            Refresh
          </button>

          <button
            type="button"
            className="settings-save-button"
            onClick={saveSettings}
            disabled={saving || uploadingLogo || uploadingCover}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </header>

      {message && <div className="settings-message">{message}</div>}

      <div className="settings-grid">
        <SettingsCard
          icon={Store}
          title="Restaurant profile"
          text="Basic identity shown in dashboard and public QR menu."
        >
          <div className="settings-form-grid two">
            <SettingsInput
              label="Restaurant name"
              value={form.name}
              onChange={(value) => updateField('name', value)}
              placeholder="Kubra Cafe"
            />

            <SettingsInput
              label="Menu slug"
              value={form.slug}
              onChange={(value) => updateField('slug', makeSafeSlug(value))}
              placeholder="kubra-cafe"
            />
          </div>

          {publicMenuUrl && (
            <div className="settings-public-url">
              <span>Public menu URL</span>
              <strong>{publicMenuUrl}</strong>
            </div>
          )}

          <div className="settings-form-grid two">
            <SettingsInput
              label="Phone"
              value={form.phone || ''}
              onChange={(value) => updateField('phone', value)}
              placeholder="+971..."
            />

            <SettingsInput
              label="WhatsApp phone"
              value={form.whatsapp_phone || ''}
              onChange={(value) => updateField('whatsapp_phone', value)}
              placeholder="+971..."
            />
          </div>

          <SettingsTextarea
            label="Address"
            value={form.address || ''}
            onChange={(value) => updateField('address', value)}
            placeholder="Restaurant address"
          />
        </SettingsCard>

        <SettingsCard
          icon={ImagePlus}
          title="Logo upload"
          text="Upload once. Spizy auto-crops and optimizes the logo for fast loading."
        >
          <div className="settings-logo-uploader">
            <div className="settings-logo-preview">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Restaurant logo" />
              ) : (
                <ImagePlus size={32} />
              )}
            </div>

            <div className="settings-logo-upload-content">
              <strong>Recommended logo size: 512 × 512 px</strong>
              <span>
                Upload JPG, PNG or WebP below 4 MB. Wrong sizes are automatically
                center-cropped to a square logo.
              </span>

              <label className="settings-upload-button">
                <UploadCloud size={16} />
                {uploadingLogo ? 'Uploading...' : 'Upload logo'}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingLogo}
                  onChange={(event) => handleLogoUpload(event.target.files?.[0])}
                />
              </label>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          icon={Palette}
          title="Public menu appearance"
          text="Customize the customer QR menu branding without touching code."
          wide
        >
          <div className="settings-cover-uploader">
            <div className="settings-cover-preview">
              {form.public_cover_url ? (
                <img src={form.public_cover_url} alt="Public menu cover" />
              ) : (
                <div>
                  <ImagePlus size={30} />
                  <span>Cover preview</span>
                </div>
              )}
            </div>

            <div className="settings-cover-content">
              <strong>Recommended public menu cover: 1600 × 640 px</strong>
              <span>
                Use a wide food/banner image. Spizy auto-crops wrong sizes and
                optimizes it for fast loading on mobile and desktop.
              </span>

              <label className="settings-upload-button">
                <UploadCloud size={16} />
                {uploadingCover ? 'Uploading...' : 'Upload menu cover'}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingCover}
                  onChange={(event) => handleCoverUpload(event.target.files?.[0])}
                />
              </label>
            </div>
          </div>

          <div className="settings-form-grid three">
            <label className="settings-field">
              Accent color
              <select
                value={publicMenuTheme.accent_color}
                onChange={(event) => updateTheme('accent_color', event.target.value)}
              >
                {themeAccentOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              Header style
              <select
                value={publicMenuTheme.header_style}
                onChange={(event) => updateTheme('header_style', event.target.value)}
              >
                <option value="premium">Premium banner</option>
                <option value="compact">Compact</option>
              </select>
            </label>

            <label className="settings-field">
              Product card style
              <select
                value={publicMenuTheme.product_card_style}
                onChange={(event) => updateTheme('product_card_style', event.target.value)}
              >
                <option value="compact">Compact list</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </label>
          </div>

          <div className="settings-toggle-grid appearance-toggle-grid">
            <SettingsToggle
              label="Show cover image"
              active={publicMenuTheme.show_cover_image}
              onClick={() => toggleTheme('show_cover_image')}
            />
            <SettingsToggle
              label="Show logo"
              active={publicMenuTheme.show_logo}
              onClick={() => toggleTheme('show_logo')}
            />
            <SettingsToggle
              label="Show social links"
              active={publicMenuTheme.show_social_links}
              onClick={() => toggleTheme('show_social_links')}
            />
            <SettingsToggle
              label="Show directions"
              active={publicMenuTheme.show_directions}
              onClick={() => toggleTheme('show_directions')}
            />
            <SettingsToggle
              label="Show campaigns"
              active={publicMenuTheme.show_campaigns}
              onClick={() => toggleTheme('show_campaigns')}
            />
            <SettingsToggle
              label="Show reviews"
              active={publicMenuTheme.show_reviews}
              onClick={() => toggleTheme('show_reviews')}
            />
          </div>
        </SettingsCard>

        <SettingsCard
          icon={Globe2}
          title="Social media links"
          text="Add official website and social accounts for customer trust."
          wide
        >
          <div className="settings-form-grid three">
            {socialFields.map((field) => (
              <SettingsInput
                key={field.key}
                label={field.label}
                value={form[field.key] || ''}
                onChange={(value) => updateField(field.key, value)}
                placeholder={field.placeholder}
              />
            ))}
          </div>

          <div className="settings-custom-links-box">
            <div className="settings-subhead-row">
              <div>
                <strong>Custom social / external links</strong>
                <span>Add delivery profile, booking page or any custom account.</span>
              </div>

              <button type="button" onClick={addCustomLink}>
                <Link2 size={15} />
                Add custom link
              </button>
            </div>

            {editableCustomLinks.length === 0 ? (
              <div className="settings-muted-note">No custom links added yet.</div>
            ) : (
              <div className="settings-custom-link-list">
                {editableCustomLinks.map((link, index) => (
                  <div className="settings-custom-link-row" key={`custom-social-link-${index}`}>
                    <SettingsInput
                      label="Label"
                      value={link.label || ''}
                      onChange={(value) => updateCustomLink(index, 'label', value)}
                      placeholder="Talabat / Booking / Custom"
                    />

                    <SettingsInput
                      label="URL"
                      value={link.url || ''}
                      onChange={(value) => updateCustomLink(index, 'url', value)}
                      placeholder="https://..."
                    />

                    <button type="button" onClick={() => removeCustomLink(index)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SettingsCard>

        <SettingsCard
          icon={Truck}
          title="Order channels"
          text="Choose whether the menu accepts orders or works as view-only menu."
        >
          <div className="settings-toggle-grid">
            <SettingsToggle
              label="Dine-in QR orders"
              active={form.dine_in_enabled}
              onClick={() => toggleField('dine_in_enabled')}
            />
            <SettingsToggle
              label="Takeaway orders"
              active={form.takeaway_enabled}
              onClick={() => toggleField('takeaway_enabled')}
            />
            <SettingsToggle
              label="Delivery orders"
              active={form.delivery_enabled}
              onClick={() => toggleField('delivery_enabled')}
            />
            <SettingsToggle
              label="Accept outside / QR orders"
              active={form.accept_outside_orders}
              onClick={() => toggleField('accept_outside_orders')}
            />
            <SettingsToggle
              label="Auto accept orders"
              active={form.auto_accept_orders}
              onClick={() => toggleField('auto_accept_orders')}
            />
          </div>

          {!form.accept_outside_orders && (
            <div className="settings-warning-note">
              Public QR menu will become view-only. Customers can see recipes/menu,
              but Add to cart and checkout will be disabled.
            </div>
          )}
        </SettingsCard>

        <SettingsCard
          icon={Banknote}
          title="Currency, tax and delivery charges"
          text="These values are used for order totals and payment gateway currency."
        >
          <div className="settings-form-grid three">
            <label className="settings-field">
              Default store currency
              <select
                value={form.currency || 'AED'}
                onChange={(event) => updateField('currency', event.target.value)}
              >
                {currencyOptions.map((currency) => (
                  <option value={currency.code} key={currency.code}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </label>

            <SettingsInput
              label="Minimum order"
              type="number"
              value={form.minimum_order_amount}
              onChange={(value) => updateField('minimum_order_amount', value)}
            />

            <SettingsInput
              label="Shipping fee"
              type="number"
              value={form.shipping_fee}
              onChange={(value) => updateField('shipping_fee', value)}
            />

            <SettingsInput
              label="Packaging / extra fee"
              type="number"
              value={form.packaging_fee}
              onChange={(value) => updateField('packaging_fee', value)}
            />

            <SettingsInput
              label="Delivery minutes"
              type="number"
              value={form.estimated_delivery_minutes}
              onChange={(value) => updateField('estimated_delivery_minutes', value)}
            />

            <SettingsInput
              label="Global tax %"
              type="number"
              value={form.tax_rate}
              onChange={(value) => updateField('tax_rate', value)}
            />

            <SettingsInput
              label="Service charge % - future"
              type="number"
              value={form.service_charge}
              onChange={(value) => updateField('service_charge', value)}
            />
          </div>
        </SettingsCard>

        <SettingsCard
          icon={CreditCard}
          title="Payment gateways"
          text="Upload gateway logos in public/payment-gateways and activate the options used by this restaurant."
          wide
        >
          <div className="settings-gateway-grid">
            {paymentGateways.map((gateway) => {
              const gatewayValue = gatewaySettings[gateway.key] || {}

              return (
                <div
                  className={`settings-gateway-card ${gatewayValue.enabled ? 'active' : ''}`}
                  key={gateway.key}
                >
                  <div className="settings-gateway-top">
                    <div className="settings-gateway-logo">
                      <img
                        src={`/payment-gateways/${gateway.key}.png`}
                        alt={gateway.label}
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                        }}
                      />
                      <span>{gateway.label.slice(0, 2).toUpperCase()}</span>
                    </div>

                    <button
                      type="button"
                      className={`settings-mini-toggle ${gatewayValue.enabled ? 'active' : ''}`}
                      onClick={() =>
                        updateGateway(gateway.key, {
                          enabled: !gatewayValue.enabled,
                        })
                      }
                    >
                      {gatewayValue.enabled ? 'Active' : 'Off'}
                    </button>
                  </div>

                  <strong>{gateway.label}</strong>
                  <p>{gateway.text}</p>

                  <div className={`settings-gateway-status ${gatewayValue.enabled ? 'active' : 'off'}`}>
                    {getPaymentGatewayStatusText(gateway.key, gatewayValue)}
                  </div>

                  {gateway.key === 'cod' && gatewayValue.enabled && (
                    <div className="settings-cod-options">
                      <div className="settings-gateway-note">
                        Customer delivery checkout will show only the active COD
                        options below. Card means the rider carries a tap/card
                        machine.
                      </div>

                      <SettingsToggle
                        label="COD cash"
                        active={gatewayValue.cash_enabled !== false}
                        onClick={() =>
                          updateGateway('cod', {
                            cash_enabled: gatewayValue.cash_enabled === false,
                          })
                        }
                      />
                      <SettingsToggle
                        label="COD card machine"
                        active={gatewayValue.card_enabled !== false}
                        onClick={() =>
                          updateGateway('cod', {
                            card_enabled: gatewayValue.card_enabled === false,
                          })
                        }
                      />
                    </div>
                  )}

                  {gateway.key !== 'cod' && gatewayValue.enabled && (
                    <div className="settings-gateway-connection-box">
                      <SettingsToggle
                        label={gatewayValue.test_mode === false ? 'Live mode' : 'Test mode'}
                        active={gatewayValue.test_mode !== false}
                        onClick={() =>
                          updateGateway(gateway.key, {
                            test_mode: gatewayValue.test_mode === false,
                          })
                        }
                      />

                      <label className="settings-field compact">
                        Merchant / account label
                        <input
                          type="text"
                          value={gatewayValue.merchant_label || ''}
                          onChange={(event) =>
                            updateGateway(gateway.key, {
                              merchant_label: event.target.value,
                            })
                          }
                          placeholder={`${gateway.label} merchant name`}
                        />
                      </label>

                      <label className="settings-field compact">
                        {gateway.key === 'razorpay' ? 'Razorpay Key ID' : gateway.key === 'cashfree' ? 'Cashfree Client ID' : gateway.key === 'phonepe' ? 'PhonePe Client ID' : gateway.key === 'network' ? 'N-Genius Outlet Reference' : gateway.key === 'paypal' ? 'PayPal Client ID' : 'Public key / client ID - optional'}
                        <input
                          type="text"
                          value={gatewayValue.public_key || ''}
                          onChange={(event) =>
                            updateGateway(gateway.key, {
                              public_key: event.target.value,
                            })
                          }
                          placeholder={gateway.key === 'razorpay' ? 'Paste this restaurant Razorpay Key ID' : gateway.key === 'cashfree' ? 'Paste this restaurant Cashfree Client ID' : gateway.key === 'phonepe' ? 'Paste this restaurant PhonePe Client ID' : gateway.key === 'network' ? 'Paste this restaurant N-Genius Outlet Reference' : gateway.key === 'paypal' ? 'Paste this restaurant PayPal Client ID' : 'Only safe public key. Never secret key.'}
                        />
                      </label>

                      <div className="settings-gateway-ops-panel">
                        <div className="settings-gateway-ops-head">
                          <strong>Customer checkout display</strong>
                          <span>Control how this gateway appears on the public menu.</span>
                        </div>

                        <div className="settings-gateway-ops-grid">
                          <label className="settings-field compact">
                            Public checkout label
                            <input
                              type="text"
                              value={gatewayValue.display_label || ''}
                              onChange={(event) =>
                                updateGateway(gateway.key, {
                                  display_label: event.target.value,
                                })
                              }
                              placeholder={`${gateway.label} checkout`}
                            />
                          </label>

                          <label className="settings-field compact">
                            Display order
                            <input
                              type="number"
                              min="1"
                              value={gatewayValue.sort_order || ''}
                              onChange={(event) =>
                                updateGateway(gateway.key, {
                                  sort_order: event.target.value,
                                })
                              }
                              placeholder="1"
                            />
                          </label>
                        </div>

                        <SettingsToggle
                          label="Highlight as recommended"
                          active={Boolean(gatewayValue.highlighted)}
                          onClick={() =>
                            updateGateway(gateway.key, {
                              highlighted: !gatewayValue.highlighted,
                            })
                          }
                        />

                        <SettingsToggle
                          label="Hide until connection test passes"
                          active={Boolean(gatewayValue.require_successful_test)}
                          onClick={() =>
                            updateGateway(gateway.key, {
                              require_successful_test: !gatewayValue.require_successful_test,
                            })
                          }
                        />
                      </div>

                      {['ziina', 'stripe', 'paypal', 'razorpay', 'cashfree', 'network', 'phonepe'].includes(gateway.key) && (
                        <div className="settings-gateway-owned-box">
                          <div className="settings-gateway-live-note">
                            Connect this restaurant's own {gateway.label} account. Spizy does
                            not use a shared {gateway.label} profile for restaurant customer
                            payments. The secret credential is sent to a protected Edge
                            Function and stored server-side only.
                          </div>

                          <label className="settings-field compact settings-secret-field">
                            Restaurant {gateway.label} {gateway.key === 'stripe' ? 'secret key' : gateway.key === 'paypal' ? 'client secret' : gateway.key === 'razorpay' ? 'key secret' : gateway.key === 'cashfree' ? 'client secret' : gateway.key === 'phonepe' ? 'client secret' : gateway.key === 'network' ? 'Hosted Payment Page API key' : 'access token'}
                            <input
                              type="password"
                              value={gatewayCredentialInputs[gateway.key]?.accessToken || ''}
                              onChange={(event) =>
                                updateGatewayCredentialInput(gateway.key, 'accessToken', event.target.value)
                              }
                              placeholder={gateway.key === 'stripe' ? 'Paste this restaurant Stripe secret key' : gateway.key === 'paypal' ? 'Paste this restaurant PayPal client secret' : gateway.key === 'razorpay' ? 'Paste this restaurant Razorpay key secret' : gateway.key === 'cashfree' ? 'Paste this restaurant Cashfree client secret' : gateway.key === 'phonepe' ? 'Paste this restaurant PhonePe client secret' : gateway.key === 'network' ? 'Paste this restaurant N-Genius Hosted Payment Page API key' : `Paste this restaurant\'s ${gateway.label} access token`}
                              autoComplete="new-password"
                            />
                          </label>

                          <label className="settings-field compact settings-secret-field">
                            Restaurant {gateway.label} webhook secret - optional
                            <input
                              type="password"
                              value={gatewayCredentialInputs[gateway.key]?.webhookSecret || ''}
                              onChange={(event) =>
                                updateGatewayCredentialInput(gateway.key, 'webhookSecret', event.target.value)
                              }
                              placeholder="Paste webhook signing secret for signature verification"
                              autoComplete="new-password"
                            />
                          </label>

                          {gateway.key === 'phonepe' && (
                            <>
                              <label className="settings-field compact settings-secret-field">
                                PhonePe Client Version
                                <input
                                  type="text"
                                  value={gatewayCredentialInputs.phonepe?.clientVersion || ''}
                                  onChange={(event) =>
                                    updateGatewayCredentialInput('phonepe', 'clientVersion', event.target.value)
                                  }
                                  placeholder="Client Version from PhonePe dashboard"
                                  autoComplete="off"
                                />
                              </label>

                              <label className="settings-field compact settings-secret-field">
                                PhonePe webhook username - optional
                                <input
                                  type="text"
                                  value={gatewayCredentialInputs.phonepe?.webhookUsername || ''}
                                  onChange={(event) =>
                                    updateGatewayCredentialInput('phonepe', 'webhookUsername', event.target.value)
                                  }
                                  placeholder="Webhook username configured in PhonePe dashboard"
                                  autoComplete="off"
                                />
                              </label>

                              <label className="settings-field compact settings-secret-field">
                                PhonePe webhook password - optional
                                <input
                                  type="password"
                                  value={gatewayCredentialInputs.phonepe?.webhookPassword || ''}
                                  onChange={(event) =>
                                    updateGatewayCredentialInput('phonepe', 'webhookPassword', event.target.value)
                                  }
                                  placeholder="Webhook password configured in PhonePe dashboard"
                                  autoComplete="new-password"
                                />
                              </label>
                            </>
                          )}

                          <div className="settings-gateway-secret-warning">
                            These secret values are not saved inside public restaurant
                            settings and will clear from this screen after saving. To rotate
                            credentials, paste the new credential and save again.
                          </div>

                          <div className="settings-gateway-rotation-panel">
                            <div>
                              <strong>Credential safety</strong>
                              <span>
                                Credential status: {gatewayValue.credential_status === 'saved' ? 'Saved server-side' : 'Not connected'}
                                {gatewayValue.last_connected_at ? ` • Connected ${formatSettingsDate(gatewayValue.last_connected_at)}` : ''}
                                {gatewayValue.disconnected_at ? ` • Last disconnected ${formatSettingsDate(gatewayValue.disconnected_at)}` : ''}
                              </span>
                            </div>

                            <button
                              type="button"
                              className="danger"
                              onClick={() => disconnectGatewayConnection(gateway.key)}
                              disabled={gatewayDisconnecting === gateway.key || gatewayValue.credential_status !== 'saved'}
                            >
                              <X size={15} />
                              {gatewayDisconnecting === gateway.key
                                ? 'Disconnecting...'
                                : gatewayDisconnectConfirm === gateway.key
                                  ? 'Confirm disconnect'
                                  : `Disconnect ${gateway.label}`}
                            </button>
                          </div>

                          <div className={`settings-gateway-test-panel ${getGatewayConnectionTone(gatewayValue)}`}>
                            <div>
                              <strong>{getGatewayConnectionTitle(gatewayValue)}</strong>
                              <span>{getGatewayConnectionDescription(gatewayValue)}</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => testGatewayConnection(gateway.key)}
                              disabled={gatewayTesting === gateway.key || !gatewayValue.enabled}
                            >
                              <RefreshCcw size={15} />
                              {gatewayTesting === gateway.key ? 'Testing...' : `Test ${gateway.label} connection`}
                            </button>
                          </div>

                          {gatewayTestResult?.gateway === gateway.key && (
                            <div className={`settings-gateway-test-result ${gatewayTestResult.success ? 'success' : 'error'}`}>
                              {gatewayTestResult.message}
                              {gatewayTestResult.reference ? ` Reference: ${gatewayTestResult.reference}` : ''}
                            </div>
                          )}

                          <div className="settings-gateway-audit-panel">
                            <div className="settings-gateway-audit-head">
                              <div>
                                <strong>Safe gateway history</strong>
                                <span>Shows connect, rotate, test, webhook and disconnect actions. Secret keys are never displayed.</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => loadGatewayAuditLogs(gateway.key)}
                                disabled={gatewayAuditLoading}
                              >
                                <RefreshCcw size={14} />
                                {gatewayAuditLoading ? 'Loading...' : 'Refresh'}
                              </button>
                            </div>

                            {gatewayAuditLoading ? (
                              <div className="settings-gateway-audit-empty">Loading gateway history...</div>
                            ) : gatewayAuditLogs.length === 0 ? (
                              <div className="settings-gateway-audit-empty">No gateway history loaded for this gateway yet.</div>
                            ) : (
                              <div className="settings-gateway-audit-list">
                                {gatewayAuditLogs.map((log) => (
                                  <div className="settings-gateway-audit-item" key={log.id}>
                                    <div>
                                      <strong>{getGatewayAuditActionLabel(log.action)}</strong>
                                      <span>{log.message || 'Gateway activity recorded.'}</span>
                                    </div>

                                    <small>
                                      {log.gateway ? `${formatGatewayName(log.gateway)} • ` : ''}
                                      {log.status ? `${String(log.status).toUpperCase()} • ` : ''}
                                      {formatSettingsDate(log.created_at)}
                                    </small>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="settings-gateway-coming">
                        {['ziina', 'stripe', 'paypal', 'razorpay', 'cashfree', 'network', 'phonepe'].includes(gateway.key)
                          ? `Public menu will redirect customers to this restaurant’s own ${gateway.label} checkout after the order is saved. Webhook will update paid/failed automatically when configured.`
                          : 'Public menu will show this payment option. Each restaurant must connect its own merchant account through backend-secured credentials before real collection.'}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="settings-gateway-footer-note">
            Logo files: public/payment-gateways/cod.png, ziina.png, stripe.png,
            paypal.png, network.png, cashfree.png, razorpay.png, phonepe.png.
            Use transparent PNG, 512 × 256 px, below 150 KB. Customer-payment gateways must belong to each restaurant, not Spizy/Zalepro.
          </div>
        </SettingsCard>

        <SettingsCard
          icon={MapPin}
          title="Map location and directions"
          text="Add the restaurant map location so customers can open directions from the menu."
          wide
        >
          <div className="settings-form-grid three">
            <SettingsInput
              label="Latitude"
              value={form.map_latitude || ''}
              onChange={(value) => updateField('map_latitude', value)}
              placeholder="25.2048493"
            />

            <SettingsInput
              label="Longitude"
              value={form.map_longitude || ''}
              onChange={(value) => updateField('map_longitude', value)}
              placeholder="55.2707828"
            />

            <label className="settings-field settings-map-action-field">
              Quick picker
              <button
                type="button"
                className="settings-map-button"
                onClick={handleUseCurrentLocation}
                disabled={locating}
              >
                <LocateFixed size={16} />
                {locating ? 'Picking location...' : 'Use current location'}
              </button>
            </label>
          </div>

          <SettingsInput
            label="Google Maps / direction URL"
            value={form.map_url || ''}
            onChange={(value) => updateField('map_url', value)}
            placeholder="https://maps.google.com/..."
          />

          <div className="settings-muted-note">
            For exact shop location, open Google Maps, select the shop/location,
            copy the share link and paste it here. Current location picker is useful
            when you are physically at the restaurant.
          </div>
        </SettingsCard>

        <SettingsCard
          icon={Clock3}
          title="Opening hours"
          text="Pick open and close time for each day. Turn off closed days."
          wide
        >
          <div className="settings-opening-hours">
            {weekDays.map((day) => {
              const dayHours = normalizeOpeningHours(form.opening_hours)[day.key]

              return (
                <div className="settings-opening-row" key={day.key}>
                  <button
                    type="button"
                    className={`settings-day-toggle ${
                      dayHours.enabled ? 'active' : ''
                    }`}
                    onClick={() =>
                      updateOpeningHour(day.key, 'enabled', !dayHours.enabled)
                    }
                  >
                    {dayHours.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    {day.label}
                  </button>

                  <input
                    type="time"
                    value={dayHours.open || '09:00'}
                    disabled={!dayHours.enabled}
                    onChange={(event) =>
                      updateOpeningHour(day.key, 'open', event.target.value)
                    }
                  />

                  <input
                    type="time"
                    value={dayHours.close || '23:00'}
                    disabled={!dayHours.enabled}
                    onChange={(event) =>
                      updateOpeningHour(day.key, 'close', event.target.value)
                    }
                  />
                </div>
              )
            })}
          </div>
        </SettingsCard>
      </div>
    </section>
  )
}

function SettingsCard({ icon: Icon, title, text, children, wide = false }) {
  return (
    <article className={`settings-card ${wide ? 'wide' : ''}`}>
      <div className="settings-card-head">
        <div className="settings-card-icon">
          <Icon size={19} />
        </div>

        <div>
          <h3>{title}</h3>
          <p>{text}</p>
        </div>
      </div>

      <div className="settings-card-body">{children}</div>
    </article>
  )
}


async function savePendingGatewayCredentials({
  restaurantId,
  gatewaySettings,
  credentialInputs,
}) {
  const supportedCredentialGateways = ['ziina', 'stripe', 'paypal', 'razorpay', 'cashfree', 'network', 'phonepe']
  const errors = []

  for (const gatewayKey of supportedCredentialGateways) {
    const gatewaySettingsValue = gatewaySettings?.[gatewayKey] || {}
    const gatewayInputs = credentialInputs?.[gatewayKey] || {}
    const hasSecretInput =
      String(gatewayInputs.accessToken || '').trim() ||
      String(gatewayInputs.webhookSecret || '').trim() ||
      String(gatewayInputs.clientVersion || '').trim() ||
      String(gatewayInputs.webhookUsername || '').trim() ||
      String(gatewayInputs.webhookPassword || '').trim()

    if (!gatewaySettingsValue.enabled || !hasSecretInput) continue

    const { data, error } = await supabase.functions.invoke(
      'save-restaurant-gateway-credentials',
      {
        body: {
          restaurant_id: restaurantId,
          gateway: gatewayKey,
          access_token: String(gatewayInputs.accessToken || '').trim(),
          webhook_secret: String(gatewayInputs.webhookSecret || '').trim(),
          public_key: String(gatewaySettingsValue.public_key || '').trim(),
          merchant_label: String(gatewaySettingsValue.merchant_label || '').trim(),
          test_mode: gatewaySettingsValue.test_mode !== false,
          is_enabled: Boolean(gatewaySettingsValue.enabled),
          metadata: {
            client_version: String(gatewayInputs.clientVersion || '').trim(),
            webhook_username: String(gatewayInputs.webhookUsername || '').trim(),
            webhook_password: String(gatewayInputs.webhookPassword || '').trim(),
          },
        },
      },
    )

    if (error || !data?.success) {
      errors.push(`${formatGatewayName(gatewayKey)}: ${error?.message || data?.message || 'Gateway credential save failed.'}`)
    }
  }

  return errors.join(' | ')
}

function SettingsInput({ label, value, onChange, placeholder = '', type = 'text' }) {
  return (
    <label className="settings-field">
      {label}
      <input
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

function SettingsTextarea({ label, value, onChange, placeholder = '' }) {
  return (
    <label className="settings-field">
      {label}
      <textarea
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows="3"
      />
    </label>
  )
}

function SettingsToggle({ label, active, onClick }) {
  return (
    <button
      type="button"
      className={`settings-toggle ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
      <span>{label}</span>
    </button>
  )
}

function normalizePublicMenuTheme(value) {
  const incoming = value && typeof value === 'object' ? value : {}

  return {
    ...defaultPublicMenuTheme,
    ...incoming,
    accent_color: incoming.accent_color || defaultPublicMenuTheme.accent_color,
    secondary_color: incoming.secondary_color || defaultPublicMenuTheme.secondary_color,
    background_style: incoming.background_style || defaultPublicMenuTheme.background_style,
    header_style: incoming.header_style || defaultPublicMenuTheme.header_style,
    product_card_style:
      incoming.product_card_style || defaultPublicMenuTheme.product_card_style,
    show_cover_image: incoming.show_cover_image !== false,
    show_logo: incoming.show_logo !== false,
    show_social_links: incoming.show_social_links !== false,
    show_directions: incoming.show_directions !== false,
    show_campaigns: incoming.show_campaigns !== false,
    show_reviews: incoming.show_reviews !== false,
  }
}

function formatSettingsDate(value) {
  if (!value) return ''

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return ''
  }
}


function formatGatewayName(gateway = '') {
  const labels = {
    ziina: 'Ziina',
    stripe: 'Stripe',
    razorpay: 'Razorpay',
    paypal: 'PayPal',
    network: 'Network / N-Genius',
    cashfree: 'Cashfree',
    phonepe: 'PhonePe',
    cod: 'COD',
  }

  const normalizedGateway = String(gateway || '').toLowerCase()
  return labels[normalizedGateway] || normalizedGateway.toUpperCase()
}

function getPaymentGatewayStatusText(gatewayKey, gatewayValue) {
  if (!gatewayValue?.enabled) return 'Hidden from public checkout.'

  if (gatewayKey === 'cod') {
    const cashEnabled = gatewayValue.cash_enabled !== false
    const cardEnabled = gatewayValue.card_enabled !== false

    if (cashEnabled && cardEnabled) {
      return 'Public checkout shows COD cash and card-machine collection.'
    }

    if (cashEnabled) return 'Public checkout shows COD cash only.'
    if (cardEnabled) return 'Public checkout shows card on delivery only.'

    return 'No COD collection method selected. Save will hide COD until one method is enabled.'
  }

  if (['ziina', 'stripe', 'paypal', 'razorpay', 'cashfree', 'network', 'phonepe'].includes(gatewayKey)) {
    const connectionStatus = String(gatewayValue.connection_status || '').toLowerCase()
    const lastTestStatus = String(gatewayValue.last_test_status || '').toLowerCase()
    const gatewayName = formatGatewayName(gatewayKey)

    if (lastTestStatus === 'success') {
      return gatewayValue.test_mode === false
        ? `${gatewayName} live checkout is enabled and this restaurant connection test passed.`
        : `${gatewayName} test checkout is enabled and this restaurant connection test passed.`
    }

    if (connectionStatus === 'connected') {
      return `Restaurant ${gatewayName} credentials are saved. Run Test ${gatewayName} connection before live launch.`
    }

    if (connectionStatus === 'test_failed') {
      return `${gatewayName} credentials were saved, but the latest connection test failed. Check credential/mode and test again.`
    }

    if (connectionStatus === 'disconnected' || gatewayValue.credential_status === 'removed') {
      return `${gatewayName} was disconnected. Save this restaurant’s ${gatewayName} credential again before customers can pay online.`
    }

    return `${gatewayName} is enabled but this restaurant must save its own credential before customers can pay online.`
  }

  return gatewayValue.test_mode === false
    ? 'Live UI enabled. Use backend secrets, payment sessions and webhooks before real collection.'
    : 'Test/foundation UI enabled. Orders remain unpaid until webhook integration is connected.'
}

function getGatewayAuditActionLabel(action) {
  if (action === 'connect') return 'Connected gateway'
  if (action === 'rotate_or_update') return 'Updated / rotated credentials'
  if (action === 'test_connection') return 'Tested connection'
  if (action === 'disconnect') return 'Disconnected gateway'
  if (action === 'webhook') return 'Webhook event'

  return String(action || 'Gateway activity')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getGatewayConnectionTitle(gatewayValue) {
  const status = String(gatewayValue?.connection_status || '').toLowerCase()
  const testStatus = String(gatewayValue?.last_test_status || '').toLowerCase()

  if (testStatus === 'success') return 'Connection test passed'
  if (status === 'test_failed' || testStatus === 'failed') return 'Connection test failed'
  if (status === 'connected') return 'Credentials saved'
  return 'Credentials not connected yet'
}

function getGatewayConnectionDescription(gatewayValue) {
  const status = String(gatewayValue?.connection_status || '').toLowerCase()
  const testStatus = String(gatewayValue?.last_test_status || '').toLowerCase()
  const message = String(gatewayValue?.last_test_message || '').trim()

  if (testStatus === 'success') {
    return message || 'This restaurant’s gateway credential responded successfully. Customers can use this checkout when enabled.'
  }

  if (status === 'test_failed' || testStatus === 'failed') {
    return message || 'The latest gateway test failed. Check the restaurant credential and test/live mode.'
  }

  if (status === 'connected') {
    return 'Token is saved in backend-only storage. Run a connection test before accepting real payments.'
  }

  return 'Paste this restaurant’s own gateway credential and save settings first.'
}

function getGatewayConnectionTone(gatewayValue) {
  const status = String(gatewayValue?.connection_status || '').toLowerCase()
  const testStatus = String(gatewayValue?.last_test_status || '').toLowerCase()

  if (testStatus === 'success') return 'success'
  if (status === 'test_failed' || testStatus === 'failed') return 'error'
  if (status === 'connected') return 'warning'
  return 'neutral'
}

function normalizePaymentGatewaySettings(value) {
  const incoming = value && typeof value === 'object' ? value : {}
  const normalized = {}

  paymentGateways.forEach((gateway, index) => {
    const gatewayValue = incoming[gateway.key] || {}

    normalized[gateway.key] = {
      ...defaultPaymentGatewaySettings[gateway.key],
      ...gatewayValue,
      display_label: String(gatewayValue.display_label || '').trim(),
      sort_order: Number.isFinite(Number(gatewayValue.sort_order))
        ? Number(gatewayValue.sort_order)
        : index + 1,
      highlighted: Boolean(gatewayValue.highlighted),
      require_successful_test: Boolean(gatewayValue.require_successful_test),
    }
  })

  return normalized
}

function normalizeEditableCustomSocialLinks(value) {
  if (!Array.isArray(value)) return []

  return value.map((link) => ({
    label: String(link?.label || ''),
    url: String(link?.url || ''),
  }))
}

function cleanCustomSocialLinks(value) {
  if (!Array.isArray(value)) return []

  return value
    .map((link) => {
      const url = normalizeExternalUrl(link?.url)

      if (!url) return null

      return {
        label: String(link?.label || '').trim() || getLabelFromUrl(url),
        url,
      }
    })
    .filter(Boolean)
}

function normalizeExternalUrl(value) {
  const cleanValue = String(value || '').trim()

  if (!cleanValue) return ''

  if (/^https?:\/\//i.test(cleanValue)) return cleanValue

  return `https://${cleanValue.replace(/^\/+/, '')}`
}

function getLabelFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '') || 'Custom link'
  } catch {
    return 'Custom link'
  }
}

function normalizeOpeningHours(value) {
  const incoming = value && typeof value === 'object' ? value : {}
  const normalized = {}

  weekDays.forEach((day) => {
    normalized[day.key] = {
      enabled: incoming?.[day.key]?.enabled !== false,
      open: incoming?.[day.key]?.open || '09:00',
      close: incoming?.[day.key]?.close || '23:00',
    }
  })

  return normalized
}

function makeSafeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function nullIfEmpty(value) {
  const cleanValue = String(value || '').trim()

  return cleanValue || null
}

function getSafeNumber(value) {
  const numberValue = Number(value || 0)

  if (Number.isNaN(numberValue)) return 0

  return Math.max(0, numberValue)
}

function getNullableNumber(value) {
  const numberValue = Number(value)

  if (Number.isNaN(numberValue)) return null

  return numberValue
}

function cropImageToDataUrl({ file, width, height, quality = 0.86 }) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const image = new Image()

      image.onload = () => {
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')

        canvas.width = width
        canvas.height = height

        const sourceRatio = image.width / image.height
        const targetRatio = width / height
        let sourceWidth = image.width
        let sourceHeight = image.height
        let sourceX = 0
        let sourceY = 0

        if (sourceRatio > targetRatio) {
          sourceWidth = image.height * targetRatio
          sourceX = (image.width - sourceWidth) / 2
        } else {
          sourceHeight = image.width / targetRatio
          sourceY = (image.height - sourceHeight) / 2
        }

        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          width,
          height,
        )

        resolve(canvas.toDataURL('image/jpeg', quality))
      }

      image.onerror = () => reject(new Error('Unable to read this image.'))
      image.src = reader.result
    }

    reader.onerror = () => reject(new Error('Unable to read this file.'))
    reader.readAsDataURL(file)
  })
}

export default SettingsManagement
