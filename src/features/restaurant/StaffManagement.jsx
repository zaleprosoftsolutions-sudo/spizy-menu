import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Edit3,
  KeyRound,
  Plus,
  RefreshCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './StaffManagement.css'

const defaultPermissions = {
  pos: true,
  orders: true,
  menu: false,
  customers: false,
  reports: false,
  settings: false,
}

const roleOptions = [
  { value: 'manager', label: 'Manager' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'waiter', label: 'Waiter' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'staff', label: 'Staff' },
]

const permissionOptions = [
  { key: 'pos', label: 'POS / New orders' },
  { key: 'orders', label: 'Orders' },
  { key: 'menu', label: 'Menu items' },
  { key: 'customers', label: 'Customers & rewards' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
]

const emptyForm = {
  staff_name: '',
  email: '',
  phone: '',
  staff_role: 'staff',
  pin_code: '',
  notes: '',
  is_active: true,
  permissions: defaultPermissions,
}

function StaffManagement({ restaurant }) {
  const [staffs, setStaffs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const loadStaffs = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data } = await supabase
      .from('restaurant_staffs')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    setStaffs(data || [])
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadStaffs()
  }, [loadStaffs])

  const filteredStaffs = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return staffs

    return staffs.filter((staff) =>
      [staff.staff_name, staff.email, staff.phone, staff.staff_role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword)),
    )
  }, [search, staffs])

  const stats = useMemo(() => {
    const active = staffs.filter((staff) => staff.is_active).length
    const inactive = staffs.length - active
    const managers = staffs.filter((staff) => staff.staff_role === 'manager').length

    return {
      total: staffs.length,
      active,
      inactive,
      managers,
    }
  }, [staffs])

  const openCreateForm = () => {
    setEditingStaff(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const openEditForm = (staff) => {
    setEditingStaff(staff)
    setForm({
      staff_name: staff.staff_name || '',
      email: staff.email || '',
      phone: staff.phone || '',
      staff_role: staff.staff_role || 'staff',
      pin_code: staff.pin_code || '',
      notes: staff.notes || '',
      is_active: staff.is_active !== false,
      permissions: {
        ...defaultPermissions,
        ...(staff.permissions || {}),
      },
    })
    setShowForm(true)
  }

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const updatePermission = (key) => {
    setForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [key]: !current.permissions?.[key],
      },
    }))
  }

  const saveStaff = async () => {
    if (!restaurant?.id || !form.staff_name.trim()) return

    setSaving(true)

    const payload = {
      restaurant_id: restaurant.id,
      staff_name: form.staff_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      staff_role: form.staff_role || 'staff',
      pin_code: form.pin_code.trim() || null,
      notes: form.notes.trim() || null,
      is_active: Boolean(form.is_active),
      permissions: {
        ...defaultPermissions,
        ...(form.permissions || {}),
      },
      updated_at: new Date().toISOString(),
    }

    const request = editingStaff?.id
      ? supabase
          .from('restaurant_staffs')
          .update(payload)
          .eq('id', editingStaff.id)
          .select('*')
          .single()
      : supabase
          .from('restaurant_staffs')
          .insert(payload)
          .select('*')
          .single()

    const { data, error } = await request

    setSaving(false)

    if (error) return

    if (editingStaff?.id) {
      setStaffs((current) =>
        current.map((staff) => (staff.id === data.id ? data : staff)),
      )
    } else {
      setStaffs((current) => [data, ...current])
    }

    setShowForm(false)
    setEditingStaff(null)
    setForm(emptyForm)
  }

  const toggleStaffActive = async (staff) => {
    const { data, error } = await supabase
      .from('restaurant_staffs')
      .update({
        is_active: !staff.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', staff.id)
      .select('*')
      .single()

    if (error) return

    setStaffs((current) =>
      current.map((item) => (item.id === data.id ? data : item)),
    )
  }

  const softDeleteStaff = async (staff) => {
    const { error } = await supabase
      .from('restaurant_staffs')
      .update({
        is_deleted: true,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', staff.id)

    if (error) return

    setStaffs((current) => current.filter((item) => item.id !== staff.id))
  }

  if (loading) {
    return (
      <section className="management-section staff-screen">
        <div className="staff-empty-state">
          <Users size={36} />
          <h2>Loading staff...</h2>
          <p>Please wait while Spizy prepares staff records.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="management-section staff-screen">
      <header className="staff-header">
        <div>
          <p className="section-kicker">Staff</p>
          <h2>Staff access & permissions</h2>
          <span>
            Create staff profiles, assign POS/order permissions and prepare for
            future staff login.
          </span>
        </div>

        <div className="staff-header-actions">
          <button type="button" className="staff-light-button" onClick={loadStaffs}>
            <RefreshCcw size={16} />
            Refresh
          </button>

          <button type="button" className="staff-primary-button" onClick={openCreateForm}>
            <Plus size={16} />
            Add staff
          </button>
        </div>
      </header>

      <div className="staff-stats-grid">
        <StaffStat label="Total staff" value={stats.total} icon={Users} />
        <StaffStat label="Active" value={stats.active} icon={ShieldCheck} />
        <StaffStat label="Inactive" value={stats.inactive} icon={UserCog} />
        <StaffStat label="Managers" value={stats.managers} icon={KeyRound} />
      </div>

      <div className="staff-toolbar">
        <div className="staff-search">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search staff name, phone, email or role..."
          />
        </div>
      </div>

      {filteredStaffs.length === 0 ? (
        <div className="staff-empty-state">
          <Users size={36} />
          <h2>No staff found</h2>
          <p>Add cashier, waiter, kitchen, manager or delivery staff profiles.</p>
        </div>
      ) : (
        <div className="staff-table-card">
          <div className="staff-table-head">
            <span>Staff</span>
            <span>Role</span>
            <span>Permissions</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {filteredStaffs.map((staff) => (
            <StaffRow
              key={staff.id}
              staff={staff}
              onEdit={openEditForm}
              onToggle={toggleStaffActive}
              onDelete={softDeleteStaff}
            />
          ))}
        </div>
      )}

      {showForm && (
        <StaffFormModal
          form={form}
          editing={Boolean(editingStaff)}
          saving={saving}
          onClose={() => setShowForm(false)}
          onSave={saveStaff}
          onChange={updateForm}
          onPermissionChange={updatePermission}
        />
      )}
    </section>
  )
}

function StaffStat({ label, value, icon: Icon }) {
  return (
    <div className="staff-stat-card">
      <div>
        <Icon size={18} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StaffRow({ staff, onEdit, onToggle, onDelete }) {
  const permissions = {
    ...defaultPermissions,
    ...(staff.permissions || {}),
  }

  const activePermissions = permissionOptions
    .filter((permission) => permissions[permission.key])
    .map((permission) => permission.label)

  return (
    <article className="staff-row">
      <div className="staff-person-cell">
        <div className="staff-avatar">{getStaffInitials(staff.staff_name)}</div>
        <div>
          <strong>{staff.staff_name}</strong>
          <span>{staff.phone || 'No phone'}</span>
          {staff.email && <small>{staff.email}</small>}
        </div>
      </div>

      <div className="staff-role-cell">{formatStaffRole(staff.staff_role)}</div>

      <div className="staff-permission-cell">
        {activePermissions.length === 0 ? (
          <span>No access</span>
        ) : (
          activePermissions.slice(0, 3).map((permission) => (
            <span key={permission}>{permission}</span>
          ))
        )}
        {activePermissions.length > 3 && <small>+{activePermissions.length - 3} more</small>}
      </div>

      <button
        type="button"
        className={`staff-status-pill ${staff.is_active ? 'active' : 'inactive'}`}
        onClick={() => onToggle(staff)}
      >
        {staff.is_active ? 'Active' : 'Inactive'}
      </button>

      <div className="staff-action-cell">
        <button type="button" onClick={() => onEdit(staff)}>
          <Edit3 size={15} />
          Edit
        </button>

        <button type="button" className="danger" onClick={() => onDelete(staff)}>
          <Trash2 size={15} />
          Delete
        </button>
      </div>
    </article>
  )
}

function StaffFormModal({
  form,
  editing,
  saving,
  onClose,
  onSave,
  onChange,
  onPermissionChange,
}) {
  return (
    <div className="staff-modal-overlay" onClick={onClose}>
      <div className="staff-modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="staff-modal-head">
          <div>
            <p className="section-kicker">{editing ? 'Edit staff' : 'New staff'}</p>
            <h2>{editing ? 'Update staff profile' : 'Add staff member'}</h2>
            <span>
              This creates the staff profile and permission foundation. Login
              connection can be added in the next phase.
            </span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="staff-form-grid">
          <label>
            Staff name
            <input
              type="text"
              value={form.staff_name}
              onChange={(event) => onChange('staff_name', event.target.value)}
              placeholder="Example: Ahmed"
            />
          </label>

          <label>
            Role
            <select
              value={form.staff_role}
              onChange={(event) => onChange('staff_role', event.target.value)}
            >
              {roleOptions.map((role) => (
                <option value={role.value} key={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Phone
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => onChange('phone', event.target.value)}
              placeholder="+971..."
            />
          </label>

          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => onChange('email', event.target.value)}
              placeholder="staff@example.com"
            />
          </label>

          <label>
            Staff PIN
            <input
              type="text"
              value={form.pin_code}
              onChange={(event) => onChange('pin_code', event.target.value)}
              placeholder="Optional POS PIN"
              maxLength="8"
            />
          </label>

          <label>
            Status
            <select
              value={form.is_active ? 'active' : 'inactive'}
              onChange={(event) => onChange('is_active', event.target.value === 'active')}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <section className="staff-permissions-panel">
          <div>
            <strong>Permissions</strong>
            <span>Choose what this staff can access later.</span>
          </div>

          <div className="staff-permission-grid">
            {permissionOptions.map((permission) => (
              <button
                type="button"
                key={permission.key}
                className={form.permissions?.[permission.key] ? 'active' : ''}
                onClick={() => onPermissionChange(permission.key)}
              >
                <ShieldCheck size={16} />
                {permission.label}
              </button>
            ))}
          </div>
        </section>

        <label className="staff-notes-field">
          Notes
          <textarea
            value={form.notes}
            onChange={(event) => onChange('notes', event.target.value)}
            placeholder="Any internal notes about this staff member..."
            rows="3"
          />
        </label>

        <button
          type="button"
          className="staff-save-button"
          onClick={onSave}
          disabled={saving || !form.staff_name.trim()}
        >
          <Save size={16} />
          {saving ? 'Saving...' : editing ? 'Save changes' : 'Create staff'}
        </button>
      </div>
    </div>
  )
}

function getStaffInitials(name) {
  return String(name || 'ST')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function formatStaffRole(role) {
  return roleOptions.find((item) => item.value === role)?.label || 'Staff'
}

export default StaffManagement
