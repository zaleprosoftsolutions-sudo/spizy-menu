import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Coffee,
  LogIn,
  LogOut,
  Plus,
  RefreshCcw,
  Save,
  Search,
  TimerReset,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './StaffAttendanceManagement.css'

const statusOptions = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'half_day', label: 'Half day' },
  { value: 'absent', label: 'Absent' },
  { value: 'leave', label: 'Leave' },
  { value: 'off', label: 'Off day' },
]

const shiftOptions = [
  'Morning',
  'Afternoon',
  'Evening',
  'Night',
  'Full day',
  'Custom',
]

const emptyForm = {
  staff_id: '',
  attendance_date: getTodayDateValue(),
  shift_name: 'Morning',
  scheduled_start: '09:00',
  scheduled_end: '18:00',
  status: 'scheduled',
  clock_in_at: '',
  clock_out_at: '',
  break_minutes: 0,
  notes: '',
}

function StaffAttendanceManagement({ restaurant }) {
  const [staffs, setStaffs] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState(getTodayDateValue())
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const loadData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [staffResponse, attendanceResponse] = await Promise.all([
      supabase
        .from('restaurant_staffs')
        .select('id, staff_name, phone, staff_role, is_active')
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .order('staff_name', { ascending: true }),
      supabase
        .from('restaurant_staff_attendance')
        .select(
          `
            *,
            staff:restaurant_staffs (
              id,
              staff_name,
              phone,
              staff_role
            )
          `,
        )
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .gte('attendance_date', getDateDaysAgo(30))
        .order('attendance_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    setStaffs(staffResponse.data || [])
    setRecords(attendanceResponse.data || [])
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return records.filter((record) => {
      const matchesDate = !dateFilter || record.attendance_date === dateFilter
      const matchesStatus = statusFilter === 'all' || record.status === statusFilter

      if (!matchesDate || !matchesStatus) return false

      if (!keyword) return true

      return [
        record.staff?.staff_name,
        record.staff?.phone,
        record.staff?.staff_role,
        record.shift_name,
        record.status,
        record.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    })
  }, [dateFilter, records, search, statusFilter])

  const stats = useMemo(() => {
    const dayRecords = records.filter((record) => record.attendance_date === dateFilter)
    const present = dayRecords.filter((record) =>
      ['present', 'late', 'half_day'].includes(record.status),
    ).length
    const late = dayRecords.filter((record) => record.status === 'late').length
    const absent = dayRecords.filter((record) => record.status === 'absent').length
    const openShifts = dayRecords.filter(
      (record) => record.clock_in_at && !record.clock_out_at,
    ).length
    const totalMinutes = dayRecords.reduce(
      (sum, record) => sum + Number(record.total_work_minutes || 0),
      0,
    )

    return {
      totalStaff: staffs.filter((staff) => staff.is_active !== false).length,
      scheduled: dayRecords.length,
      present,
      late,
      absent,
      openShifts,
      totalHours: totalMinutes / 60,
    }
  }, [dateFilter, records, staffs])

  const openCreateForm = () => {
    setEditingRecord(null)
    setForm({
      ...emptyForm,
      attendance_date: dateFilter || getTodayDateValue(),
      staff_id: staffs[0]?.id || '',
    })
    setShowForm(true)
  }

  const openEditForm = (record) => {
    setEditingRecord(record)
    setForm({
      staff_id: record.staff_id || '',
      attendance_date: record.attendance_date || getTodayDateValue(),
      shift_name: record.shift_name || 'Morning',
      scheduled_start: normalizeTimeValue(record.scheduled_start) || '09:00',
      scheduled_end: normalizeTimeValue(record.scheduled_end) || '18:00',
      status: record.status || 'scheduled',
      clock_in_at: normalizeDateTimeLocalValue(record.clock_in_at),
      clock_out_at: normalizeDateTimeLocalValue(record.clock_out_at),
      break_minutes: Number(record.break_minutes || 0),
      notes: record.notes || '',
    })
    setShowForm(true)
  }

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const saveRecord = async () => {
    if (!restaurant?.id || !form.staff_id || !form.attendance_date) return

    setSaving(true)

    const totalWorkMinutes = calculateWorkMinutes({
      clockInAt: form.clock_in_at,
      clockOutAt: form.clock_out_at,
      breakMinutes: form.break_minutes,
    })

    const payload = {
      restaurant_id: restaurant.id,
      staff_id: form.staff_id,
      attendance_date: form.attendance_date,
      shift_name: form.shift_name || 'Custom',
      scheduled_start: form.scheduled_start || null,
      scheduled_end: form.scheduled_end || null,
      status: form.status || 'scheduled',
      clock_in_at: form.clock_in_at ? new Date(form.clock_in_at).toISOString() : null,
      clock_out_at: form.clock_out_at ? new Date(form.clock_out_at).toISOString() : null,
      break_minutes: Number(form.break_minutes || 0),
      total_work_minutes: totalWorkMinutes,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const request = editingRecord?.id
      ? supabase
          .from('restaurant_staff_attendance')
          .update(payload)
          .eq('id', editingRecord.id)
          .select(
            `
              *,
              staff:restaurant_staffs (
                id,
                staff_name,
                phone,
                staff_role
              )
            `,
          )
          .single()
      : supabase
          .from('restaurant_staff_attendance')
          .insert(payload)
          .select(
            `
              *,
              staff:restaurant_staffs (
                id,
                staff_name,
                phone,
                staff_role
              )
            `,
          )
          .single()

    const { data, error } = await request

    setSaving(false)

    if (error) return

    if (editingRecord?.id) {
      setRecords((current) =>
        current.map((record) => (record.id === data.id ? data : record)),
      )
    } else {
      setRecords((current) => [data, ...current])
    }

    setShowForm(false)
    setEditingRecord(null)
    setForm(emptyForm)
  }

  const softDeleteRecord = async (record) => {
    if (!record?.id) return

    const { error } = await supabase
      .from('restaurant_staff_attendance')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', record.id)

    if (error) return

    setRecords((current) => current.filter((item) => item.id !== record.id))
  }

  const quickClockIn = async (record) => {
    if (!record?.id) return

    const clockInAt = new Date().toISOString()
    const nextStatus = record.status === 'scheduled' ? 'present' : record.status

    const { data, error } = await supabase
      .from('restaurant_staff_attendance')
      .update({
        clock_in_at: clockInAt,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', record.id)
      .select(
        `
          *,
          staff:restaurant_staffs (
            id,
            staff_name,
            phone,
            staff_role
          )
        `,
      )
      .single()

    if (error) return

    setRecords((current) =>
      current.map((item) => (item.id === data.id ? data : item)),
    )
  }

  const quickClockOut = async (record) => {
    if (!record?.id) return

    const clockOutAt = new Date().toISOString()
    const totalWorkMinutes = calculateWorkMinutes({
      clockInAt: record.clock_in_at,
      clockOutAt,
      breakMinutes: record.break_minutes,
    })

    const { data, error } = await supabase
      .from('restaurant_staff_attendance')
      .update({
        clock_out_at: clockOutAt,
        total_work_minutes: totalWorkMinutes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', record.id)
      .select(
        `
          *,
          staff:restaurant_staffs (
            id,
            staff_name,
            phone,
            staff_role
          )
        `,
      )
      .single()

    if (error) return

    setRecords((current) =>
      current.map((item) => (item.id === data.id ? data : item)),
    )
  }

  return (
    <section className="staff-attendance-page">
      <div className="staff-attendance-hero">
        <div>
          <p>Staff attendance</p>
          <h1>Shifts, clock-in and daily manpower</h1>
          <span>
            Plan daily shifts, mark attendance, track late staff and calculate
            working hours.
          </span>
        </div>

        <div className="staff-attendance-hero-actions">
          <button type="button" className="ghost" onClick={loadData}>
            <RefreshCcw size={17} />
            Refresh
          </button>
          <button type="button" className="primary" onClick={openCreateForm}>
            <Plus size={18} />
            Add shift
          </button>
        </div>
      </div>

      <div className="staff-attendance-stats">
        <AttendanceStat icon={<Users size={21} />} label="Active staff" value={stats.totalStaff} />
        <AttendanceStat icon={<CalendarDays size={21} />} label="Scheduled" value={stats.scheduled} />
        <AttendanceStat icon={<UserCheck size={21} />} label="Present" value={stats.present} />
        <AttendanceStat icon={<TimerReset size={21} />} label="Open shifts" value={stats.openShifts} />
        <AttendanceStat icon={<Clock size={21} />} label="Work hours" value={stats.totalHours.toFixed(1)} />
      </div>

      <div className="staff-attendance-toolbar">
        <label className="staff-attendance-date-picker">
          <span>Date</span>
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </label>

        <div className="staff-attendance-search">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search staff, role, shift, notes..."
          />
        </div>

        <div className="staff-attendance-filters">
          <button
            type="button"
            className={statusFilter === 'all' ? 'active' : ''}
            onClick={() => setStatusFilter('all')}
          >
            All
          </button>
          {statusOptions.map((status) => (
            <button
              type="button"
              key={status.value}
              className={statusFilter === status.value ? 'active' : ''}
              onClick={() => setStatusFilter(status.value)}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="staff-attendance-empty">Loading attendance...</div>
      ) : filteredRecords.length === 0 ? (
        <div className="staff-attendance-empty">
          <CalendarDays size={34} />
          <h3>No shifts found</h3>
          <p>Create today’s shift schedule or change the date/filter.</p>
          <button type="button" onClick={openCreateForm}>Add shift</button>
        </div>
      ) : (
        <div className="staff-attendance-list">
          {filteredRecords.map((record) => (
            <AttendanceCard
              key={record.id}
              record={record}
              onEdit={openEditForm}
              onDelete={softDeleteRecord}
              onClockIn={quickClockIn}
              onClockOut={quickClockOut}
            />
          ))}
        </div>
      )}

      {showForm && (
        <AttendanceFormModal
          staffs={staffs}
          form={form}
          saving={saving}
          editing={Boolean(editingRecord)}
          onClose={() => {
            setShowForm(false)
            setEditingRecord(null)
            setForm(emptyForm)
          }}
          onUpdate={updateForm}
          onSave={saveRecord}
        />
      )}
    </section>
  )
}

function AttendanceStat({ icon, label, value }) {
  return (
    <div className="staff-attendance-stat">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function AttendanceCard({ record, onEdit, onDelete, onClockIn, onClockOut }) {
  const hasClockIn = Boolean(record.clock_in_at)
  const hasClockOut = Boolean(record.clock_out_at)

  return (
    <article className={`staff-attendance-card status-${record.status || 'scheduled'}`}>
      <div className="attendance-card-main">
        <div className="attendance-staff-avatar">
          {record.staff?.staff_name?.slice(0, 2)?.toUpperCase() || 'ST'}
        </div>

        <div className="attendance-staff-info">
          <div className="attendance-card-title-row">
            <h3>{record.staff?.staff_name || 'Staff member'}</h3>
            <span>{formatStatus(record.status)}</span>
          </div>
          <p>
            {formatRole(record.staff?.staff_role)} • {record.shift_name || 'Shift'} •{' '}
            {formatDate(record.attendance_date)}
          </p>
          {record.notes && <small>{record.notes}</small>}
        </div>
      </div>

      <div className="attendance-time-grid">
        <div>
          <span>Scheduled</span>
          <strong>
            {formatTimeOnly(record.scheduled_start)} - {formatTimeOnly(record.scheduled_end)}
          </strong>
        </div>
        <div>
          <span>Clock in</span>
          <strong>{formatDateTime(record.clock_in_at)}</strong>
        </div>
        <div>
          <span>Clock out</span>
          <strong>{formatDateTime(record.clock_out_at)}</strong>
        </div>
        <div>
          <span>Break</span>
          <strong>{Number(record.break_minutes || 0)} min</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{formatWorkMinutes(record.total_work_minutes)}</strong>
        </div>
      </div>

      <div className="attendance-card-actions">
        {!hasClockIn && (
          <button type="button" onClick={() => onClockIn(record)}>
            <LogIn size={16} />
            Clock in
          </button>
        )}

        {hasClockIn && !hasClockOut && (
          <button type="button" className="ready" onClick={() => onClockOut(record)}>
            <LogOut size={16} />
            Clock out
          </button>
        )}

        <button type="button" onClick={() => onEdit(record)}>
          <Save size={16} />
          Edit
        </button>

        <button type="button" className="danger" onClick={() => onDelete(record)}>
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </article>
  )
}

function AttendanceFormModal({ staffs, form, saving, editing, onClose, onUpdate, onSave }) {
  return (
    <div className="attendance-modal-overlay" onClick={onClose}>
      <div className="attendance-modal" onClick={(event) => event.stopPropagation()}>
        <div className="attendance-modal-head">
          <div>
            <p>Attendance entry</p>
            <h2>{editing ? 'Edit shift / attendance' : 'Add shift / attendance'}</h2>
          </div>
          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="attendance-form-grid">
          <label>
            <span>Staff member</span>
            <select
              value={form.staff_id}
              onChange={(event) => onUpdate('staff_id', event.target.value)}
            >
              <option value="">Select staff</option>
              {staffs.map((staff) => (
                <option value={staff.id} key={staff.id}>
                  {staff.staff_name} - {formatRole(staff.staff_role)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Date</span>
            <input
              type="date"
              value={form.attendance_date}
              onChange={(event) => onUpdate('attendance_date', event.target.value)}
            />
          </label>

          <label>
            <span>Shift</span>
            <select
              value={form.shift_name}
              onChange={(event) => onUpdate('shift_name', event.target.value)}
            >
              {shiftOptions.map((shift) => (
                <option value={shift} key={shift}>{shift}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>
            <select
              value={form.status}
              onChange={(event) => onUpdate('status', event.target.value)}
            >
              {statusOptions.map((status) => (
                <option value={status.value} key={status.value}>{status.label}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Scheduled start</span>
            <input
              type="time"
              value={form.scheduled_start}
              onChange={(event) => onUpdate('scheduled_start', event.target.value)}
            />
          </label>

          <label>
            <span>Scheduled end</span>
            <input
              type="time"
              value={form.scheduled_end}
              onChange={(event) => onUpdate('scheduled_end', event.target.value)}
            />
          </label>

          <label>
            <span>Clock in</span>
            <input
              type="datetime-local"
              value={form.clock_in_at}
              onChange={(event) => onUpdate('clock_in_at', event.target.value)}
            />
          </label>

          <label>
            <span>Clock out</span>
            <input
              type="datetime-local"
              value={form.clock_out_at}
              onChange={(event) => onUpdate('clock_out_at', event.target.value)}
            />
          </label>

          <label>
            <span>Break minutes</span>
            <input
              type="number"
              min="0"
              value={form.break_minutes}
              onChange={(event) => onUpdate('break_minutes', event.target.value)}
            />
          </label>

          <label className="wide">
            <span>Notes</span>
            <textarea
              rows="3"
              value={form.notes}
              onChange={(event) => onUpdate('notes', event.target.value)}
              placeholder="Late reason, leave note, manager remarks..."
            />
          </label>
        </div>

        <div className="attendance-modal-foot">
          <div>
            <Coffee size={16} />
            Working hours are calculated after clock-out.
          </div>
          <button type="button" className="cancel" onClick={onClose}>Cancel</button>
          <button type="button" className="save" onClick={onSave} disabled={saving}>
            <CheckCircle2 size={17} />
            {saving ? 'Saving...' : 'Save attendance'}
          </button>
        </div>
      </div>
    </div>
  )
}

function getTodayDateValue() {
  return new Date().toISOString().slice(0, 10)
}

function getDateDaysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

function normalizeTimeValue(value) {
  if (!value) return ''
  return String(value).slice(0, 5)
}

function normalizeDateTimeLocalValue(value) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - offset * 60 * 1000)
  return localDate.toISOString().slice(0, 16)
}

function calculateWorkMinutes({ clockInAt, clockOutAt, breakMinutes }) {
  if (!clockInAt || !clockOutAt) return 0

  const start = new Date(clockInAt)
  const end = new Date(clockOutAt)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  if (end <= start) return 0

  const total = Math.round((end.getTime() - start.getTime()) / 60000)
  return Math.max(total - Number(breakMinutes || 0), 0)
}

function formatWorkMinutes(value) {
  const minutes = Number(value || 0)
  if (minutes <= 0) return '-'

  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60

  if (hours <= 0) return `${remainder}m`
  if (remainder <= 0) return `${hours}h`
  return `${hours}h ${remainder}m`
}

function formatStatus(value) {
  const match = statusOptions.find((status) => status.value === value)
  return match?.label || 'Scheduled'
}

function formatRole(value) {
  if (!value) return 'Staff'
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatTimeOnly(value) {
  if (!value) return '-'
  return String(value).slice(0, 5)
}

function formatDate(value) {
  if (!value) return 'Today'

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

function formatDateTime(value) {
  if (!value) return '-'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '-'
  }
}

export default StaffAttendanceManagement
