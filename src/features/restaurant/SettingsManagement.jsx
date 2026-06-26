import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  Clock3,
  CreditCard,
  Globe2,
  ImagePlus,
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
    text: 'UAE online payments foundation.',
  },
  {
    key: 'stripe',
    label: 'Stripe',
    text: 'Global card checkout foundation.',
  },
  {
    key: 'paypal',
    label: 'PayPal',
    text: 'PayPal checkout foundation.',
  },
  {
    key: 'network',
    label: 'Network',
    text: 'Network International / N-Genius.',
  },
  {
    key: 'cashfree',
    label: 'Cashfree',
    text: 'India payment gateway foundation.',
  },
  {
    key: 'razorpay',
    label: 'Razorpay',
    text: 'India card / UPI gateway foundation.',
  },
  {
    key: 'phonepe',
    label: 'PhonePe',
    text: 'India PhonePe gateway foundation.',
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
  ziina: { enabled: false, test_mode: true },
  stripe: { enabled: false, test_mode: true },
  paypal: { enabled: false, test_mode: true },
  network: { enabled: false, test_mode: true },
  cashfree: { enabled: false, test_mode: true },
  razorpay: { enabled: false, test_mode: true },
  phonepe: { enabled: false, test_mode: true },
}

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
  const [locating, setLocating] = useState(false)
  const [message, setMessage] = useState('')

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
        accepts_online: Boolean(form.accepts_online),
        accepts_cod: Boolean(normalizedGatewaySettings.cod?.enabled),
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
        payment_gateway_settings: normalizedGatewaySettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', restaurant.id)

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setForm((current) => ({ ...current, slug: cleanSlug }))
    setMessage('Restaurant settings saved successfully.')
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

  return (
    <section className="management-section settings-screen">
      <header className="settings-header">
        <div>
          <p className="section-kicker">Settings</p>
          <h2>Restaurant settings</h2>
          <span>
            Manage profile, public menu URL, logo, social links, currency,
            payments, delivery charges, tax, map location and opening hours.
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
            disabled={saving || uploadingLogo}
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

                  {gateway.key === 'cod' && gatewayValue.enabled && (
                    <div className="settings-cod-options">
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
                    <div className="settings-gateway-coming">
                      Gateway credentials and secure connect flow will be handled
                      gateway-by-gateway in the next integration phase.
                    </div>
                  )}
                </div>
              )
            })}
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

function normalizePaymentGatewaySettings(value) {
  const incoming = value && typeof value === 'object' ? value : {}
  const normalized = {}

  paymentGateways.forEach((gateway) => {
    normalized[gateway.key] = {
      ...defaultPaymentGatewaySettings[gateway.key],
      ...(incoming[gateway.key] || {}),
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
