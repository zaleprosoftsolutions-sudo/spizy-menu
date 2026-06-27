import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgePercent,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Gift,
  MessageCircle,
  Megaphone,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Users,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './MarketingBroadcastManagement.css'

const segmentOptions = [
  { value: 'all', label: 'All customers', description: 'Every saved customer' },
  { value: 'repeat', label: 'Repeat customers', description: '2+ orders' },
  { value: 'new', label: 'New customers', description: 'Only 1 order' },
  { value: 'inactive30', label: 'Inactive 30+ days', description: 'Bring them back' },
  { value: 'highSpend', label: 'High spenders', description: 'Top value customers' },
  { value: 'rewardPoints', label: 'Reward points', description: 'Customers with points' },
]

const templateOptions = [
  {
    key: 'today-special',
    title: 'Today special',
    text:
      'Hi {name}, today special is live at {restaurant}! Order from our menu here: {menu_link}',
  },
  {
    key: 'coupon',
    title: 'Coupon offer',
    text:
      'Hi {name}, enjoy a special offer from {restaurant}. Use coupon {coupon} on your next order: {menu_link}',
  },
  {
    key: 'come-back',
    title: 'Come back message',
    text:
      'Hi {name}, we missed you at {restaurant}! Your favourite menu is ready. Order now: {menu_link}',
  },
  {
    key: 'reward-points',
    title: 'Rewards reminder',
    text:
      'Hi {name}, you have {points} reward points at {restaurant}. Visit again and enjoy your rewards: {menu_link}',
  },
]

