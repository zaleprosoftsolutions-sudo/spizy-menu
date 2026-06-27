import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CircleDollarSign,
  Clock3,
  Edit3,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './DeliveryZonesManagement.css'

const defaultForm = {
  zone_name: '',
  city: '',
  area_name: '',
  delivery_fee: '',
  minimum_order_amount: '',
  packaging_fee: '',
  free_delivery_above: '',
  estimated_delivery_minutes: '30',
  radius_km: '',
  latitude: '',
  longitude: '',
  maps_url: '',
  notes: '',
  is_active: true,
}

function DeliveryZonesManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [zones, setZones] = useState([])
  const [editingZone, setEditingZone] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState(defaultForm)

  const currency = restaurant?.currency || 'AED'

  const loadZones = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data, error } = await supabase
      .from('restaurant_delivery_zones')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false })

    setLoading(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Delivery zones loading failed',
        message: error.message,
      })
      return
    }

    setZones(data || [])
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadZones()
  }, [loadZones])

  const filteredZones = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return zones.filter((zone) => {
      if (statusFilter === 'active' && !zone.is_active) return false
      if (statusFilter === 'hidden' && zone.is_active) return false

      if (!keyword) return true

      return [
        zone.zone_name,
        zone.city,
        zone.area_name,
        zone.notes,
      ].some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  }, [search, statusFilter, zones])

  const stats = useMemo(() => {
    const activeZones = zones.filter((zone) => zone.is_active)
    const averageFee = activeZones.length
      ? activeZones.reduce(
          (total, zone) => total + Number(zone.delivery_fee || 0),
          0,
        ) / activeZones.length
      : 0

    return {
      total: zones.length,
      active: activeZones.length,
      hidden: zones.length - activeZones.length,
      averageFee,
    }
  }, [zones])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const resetForm = () => {
    setForm(defaultForm)
    setEditingZone(null)
    setShowForm(false)
  }

  const handleNewZone = () => {
    setEditingZone(null)
    setForm(defaultForm)
    setShowForm(true)
  }

  const handleEditZone = (zone) => {
    setEditingZone(zone)
    setForm({
      zone_name: zone.zone_name || '',
      city: zone.city || '',
      area_name: zone.area_name || '',
      delivery_fee: numberToInput(zone.delivery_fee),
      minimum_order_amount: numberToInput(zone.minimum_order_amount),
      packaging_fee: numberToInput(zone.packaging_fee),
      free_delivery_above: numberToInput(zone.free_delivery_above),
      estimated_delivery_minutes: String(zone.estimated_delivery_minutes || 30),
      radius_km: numberToInput(zone.radius_km),
      latitude: numberToInput(zone.latitude),
      longitude: numberToInput(zone.longitude),
      maps_url: zone.maps_url || '',
      notes: zone.notes || '',
      is_active: zone.is_active !== false,
    })
    setShowForm(true)
  }

  const handleSaveZone = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const cleanName = form.zone_name.trim()

    if (!cleanName) {
      showToast({
        type: 'warning',
        title: 'Zone name needed',
        message: 'Enter a delivery zone name before saving.',
      })
      return
    }

    setSaving(true)

    const payload = {
      restaurant_id: restaurant.id,
      zone_name: cleanName,
      city: form.city.trim() || null,
      area_name: form.area_name.trim() || null,
      delivery_fee: safeNumber(form.delivery_fee),
      minimum_order_amount: safeNumber(form.minimum_order_amount),
      packaging_fee: safeNumber(form.packaging_fee),
      free_delivery_above: optionalNumber(form.free_delivery_above),
      estimated_delivery_minutes: Math.max(
        Number.parseInt(form.estimated_delivery_minutes, 10) || 30,
        1,
      ),
      radius_km: optionalNumber(form.radius_km),
      latitude: optionalNumber(form.latitude),
      longitude: optionalNumber(form.longitude),
      maps_url: cleanUrl(form.maps_url),
      notes: form.notes.trim() || null,
      is_active: Boolean(form.is_active),
    }

    const request = editingZone?.id
      ? supabase
          .from('restaurant_delivery_zones')
          .update(payload)
          .eq('id', editingZone.id)
          .eq('restaurant_id', restaurant.id)
          .select('*')
          .single()
      : supabase
          .from('restaurant_delivery_zones')
          .insert(payload)
          .select('*')
          .single()

    const { data, error } = await request

    setSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Delivery zone save failed',
        message: error.message,
      })
      return
    }

    setZones((current) => {
      if (editingZone?.id) {
        return current.map((zone) => (zone.id === data.id ? data : zone))
      }

      return [data, ...current]
    })

    showToast({
      type: 'success',
      title: editingZone?.id ? 'Delivery zone updated' : 'Delivery zone added',
      message: `${data.zone_name} is ready for delivery setup.`,
    })

    resetForm()
  }

  const handleToggleStatus = async (zone) => {
    if (!restaurant?.id || !zone?.id) return

    const nextStatus = !zone.is_active

    setZones((current) =>
      current.map((item) =>
        item.id === zone.id ? { ...item, is_active: nextStatus } : item,
      ),
    )

    const { error } = await supabase
      .from('restaurant_delivery_zones')
      .update({ is_active: nextStatus })
      .eq('id', zone.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      setZones((current) =>
        current.map((item) =>
          item.id === zone.id ? { ...item, is_active: zone.is_active } : item,
        ),
      )
      showToast({
        type: 'error',
        title: 'Status update failed',
        message: error.message,
      })
    }
  }

  const handleDeleteZone = async (zone) => {
    const confirmed = await confirmAction({
      title: 'Delete delivery zone?',
      message: `${zone.zone_name} will be removed from your delivery settings.`,
      confirmText: 'Delete',
      cancelText: 'Keep',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('restaurant_delivery_zones')
      .update({ is_deleted: true, is_active: false })
      .eq('id', zone.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Delete failed',
        message: error.message,
      })
      return
    }

    setZones((current) => current.filter((item) => item.id !== zone.id))

    showToast({
      type: 'success',
      title: 'Delivery zone deleted',
      message: `${zone.zone_name} was removed.`,
    })
  }

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast({
        type: 'warning',
        title: 'Location not available',
        message: 'This browser does not support location selection.',
      })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude.toFixed(7)
        const longitude = position.coords.longitude.toFixed(7)

        setForm((current) => ({
          ...current,
          latitude,
          longitude,
          maps_url:
            current.maps_url ||
            `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
        }))

        showToast({
          type: 'success',
          title: 'Location added',
          message: 'Latitude and longitude were added to the zone.',
        })
      },
      () => {
        showToast({
          type: 'warning',
          title: 'Location permission denied',
          message: 'Please allow location access or paste the map URL manually.',
        })
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  if (!restaurant?.id) {
    return (
      <section className="delivery-zones-screen">
        <div className="delivery-zone-empty-card">
          Restaurant profile not found. Please complete restaurant setup first.
        </div>
      </section>
    )
  }

  return (
    <section className="delivery-zones-screen">
      <div className="delivery-zones-head">
        <div>
          <p className="pricing-label">Delivery Setup</p>
          <h2>Delivery zones & fees</h2>
          <span>
            Create delivery areas with fee, minimum order, packaging charge and delivery time.
          </span>
        </div>

        <div className="delivery-zones-head-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={loadZones}
            disabled={loading}
          >
            <RefreshCw size={18} />
            Refresh
          </button>

          <button type="button" className="primary-button" onClick={handleNewZone}>
            <Plus size={18} />
            Add Zone
          </button>
        </div>
      </div>

      <div className="delivery-zone-stat-grid">
        <DeliveryZoneStatCard label="Total zones" value={stats.total} icon={<MapPin size={20} />} />
        <DeliveryZoneStatCard label="Active" value={stats.active} icon={<Navigation size={20} />} />
        <DeliveryZoneStatCard label="Hidden" value={stats.hidden} icon={<Clock3 size={20} />} />
        <DeliveryZoneStatCard
          label="Average fee"
          value={formatMoney(currency, stats.averageFee)}
          icon={<CircleDollarSign size={20} />}
        />
      </div>

      <div className="delivery-zone-toolbar">
        <div className="delivery-zone-search">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search zone, city, area..."
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All zones</option>
          <option value="active">Active only</option>
          <option value="hidden">Hidden only</option>
        </select>
      </div>

      {showForm && (
        <form className="delivery-zone-form-card" onSubmit={handleSaveZone}>
          <div className="delivery-zone-form-head">
            <div>
              <p className="pricing-label">{editingZone ? 'Edit Zone' : 'New Zone'}</p>
              <h3>{editingZone ? editingZone.zone_name : 'Create delivery zone'}</h3>
            </div>

            <button type="button" className="tiny-button danger" onClick={resetForm}>
              Close
            </button>
          </div>

          <div className="delivery-zone-form-grid">
            <label>
              Zone name *
              <input
                type="text"
                value={form.zone_name}
                onChange={(event) => updateForm('zone_name', event.target.value)}
                placeholder="Example: Dubai Marina"
              />
            </label>

            <label>
              City / emirate
              <input
                type="text"
                value={form.city}
                onChange={(event) => updateForm('city', event.target.value)}
                placeholder="Example: Dubai"
              />
            </label>

            <label>
              Area / locality
              <input
                type="text"
                value={form.area_name}
                onChange={(event) => updateForm('area_name', event.target.value)}
                placeholder="Example: JBR, Marina Walk"
              />
            </label>

            <label>
              Delivery fee ({currency})
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.delivery_fee}
                onChange={(event) => updateForm('delivery_fee', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Minimum order ({currency})
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.minimum_order_amount}
                onChange={(event) => updateForm('minimum_order_amount', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Packaging / extra fee ({currency})
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.packaging_fee}
                onChange={(event) => updateForm('packaging_fee', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Free delivery above ({currency})
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.free_delivery_above}
                onChange={(event) => updateForm('free_delivery_above', event.target.value)}
                placeholder="Optional"
              />
            </label>

            <label>
              Delivery time minutes
              <input
                type="number"
                min="1"
                step="1"
                value={form.estimated_delivery_minutes}
                onChange={(event) => updateForm('estimated_delivery_minutes', event.target.value)}
                placeholder="30"
              />
            </label>

            <label>
              Radius km
              <input
                type="number"
                min="0"
                step="0.1"
                value={form.radius_km}
                onChange={(event) => updateForm('radius_km', event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="delivery-zone-map-card">
            <div>
              <strong>Map location foundation</strong>
              <span>
                Add a center point for this zone. Later we can auto-detect customer address inside this radius.
              </span>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={handleUseCurrentLocation}
            >
              <MapPin size={17} />
              Use Current Location
            </button>
          </div>

          <div className="delivery-zone-form-grid compact">
            <label>
              Latitude
              <input
                type="number"
                step="0.0000001"
                value={form.latitude}
                onChange={(event) => updateForm('latitude', event.target.value)}
                placeholder="25.204849"
              />
            </label>

            <label>
              Longitude
              <input
                type="number"
                step="0.0000001"
                value={form.longitude}
                onChange={(event) => updateForm('longitude', event.target.value)}
                placeholder="55.270783"
              />
            </label>

            <label className="wide-field">
              Google Maps URL
              <input
                type="url"
                value={form.maps_url}
                onChange={(event) => updateForm('maps_url', event.target.value)}
                placeholder="https://maps.google.com/..."
              />
            </label>
          </div>

          <label className="delivery-zone-notes-field">
            Internal notes
            <textarea
              value={form.notes}
              onChange={(event) => updateForm('notes', event.target.value)}
              placeholder="Example: Free delivery during lunch, avoid late-night orders..."
              rows="3"
            />
          </label>

          <div className="delivery-zone-form-bottom">
            <label className="delivery-zone-switch-row">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => updateForm('is_active', event.target.checked)}
              />
              <span>
                <strong>Active zone</strong>
                <small>Customers can use this zone after public checkout connection.</small>
              </span>
            </label>

            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Saving...' : editingZone ? 'Save Changes' : 'Create Zone'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="delivery-zone-empty-card">Loading delivery zones...</div>
      ) : filteredZones.length === 0 ? (
        <div className="delivery-zone-empty-card">
          <MapPin size={38} />
          <h3>No delivery zones found</h3>
          <p>Add your first delivery area with fee and delivery time.</p>
          <button type="button" className="primary-button" onClick={handleNewZone}>
            <Plus size={18} />
            Add Zone
          </button>
        </div>
      ) : (
        <div className="delivery-zone-grid">
          {filteredZones.map((zone) => (
            <DeliveryZoneCard
              key={zone.id}
              zone={zone}
              currency={currency}
              onEdit={() => handleEditZone(zone)}
              onDelete={() => handleDeleteZone(zone)}
              onToggle={() => handleToggleStatus(zone)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function DeliveryZoneStatCard({ label, value, icon }) {
  return (
    <div className="delivery-zone-stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function DeliveryZoneCard({ zone, currency, onEdit, onDelete, onToggle }) {
  const freeAbove = Number(zone.free_delivery_above || 0)
  const mapsUrl = zone.maps_url || buildMapsUrl(zone)

  return (
    <article className={`delivery-zone-card ${zone.is_active ? 'active' : 'hidden'}`}>
      <div className="delivery-zone-card-head">
        <div>
          <span className="delivery-zone-status">
            {zone.is_active ? 'Active' : 'Hidden'}
          </span>
          <h3>{zone.zone_name}</h3>
          <p>
            {[zone.area_name, zone.city].filter(Boolean).join(' • ') || 'Delivery area'}
          </p>
        </div>

        <label className="delivery-zone-toggle">
          <input type="checkbox" checked={zone.is_active} onChange={onToggle} />
          <span />
        </label>
      </div>

      <div className="delivery-zone-price-grid">
        <div>
          <span>Delivery fee</span>
          <strong>{formatMoney(currency, zone.delivery_fee)}</strong>
        </div>

        <div>
          <span>Minimum order</span>
          <strong>{formatMoney(currency, zone.minimum_order_amount)}</strong>
        </div>

        <div>
          <span>Packaging</span>
          <strong>{formatMoney(currency, zone.packaging_fee)}</strong>
        </div>

        <div>
          <span>Time</span>
          <strong>{Number(zone.estimated_delivery_minutes || 30)} min</strong>
        </div>
      </div>

      {freeAbove > 0 && (
        <div className="delivery-zone-free-pill">
          Free delivery above {formatMoney(currency, freeAbove)}
        </div>
      )}

      {(zone.radius_km || zone.latitude || zone.longitude) && (
        <div className="delivery-zone-map-info">
          <MapPin size={16} />
          <span>
            {zone.radius_km ? `${zone.radius_km} km radius` : 'Map point saved'}
          </span>
        </div>
      )}

      {zone.notes && <p className="delivery-zone-notes">{zone.notes}</p>}

      <div className="delivery-zone-actions">
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer">
            <Navigation size={16} />
            Map
          </a>
        )}

        <button type="button" onClick={onEdit}>
          <Edit3 size={16} />
          Edit
        </button>

        <button type="button" className="danger" onClick={onDelete}>
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </article>
  )
}

function safeNumber(value) {
  const numberValue = Number(value || 0)

  if (Number.isNaN(numberValue) || numberValue < 0) return 0

  return numberValue
}

function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null

  const numberValue = Number(value)

  if (Number.isNaN(numberValue)) return null

  return numberValue
}

function numberToInput(value) {
  if (value === null || value === undefined) return ''

  return String(value)
}

function cleanUrl(value) {
  const cleaned = String(value || '').trim()

  if (!cleaned) return null

  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return cleaned
  }

  return `https://${cleaned}`
}

function buildMapsUrl(zone) {
  if (!zone.latitude || !zone.longitude) return ''

  return `https://www.google.com/maps/search/?api=1&query=${zone.latitude},${zone.longitude}`
}

function formatMoney(currency, amount) {
  return `${currency || 'AED'} ${Number(amount || 0).toFixed(2)}`
}

export default DeliveryZonesManagement
