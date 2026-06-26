import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Edit3,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './ReservationsManagement.css'

const emptyReservationForm = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  guest_count: 2,
  reservation_date: getTodayInputValue(),
  reservation_time: '20:00',
  expected_duration_minutes: 90,
  table_preference: '',
  occasion: '',
  source: 'phone',
  status: 'pending',
  deposit_amount: '',
  notes: '',
}

const statusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'seated', label: 'Seated' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
]

const sourceOptions = [
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'admin', label: 'Admin' },
  { value: 'public', label: 'Online' },
  { value: 'walk_in', label: 'Walk-in' },
]

function ReservationsManagement({ restaurant }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingReservation, setEditingReservation] = useState(null)
  const [form, setForm] = useState(emptyReservationForm)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('today')
  const [statusFilter, setStatusFilter] = useState('all')
  const [toast, setToast] = useState('')

  const currency = restaurant?.currency || 'AED'

  const showToast = useCallback((message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }, [])

  const loadReservations = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    let query = supabase
      .from('restaurant_reservations')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .order('reservation_date', { ascending: true })
      .order('reservation_time', { ascending: true })
      .limit(250)

    const today = getTodayInputValue()

    if (dateFilter === 'today') {
      query = query.eq('reservation_date', today)
    }

    if (dateFilter === 'upcoming') {
      query = query.gte('reservation_date', today)
    }

    if (dateFilter === 'past') {
      query = query.lt('reservation_date', today)
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query

    setLoading(false)

    if (error) {
      showToast(error.message || 'Failed to load reservations.')
      setReservations([])
      return
    }

    setReservations(data || [])
  }, [dateFilter, restaurant?.id, showToast, statusFilter])

  useEffect(() => {
    loadReservations()
  }, [loadReservations])

  const filteredReservations = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return reservations

    return reservations.filter((reservation) =>
      [
        reservation.reservation_code,
        reservation.customer_name,
        reservation.customer_phone,
        reservation.customer_email,
        reservation.table_preference,
        reservation.occasion,
        reservation.notes,
        reservation.source,
        reservation.status,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      ),
    )
  }, [reservations, search])

  const stats = useMemo(() => {
    const today = getTodayInputValue()
    const todayReservations = reservations.filter(
      (reservation) => reservation.reservation_date === today,
    )
    const liveReservations = reservations.filter((reservation) =>
      ['pending', 'confirmed', 'seated'].includes(reservation.status),
    )

    return {
      today: todayReservations.length,
      guests: reservations.reduce(
        (total, reservation) => total + Number(reservation.guest_count || 0),
        0,
      ),
      pending: reservations.filter((reservation) => reservation.status === 'pending')
        .length,
      confirmed: reservations.filter(
        (reservation) => reservation.status === 'confirmed',
      ).length,
      seated: reservations.filter((reservation) => reservation.status === 'seated')
        .length,
      live: liveReservations.length,
    }
  }, [reservations])

  const openCreateForm = () => {
    setEditingReservation(null)
    setForm(emptyReservationForm)
    setShowForm(true)
  }

  const openEditForm = (reservation) => {
    setEditingReservation(reservation)
    setForm({
      customer_name: reservation.customer_name || '',
      customer_phone: reservation.customer_phone || '',
      customer_email: reservation.customer_email || '',
      guest_count: reservation.guest_count || 2,
      reservation_date: reservation.reservation_date || getTodayInputValue(),
      reservation_time: normalizeInputTime(reservation.reservation_time),
      expected_duration_minutes: reservation.expected_duration_minutes || 90,
      table_preference: reservation.table_preference || '',
      occasion: reservation.occasion || '',
      source: reservation.source || 'phone',
      status: reservation.status || 'pending',
      deposit_amount:
        reservation.deposit_amount === null || reservation.deposit_amount === undefined
          ? ''
          : String(reservation.deposit_amount),
      notes: reservation.notes || '',
    })
    setShowForm(true)
  }

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingReservation(null)
    setForm(emptyReservationForm)
  }

  const handleSaveReservation = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    if (!form.customer_name.trim()) {
      showToast('Customer name is required.')
      return
    }

    if (!form.customer_phone.trim()) {
      showToast('Customer phone is required.')
      return
    }

    if (!form.reservation_date || !form.reservation_time) {
      showToast('Reservation date and time are required.')
      return
    }

    setSaving(true)

    const payload = {
      restaurant_id: restaurant.id,
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim(),
      customer_email: form.customer_email.trim() || null,
      guest_count: Number(form.guest_count || 1),
      reservation_date: form.reservation_date,
      reservation_time: form.reservation_time,
      expected_duration_minutes: Number(form.expected_duration_minutes || 90),
      table_preference: form.table_preference.trim() || null,
      occasion: form.occasion.trim() || null,
      source: form.source || 'phone',
      status: form.status || 'pending',
      deposit_amount: form.deposit_amount === '' ? 0 : Number(form.deposit_amount || 0),
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    let response

    if (editingReservation?.id) {
      response = await supabase
        .from('restaurant_reservations')
        .update(payload)
        .eq('id', editingReservation.id)
        .eq('restaurant_id', restaurant.id)
        .select('*')
        .single()
    } else {
      response = await supabase
        .from('restaurant_reservations')
        .insert(payload)
        .select('*')
        .single()
    }

    setSaving(false)

    if (response.error) {
      showToast(response.error.message || 'Failed to save reservation.')
      return
    }

    const savedReservation = response.data

    setReservations((current) => {
      if (editingReservation?.id) {
        return current.map((reservation) =>
          reservation.id === savedReservation.id ? savedReservation : reservation,
        )
      }

      return sortReservations([...current, savedReservation])
    })

    closeForm()
    showToast(editingReservation ? 'Reservation updated.' : 'Reservation added.')
  }

  const updateReservationStatus = async (reservation, nextStatus) => {
    if (!restaurant?.id || !reservation?.id) return

    const { data, error } = await supabase
      .from('restaurant_reservations')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', reservation.id)
      .eq('restaurant_id', restaurant.id)
      .select('*')
      .single()

    if (error) {
      showToast(error.message || 'Status update failed.')
      return
    }

    setReservations((current) =>
      current.map((item) => (item.id === data.id ? data : item)),
    )
    showToast(`Reservation marked ${formatReservationStatus(nextStatus)}.`)
  }

  const deleteReservation = async (reservation) => {
    if (!restaurant?.id || !reservation?.id) return

    const { error } = await supabase
      .from('restaurant_reservations')
      .delete()
      .eq('id', reservation.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showToast(error.message || 'Delete failed.')
      return
    }

    setReservations((current) =>
      current.filter((item) => item.id !== reservation.id),
    )
    showToast('Reservation deleted.')
  }

  return (
    <section className="reservations-page">
      {toast && <div className="reservations-toast">{toast}</div>}

      <div className="reservations-hero">
        <div>
          <span className="reservations-kicker">Bookings</span>
          <h1>Reservations</h1>
          <p>
            Manage table bookings, customer calls, confirmations, deposits and
            no-show tracking in one premium restaurant board.
          </p>
        </div>

        <button type="button" className="reservations-primary" onClick={openCreateForm}>
          <Plus size={18} />
          Add reservation
        </button>
      </div>

      <div className="reservations-stat-grid">
        <ReservationStat icon={<CalendarCheck size={21} />} label="Today" value={stats.today} />
        <ReservationStat icon={<Users size={21} />} label="Guests" value={stats.guests} />
        <ReservationStat icon={<Clock3 size={21} />} label="Pending" value={stats.pending} />
        <ReservationStat icon={<CheckCircle2 size={21} />} label="Confirmed" value={stats.confirmed} />
      </div>

      <div className="reservations-toolbar">
        <div className="reservations-search">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, phone, table, occasion..."
          />
        </div>

        <div className="reservations-filter-row">
          <button
            type="button"
            className={dateFilter === 'today' ? 'active' : ''}
            onClick={() => setDateFilter('today')}
          >
            Today
          </button>
          <button
            type="button"
            className={dateFilter === 'upcoming' ? 'active' : ''}
            onClick={() => setDateFilter('upcoming')}
          >
            Upcoming
          </button>
          <button
            type="button"
            className={dateFilter === 'past' ? 'active' : ''}
            onClick={() => setDateFilter('past')}
          >
            Past
          </button>
          <button
            type="button"
            className={dateFilter === 'all' ? 'active' : ''}
            onClick={() => setDateFilter('all')}
          >
            All
          </button>
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          {statusOptions.map((status) => (
            <option value={status.value} key={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="reservations-loading">Loading reservations...</div>
      ) : filteredReservations.length === 0 ? (
        <div className="reservations-empty">
          <CalendarCheck size={38} />
          <h3>No reservations found</h3>
          <p>Add phone bookings or use filters to view upcoming reservations.</p>
          <button type="button" onClick={openCreateForm}>Add first reservation</button>
        </div>
      ) : (
        <div className="reservations-grid">
          {filteredReservations.map((reservation) => (
            <ReservationCard
              key={reservation.id}
              reservation={reservation}
              currency={currency}
              onEdit={openEditForm}
              onDelete={deleteReservation}
              onStatusChange={updateReservationStatus}
            />
          ))}
        </div>
      )}

      {showForm && (
        <ReservationFormModal
          form={form}
          saving={saving}
          editing={Boolean(editingReservation)}
          onClose={closeForm}
          onChange={updateForm}
          onSubmit={handleSaveReservation}
          currency={currency}
        />
      )}
    </section>
  )
}

function ReservationStat({ icon, label, value }) {
  return (
    <div className="reservation-stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ReservationCard({ reservation, currency, onEdit, onDelete, onStatusChange }) {
  const nextActions = getReservationActions(reservation.status)
  const phoneHref = reservation.customer_phone
    ? `tel:${reservation.customer_phone}`
    : undefined

  return (
    <article className={`reservation-card status-${reservation.status}`}>
      <div className="reservation-card-head">
        <div>
          <span>{reservation.reservation_code || 'Reservation'}</span>
          <h3>{reservation.customer_name}</h3>
          <p>{reservation.customer_phone}</p>
        </div>

        <div className={`reservation-status-pill ${reservation.status}`}>
          {formatReservationStatus(reservation.status)}
        </div>
      </div>

      <div className="reservation-time-row">
        <strong>{formatReservationDate(reservation.reservation_date)}</strong>
        <span>{normalizeDisplayTime(reservation.reservation_time)}</span>
      </div>

      <div className="reservation-mini-grid">
        <div>
          <span>Guests</span>
          <strong>{reservation.guest_count}</strong>
        </div>
        <div>
          <span>Duration</span>
          <strong>{reservation.expected_duration_minutes || 90} min</strong>
        </div>
        <div>
          <span>Source</span>
          <strong>{formatReservationSource(reservation.source)}</strong>
        </div>
        <div>
          <span>Deposit</span>
          <strong>
            {currency} {Number(reservation.deposit_amount || 0).toFixed(2)}
          </strong>
        </div>
      </div>

      {(reservation.table_preference || reservation.occasion) && (
        <div className="reservation-detail-line">
          {reservation.table_preference && <span>Table: {reservation.table_preference}</span>}
          {reservation.occasion && <span>Occasion: {reservation.occasion}</span>}
        </div>
      )}

      {reservation.notes && <p className="reservation-notes">{reservation.notes}</p>}

      <div className="reservation-actions">
        {phoneHref && (
          <a href={phoneHref} className="reservation-icon-action">
            <Phone size={16} />
            Call
          </a>
        )}

        {nextActions.map((action) => (
          <button
            type="button"
            key={action.status}
            className={action.className || ''}
            onClick={() => onStatusChange(reservation, action.status)}
          >
            {action.label}
          </button>
        ))}

        <button type="button" onClick={() => onEdit(reservation)}>
          <Edit3 size={15} />
          Edit
        </button>

        <button
          type="button"
          className="danger"
          onClick={() => onDelete(reservation)}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  )
}

function ReservationFormModal({
  form,
  saving,
  editing,
  onClose,
  onChange,
  onSubmit,
  currency,
}) {
  return (
    <div className="reservation-modal-overlay" onMouseDown={onClose}>
      <form
        className="reservation-modal"
        onSubmit={onSubmit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="reservation-modal-head">
          <div>
            <span className="reservations-kicker">Reservation</span>
            <h2>{editing ? 'Edit reservation' : 'Add reservation'}</h2>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="reservation-form-grid">
          <label>
            Customer name
            <input
              type="text"
              value={form.customer_name}
              onChange={(event) => onChange('customer_name', event.target.value)}
              placeholder="Customer name"
            />
          </label>

          <label>
            Phone number
            <input
              type="tel"
              value={form.customer_phone}
              onChange={(event) => onChange('customer_phone', event.target.value)}
              placeholder="Phone number"
            />
          </label>

          <label>
            Email optional
            <input
              type="email"
              value={form.customer_email}
              onChange={(event) => onChange('customer_email', event.target.value)}
              placeholder="customer@email.com"
            />
          </label>

          <label>
            Guests
            <input
              type="number"
              min="1"
              max="99"
              value={form.guest_count}
              onChange={(event) => onChange('guest_count', event.target.value)}
            />
          </label>

          <label>
            Date
            <input
              type="date"
              value={form.reservation_date}
              onFocus={(event) => event.target.showPicker?.()}
              onClick={(event) => event.currentTarget.showPicker?.()}
              onChange={(event) => onChange('reservation_date', event.target.value)}
            />
          </label>

          <label>
            Time
            <input
              type="time"
              value={form.reservation_time}
              onFocus={(event) => event.target.showPicker?.()}
              onClick={(event) => event.currentTarget.showPicker?.()}
              onChange={(event) => onChange('reservation_time', event.target.value)}
            />
          </label>

          <label>
            Duration
            <select
              value={form.expected_duration_minutes}
              onChange={(event) =>
                onChange('expected_duration_minutes', event.target.value)
              }
            >
              <option value="60">1 hour</option>
              <option value="90">1 hour 30 min</option>
              <option value="120">2 hours</option>
              <option value="150">2 hours 30 min</option>
              <option value="180">3 hours</option>
            </select>
          </label>

          <label>
            Status
            <select
              value={form.status}
              onChange={(event) => onChange('status', event.target.value)}
            >
              {statusOptions.map((status) => (
                <option value={status.value} key={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Source
            <select
              value={form.source}
              onChange={(event) => onChange('source', event.target.value)}
            >
              {sourceOptions.map((source) => (
                <option value={source.value} key={source.value}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Deposit amount ({currency})
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.deposit_amount}
              onChange={(event) => onChange('deposit_amount', event.target.value)}
              placeholder="0.00"
            />
          </label>

          <label>
            Table preference
            <input
              type="text"
              value={form.table_preference}
              onChange={(event) => onChange('table_preference', event.target.value)}
              placeholder="Window side, family table, outdoor..."
            />
          </label>

          <label>
            Occasion
            <input
              type="text"
              value={form.occasion}
              onChange={(event) => onChange('occasion', event.target.value)}
              placeholder="Birthday, anniversary, business meeting..."
            />
          </label>

          <label className="wide">
            Notes
            <textarea
              rows="4"
              value={form.notes}
              onChange={(event) => onChange('notes', event.target.value)}
              placeholder="Special requests, advance payment details, seating notes..."
            />
          </label>
        </div>

        <div className="reservation-modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Create reservation'}
          </button>
        </div>
      </form>
    </div>
  )
}

function getReservationActions(status) {
  if (status === 'pending') {
    return [
      { status: 'confirmed', label: 'Confirm', className: 'success' },
      { status: 'cancelled', label: 'Cancel', className: 'warning' },
    ]
  }

  if (status === 'confirmed') {
    return [
      { status: 'seated', label: 'Seat now', className: 'success' },
      { status: 'no_show', label: 'No show', className: 'warning' },
    ]
  }

  if (status === 'seated') {
    return [{ status: 'completed', label: 'Complete', className: 'success' }]
  }

  return []
}

function sortReservations(items) {
  return [...items].sort((first, second) => {
    const firstDate = `${first.reservation_date || ''} ${first.reservation_time || ''}`
    const secondDate = `${second.reservation_date || ''} ${second.reservation_time || ''}`
    return firstDate.localeCompare(secondDate)
  })
}

function getTodayInputValue() {
  const date = new Date()
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 10)
}

function normalizeInputTime(value) {
  if (!value) return '20:00'
  return String(value).slice(0, 5)
}

function normalizeDisplayTime(value) {
  if (!value) return 'Time not set'

  const cleanValue = String(value).slice(0, 5)
  const [hourValue, minuteValue] = cleanValue.split(':')
  const hourNumber = Number(hourValue || 0)
  const suffix = hourNumber >= 12 ? 'PM' : 'AM'
  const displayHour = hourNumber % 12 || 12

  return `${displayHour}:${minuteValue || '00'} ${suffix}`
}

function formatReservationDate(value) {
  if (!value) return 'Date not set'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${value}T00:00:00`))
  } catch {
    return value
  }
}

function formatReservationStatus(status) {
  if (status === 'pending') return 'Pending'
  if (status === 'confirmed') return 'Confirmed'
  if (status === 'seated') return 'Seated'
  if (status === 'completed') return 'Completed'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'no_show') return 'No show'
  return 'Pending'
}

function formatReservationSource(source) {
  if (source === 'whatsapp') return 'WhatsApp'
  if (source === 'walk_in') return 'Walk-in'
  if (source === 'public') return 'Online'
  if (source === 'admin') return 'Admin'
  return 'Phone'
}

export default ReservationsManagement
