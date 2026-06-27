import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  Edit3,
  ExternalLink,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  Save,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './BranchesManagement.css'

const currencyOptions = [
  { value: 'AED', label: 'AED - UAE Dirham' },
  { value: 'SAR', label: 'SAR - Saudi Riyal' },
  { value: 'QAR', label: 'QAR - Qatari Riyal' },
  { value: 'BHD', label: 'BHD - Bahraini Dinar' },
  { value: 'KWD', label: 'KWD - Kuwaiti Dinar' },
  { value: 'OMR', label: 'OMR - Omani Rial' },
  { value: 'INR', label: 'INR - Indian Rupee' },
]

const emptyForm = {
  branch_name: '',
  branch_code: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  city: '',
  country: 'United Arab Emirates',
  currency: 'AED',
  latitude: '',
  longitude: '',
  google_maps_url: '',
  delivery_fee: '',
  minimum_order: '',
  packaging_fee: '',
  tax_percentage: '',
  dine_in_enabled: true,
  takeaway_enabled: true,
  delivery_enabled: true,
  accepts_orders: true,
  is_default: false,
  is_active: true,
  notes: '',
}

function BranchesManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingBranch, setEditingBranch] = useState(null)
  const [form, setForm] = useState(() => getDefaultFormFromRestaurant(restaurant))

  const currency = restaurant?.currency || 'AED'

  const loadBranches = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data, error } = await supabase
      .from('restaurant_branches')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('is_default', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    setLoading(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Branches loading failed',
        message: error.message,
      })
      return
    }

    setBranches(data || [])
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadBranches()
  }, [loadBranches])

  const summary = useMemo(() => {
    const activeBranches = branches.filter((branch) => branch.is_active)
    const orderBranches = branches.filter(
      (branch) => branch.is_active && branch.accepts_orders,
    )
    const deliveryBranches = branches.filter(
      (branch) => branch.is_active && branch.delivery_enabled,
    )

    return {
      total: branches.length,
      active: activeBranches.length,
      orderEnabled: orderBranches.length,
      deliveryEnabled: deliveryBranches.length,
    }
  }, [branches])

  const filteredBranches = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return branches.filter((branch) => {
      if (statusFilter === 'active' && !branch.is_active) return false
      if (statusFilter === 'inactive' && branch.is_active) return false
      if (statusFilter === 'orders' && !branch.accepts_orders) return false
      if (statusFilter === 'default' && !branch.is_default) return false

      if (!keyword) return true

      return [
        branch.branch_name,
        branch.branch_code,
        branch.phone,
        branch.whatsapp,
        branch.email,
        branch.address,
        branch.city,
        branch.country,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [branches, search, statusFilter])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const openCreateForm = () => {
    setEditingBranch(null)
    setForm({
      ...getDefaultFormFromRestaurant(restaurant),
      is_default: branches.length === 0,
    })
    setShowForm(true)
  }

  const openEditForm = (branch) => {
    setEditingBranch(branch)
    setForm({
      branch_name: branch.branch_name || '',
      branch_code: branch.branch_code || '',
      phone: branch.phone || '',
      whatsapp: branch.whatsapp || '',
      email: branch.email || '',
      address: branch.address || '',
      city: branch.city || '',
      country: branch.country || 'United Arab Emirates',
      currency: branch.currency || restaurant?.currency || 'AED',
      latitude: branch.latitude ?? '',
      longitude: branch.longitude ?? '',
      google_maps_url: branch.google_maps_url || '',
      delivery_fee: branch.delivery_fee ?? '',
      minimum_order: branch.minimum_order ?? '',
      packaging_fee: branch.packaging_fee ?? '',
      tax_percentage: branch.tax_percentage ?? '',
      dine_in_enabled: branch.dine_in_enabled !== false,
      takeaway_enabled: branch.takeaway_enabled !== false,
      delivery_enabled: branch.delivery_enabled !== false,
      accepts_orders: branch.accepts_orders !== false,
      is_default: Boolean(branch.is_default),
      is_active: branch.is_active !== false,
      notes: branch.notes || '',
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingBranch(null)
    setForm(getDefaultFormFromRestaurant(restaurant))
  }

  const handleSaveBranch = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const branchName = form.branch_name.trim()

    if (!branchName) {
      showToast({
        type: 'warning',
        title: 'Branch name required',
        message: 'Enter a branch / location name before saving.',
      })
      return
    }

    setSaving(true)

    const payload = buildBranchPayload(form, restaurant.id)
    const { data: userData } = await supabase.auth.getUser()

    let response

    if (editingBranch?.id) {
      response = await supabase
        .from('restaurant_branches')
        .update({
          ...payload,
          updated_by: userData?.user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingBranch.id)
        .eq('restaurant_id', restaurant.id)
        .select('*')
        .single()
    } else {
      response = await supabase
        .from('restaurant_branches')
        .insert({
          ...payload,
          created_by: userData?.user?.id || null,
          updated_by: userData?.user?.id || null,
        })
        .select('*')
        .single()
    }

    setSaving(false)

    if (response.error) {
      showToast({
        type: 'error',
        title: 'Branch save failed',
        message: response.error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: editingBranch?.id ? 'Branch updated' : 'Branch created',
      message: `${response.data.branch_name} saved successfully.`,
    })

    closeForm()
    await loadBranches()
  }

  const handleSetDefault = async (branch) => {
    if (!branch?.id || branch.is_default) return

    const confirmed = await confirmAction({
      title: 'Set default branch?',
      message: `${branch.branch_name} will become the main/default branch for this restaurant.`,
      confirmText: 'Set Default',
      cancelText: 'Cancel',
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('restaurant_branches')
      .update({ is_default: true })
      .eq('id', branch.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Default update failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Default branch updated',
      message: `${branch.branch_name} is now the default branch.`,
    })

    await loadBranches()
  }

  const handleToggleBranch = async (branch, key) => {
    const nextValue = !branch[key]

    const { error } = await supabase
      .from('restaurant_branches')
      .update({ [key]: nextValue, updated_at: new Date().toISOString() })
      .eq('id', branch.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Branch update failed',
        message: error.message,
      })
      return
    }

    setBranches((current) =>
      current.map((item) =>
        item.id === branch.id ? { ...item, [key]: nextValue } : item,
      ),
    )
  }

  const handleDeleteBranch = async (branch) => {
    if (!branch?.id) return

    const confirmed = await confirmAction({
      title: 'Delete branch?',
      message: `${branch.branch_name} will be hidden from branch management.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('restaurant_branches')
      .update({
        is_deleted: true,
        is_active: false,
        is_default: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', branch.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Branch delete failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Branch deleted',
      message: `${branch.branch_name} was removed.`,
    })

    await loadBranches()
  }

  if (!restaurant?.id) {
    return (
      <section className="branches-section">
        <div className="branches-empty-state">
          Restaurant profile not found. Please complete restaurant setup first.
        </div>
      </section>
    )
  }

  return (
    <section className="branches-section">
      <div className="branches-hero">
        <div>
          <p className="pricing-label">Branches / Locations</p>
          <h2>Manage restaurant branches</h2>
          <span>
            Create multiple locations, set default branch, manage contact,
            delivery, currency and map details.
          </span>
        </div>

        <div className="branches-hero-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={loadBranches}
            disabled={loading}
          >
            <RefreshCw size={18} />
            Refresh
          </button>

          <button type="button" className="primary-button" onClick={openCreateForm}>
            <Plus size={18} />
            Add Branch
          </button>
        </div>
      </div>

      <div className="branches-summary-grid">
        <SummaryCard label="Total branches" value={summary.total} />
        <SummaryCard label="Active branches" value={summary.active} tone="green" />
        <SummaryCard label="Accepting orders" value={summary.orderEnabled} tone="orange" />
        <SummaryCard label="Delivery enabled" value={summary.deliveryEnabled} tone="blue" />
      </div>

      <div className="branches-toolbar">
        <div className="branches-search-box">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search branch, city, phone, address..."
          />
        </div>

        <div className="branches-filter-chips">
          {[
            ['all', 'All'],
            ['active', 'Active'],
            ['inactive', 'Inactive'],
            ['orders', 'Orders on'],
            ['default', 'Default'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={statusFilter === value ? 'active' : ''}
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <BranchForm
          form={form}
          currency={currency}
          editingBranch={editingBranch}
          saving={saving}
          onUpdateForm={updateForm}
          onClose={closeForm}
          onSubmit={handleSaveBranch}
        />
      )}

      {loading ? (
        <div className="branches-empty-state">Loading branches...</div>
      ) : filteredBranches.length === 0 ? (
        <div className="branches-empty-state">
          <Building2 size={34} />
          <strong>No branches found</strong>
          <span>Add your first branch or adjust the search/filter.</span>
        </div>
      ) : (
        <div className="branches-grid">
          {filteredBranches.map((branch) => (
            <BranchCard
              branch={branch}
              currency={currency}
              key={branch.id}
              onEdit={openEditForm}
              onDelete={handleDeleteBranch}
              onToggle={handleToggleBranch}
              onSetDefault={handleSetDefault}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function SummaryCard({ label, value, tone = '' }) {
  return (
    <article className={`branches-summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function BranchForm({
  form,
  currency,
  editingBranch,
  saving,
  onUpdateForm,
  onClose,
  onSubmit,
}) {
  const mapUrl = buildMapUrl(form)

  return (
    <form className="branches-form-card" onSubmit={onSubmit}>
      <div className="branches-form-head">
        <div>
          <p className="pricing-label">
            {editingBranch?.id ? 'Edit Branch' : 'New Branch'}
          </p>
          <h3>{editingBranch?.id ? 'Update branch details' : 'Add branch details'}</h3>
        </div>

        <button type="button" className="tiny-button danger" onClick={onClose}>
          <X size={15} />
          Close
        </button>
      </div>

      <div className="branches-form-grid">
        <label>
          Branch name *
          <input
            type="text"
            value={form.branch_name}
            onChange={(event) => onUpdateForm('branch_name', event.target.value)}
            placeholder="Example: Kubra Cafe - Deira"
          />
        </label>

        <label>
          Branch code
          <input
            type="text"
            value={form.branch_code}
            onChange={(event) =>
              onUpdateForm('branch_code', event.target.value.toUpperCase())
            }
            placeholder="DXB01"
          />
        </label>

        <label>
          Phone
          <input
            type="tel"
            value={form.phone}
            onChange={(event) => onUpdateForm('phone', event.target.value)}
            placeholder="+971..."
          />
        </label>

        <label>
          WhatsApp
          <input
            type="tel"
            value={form.whatsapp}
            onChange={(event) => onUpdateForm('whatsapp', event.target.value)}
            placeholder="+971..."
          />
        </label>

        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) => onUpdateForm('email', event.target.value)}
            placeholder="branch@example.com"
          />
        </label>

        <label>
          Currency
          <select
            value={form.currency || currency || 'AED'}
            onChange={(event) => onUpdateForm('currency', event.target.value)}
          >
            {currencyOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          City
          <input
            type="text"
            value={form.city}
            onChange={(event) => onUpdateForm('city', event.target.value)}
            placeholder="Dubai"
          />
        </label>

        <label>
          Country
          <input
            type="text"
            value={form.country}
            onChange={(event) => onUpdateForm('country', event.target.value)}
            placeholder="United Arab Emirates"
          />
        </label>

        <label className="wide">
          Full address
          <textarea
            value={form.address}
            onChange={(event) => onUpdateForm('address', event.target.value)}
            placeholder="Building, street, area, city"
            rows="3"
          />
        </label>

        <label>
          Latitude
          <input
            type="number"
            step="0.000001"
            value={form.latitude}
            onChange={(event) => onUpdateForm('latitude', event.target.value)}
            placeholder="25.204849"
          />
        </label>

        <label>
          Longitude
          <input
            type="number"
            step="0.000001"
            value={form.longitude}
            onChange={(event) => onUpdateForm('longitude', event.target.value)}
            placeholder="55.270783"
          />
        </label>

        <label className="wide">
          Google Maps URL
          <input
            type="url"
            value={form.google_maps_url}
            onChange={(event) => onUpdateForm('google_maps_url', event.target.value)}
            placeholder="https://maps.google.com/..."
          />
        </label>

        <label>
          Minimum order
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.minimum_order}
            onChange={(event) => onUpdateForm('minimum_order', event.target.value)}
            placeholder="0.00"
          />
        </label>

        <label>
          Delivery fee
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.delivery_fee}
            onChange={(event) => onUpdateForm('delivery_fee', event.target.value)}
            placeholder="0.00"
          />
        </label>

        <label>
          Packaging / extra fee
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.packaging_fee}
            onChange={(event) => onUpdateForm('packaging_fee', event.target.value)}
            placeholder="0.00"
          />
        </label>

        <label>
          Tax %
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.tax_percentage}
            onChange={(event) => onUpdateForm('tax_percentage', event.target.value)}
            placeholder="5"
          />
        </label>
      </div>

      <div className="branches-toggle-grid">
        <ToggleTile
          label="Accept orders"
          text="Turn off to keep this branch view-only."
          checked={form.accepts_orders}
          onChange={() => onUpdateForm('accepts_orders', !form.accepts_orders)}
        />
        <ToggleTile
          label="Dine-in"
          text="Allow dine-in / QR table orders."
          checked={form.dine_in_enabled}
          onChange={() => onUpdateForm('dine_in_enabled', !form.dine_in_enabled)}
        />
        <ToggleTile
          label="Takeaway"
          text="Allow takeaway orders."
          checked={form.takeaway_enabled}
          onChange={() => onUpdateForm('takeaway_enabled', !form.takeaway_enabled)}
        />
        <ToggleTile
          label="Delivery"
          text="Allow branch delivery orders."
          checked={form.delivery_enabled}
          onChange={() => onUpdateForm('delivery_enabled', !form.delivery_enabled)}
        />
        <ToggleTile
          label="Default branch"
          text="Use this branch as main location."
          checked={form.is_default}
          onChange={() => onUpdateForm('is_default', !form.is_default)}
        />
        <ToggleTile
          label="Active"
          text="Show and use this branch."
          checked={form.is_active}
          onChange={() => onUpdateForm('is_active', !form.is_active)}
        />
      </div>

      <label className="branches-notes-label">
        Internal notes
        <textarea
          value={form.notes}
          onChange={(event) => onUpdateForm('notes', event.target.value)}
          placeholder="Manager name, branch instructions, delivery notes..."
          rows="3"
        />
      </label>

      {mapUrl && (
        <a
          className="branches-map-preview"
          href={mapUrl}
          target="_blank"
          rel="noreferrer"
        >
          <Navigation size={18} />
          Preview branch direction
          <ExternalLink size={15} />
        </a>
      )}

      <div className="branches-form-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          Cancel
        </button>

        <button type="submit" className="primary-button" disabled={saving}>
          <Save size={18} />
          {saving ? 'Saving...' : editingBranch?.id ? 'Update Branch' : 'Save Branch'}
        </button>
      </div>
    </form>
  )
}

function ToggleTile({ label, text, checked, onChange }) {
  return (
    <button
      type="button"
      className={`branches-toggle-tile ${checked ? 'active' : ''}`}
      onClick={onChange}
    >
      <span>
        <strong>{label}</strong>
        <small>{text}</small>
      </span>
      <i>{checked ? 'ON' : 'OFF'}</i>
    </button>
  )
}

function BranchCard({ branch, currency, onEdit, onDelete, onToggle, onSetDefault }) {
  const mapUrl = buildMapUrl(branch)
  const branchCurrency = branch.currency || currency || 'AED'

  return (
    <article className={`branches-card ${branch.is_active ? '' : 'inactive'}`}>
      <div className="branches-card-head">
        <div className="branches-card-icon">
          <Building2 size={23} />
        </div>

        <div>
          <div className="branches-title-row">
            <h3>{branch.branch_name}</h3>
            {branch.is_default && (
              <span className="branches-default-pill">
                <Star size={13} />
                Default
              </span>
            )}
          </div>
          <p>
            {branch.branch_code || 'No branch code'} • {branchCurrency}
          </p>
        </div>
      </div>

      <div className="branches-card-address">
        <MapPin size={17} />
        <span>{branch.address || branch.city || 'Address not added'}</span>
      </div>

      <div className="branches-info-grid">
        <InfoChip label="Phone" value={branch.phone || 'Not set'} />
        <InfoChip label="WhatsApp" value={branch.whatsapp || 'Not set'} />
        <InfoChip label="Min order" value={`${branchCurrency} ${Number(branch.minimum_order || 0).toFixed(2)}`} />
        <InfoChip label="Delivery" value={`${branchCurrency} ${Number(branch.delivery_fee || 0).toFixed(2)}`} />
        <InfoChip label="Packaging" value={`${branchCurrency} ${Number(branch.packaging_fee || 0).toFixed(2)}`} />
        <InfoChip label="Tax" value={`${Number(branch.tax_percentage || 0).toFixed(2)}%`} />
      </div>

      <div className="branches-service-row">
        <StatusPill label="Orders" active={branch.accepts_orders} />
        <StatusPill label="Dine-in" active={branch.dine_in_enabled} />
        <StatusPill label="Takeaway" active={branch.takeaway_enabled} />
        <StatusPill label="Delivery" active={branch.delivery_enabled} />
        <StatusPill label="Active" active={branch.is_active} />
      </div>

      <div className="branches-card-actions">
        {mapUrl && (
          <a href={mapUrl} target="_blank" rel="noreferrer">
            <Navigation size={15} />
            Directions
          </a>
        )}

        <button type="button" onClick={() => onToggle(branch, 'accepts_orders')}>
          {branch.accepts_orders ? 'Stop Orders' : 'Accept Orders'}
        </button>

        <button type="button" onClick={() => onToggle(branch, 'is_active')}>
          {branch.is_active ? 'Deactivate' : 'Activate'}
        </button>

        {!branch.is_default && (
          <button type="button" onClick={() => onSetDefault(branch)}>
            <CheckCircle2 size={15} />
            Set Default
          </button>
        )}

        <button type="button" onClick={() => onEdit(branch)}>
          <Edit3 size={15} />
          Edit
        </button>

        <button type="button" className="danger" onClick={() => onDelete(branch)}>
          <Trash2 size={15} />
          Delete
        </button>
      </div>
    </article>
  )
}

function InfoChip({ label, value }) {
  return (
    <div className="branches-info-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StatusPill({ label, active }) {
  return (
    <span className={`branches-status-pill ${active ? 'active' : ''}`}>
      {label}: {active ? 'On' : 'Off'}
    </span>
  )
}

function getDefaultFormFromRestaurant(restaurant) {
  return {
    ...emptyForm,
    branch_name: restaurant?.name ? `${restaurant.name} - Main Branch` : '',
    phone: restaurant?.phone || '',
    whatsapp: restaurant?.whatsapp || restaurant?.phone || '',
    address: restaurant?.address || '',
    currency: restaurant?.currency || 'AED',
    latitude: restaurant?.latitude ?? '',
    longitude: restaurant?.longitude ?? '',
    google_maps_url: restaurant?.google_maps_url || '',
    delivery_fee: restaurant?.delivery_fee ?? '',
    minimum_order: restaurant?.minimum_order ?? '',
    packaging_fee: restaurant?.packaging_fee ?? '',
    tax_percentage: restaurant?.tax_percentage ?? '',
    is_default: false,
  }
}

function buildBranchPayload(form, restaurantId) {
  return {
    restaurant_id: restaurantId,
    branch_name: form.branch_name.trim(),
    branch_code: form.branch_code.trim() || null,
    phone: form.phone.trim() || null,
    whatsapp: form.whatsapp.trim() || null,
    email: form.email.trim() || null,
    address: form.address.trim() || null,
    city: form.city.trim() || null,
    country: form.country.trim() || null,
    currency: form.currency || 'AED',
    latitude: toNullableNumber(form.latitude),
    longitude: toNullableNumber(form.longitude),
    google_maps_url: normalizeUrl(form.google_maps_url),
    delivery_fee: toSafeAmount(form.delivery_fee),
    minimum_order: toSafeAmount(form.minimum_order),
    packaging_fee: toSafeAmount(form.packaging_fee),
    tax_percentage: toSafeAmount(form.tax_percentage),
    dine_in_enabled: Boolean(form.dine_in_enabled),
    takeaway_enabled: Boolean(form.takeaway_enabled),
    delivery_enabled: Boolean(form.delivery_enabled),
    accepts_orders: Boolean(form.accepts_orders),
    is_default: Boolean(form.is_default),
    is_active: Boolean(form.is_active),
    notes: form.notes.trim() || null,
  }
}

function toNullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function toSafeAmount(value) {
  if (value === '' || value === null || value === undefined) return 0
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0
}

function normalizeUrl(value) {
  const trimmedValue = String(value || '').trim()

  if (!trimmedValue) return null

  if (/^https?:\/\//i.test(trimmedValue)) return trimmedValue

  return `https://${trimmedValue}`
}

function buildMapUrl(source) {
  if (!source) return ''

  if (source.google_maps_url) return normalizeUrl(source.google_maps_url)

  if (source.latitude !== null && source.latitude !== undefined && source.longitude !== null && source.longitude !== undefined) {
    return `https://www.google.com/maps/search/?api=1&query=${source.latitude},${source.longitude}`
  }

  if (source.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(source.address)}`
  }

  return ''
}

export default BranchesManagement
