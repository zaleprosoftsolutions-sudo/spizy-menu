import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './StaffPermissionsReviewManagement.css'

const permissionKeys = [
  { key: 'pos', label: 'POS', description: 'Counter orders, floor, live sales actions' },
  { key: 'orders', label: 'Orders', description: 'Orders, kitchen, delivery, service requests' },
  { key: 'menu', label: 'Menu', description: 'Products, QR, recipes, inventory, purchases' },
  { key: 'customers', label: 'Customers', description: 'Rewards, CRM, campaigns, reviews' },
  { key: 'reports', label: 'Reports', description: 'Finance, reports, VAT, COGS, cash ledger' },
  { key: 'settings', label: 'Settings', description: 'Staff, subscription, profile, admin controls' },
]

const permissionPresets = [
  {
    key: 'waiter',
    label: 'Waiter',
    note: 'Can take orders and service table requests.',
    permissions: { pos: true, orders: true, menu: false, customers: false, reports: false, settings: false },
  },
  {
    key: 'cashier',
    label: 'Cashier',
    note: 'Can handle POS, orders, payments and shift close reports.',
    permissions: { pos: true, orders: true, menu: false, customers: false, reports: true, settings: false },
  },
  {
    key: 'kitchen',
    label: 'Kitchen',
    note: 'Can see orders and kitchen flow only.',
    permissions: { pos: false, orders: true, menu: false, customers: false, reports: false, settings: false },
  },
  {
    key: 'manager',
    label: 'Manager',
    note: 'Can run day operations, reports, menu and customers.',
    permissions: { pos: true, orders: true, menu: true, customers: true, reports: true, settings: false },
  },
  {
    key: 'accountant',
    label: 'Accountant',
    note: 'Can review finance, VAT, expenses and reports.',
    permissions: { pos: false, orders: false, menu: false, customers: false, reports: true, settings: false },
  },
  {
    key: 'admin_assistant',
    label: 'Admin assistant',
    note: 'Can help with menu, customers and basic settings.',
    permissions: { pos: false, orders: false, menu: true, customers: true, reports: false, settings: true },
  },
]

const sectionAccessGroups = [
  {
    title: 'Sales operations',
    rows: [
      { section: 'POS / floor', permissions: ['pos'] },
      { section: 'Orders / kitchen / delivery', permissions: ['orders'] },
      { section: 'Customer payments', permissions: ['orders', 'customers'] },
      { section: 'Day closing / shift closing', permissions: ['orders', 'reports'] },
    ],
  },
  {
    title: 'Menu and stock',
    rows: [
      { section: 'Products / QR / schedules / modifiers', permissions: ['menu'] },
      { section: 'Recipes / COGS / inventory / purchases', permissions: ['menu', 'reports'] },
      { section: 'Supplier payments', permissions: ['menu', 'reports'] },
    ],
  },
  {
    title: 'Finance and compliance',
    rows: [
      { section: 'Cash & Bank / finance / reports', permissions: ['reports'] },
      { section: 'VAT statutory / tax invoices', permissions: ['reports', 'settings'] },
      { section: 'Refund automation', permissions: ['orders', 'reports'] },
      { section: 'Subscription billing', permissions: ['settings'] },
    ],
  },
  {
    title: 'Growth and admin',
    rows: [
      { section: 'Customers / rewards / campaigns', permissions: ['customers'] },
      { section: 'Staff / payroll / permissions', permissions: ['settings'] },
      { section: 'Data export / activity logs', permissions: ['reports', 'settings'] },
    ],
  },
]

const defaultPermissions = permissionKeys.reduce((acc, item) => {
  acc[item.key] = false
  return acc
}, {})

