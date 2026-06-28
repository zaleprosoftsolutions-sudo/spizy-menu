import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileText,
  Landmark,
  ListChecks,
  MapPin,
  QrCode,
  RefreshCw,
  Save,
  Settings,
  Store,
  Users,
  Utensils,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './RestaurantOnboardingWizard.css'

const currencyOptions = ['AED', 'SAR', 'QAR', 'BHD', 'KWD', 'OMR', 'INR']

const recommendedFinanceAccounts = [
  {
    account_type: 'cash',
    account_name: 'Main Cash Drawer',
    note: 'Used for cash sales, COD collections and daily cash drawer closing.',
    required: true,
  },
  {
    account_type: 'card_machine',
    account_name: 'Card Machine Settlement',
    note: 'Used for card machine / POS terminal collections.',
    required: true,
  },
  {
    account_type: 'online_gateway',
    account_name: 'Online Gateway Clearing',
    note: 'Used for restaurant-owned gateway settlements such as Ziina, Stripe, PayPal, Razorpay, Cashfree, PhonePe or Network.',
    required: true,
  },
  {
    account_type: 'bank',
    account_name: 'Main Bank Account',
    note: 'Used for bank deposits, gateway settlement transfers and owner reconciliation.',
    required: false,
  },
]

const starterCategories = [
  { name: 'Starters', description: 'Popular starters and snacks' },
  { name: 'Main Course', description: 'Main dishes and meal items' },
  { name: 'Beverages', description: 'Drinks, tea, coffee and juices' },
]

