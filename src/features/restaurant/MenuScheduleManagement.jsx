import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgePercent,
  CalendarClock,
  Clock,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './MenuScheduleManagement.css'

const dayOptions = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

const scheduleTypes = [
  {
    value: 'availability',
    label: 'Available only in this time',
    hint: 'Example: breakfast menu from 7 AM to 11 AM.',
  },
  {
    value: 'happy_hour',
    label: 'Happy hour discount',
    hint: 'Example: 20% off on selected drinks after 4 PM.',
  },
  {
    value: 'special_price',
    label: 'Special scheduled price',
    hint: 'Example: lunch combo AED 19 during weekdays.',
  },
  {
    value: 'hide_item',
    label: 'Hide / stop selling in this time',
    hint: 'Example: hide unavailable items after kitchen closing time.',
  },
]

const appliesToOptions = [
  { value: 'item', label: 'Single item' },
  { value: 'category', label: 'Category' },
  { value: 'all_menu', label: 'Full menu' },
]

const emptyForm = {
  scheduleName: '',
  scheduleType: 'availability',
  appliesTo: 'item',
  itemId: '',
  categoryId: '',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startTime: '09:00',
  endTime: '23:00',
  startDate: '',
  endDate: '',
  specialPrice: '',
  discountPercent: '',
  bannerNote: '',
  isActive: true,
}

function MenuScheduleManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [schedules, setSchedules] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [form, setForm] = useState(emptyForm)

  const currency = restaurant?.currency || 'AED'

  const loadSchedules = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [categoryResult, itemResult, scheduleResult] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('id, name')
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false }),
      supabase
        .from('menu_items')
        .select('id, name, price, category_id, is_available')
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .order('name', { ascending: true }),
      supabase
        .from('restaurant_menu_schedules')
        .select(
          `
            *,
            item:menu_items (
              id,
              name,
              price
            ),
            category:menu_categories (
              id,
              name
            )
          `,
        )
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false }),
    ])

    if (categoryResult.error) {
      showToast({
        type: 'error',
        title: 'Categories failed',
        message: categoryResult.error.message,
      })
    }

    if (itemResult.error) {
      showToast({
        type: 'error',
        title: 'Menu items failed',
        message: itemResult.error.message,
      })
    }

    if (scheduleResult.error) {
      showToast({
        type: 'error',
        title: 'Schedules failed',
        message: scheduleResult.error.message,
      })
    }

    setCategories(categoryResult.data || [])
    setItems(itemResult.data || [])
    setSchedules(scheduleResult.data || [])
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadSchedules()
  }, [loadSchedules])

  const stats = useMemo(() => {
    const active = schedules.filter((schedule) => schedule.is_active).length
    const happyHour = schedules.filter(
      (schedule) => schedule.schedule_type === 'happy_hour',
    ).length
    const hidden = schedules.filter(
      (schedule) => schedule.schedule_type === 'hide_item',
    ).length
    const itemSpecific = schedules.filter(
      (schedule) => schedule.applies_to === 'item',
    ).length

    return {
      total: schedules.length,
      active,
      happyHour,
      hidden,
      itemSpecific,
    }
  }, [schedules])

  const filteredSchedules = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return schedules.filter((schedule) => {
      const matchesType =
        typeFilter === 'all' || schedule.schedule_type === typeFilter

      if (!matchesType) return false
      if (!keyword) return true

      return [
        schedule.schedule_name,
        schedule.banner_note,
        schedule.item?.name,
        schedule.category?.name,
        getScheduleTypeLabel(schedule.schedule_type),
      ].some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  }, [schedules, search, typeFilter])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const toggleDay = (day) => {
    setForm((current) => {
      const exists = current.daysOfWeek.includes(day)
      const nextDays = exists
        ? current.daysOfWeek.filter((value) => value !== day)
        : [...current.daysOfWeek, day]

      return {
        ...current,
        daysOfWeek: nextDays.sort((a, b) => a - b),
      }
    })
  }

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(false)
  }

  const startCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const startEdit = (schedule) => {
    setEditingId(schedule.id)
    setForm({
      scheduleName: schedule.schedule_name || '',
      scheduleType: schedule.schedule_type || 'availability',
      appliesTo: schedule.applies_to || 'item',
      itemId: schedule.item_id || '',
      categoryId: schedule.category_id || '',
      daysOfWeek: Array.isArray(schedule.days_of_week)
        ? schedule.days_of_week
        : [0, 1, 2, 3, 4, 5, 6],
      startTime: normalizeTimeForInput(schedule.start_time) || '09:00',
      endTime: normalizeTimeForInput(schedule.end_time) || '23:00',
      startDate: schedule.start_date || '',
      endDate: schedule.end_date || '',
      specialPrice:
        schedule.special_price !== null && schedule.special_price !== undefined
          ? String(schedule.special_price)
          : '',
      discountPercent:
        schedule.discount_percent !== null &&
        schedule.discount_percent !== undefined
          ? String(schedule.discount_percent)
          : '',
      bannerNote: schedule.banner_note || '',
      isActive: schedule.is_active !== false,
    })
    setShowForm(true)
  }

  const validateForm = () => {
    if (!form.scheduleName.trim()) return 'Enter schedule name.'
    if (form.daysOfWeek.length === 0) return 'Select at least one day.'
    if (!form.startTime || !form.endTime) return 'Select start and end time.'
    if (form.appliesTo === 'item' && !form.itemId) return 'Select menu item.'
    if (form.appliesTo === 'category' && !form.categoryId) {
      return 'Select category.'
    }
    if (form.scheduleType === 'special_price' && Number(form.specialPrice) <= 0) {
      return 'Enter special price.'
    }
    if (form.scheduleType === 'happy_hour' && Number(form.discountPercent) <= 0) {
      return 'Enter discount percentage.'
    }

    return ''
  }

  const saveSchedule = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const validationMessage = validateForm()

    if (validationMessage) {
      showToast({
        type: 'warning',
        title: 'Check schedule',
        message: validationMessage,
      })
      return
    }

    setSaving(true)

    const payload = {
      restaurant_id: restaurant.id,
      schedule_name: form.scheduleName.trim(),
      schedule_type: form.scheduleType,
      applies_to: form.appliesTo,
      item_id: form.appliesTo === 'item' ? form.itemId : null,
      category_id: form.appliesTo === 'category' ? form.categoryId : null,
      days_of_week: form.daysOfWeek,
      start_time: form.startTime,
      end_time: form.endTime,
      start_date: form.startDate || null,
      end_date: form.endDate || null,
      special_price:
        form.scheduleType === 'special_price' || form.scheduleType === 'happy_hour'
          ? nullableNumber(form.specialPrice)
          : null,
      discount_percent:
        form.scheduleType === 'happy_hour'
          ? nullableNumber(form.discountPercent)
          : null,
      banner_note: form.bannerNote.trim() || null,
      is_active: form.isActive,
    }

    const request = editingId
      ? supabase
          .from('restaurant_menu_schedules')
          .update(payload)
          .eq('id', editingId)
          .eq('restaurant_id', restaurant.id)
          .select(
            `
              *,
              item:menu_items (
                id,
                name,
                price
              ),
              category:menu_categories (
                id,
                name
              )
            `,
          )
          .single()
      : supabase
          .from('restaurant_menu_schedules')
          .insert(payload)
          .select(
            `
              *,
              item:menu_items (
                id,
                name,
                price
              ),
              category:menu_categories (
                id,
                name
              )
            `,
          )
          .single()

    const { data, error } = await request

    setSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Schedule not saved',
        message: error.message,
      })
      return
    }

    setSchedules((current) => {
      if (editingId) {
        return current.map((schedule) =>
          schedule.id === editingId ? data : schedule,
        )
      }

      return [data, ...current]
    })

    showToast({
      type: 'success',
      title: editingId ? 'Schedule updated' : 'Schedule created',
      message: `${data.schedule_name} is ready.`,
    })

    resetForm()
  }

  const toggleScheduleStatus = async (schedule) => {
    const nextStatus = !schedule.is_active

    setSchedules((current) =>
      current.map((item) =>
        item.id === schedule.id ? { ...item, is_active: nextStatus } : item,
      ),
    )

    const { error } = await supabase
      .from('restaurant_menu_schedules')
      .update({ is_active: nextStatus })
      .eq('id', schedule.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      setSchedules((current) =>
        current.map((item) =>
          item.id === schedule.id
            ? { ...item, is_active: schedule.is_active }
            : item,
        ),
      )
      showToast({
        type: 'error',
        title: 'Status update failed',
        message: error.message,
      })
    }
  }

  const deleteSchedule = async (schedule) => {
    const confirmed = await confirmAction({
      title: 'Delete schedule?',
      message: `${schedule.schedule_name} will be removed from menu scheduling.`,
      confirmText: 'Delete',
      cancelText: 'Keep',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('restaurant_menu_schedules')
      .update({ is_deleted: true, is_active: false })
      .eq('id', schedule.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Delete failed',
        message: error.message,
      })
      return
    }

    setSchedules((current) => current.filter((item) => item.id !== schedule.id))
  }

  return (
    <section className="menu-schedule-page">
      <div className="menu-schedule-hero">
        <div>
          <p className="pricing-label">Menu Schedule</p>
          <h2>Availability, happy hours and timed menu rules</h2>
          <span>
            Control breakfast/lunch menus, hide unavailable items and schedule
            happy hour offers without manually editing products every day.
          </span>
        </div>

        <div className="menu-schedule-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={loadSchedules}
            disabled={loading}
          >
            <RefreshCw size={17} />
            Refresh
          </button>

          <button type="button" className="primary-button" onClick={startCreate}>
            <Plus size={18} />
            Add Schedule
          </button>
        </div>
      </div>

      <div className="menu-schedule-stat-grid">
        <ScheduleStatCard label="Total rules" value={stats.total} icon={<CalendarClock />} />
        <ScheduleStatCard label="Active" value={stats.active} icon={<Eye />} />
        <ScheduleStatCard label="Happy hours" value={stats.happyHour} icon={<BadgePercent />} />
        <ScheduleStatCard label="Hidden rules" value={stats.hidden} icon={<EyeOff />} />
      </div>

      {showForm && (
        <form className="menu-schedule-form" onSubmit={saveSchedule}>
          <div className="menu-schedule-form-head">
            <div>
              <p className="pricing-label">
                {editingId ? 'Edit Schedule' : 'New Schedule'}
              </p>
              <h3>{editingId ? 'Update menu rule' : 'Create timed menu rule'}</h3>
            </div>

            <button type="button" className="tiny-button danger" onClick={resetForm}>
              <X size={15} />
              Close
            </button>
          </div>

          <div className="menu-schedule-field-grid">
            <label className="wide">
              Schedule name
              <input
                type="text"
                value={form.scheduleName}
                onChange={(event) => updateForm('scheduleName', event.target.value)}
                placeholder="Breakfast timing, Evening happy hour..."
              />
            </label>

            <label>
              Rule type
              <select
                value={form.scheduleType}
                onChange={(event) => updateForm('scheduleType', event.target.value)}
              >
                {scheduleTypes.map((type) => (
                  <option value={type.value} key={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Applies to
              <select
                value={form.appliesTo}
                onChange={(event) => updateForm('appliesTo', event.target.value)}
              >
                {appliesToOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {form.appliesTo === 'item' && (
              <label className="wide">
                Menu item
                <select
                  value={form.itemId}
                  onChange={(event) => updateForm('itemId', event.target.value)}
                >
                  <option value="">Select menu item</option>
                  {items.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name} • {currency} {Number(item.price || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {form.appliesTo === 'category' && (
              <label className="wide">
                Category
                <select
                  value={form.categoryId}
                  onChange={(event) => updateForm('categoryId', event.target.value)}
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="menu-schedule-time-card wide">
              <div>
                <strong>Active days</strong>
                <span>Select the week days when this rule should run.</span>
              </div>

              <div className="menu-schedule-day-row">
                {dayOptions.map((day) => (
                  <button
                    type="button"
                    key={day.value}
                    className={form.daysOfWeek.includes(day.value) ? 'active' : ''}
                    onClick={() => toggleDay(day.value)}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            <label>
              Start time
              <input
                type="time"
                value={form.startTime}
                onChange={(event) => updateForm('startTime', event.target.value)}
              />
            </label>

            <label>
              End time
              <input
                type="time"
                value={form.endTime}
                onChange={(event) => updateForm('endTime', event.target.value)}
              />
            </label>

            <label>
              Start date optional
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => updateForm('startDate', event.target.value)}
              />
            </label>

            <label>
              End date optional
              <input
                type="date"
                value={form.endDate}
                onChange={(event) => updateForm('endDate', event.target.value)}
              />
            </label>

            {form.scheduleType === 'special_price' && (
              <label>
                Special price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.specialPrice}
                  onChange={(event) => updateForm('specialPrice', event.target.value)}
                  placeholder="0.00"
                />
              </label>
            )}

            {form.scheduleType === 'happy_hour' && (
              <>
                <label>
                  Discount %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.discountPercent}
                    onChange={(event) =>
                      updateForm('discountPercent', event.target.value)
                    }
                    placeholder="20"
                  />
                </label>

                <label>
                  Optional special price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.specialPrice}
                    onChange={(event) => updateForm('specialPrice', event.target.value)}
                    placeholder="0.00"
                  />
                </label>
              </>
            )}

            <label className="wide">
              Customer note optional
              <textarea
                rows="3"
                value={form.bannerNote}
                onChange={(event) => updateForm('bannerNote', event.target.value)}
                placeholder="Example: Available only during breakfast hours."
              />
            </label>
          </div>

          <div className="menu-schedule-rule-tip">
            <Sparkles size={18} />
            <span>{getScheduleTypeHint(form.scheduleType)}</span>
          </div>

          <div className="menu-schedule-form-footer">
            <label className="menu-schedule-toggle">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => updateForm('isActive', event.target.checked)}
              />
              <span />
              Active rule
            </label>

            <button type="submit" className="primary-button" disabled={saving}>
              <Save size={18} />
              {saving ? 'Saving...' : editingId ? 'Update Schedule' : 'Save Schedule'}
            </button>
          </div>
        </form>
      )}

      <div className="menu-schedule-list-card">
        <div className="menu-schedule-list-head">
          <div>
            <p className="pricing-label">Scheduled Rules</p>
            <h3>Current menu automation</h3>
          </div>

          <div className="menu-schedule-filters">
            <div className="search-box">
              <Search size={17} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search schedule, item, category..."
              />
            </div>

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="all">All rules</option>
              {scheduleTypes.map((type) => (
                <option value={type.value} key={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Loading menu schedules...</div>
        ) : filteredSchedules.length === 0 ? (
          <div className="menu-schedule-empty">
            <Clock size={38} />
            <h3>No schedules found</h3>
            <p>
              Add your first breakfast timing, happy hour rule, hidden item rule
              or special price automation.
            </p>
          </div>
        ) : (
          <div className="menu-schedule-grid">
            {filteredSchedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                currency={currency}
                onEdit={startEdit}
                onToggleStatus={toggleScheduleStatus}
                onDelete={deleteSchedule}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function ScheduleStatCard({ label, value, icon }) {
  return (
    <div className="menu-schedule-stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ScheduleCard({ schedule, currency, onEdit, onToggleStatus, onDelete }) {
  return (
    <article className={`menu-schedule-card ${schedule.is_active ? 'active' : 'inactive'}`}>
      <div className="menu-schedule-card-head">
        <div>
          <span className={`menu-schedule-type ${schedule.schedule_type}`}>
            {getScheduleTypeLabel(schedule.schedule_type)}
          </span>
          <h4>{schedule.schedule_name}</h4>
        </div>

        <button
          type="button"
          className={`menu-schedule-status ${schedule.is_active ? 'active' : ''}`}
          onClick={() => onToggleStatus(schedule)}
        >
          {schedule.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
          {schedule.is_active ? 'Active' : 'Hidden'}
        </button>
      </div>

      <div className="menu-schedule-target-box">
        <strong>{getScheduleTarget(schedule)}</strong>
        <span>{getScheduleScopeLabel(schedule.applies_to)}</span>
      </div>

      <div className="menu-schedule-meta-grid">
        <div>
          <span>Days</span>
          <strong>{formatDays(schedule.days_of_week)}</strong>
        </div>
        <div>
          <span>Time</span>
          <strong>
            {formatTime(schedule.start_time)} - {formatTime(schedule.end_time)}
          </strong>
        </div>
        <div>
          <span>Date range</span>
          <strong>{formatDateRange(schedule.start_date, schedule.end_date)}</strong>
        </div>
        <div>
          <span>Price rule</span>
          <strong>{formatPriceRule(schedule, currency)}</strong>
        </div>
      </div>

      {schedule.banner_note && (
        <p className="menu-schedule-note">{schedule.banner_note}</p>
      )}

      <div className="menu-schedule-card-actions">
        <button type="button" className="secondary-button" onClick={() => onEdit(schedule)}>
          <Pencil size={16} />
          Edit
        </button>
        <button type="button" className="tiny-button danger" onClick={() => onDelete(schedule)}>
          <Trash2 size={15} />
          Delete
        </button>
      </div>
    </article>
  )
}

function getScheduleTypeLabel(value) {
  if (value === 'happy_hour') return 'Happy hour'
  if (value === 'special_price') return 'Special price'
  if (value === 'hide_item') return 'Hide item'
  return 'Availability'
}

function getScheduleTypeHint(value) {
  return scheduleTypes.find((type) => type.value === value)?.hint || ''
}

function getScheduleScopeLabel(value) {
  if (value === 'all_menu') return 'Full menu rule'
  if (value === 'category') return 'Category rule'
  return 'Item rule'
}

function getScheduleTarget(schedule) {
  if (schedule.applies_to === 'all_menu') return 'Full menu'
  if (schedule.applies_to === 'category') return schedule.category?.name || 'Category'
  return schedule.item?.name || 'Menu item'
}

function formatDays(days) {
  if (!Array.isArray(days) || days.length === 0) return 'No days'
  if (days.length === 7) return 'Every day'

  return days
    .map((day) => dayOptions.find((item) => item.value === Number(day))?.label)
    .filter(Boolean)
    .join(', ')
}

function formatTime(value) {
  if (!value) return '--:--'

  return String(value).slice(0, 5)
}

function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return 'Always'
  if (startDate && endDate) return `${startDate} → ${endDate}`
  if (startDate) return `From ${startDate}`
  return `Until ${endDate}`
}

function formatPriceRule(schedule, currency) {
  if (schedule.schedule_type === 'happy_hour') {
    return `${Number(schedule.discount_percent || 0).toFixed(0)}% off`
  }

  if (schedule.schedule_type === 'special_price') {
    return `${currency} ${Number(schedule.special_price || 0).toFixed(2)}`
  }

  if (schedule.schedule_type === 'hide_item') return 'Hidden during time'

  return 'Available during time'
}

function nullableNumber(value) {
  const numberValue = Number(value || 0)

  return numberValue > 0 ? numberValue : null
}

function normalizeTimeForInput(value) {
  if (!value) return ''

  return String(value).slice(0, 5)
}

export default MenuScheduleManagement