function StaffPermissionsReviewManagement({ restaurant }) {
  const [loading, setLoading] = useState(true)
  const [savingStaffId, setSavingStaffId] = useState('')
  const [staffRows, setStaffRows] = useState([])
  const [message, setMessage] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')

  const loadStaff = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)
    setMessage(null)

    const { data, error } = await supabase
      .from('restaurant_staffs')
      .select('id, staff_name, email, staff_role, permissions, is_active, is_deleted, created_at, updated_at')
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('staff_name', { ascending: true })

    if (error) {
      setStaffRows([])
      setMessage({ type: 'error', text: error.message })
      setLoading(false)
      return
    }

    setStaffRows(data || [])
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadStaff()
  }, [loadStaff])

  const filteredStaffRows = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return staffRows.filter((staff) => {
      if (statusFilter === 'active' && staff.is_active === false) return false
      if (statusFilter === 'inactive' && staff.is_active !== false) return false

      if (!keyword) return true

      return [staff.staff_name, staff.email, staff.staff_role]
        .some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  }, [search, staffRows, statusFilter])

  const auditSummary = useMemo(
    () => buildPermissionAuditSummary(staffRows),
    [staffRows],
  )

  const updateStaffPermissions = async (staff, nextPermissions, successMessage = 'Permissions updated.') => {
    if (!staff?.id) return

    setSavingStaffId(staff.id)
    setMessage(null)

    const normalized = normalizePermissions(nextPermissions)

    const { error } = await supabase
      .from('restaurant_staffs')
      .update({ permissions: normalized })
      .eq('id', staff.id)
      .eq('restaurant_id', restaurant.id)

    setSavingStaffId('')

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }

    setStaffRows((current) =>
      current.map((row) =>
        row.id === staff.id ? { ...row, permissions: normalized } : row,
      ),
    )

    setMessage({ type: 'success', text: successMessage })
  }

  const toggleStaffPermission = (staff, permissionKey) => {
    const currentPermissions = normalizePermissions(staff.permissions)
    const nextPermissions = {
      ...currentPermissions,
      [permissionKey]: !currentPermissions[permissionKey],
    }

    updateStaffPermissions(staff, nextPermissions)
  }

  const applyPreset = (staff, preset) => {
    updateStaffPermissions(
      staff,
      preset.permissions,
      `${preset.label} permission preset applied to ${staff.staff_name || 'staff member'}.`,
    )
  }

  const exportCsv = () => {
    const csvRows = [
      [
        'Staff Name',
        'Email',
        'Role',
        'Active',
        ...permissionKeys.map((permission) => permission.label),
      ],
      ...filteredStaffRows.map((staff) => {
        const permissions = normalizePermissions(staff.permissions)
        return [
          staff.staff_name || '',
          staff.email || '',
          staff.staff_role || '',
          staff.is_active === false ? 'No' : 'Yes',
          ...permissionKeys.map((permission) => permissions[permission.key] ? 'Yes' : 'No'),
        ]
      }),
    ]

    downloadCsv(
      `spizy-staff-permissions-${restaurant?.slug || restaurant?.id || 'restaurant'}.csv`,
      csvRows,
    )
  }

  return (
    <section className="staff-permissions-review-shell">
      <div className="staff-permissions-hero">
        <div>
          <p className="pricing-label">Staff Access Control</p>
          <h1>Permissions Review</h1>
          <p>
            Review every staff member’s POS, orders, menu, customer, reports and settings access before production launch.
          </p>
        </div>

        <div className="staff-permissions-hero-actions">
          <button type="button" onClick={loadStaff} disabled={loading}>
            <RefreshCw size={17} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button type="button" onClick={exportCsv} disabled={filteredStaffRows.length === 0}>
            <Download size={17} />
            Export CSV
          </button>
        </div>
      </div>

      {message && (
        <div className={`staff-permissions-message ${message.type}`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="staff-permissions-kpi-grid">
        <PermissionKpiCard icon={<Users size={20} />} label="Total Staff" value={auditSummary.totalStaff} note="Non-deleted records" />
        <PermissionKpiCard icon={<CheckCircle2 size={20} />} label="Active Staff" value={auditSummary.activeStaff} note="Can login if linked" tone="good" />
        <PermissionKpiCard icon={<AlertTriangle size={20} />} label="Email Missing" value={auditSummary.emailMissing} note="Login link risk" tone={auditSummary.emailMissing > 0 ? 'warning' : 'good'} />
        <PermissionKpiCard icon={<ShieldCheck size={20} />} label="Settings Access" value={auditSummary.settingsAccess} note="Admin-level module access" tone={auditSummary.settingsAccess > 0 ? 'warning' : 'good'} />
      </div>

      <div className="staff-permissions-grid">
        <section className="staff-permissions-panel staff-permissions-main-panel">
          <div className="staff-permissions-panel-head">
            <div>
              <p className="pricing-label">Staff Matrix</p>
              <h2>Current access by staff member</h2>
            </div>

            <div className="staff-permissions-filters">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search staff, email or role..."
              />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="active">Active only</option>
                <option value="all">All staff</option>
                <option value="inactive">Inactive only</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="staff-permissions-loading">
              <RefreshCw size={20} />
              Loading staff permissions...
            </div>
          ) : filteredStaffRows.length === 0 ? (
            <div className="staff-permissions-empty">
              <UserCog size={20} />
              <span>No staff records found for this filter. Add staff from the Staff module first.</span>
            </div>
          ) : (
            <div className="staff-permissions-table-wrap">
              <table className="staff-permissions-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    {permissionKeys.map((permission) => (
                      <th key={permission.key}>{permission.label}</th>
                    ))}
                    <th>Presets</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaffRows.map((staff) => {
                    const permissions = normalizePermissions(staff.permissions)
                    const isSaving = savingStaffId === staff.id

                    return (
                      <tr key={staff.id} className={staff.is_active === false ? 'inactive' : ''}>
                        <td>
                          <strong>{staff.staff_name || 'Unnamed staff'}</strong>
                          <span>{staff.staff_role || 'Staff'} • {staff.email || 'Email missing'}</span>
                        </td>
                        {permissionKeys.map((permission) => (
                          <td key={permission.key}>
                            <button
                              type="button"
                              className={`staff-permission-toggle ${permissions[permission.key] ? 'enabled' : ''}`}
                              onClick={() => toggleStaffPermission(staff, permission.key)}
                              disabled={isSaving}
                              title={permission.description}
                            >
                              {permissions[permission.key] ? 'Yes' : 'No'}
                            </button>
                          </td>
                        ))}
                        <td>
                          <div className="staff-permissions-preset-row">
                            {permissionPresets.slice(0, 4).map((preset) => (
                              <button
                                type="button"
                                key={preset.key}
                                onClick={() => applyPreset(staff, preset)}
                                disabled={isSaving}
                              >
                                {isSaving ? <Save size={13} /> : null}
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="staff-permissions-side-stack">
          <section className="staff-permissions-panel">
            <div className="staff-permissions-panel-head compact">
              <div>
                <p className="pricing-label">Role Presets</p>
                <h2>Recommended access</h2>
              </div>
            </div>

            <div className="staff-permissions-preset-list">
              {permissionPresets.map((preset) => (
                <article key={preset.key}>
                  <strong>{preset.label}</strong>
                  <span>{preset.note}</span>
                  <small>
                    {permissionKeys
                      .filter((permission) => preset.permissions[permission.key])
                      .map((permission) => permission.label)
                      .join(' • ') || 'No module access'}
                  </small>
                </article>
              ))}
            </div>
          </section>

          <section className="staff-permissions-panel">
            <div className="staff-permissions-panel-head compact">
              <div>
                <p className="pricing-label">Module Logic</p>
                <h2>Permission map</h2>
              </div>
            </div>

            <div className="staff-permissions-section-map">
              {sectionAccessGroups.map((group) => (
                <div key={group.title}>
                  <h3>{group.title}</h3>
                  {group.rows.map((row) => (
                    <article key={row.section}>
                      <span>{row.section}</span>
                      <strong>{row.permissions.map(formatPermissionLabel).join(' / ')}</strong>
                    </article>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  )
}

function PermissionKpiCard({ icon, label, value, note, tone = 'neutral' }) {
  return (
    <article className={`staff-permissions-kpi-card ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function normalizePermissions(value) {
  if (!value || typeof value !== 'object') return { ...defaultPermissions }

  return {
    ...defaultPermissions,
    ...value,
  }
}

function buildPermissionAuditSummary(staffRows) {
  const rows = Array.isArray(staffRows) ? staffRows : []
  const activeRows = rows.filter((staff) => staff.is_active !== false)

  return {
    totalStaff: rows.length,
    activeStaff: activeRows.length,
    emailMissing: activeRows.filter((staff) => !String(staff.email || '').trim()).length,
    settingsAccess: activeRows.filter((staff) => normalizePermissions(staff.permissions).settings).length,
  }
}

function formatPermissionLabel(permissionKey) {
  return permissionKeys.find((permission) => permission.key === permissionKey)?.label || permissionKey
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default StaffPermissionsReviewManagement