function MarketingBroadcastManagement({ restaurant }) {
  const { showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState([])
  const [discounts, setDiscounts] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState('all')
  const [selectedIds, setSelectedIds] = useState([])
  const [couponCode, setCouponCode] = useState('')
  const [message, setMessage] = useState(templateOptions[0].text)
  const [copiedCustomerId, setCopiedCustomerId] = useState('')

  const currency = restaurant?.currency || 'AED'
  const menuLink = useMemo(() => {
    if (!restaurant?.slug) return window.location.origin

    return `${window.location.origin}/menu/${restaurant.slug}`
  }, [restaurant?.slug])

  const loadMarketingData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [customersResult, discountsResult, campaignsResult] = await Promise.all([
      supabase
        .from('restaurant_customers')
        .select(
          'id, customer_name, customer_phone, total_orders, total_spend, reward_points, first_order_at, last_order_at, created_at',
        )
        .eq('restaurant_id', restaurant.id)
        .order('last_order_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('restaurant_discounts')
        .select('id, title, code, discount_type, discount_value, is_active, starts_at, ends_at')
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false }),
      supabase
        .from('restaurant_campaigns')
        .select('id, title, subtitle, coupon_code, is_active, start_at, end_at')
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false }),
    ])

    if (customersResult.error) {
      showToast({
        type: 'error',
        title: 'Customers loading failed',
        message: customersResult.error.message,
      })
    }

    setCustomers(customersResult.data || [])
    setDiscounts(discountsResult.data || [])
    setCampaigns(campaignsResult.data || [])
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadMarketingData()
  }, [loadMarketingData])

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const inactiveLimit = new Date()
    inactiveLimit.setDate(inactiveLimit.getDate() - 30)

    return customers.filter((customer) => {
      const orders = Number(customer.total_orders || 0)
      const spend = Number(customer.total_spend || 0)
      const points = Number(customer.reward_points || 0)
      const lastOrderAt = customer.last_order_at ? new Date(customer.last_order_at) : null

      if (segment === 'repeat' && orders < 2) return false
      if (segment === 'new' && orders !== 1) return false
      if (segment === 'inactive30' && lastOrderAt && lastOrderAt > inactiveLimit) return false
      if (segment === 'highSpend' && spend < 100) return false
      if (segment === 'rewardPoints' && points <= 0) return false

      if (!keyword) return true

      return [customer.customer_name, customer.customer_phone]
        .some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  }, [customers, search, segment])

  const selectedCustomers = useMemo(() => {
    const selectedSet = new Set(selectedIds)

    return filteredCustomers.filter((customer) => selectedSet.has(customer.id))
  }, [filteredCustomers, selectedIds])

  const stats = useMemo(() => {
    const totalCustomers = customers.length
    const repeatCustomers = customers.filter(
      (customer) => Number(customer.total_orders || 0) >= 2,
    ).length
    const totalSpend = customers.reduce(
      (total, customer) => total + Number(customer.total_spend || 0),
      0,
    )
    const rewardCustomers = customers.filter(
      (customer) => Number(customer.reward_points || 0) > 0,
    ).length

    return {
      totalCustomers,
      repeatCustomers,
      totalSpend,
      rewardCustomers,
    }
  }, [customers])

  const toggleCustomer = (customerId) => {
    setSelectedIds((current) =>
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId],
    )
  }

  const selectAllFiltered = () => {
    setSelectedIds(filteredCustomers.map((customer) => customer.id))
  }

  const clearSelection = () => {
    setSelectedIds([])
  }

  const applyTemplate = (template) => {
    setMessage(template.text)
  }

  const applyDiscount = (discount) => {
    setCouponCode(discount?.code || '')

    if (discount?.code && !message.includes('{coupon}')) {
      setMessage(`${message.trim()}\n\nUse coupon {coupon}`)
    }
  }

  const applyCampaign = (campaign) => {
    const campaignMessage = [
      `Hi {name}, ${campaign.title || 'new offer'} is live at {restaurant}!`,
      campaign.subtitle || '',
      campaign.coupon_code ? 'Use coupon {coupon}.' : '',
      'Order here: {menu_link}',
    ]
      .filter(Boolean)
      .join('\n')

    setMessage(campaignMessage)
    if (campaign.coupon_code) setCouponCode(campaign.coupon_code)
  }

  const getRenderedMessage = (customer) => {
    const fallbackName = 'there'
    const name = customer?.customer_name?.trim() || fallbackName

    return String(message || '')
      .replaceAll('{name}', name)
      .replaceAll('{restaurant}', restaurant?.name || 'our restaurant')
      .replaceAll('{coupon}', couponCode || 'OFFER')
      .replaceAll('{menu_link}', menuLink)
      .replaceAll('{currency}', currency)
      .replaceAll('{points}', formatNumber(customer?.reward_points || 0))
  }

  const copyMessage = async (customer) => {
    try {
      await navigator.clipboard.writeText(getRenderedMessage(customer))
      setCopiedCustomerId(customer?.id || 'preview')
      window.setTimeout(() => setCopiedCustomerId(''), 1600)
      showToast({
        type: 'success',
        title: 'Message copied',
        message: 'You can paste it in WhatsApp or any social channel.',
      })
    } catch {
      showToast({
        type: 'warning',
        title: 'Copy failed',
        message: 'Please select and copy the message manually.',
      })
    }
  }

  const openWhatsApp = (customer) => {
    const phone = cleanPhone(customer?.customer_phone)

    if (!phone) {
      showToast({
        type: 'warning',
        title: 'Phone missing',
        message: 'This customer does not have a valid phone number.',
      })
      return
    }

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(getRenderedMessage(customer))}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  const exportSelectedCustomers = () => {
    const rows = selectedCustomers.length > 0 ? selectedCustomers : filteredCustomers

    if (rows.length === 0) return

    const csvRows = [
      ['Name', 'Phone', 'Orders', 'Spend', 'Reward Points', 'Last Order'],
      ...rows.map((customer) => [
        customer.customer_name || '',
        customer.customer_phone || '',
        customer.total_orders || 0,
        Number(customer.total_spend || 0).toFixed(2),
        Number(customer.reward_points || 0).toFixed(2),
        customer.last_order_at || '',
      ]),
    ]

    const csv = csvRows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `spizy-marketing-customers-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const firstPreviewCustomer = selectedCustomers[0] || filteredCustomers[0] || null
  const previewMessage = getRenderedMessage(firstPreviewCustomer)

  return (
    <section className="marketing-screen">
      <div className="marketing-hero">
        <div>
          <p className="pricing-label">Growth</p>
          <h2>Marketing Broadcast</h2>
          <span>
            Prepare WhatsApp-friendly customer messages, coupon reminders and
            campaign broadcasts. Bulk WhatsApp API can be connected later.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadMarketingData}
          disabled={loading}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="marketing-stats-grid">
        <MarketingStat icon={<Users size={22} />} label="Customers" value={stats.totalCustomers} />
        <MarketingStat icon={<Sparkles size={22} />} label="Repeat" value={stats.repeatCustomers} />
        <MarketingStat
          icon={<Gift size={22} />}
          label="With points"
          value={stats.rewardCustomers}
        />
        <MarketingStat
          icon={<BadgePercent size={22} />}
          label="Total spend"
          value={`${currency} ${stats.totalSpend.toFixed(2)}`}
        />
      </div>

      <div className="marketing-layout-grid">
        <div className="marketing-left-panel">
          <div className="marketing-card">
            <div className="marketing-section-head">
              <div>
                <strong>Audience</strong>
                <span>Select who should receive this campaign.</span>
              </div>

              <button type="button" onClick={selectAllFiltered}>
                Select filtered
              </button>
            </div>

            <div className="marketing-segment-grid">
              {segmentOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={segment === option.value ? 'active' : ''}
                  onClick={() => {
                    setSegment(option.value)
                    setSelectedIds([])
                  }}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>

            <div className="marketing-search-row">
              <Search size={17} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer or phone..."
              />
            </div>

            <div className="marketing-selection-row">
              <span>
                {filteredCustomers.length} matched • {selectedCustomers.length} selected
              </span>
              <button type="button" onClick={clearSelection}>Clear</button>
            </div>

            <div className="marketing-customer-list">
              {loading ? (
                <div className="marketing-empty">Loading customers...</div>
              ) : filteredCustomers.length === 0 ? (
                <div className="marketing-empty">No customers found for this segment.</div>
              ) : (
                filteredCustomers.map((customer) => (
                  <label className="marketing-customer-row" key={customer.id}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(customer.id)}
                      onChange={() => toggleCustomer(customer.id)}
                    />

                    <div>
                      <strong>{customer.customer_name || 'Customer'}</strong>
                      <span>{customer.customer_phone || 'No phone'}</span>
                    </div>

                    <small>
                      {Number(customer.total_orders || 0)} orders • {currency}{' '}
                      {Number(customer.total_spend || 0).toFixed(2)}
                    </small>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="marketing-right-panel">
          <div className="marketing-card composer">
            <div className="marketing-section-head">
              <div>
                <strong>Message composer</strong>
                <span>Use variables: {'{name}'}, {'{restaurant}'}, {'{coupon}'}, {'{menu_link}'}, {'{points}'}</span>
              </div>
            </div>

            <div className="marketing-template-grid">
              {templateOptions.map((template) => (
                <button
                  type="button"
                  key={template.key}
                  onClick={() => applyTemplate(template)}
                >
                  <Megaphone size={16} />
                  {template.title}
                </button>
              ))}
            </div>

            <div className="marketing-field-grid">
              <label>
                Coupon code
                <input
                  type="text"
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                  placeholder="Optional coupon code"
                />
              </label>

              <label>
                Public menu link
                <input type="text" value={menuLink} readOnly />
              </label>
            </div>

            {(discounts.length > 0 || campaigns.length > 0) && (
              <div className="marketing-offer-pills">
                {discounts.slice(0, 5).map((discount) => (
                  <button
                    type="button"
                    key={discount.id}
                    onClick={() => applyDiscount(discount)}
                    className={discount.is_active ? '' : 'muted'}
                  >
                    <BadgePercent size={15} />
                    {discount.code}
                  </button>
                ))}

                {campaigns.slice(0, 4).map((campaign) => (
                  <button
                    type="button"
                    key={campaign.id}
                    onClick={() => applyCampaign(campaign)}
                    className={campaign.is_active ? 'campaign' : 'muted campaign'}
                  >
                    <Sparkles size={15} />
                    {campaign.title}
                  </button>
                ))}
              </div>
            )}

            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows="8"
              placeholder="Write broadcast message..."
            />

            <div className="marketing-preview-card">
              <div className="marketing-section-head small">
                <div>
                  <strong>Preview</strong>
                  <span>
                    {firstPreviewCustomer
                      ? firstPreviewCustomer.customer_name || firstPreviewCustomer.customer_phone
                      : 'No customer selected'}
                  </span>
                </div>

                <button type="button" onClick={() => copyMessage(firstPreviewCustomer)}>
                  {copiedCustomerId ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                  Copy
                </button>
              </div>

              <p>{previewMessage}</p>
            </div>

            <div className="marketing-actions-row">
              <button type="button" className="secondary-button" onClick={exportSelectedCustomers}>
                <Download size={18} />
                Export phones
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={() => openWhatsApp(firstPreviewCustomer)}
                disabled={!firstPreviewCustomer}
              >
                <MessageCircle size={18} />
                Open WhatsApp
              </button>
            </div>
          </div>

          <div className="marketing-card">
            <div className="marketing-section-head">
              <div>
                <strong>Send one by one</strong>
                <span>Safer manual sending until WhatsApp Business API is connected.</span>
              </div>
            </div>

            <div className="marketing-send-list">
              {(selectedCustomers.length > 0 ? selectedCustomers : filteredCustomers.slice(0, 8)).map(
                (customer) => (
                  <div className="marketing-send-row" key={customer.id}>
                    <div>
                      <strong>{customer.customer_name || 'Customer'}</strong>
                      <span>{customer.customer_phone}</span>
                    </div>

                    <button type="button" onClick={() => openWhatsApp(customer)}>
                      <Send size={15} />
                      Send
                      <ExternalLink size={13} />
                    </button>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function MarketingStat({ icon, label, value }) {
  return (
    <div className="marketing-stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function cleanPhone(value) {
  const phone = String(value || '').replace(/\D/g, '')

  if (!phone) return ''
  if (phone.startsWith('00')) return phone.slice(2)

  return phone
}

function formatNumber(value) {
  const numberValue = Number(value || 0)

  if (Number.isInteger(numberValue)) return String(numberValue)

  return numberValue.toFixed(2)
}

export default MarketingBroadcastManagement