function RestaurantOnboardingWizard({ restaurant, onOpenSection }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [setupAction, setSetupAction] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState([])
  const [data, setData] = useState({
    restaurant: null,
    tables: [],
    accounts: [],
    categories: [],
    items: [],
    staffs: [],
    deliveryZones: [],
  })
  const [form, setForm] = useState(() => buildInitialForm(restaurant))

  const currency = form.currency || restaurant?.currency || 'AED'

  const loadOnboardingData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)
    setErrors([])
    setMessage('')

    const [
      restaurantResult,
      tablesResult,
      accountsResult,
      categoriesResult,
      itemsResult,
      staffsResult,
      deliveryZonesResult,
    ] = await Promise.all([
      safeSupabaseQuery(
        supabase
          .from('restaurants')
          .select(
            `
              id,
              name,
              slug,
              phone,
              whatsapp_phone,
              address,
              currency,
              tax_rate,
              accepts_cash,
              accepts_card,
              accepts_cod,
              accepts_online,
              payment_gateway_settings,
              logo_url,
              public_cover_url,
              is_active
            `,
          )
          .eq('id', restaurant.id)
          .maybeSingle(),
        'Restaurant profile',
      ),
      safeSupabaseQuery(
        supabase
          .from('restaurant_tables')
          .select('id, table_name, table_number, qr_token, is_active')
          .eq('restaurant_id', restaurant.id)
          .order('table_number', { ascending: true }),
        'QR tables',
      ),
      safeSupabaseQuery(
        supabase
          .from('restaurant_finance_accounts')
          .select('id, account_name, account_type, currency, is_active')
          .eq('restaurant_id', restaurant.id)
          .eq('is_active', true),
        'Cash & Bank accounts',
      ),
      safeSupabaseQuery(
        supabase
          .from('menu_categories')
          .select('id, name, is_active, is_deleted')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false),
        'Menu categories',
      ),
      safeSupabaseQuery(
        supabase
          .from('menu_items')
          .select('id, name, is_available, is_deleted')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false),
        'Menu items',
      ),
      safeSupabaseQuery(
        supabase
          .from('restaurant_staffs')
          .select('id, staff_name, email, is_active, is_deleted')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false),
        'Staff accounts',
      ),
      safeSupabaseQuery(
        supabase
          .from('restaurant_delivery_zones')
          .select('id, zone_name, area_name, is_active, is_deleted')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false),
        'Delivery zones',
      ),
    ])

    const loadedRestaurant = restaurantResult.data || restaurant
    const nextErrors = [
      restaurantResult,
      tablesResult,
      accountsResult,
      categoriesResult,
      itemsResult,
      staffsResult,
      deliveryZonesResult,
    ]
      .filter((result) => result.error && !result.isMissingTable)
      .map((result) => `${result.label}: ${result.error.message || 'Unable to load'}`)

    setData({
      restaurant: loadedRestaurant,
      tables: Array.isArray(tablesResult.data) ? tablesResult.data : [],
      accounts: Array.isArray(accountsResult.data) ? accountsResult.data : [],
      categories: Array.isArray(categoriesResult.data) ? categoriesResult.data : [],
      items: Array.isArray(itemsResult.data) ? itemsResult.data : [],
      staffs: Array.isArray(staffsResult.data) ? staffsResult.data : [],
      deliveryZones: Array.isArray(deliveryZonesResult.data) ? deliveryZonesResult.data : [],
    })
    setForm(buildInitialForm(loadedRestaurant))
    setErrors(nextErrors)
    setLoading(false)
  }, [restaurant])

  useEffect(() => {
    loadOnboardingData()
  }, [loadOnboardingData])

  const checklist = useMemo(
    () => buildOnboardingChecklist({ data, form }),
    [data, form],
  )

  const progress = useMemo(() => {
    const completed = checklist.filter((item) => item.complete).length
    const total = checklist.length || 1

    return {
      completed,
      total,
      percentage: Math.round((completed / total) * 100),
    }
  }, [checklist])

  const onlineGatewayStatus = useMemo(
    () => getOnlineGatewayStatus(data.restaurant?.payment_gateway_settings),
    [data.restaurant?.payment_gateway_settings],
  )

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  const handleSaveEssentials = async (event) => {
    event.preventDefault()
    if (!restaurant?.id) return

    const name = form.name.trim()
    const slug = normalizeSlug(form.slug)

    if (!name || !slug) {
      setMessage('Restaurant name and public menu slug are required.')
      return
    }

    setSaving(true)
    setMessage('')

    const { error } = await supabase
      .from('restaurants')
      .update({
        name,
        slug,
        phone: form.phone.trim() || null,
        whatsapp_phone: form.whatsapp_phone.trim() || null,
        address: form.address.trim() || null,
        currency: form.currency || 'AED',
        tax_rate: Number(form.tax_rate || 0),
        accepts_cash: form.accepts_cash,
        accepts_card: form.accepts_card,
        accepts_cod: form.accepts_cod,
        accepts_online: form.accepts_online,
      })
      .eq('id', restaurant.id)

    setSaving(false)

    if (error) {
      setMessage(error.message || 'Unable to save onboarding essentials.')
      return
    }

    setMessage('Restaurant essentials saved successfully.')
    await loadOnboardingData()
  }

  const handleCreateFinanceAccounts = async () => {
    if (!restaurant?.id) return

    const existingTypes = new Set(
      data.accounts.map((account) => String(account.account_type || '').toLowerCase()),
    )
    const missingAccounts = recommendedFinanceAccounts.filter(
      (account) => account.required && !existingTypes.has(account.account_type),
    )

    if (missingAccounts.length === 0) {
      setMessage('Required finance accounts are already ready.')
      onOpenSection?.('cash-bank')
      return
    }

    setSetupAction('finance')
    setMessage('')

    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('restaurant_finance_accounts').insert(
      missingAccounts.map((account) => ({
        restaurant_id: restaurant.id,
        account_name: account.account_name,
        account_type: account.account_type,
        currency,
        opening_balance: 0,
        current_balance: 0,
        notes: `Auto-created from Spizy Onboarding Wizard. ${account.note}`,
        created_by: userData?.user?.id || null,
      })),
    )

    setSetupAction('')

    if (error) {
      setMessage(error.message || 'Unable to create recommended finance accounts.')
      return
    }

    setMessage(`${missingAccounts.length} recommended finance account${missingAccounts.length === 1 ? '' : 's'} created.`)
    await loadOnboardingData()
  }

  const handleCreateStarterTables = async () => {
    if (!restaurant?.id) return

    if (data.tables.length > 0) {
      setMessage('QR tables already exist. Open Tables & QR to add or print more.')
      onOpenSection?.('qr')
      return
    }

    setSetupAction('tables')
    setMessage('')

    const rows = Array.from({ length: 10 }).map((_, index) => {
      const tableNumber = index + 1

      return {
        restaurant_id: restaurant.id,
        table_name: `Table ${tableNumber}`,
        table_number: String(tableNumber),
        qr_token: createQrToken(restaurant.id, tableNumber),
        is_active: true,
      }
    })

    const { error } = await supabase.from('restaurant_tables').insert(rows)

    setSetupAction('')

    if (error) {
      setMessage(error.message || 'Unable to create starter QR tables.')
      return
    }

    setMessage('10 starter QR tables created successfully.')
    await loadOnboardingData()
  }

  const handleCreateStarterCategories = async () => {
    if (!restaurant?.id) return

    if (data.categories.length > 0) {
      setMessage('Menu categories already exist. Open Products / Items to continue menu setup.')
      onOpenSection?.('products')
      return
    }

    setSetupAction('menu')
    setMessage('')

    const { error } = await supabase.from('menu_categories').insert(
      starterCategories.map((category, index) => ({
        restaurant_id: restaurant.id,
        name: category.name,
        description: category.description,
        sort_order: index + 1,
        is_active: true,
        is_deleted: false,
      })),
    )

    setSetupAction('')

    if (error) {
      setMessage(error.message || 'Unable to create starter menu categories.')
      return
    }

    setMessage('Starter menu categories created successfully.')
    await loadOnboardingData()
  }

  return (
    <section className="restaurant-onboarding-shell">
      <div className="restaurant-onboarding-hero">
        <div>
          <p className="pricing-label">Restaurant Onboarding</p>
          <h1>Launch setup wizard</h1>
          <p>
            Prepare this restaurant for live orders: profile, currency, tax, payment methods,
            QR tables, finance accounts, menu basics and staff setup from one guided checklist.
          </p>
        </div>

        <div className="restaurant-onboarding-progress-card">
          <span>Setup progress</span>
          <strong>{progress.percentage}%</strong>
          <div className="restaurant-onboarding-progress-bar">
            <i style={{ width: `${progress.percentage}%` }} />
          </div>
          <small>{progress.completed} of {progress.total} setup steps ready</small>
        </div>
      </div>

      {message && (
        <div className={`restaurant-onboarding-message ${message.toLowerCase().includes('unable') || message.toLowerCase().includes('required') ? 'warning' : 'success'}`}>
          {message.toLowerCase().includes('unable') || message.toLowerCase().includes('required') ? (
            <AlertTriangle size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{message}</span>
        </div>
      )}

      {errors.length > 0 && (
        <div className="restaurant-onboarding-message warning">
          <AlertTriangle size={18} />
          <span>{errors.join(' • ')}</span>
        </div>
      )}

      {loading ? (
        <div className="restaurant-onboarding-loading">
          <RefreshCw size={20} />
          Loading onboarding checklist...
        </div>
      ) : (
        <>
          <div className="restaurant-onboarding-grid">
            <form className="restaurant-onboarding-card wide" onSubmit={handleSaveEssentials}>
              <div className="restaurant-onboarding-card-head">
                <div className="restaurant-onboarding-icon"><Store size={20} /></div>
                <div>
                  <p className="pricing-label">Step 1</p>
                  <h2>Restaurant essentials</h2>
                  <span>Name, QR menu slug, phone, address, currency, VAT and basic payment toggles.</span>
                </div>
              </div>

              <div className="restaurant-onboarding-form-grid">
                <label>
                  Restaurant name
                  <input
                    value={form.name}
                    onChange={(event) => updateForm('name', event.target.value)}
                    placeholder="Restaurant name"
                  />
                </label>

                <label>
                  Public menu slug
                  <input
                    value={form.slug}
                    onChange={(event) => updateForm('slug', normalizeSlug(event.target.value))}
                    placeholder="restaurant-name"
                  />
                </label>

                <label>
                  Phone
                  <input
                    value={form.phone}
                    onChange={(event) => updateForm('phone', event.target.value)}
                    placeholder="Restaurant phone"
                  />
                </label>

                <label>
                  WhatsApp
                  <input
                    value={form.whatsapp_phone}
                    onChange={(event) => updateForm('whatsapp_phone', event.target.value)}
                    placeholder="WhatsApp number"
                  />
                </label>

                <label className="span-2">
                  Address
                  <input
                    value={form.address}
                    onChange={(event) => updateForm('address', event.target.value)}
                    placeholder="Restaurant address"
                  />
                </label>

                <label>
                  Currency
                  <select
                    value={form.currency}
                    onChange={(event) => updateForm('currency', event.target.value)}
                  >
                    {currencyOptions.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Tax / VAT rate %
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.tax_rate}
                    onChange={(event) => updateForm('tax_rate', event.target.value)}
                    placeholder="5"
                  />
                </label>
              </div>

              <div className="restaurant-onboarding-toggle-grid">
                <TogglePill label="Cash" checked={form.accepts_cash} onChange={() => updateForm('accepts_cash', !form.accepts_cash)} />
                <TogglePill label="Card" checked={form.accepts_card} onChange={() => updateForm('accepts_card', !form.accepts_card)} />
                <TogglePill label="COD" checked={form.accepts_cod} onChange={() => updateForm('accepts_cod', !form.accepts_cod)} />
                <TogglePill label="Online gateways" checked={form.accepts_online} onChange={() => updateForm('accepts_online', !form.accepts_online)} />
              </div>

              <div className="restaurant-onboarding-card-actions">
                <button type="submit" className="restaurant-onboarding-primary" disabled={saving}>
                  {saving ? <RefreshCw size={17} /> : <Save size={17} />}
                  {saving ? 'Saving...' : 'Save essentials'}
                </button>
                <button type="button" className="restaurant-onboarding-secondary" onClick={() => onOpenSection?.('settings')}>
                  Open full settings
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>

            <section className="restaurant-onboarding-card">
              <div className="restaurant-onboarding-card-head">
                <div className="restaurant-onboarding-icon"><ListChecks size={20} /></div>
                <div>
                  <p className="pricing-label">Checklist</p>
                  <h2>Launch readiness</h2>
                  <span>Use this list before sharing the public QR menu.</span>
                </div>
              </div>

              <div className="restaurant-onboarding-checklist">
                {checklist.map((item) => (
                  <ChecklistRow key={item.key} item={item} onOpenSection={onOpenSection} />
                ))}
              </div>
            </section>
          </div>

          <div className="restaurant-onboarding-grid compact">
            <SetupActionCard
              icon={<Landmark size={21} />}
              title="Default finance accounts"
              text="Create cash drawer, card machine and online gateway clearing accounts for Cash & Bank."
              status={`${data.accounts.length} account${data.accounts.length === 1 ? '' : 's'}`}
              buttonText={setupAction === 'finance' ? 'Creating...' : 'Create missing accounts'}
              disabled={setupAction === 'finance'}
              onClick={handleCreateFinanceAccounts}
            />

            <SetupActionCard
              icon={<QrCode size={21} />}
              title="Starter QR tables"
              text="Create 10 starter dining tables with unique QR tokens for table ordering."
              status={`${data.tables.length} table${data.tables.length === 1 ? '' : 's'}`}
              buttonText={setupAction === 'tables' ? 'Creating...' : 'Create 10 tables'}
              disabled={setupAction === 'tables'}
              onClick={handleCreateStarterTables}
            />

            <SetupActionCard
              icon={<Utensils size={21} />}
              title="Starter menu categories"
              text="Add Starters, Main Course and Beverages so menu setup can begin quickly."
              status={`${data.categories.length} categor${data.categories.length === 1 ? 'y' : 'ies'}`}
              buttonText={setupAction === 'menu' ? 'Creating...' : 'Create categories'}
              disabled={setupAction === 'menu'}
              onClick={handleCreateStarterCategories}
            />
          </div>

          <section className="restaurant-onboarding-card wide">
            <div className="restaurant-onboarding-card-head">
              <div className="restaurant-onboarding-icon"><ClipboardCheck size={20} /></div>
              <div>
                <p className="pricing-label">Production launch path</p>
                <h2>Next setup modules</h2>
                <span>Jump to the detailed module when each foundation item is ready.</span>
              </div>
            </div>

            <div className="restaurant-onboarding-module-grid">
              <ModuleJump icon={<QrCode size={18} />} title="Tables & QR" text="Print table QR codes" onClick={() => onOpenSection?.('qr')} />
              <ModuleJump icon={<Utensils size={18} />} title="Products / Items" text="Add real menu items" onClick={() => onOpenSection?.('products')} />
              <ModuleJump icon={<CreditCard size={18} />} title="Payment gateways" text={onlineGatewayStatus.label} onClick={() => onOpenSection?.('settings')} />
              <ModuleJump icon={<Landmark size={18} />} title="Cash & Bank" text="Opening cash and bank balances" onClick={() => onOpenSection?.('cash-bank')} />
              <ModuleJump icon={<Users size={18} />} title="Staff" text="Invite cashier, waiter and manager" onClick={() => onOpenSection?.('staff')} />
              <ModuleJump icon={<MapPin size={18} />} title="Delivery Zones" text="Delivery fees and areas" onClick={() => onOpenSection?.('delivery-zones')} />
              <ModuleJump icon={<FileText size={18} />} title="Tax / VAT" text="Management VAT now, statutory upgrade later" onClick={() => onOpenSection?.('cash-bank')} />
              <ModuleJump icon={<Banknote size={18} />} title="Day Closing" text="Close the first live day" onClick={() => onOpenSection?.('day-closing')} />
            </div>
          </section>
        </>
      )}
    </section>
  )
}

function TogglePill({ label, checked, onChange }) {
  return (
    <button
      type="button"
      className={`restaurant-onboarding-toggle ${checked ? 'active' : ''}`}
      onClick={onChange}
    >
      <span>{label}</span>
      <strong>{checked ? 'On' : 'Off'}</strong>
    </button>
  )
}

function ChecklistRow({ item, onOpenSection }) {
  return (
    <button
      type="button"
      className={`restaurant-onboarding-check-row ${item.complete ? 'complete' : ''}`}
      onClick={() => item.section && onOpenSection?.(item.section)}
    >
      <span className="restaurant-onboarding-check-icon">
        {item.complete ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      </span>
      <span>
        <strong>{item.title}</strong>
        <small>{item.note}</small>
      </span>
      {item.section && <ArrowRight size={15} />}
    </button>
  )
}

function SetupActionCard({ icon, title, text, status, buttonText, disabled, onClick }) {
  return (
    <article className="restaurant-onboarding-action-card">
      <div className="restaurant-onboarding-action-icon">{icon}</div>
      <span>{status}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      <button type="button" onClick={onClick} disabled={disabled}>
        {disabled && <RefreshCw size={16} />}
        {buttonText}
      </button>
    </article>
  )
}

function ModuleJump({ icon, title, text, onClick }) {
  return (
    <button type="button" className="restaurant-onboarding-module-jump" onClick={onClick}>
      <span>{icon}</span>
      <strong>{title}</strong>
      <small>{text}</small>
      <ArrowRight size={15} />
    </button>
  )
}

function buildInitialForm(restaurant) {
  return {
    name: restaurant?.name || '',
    slug: restaurant?.slug || '',
    phone: restaurant?.phone || '',
    whatsapp_phone: restaurant?.whatsapp_phone || '',
    address: restaurant?.address || '',
    currency: restaurant?.currency || 'AED',
    tax_rate: String(restaurant?.tax_rate ?? 5),
    accepts_cash: restaurant?.accepts_cash !== false,
    accepts_card: restaurant?.accepts_card !== false,
    accepts_cod: restaurant?.accepts_cod !== false,
    accepts_online: restaurant?.accepts_online === true,
  }
}

function buildOnboardingChecklist({ data, form }) {
  const profileComplete = Boolean(
    form.name && form.slug && form.phone && form.address && form.currency,
  )
  const financeTypes = new Set(
    data.accounts.map((account) => String(account.account_type || '').toLowerCase()),
  )
  const hasRequiredFinance = ['cash', 'card_machine', 'online_gateway'].every((type) =>
    financeTypes.has(type),
  )
  const hasPaymentMode = Boolean(
    form.accepts_cash || form.accepts_card || form.accepts_cod || form.accepts_online,
  )
  const onlineGatewayStatus = getOnlineGatewayStatus(data.restaurant?.payment_gateway_settings)

  return [
    {
      key: 'profile',
      title: 'Restaurant profile',
      note: profileComplete ? 'Name, slug, phone, address and currency are ready.' : 'Complete name, slug, phone, address and currency.',
      complete: profileComplete,
      section: 'settings',
    },
    {
      key: 'tax',
      title: 'Tax / VAT base rate',
      note: Number(form.tax_rate || 0) > 0 ? `${form.tax_rate}% rate configured.` : 'Set the VAT/tax rate used in menu calculations.',
      complete: Number(form.tax_rate || 0) >= 0 && form.tax_rate !== '',
      section: 'settings',
    },
    {
      key: 'payments',
      title: 'Payment methods',
      note: hasPaymentMode ? `Basic methods ready. ${onlineGatewayStatus.label}` : 'Enable at least one customer payment method.',
      complete: hasPaymentMode,
      section: 'settings',
    },
    {
      key: 'finance',
      title: 'Default finance accounts',
      note: hasRequiredFinance ? 'Cash, card and online gateway accounts are ready.' : 'Create cash drawer, card machine and online gateway accounts.',
      complete: hasRequiredFinance,
      section: 'cash-bank',
    },
    {
      key: 'qr',
      title: 'QR table setup',
      note: data.tables.length > 0 ? `${data.tables.length} table QR record${data.tables.length === 1 ? '' : 's'} found.` : 'Create tables and QR tokens for dine-in ordering.',
      complete: data.tables.length > 0,
      section: 'qr',
    },
    {
      key: 'menu',
      title: 'Menu foundation',
      note: data.items.length > 0 ? `${data.items.length} menu item${data.items.length === 1 ? '' : 's'} found.` : `${data.categories.length} categories, ${data.items.length} items. Add real products before launch.`,
      complete: data.categories.length > 0 && data.items.length > 0,
      section: 'products',
    },
    {
      key: 'staff',
      title: 'Staff invite',
      note: data.staffs.length > 0 ? `${data.staffs.length} staff profile${data.staffs.length === 1 ? '' : 's'} found.` : 'Add cashier, waiter or manager accounts when needed.',
      complete: data.staffs.length > 0,
      section: 'staff',
    },
    {
      key: 'delivery',
      title: 'Delivery setup',
      note: data.deliveryZones.length > 0 ? `${data.deliveryZones.length} delivery zone${data.deliveryZones.length === 1 ? '' : 's'} found.` : 'Add zones only if this restaurant accepts delivery.',
      complete: data.deliveryZones.length > 0 || form.accepts_cod === false,
      section: 'delivery-zones',
    },
  ]
}

function getOnlineGatewayStatus(settings) {
  if (!settings || typeof settings !== 'object') {
    return { connected: false, label: 'Online gateway not configured' }
  }

  const gatewayEntries = Object.entries(settings).filter(
    ([key, value]) => key !== 'cod' && value && typeof value === 'object',
  )
  const enabledGateways = gatewayEntries.filter(([, value]) => value.enabled)
  const connectedGateways = enabledGateways.filter(([, value]) => {
    const connectionStatus = String(value.connection_status || '').toLowerCase()
    const credentialStatus = String(value.credential_status || '').toLowerCase()

    return ['connected', 'verified', 'ready'].includes(connectionStatus) || ['saved', 'ready', 'verified'].includes(credentialStatus)
  })

  if (connectedGateways.length > 0) {
    return {
      connected: true,
      label: `${connectedGateways.length} restaurant-owned gateway${connectedGateways.length === 1 ? '' : 's'} connected`,
    }
  }

  if (enabledGateways.length > 0) {
    return {
      connected: false,
      label: `${enabledGateways.length} gateway${enabledGateways.length === 1 ? '' : 's'} enabled, credentials pending`,
    }
  }

  return { connected: false, label: 'Online gateway not configured' }
}

async function safeSupabaseQuery(query, label) {
  try {
    const result = await query
    const error = result?.error || null

    return {
      label,
      data: result?.data || null,
      error,
      isMissingTable: error?.code === '42P01',
    }
  } catch (error) {
    return {
      label,
      data: null,
      error,
      isMissingTable: error?.code === '42P01',
    }
  }
}

function normalizeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function createQrToken(restaurantId, tableNumber) {
  const randomPart =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)

  return `tbl-${String(restaurantId).slice(0, 8)}-${tableNumber}-${randomPart}`
}

export default RestaurantOnboardingWizard
