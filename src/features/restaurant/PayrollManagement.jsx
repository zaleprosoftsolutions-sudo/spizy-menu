import { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  Users,
  WalletCards,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './PayrollManagement.css'

const emptyPayrollForm = {
  id: null,
  staff_id: '',
  salary_month: getCurrentMonthValue(),
  base_salary: '',
  allowances: '',
  bonus_amount: '',
  overtime_amount: '',
  deductions: '',
  advance_paid: '',
  paid_amount: '',
  payment_method: 'cash',
  status: 'pending',
  paid_at: '',
  notes: '',
}

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'online', label: 'Online' },
  { value: 'upi', label: 'UPI' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'other', label: 'Other' },
]

const statusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'partially_paid', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
]

function PayrollManagement({ restaurant }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [staffs, setStaffs] = useState([])
  const [records, setRecords] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyPayrollForm)
  const [message, setMessage] = useState('')

  const currency = restaurant?.currency || 'AED'

  const payrollPreview = useMemo(() => {
    return calculatePayrollValues(form)
  }, [form])

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return records.filter((record) => {
      const matchesStatus = statusFilter === 'all' || record.status === statusFilter

      if (!matchesStatus) return false
      if (!keyword) return true

      return [
        record.staff?.staff_name,
        record.staff?.staff_role,
        record.payment_method,
        record.status,
        record.notes,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [records, search, statusFilter])

  const summary = useMemo(() => {
    const activeRecords = records.filter((record) => record.status !== 'cancelled')
    const totalNet = activeRecords.reduce((sum, record) => sum + Number(record.net_pay || 0), 0)
    const totalPaid = activeRecords.reduce((sum, record) => sum + Number(record.paid_amount || 0), 0)
    const totalBalance = activeRecords.reduce((sum, record) => sum + Number(record.balance_amount || 0), 0)
    const paidCount = activeRecords.filter((record) => record.status === 'paid').length
    const pendingCount = activeRecords.filter((record) => record.status !== 'paid').length

    return {
      totalNet,
      totalPaid,
      totalBalance,
      paidCount,
      pendingCount,
      staffCount: staffs.length,
    }
  }, [records, staffs.length])

  useEffect(() => {
    loadPayroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id, selectedMonth])

  const loadPayroll = async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [{ data: staffData, error: staffError }, { data: payrollData, error: payrollError }] =
      await Promise.all([
        supabase
          .from('restaurant_staffs')
          .select('id, staff_name, staff_role, phone, email, is_active')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false)
          .order('staff_name', { ascending: true }),
        supabase
          .from('restaurant_payroll_records')
          .select(
            `
              *,
              staff:restaurant_staffs (
                id,
                staff_name,
                staff_role,
                phone,
                email
              )
            `,
          )
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false)
          .eq('salary_month', selectedMonth)
          .order('created_at', { ascending: false }),
      ])

    if (staffError || payrollError) {
      showMessage(staffError?.message || payrollError?.message || 'Unable to load payroll.')
    }

    setStaffs(staffData || [])
    setRecords(payrollData || [])
    setLoading(false)
  }

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const openNewForm = () => {
    setForm({
      ...emptyPayrollForm,
      salary_month: selectedMonth,
    })
    setFormOpen(true)
  }

  const openEditForm = (record) => {
    setForm({
      id: record.id,
      staff_id: record.staff_id || '',
      salary_month: record.salary_month || selectedMonth,
      base_salary: numberToInput(record.base_salary),
      allowances: numberToInput(record.allowances),
      bonus_amount: numberToInput(record.bonus_amount),
      overtime_amount: numberToInput(record.overtime_amount),
      deductions: numberToInput(record.deductions),
      advance_paid: numberToInput(record.advance_paid),
      paid_amount: numberToInput(record.paid_amount),
      payment_method: record.payment_method || 'cash',
      status: record.status || 'pending',
      paid_at: record.paid_at || '',
      notes: record.notes || '',
    })
    setFormOpen(true)
  }

  const handleSavePayroll = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    if (!form.staff_id) {
      showMessage('Please choose a staff member.')
      return
    }

    const calculated = calculatePayrollValues(form)
    const finalStatus = getFinalPayrollStatus(form.status, calculated)

    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()

    const payload = {
      restaurant_id: restaurant.id,
      staff_id: form.staff_id,
      salary_month: form.salary_month || selectedMonth,
      base_salary: toNumber(form.base_salary),
      allowances: toNumber(form.allowances),
      bonus_amount: toNumber(form.bonus_amount),
      overtime_amount: toNumber(form.overtime_amount),
      deductions: toNumber(form.deductions),
      advance_paid: toNumber(form.advance_paid),
      gross_pay: calculated.grossPay,
      net_pay: calculated.netPay,
      paid_amount: calculated.paidAmount,
      balance_amount: calculated.balanceAmount,
      payment_method: form.payment_method || 'cash',
      status: finalStatus,
      paid_at: finalStatus === 'paid' || calculated.paidAmount > 0 ? form.paid_at || getTodayDateValue() : null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }

    if (!form.id) {
      payload.created_by = userData?.user?.id || null
    }

    const query = form.id
      ? supabase.from('restaurant_payroll_records').update(payload).eq('id', form.id)
      : supabase.from('restaurant_payroll_records').insert(payload)

    const { error } = await query

    setSaving(false)

    if (error) {
      showMessage(error.message)
      return
    }

    setFormOpen(false)
    showMessage(form.id ? 'Payroll record updated.' : 'Payroll record saved.')
    await loadPayroll()
  }

  const handleMarkPaid = async (record) => {
    const { error } = await supabase
      .from('restaurant_payroll_records')
      .update({
        paid_amount: Number(record.net_pay || 0),
        balance_amount: 0,
        status: 'paid',
        paid_at: getTodayDateValue(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', record.id)

    if (error) {
      showMessage(error.message)
      return
    }

    setRecords((current) =>
      current.map((item) =>
        item.id === record.id
          ? {
              ...item,
              paid_amount: Number(record.net_pay || 0),
              balance_amount: 0,
              status: 'paid',
              paid_at: getTodayDateValue(),
            }
          : item,
      ),
    )
    showMessage('Marked as paid.')
  }

  const handleDeletePayroll = async (record) => {
    const { error } = await supabase
      .from('restaurant_payroll_records')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', record.id)

    if (error) {
      showMessage(error.message)
      return
    }

    setRecords((current) => current.filter((item) => item.id !== record.id))
    showMessage('Payroll record removed.')
  }

  const showMessage = (value) => {
    setMessage(value)
    window.setTimeout(() => setMessage(''), 2800)
  }

  return (
    <section className="payroll-page">
      {message && <div className="payroll-toast">{message}</div>}

      <div className="payroll-hero">
        <div>
          <p>Staff Finance</p>
          <h1>Payroll & Salary</h1>
          <span>
            Prepare monthly salary, track paid amount, balance and payout method.
          </span>
        </div>

        <div className="payroll-hero-actions">
          <label>
            Salary month
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value || getCurrentMonthValue())}
            />
          </label>

          <button type="button" className="payroll-refresh-button" onClick={loadPayroll}>
            <RefreshCcw size={17} />
            Refresh
          </button>

          <button type="button" className="payroll-primary-button" onClick={openNewForm}>
            <Plus size={18} />
            Add Salary
          </button>
        </div>
      </div>

      <div className="payroll-summary-grid">
        <PayrollSummaryCard
          icon={<CircleDollarSign size={21} />}
          label="Net payroll"
          value={`${currency} ${summary.totalNet.toFixed(2)}`}
          text={`${records.length} salary record${records.length === 1 ? '' : 's'}`}
        />
        <PayrollSummaryCard
          icon={<CheckCircle2 size={21} />}
          label="Paid"
          value={`${currency} ${summary.totalPaid.toFixed(2)}`}
          text={`${summary.paidCount} fully paid`}
        />
        <PayrollSummaryCard
          icon={<WalletCards size={21} />}
          label="Balance due"
          value={`${currency} ${summary.totalBalance.toFixed(2)}`}
          text={`${summary.pendingCount} pending / partial`}
        />
        <PayrollSummaryCard
          icon={<Users size={21} />}
          label="Active staff"
          value={summary.staffCount}
          text="From Staff module"
        />
      </div>

      <div className="payroll-toolbar">
        <div className="payroll-search">
          <Search size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search staff, role, notes..."
          />
        </div>

        <div className="payroll-filter-row">
          {['all', 'pending', 'partially_paid', 'paid', 'cancelled'].map((status) => (
            <button
              type="button"
              key={status}
              className={statusFilter === status ? 'active' : ''}
              onClick={() => setStatusFilter(status)}
            >
              {status === 'all' ? 'All' : formatPayrollStatus(status)}
            </button>
          ))}
        </div>
      </div>

      {formOpen && (
        <form className="payroll-form-card" onSubmit={handleSavePayroll}>
          <div className="payroll-form-head">
            <div>
              <p>{form.id ? 'Edit salary record' : 'New salary record'}</p>
              <h2>{form.id ? 'Update payroll' : 'Create payroll'}</h2>
            </div>

            <button type="button" onClick={() => setFormOpen(false)}>
              Close
            </button>
          </div>

          <div className="payroll-form-grid">
            <label>
              Staff member
              <select
                value={form.staff_id}
                onChange={(event) => updateForm('staff_id', event.target.value)}
              >
                <option value="">Choose staff</option>
                {staffs.map((staff) => (
                  <option value={staff.id} key={staff.id}>
                    {staff.staff_name} • {formatStaffRole(staff.staff_role)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Month
              <input
                type="month"
                value={form.salary_month}
                onChange={(event) => updateForm('salary_month', event.target.value)}
              />
            </label>

            <label>
              Base salary
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.base_salary}
                onChange={(event) => updateForm('base_salary', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Allowances
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.allowances}
                onChange={(event) => updateForm('allowances', event.target.value)}
                placeholder="Food / travel / other"
              />
            </label>

            <label>
              Bonus
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.bonus_amount}
                onChange={(event) => updateForm('bonus_amount', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Overtime
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.overtime_amount}
                onChange={(event) => updateForm('overtime_amount', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Deductions
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.deductions}
                onChange={(event) => updateForm('deductions', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Advance already paid
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.advance_paid}
                onChange={(event) => updateForm('advance_paid', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Paid now
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.paid_amount}
                onChange={(event) => updateForm('paid_amount', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Payment method
              <select
                value={form.payment_method}
                onChange={(event) => updateForm('payment_method', event.target.value)}
              >
                {paymentMethods.map((method) => (
                  <option value={method.value} key={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Status
              <select
                value={form.status}
                onChange={(event) => updateForm('status', event.target.value)}
              >
                {statusOptions.map((status) => (
                  <option value={status.value} key={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Paid date
              <input
                type="date"
                value={form.paid_at}
                onChange={(event) => updateForm('paid_at', event.target.value)}
              />
            </label>
          </div>

          <textarea
            value={form.notes}
            onChange={(event) => updateForm('notes', event.target.value)}
            placeholder="Notes about salary, deductions, advance or payout reference..."
            rows="3"
          />

          <div className="payroll-preview-row">
            <div>
              <span>Gross</span>
              <strong>{currency} {payrollPreview.grossPay.toFixed(2)}</strong>
            </div>
            <div>
              <span>Net pay</span>
              <strong>{currency} {payrollPreview.netPay.toFixed(2)}</strong>
            </div>
            <div>
              <span>Balance</span>
              <strong>{currency} {payrollPreview.balanceAmount.toFixed(2)}</strong>
            </div>
          </div>

          <div className="payroll-form-actions">
            <button type="button" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save Payroll'}
            </button>
          </div>
        </form>
      )}

      <div className="payroll-records-card">
        <div className="payroll-records-head">
          <div>
            <p>Salary records</p>
            <h2>{formatMonthTitle(selectedMonth)}</h2>
          </div>
          <span>{filteredRecords.length} record{filteredRecords.length === 1 ? '' : 's'}</span>
        </div>

        {loading ? (
          <div className="payroll-empty-state">Loading payroll...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="payroll-empty-state">
            No payroll records found for this month. Add staff salary to start tracking payouts.
          </div>
        ) : (
          <div className="payroll-record-list">
            {filteredRecords.map((record) => (
              <PayrollRecordRow
                record={record}
                currency={currency}
                onEdit={() => openEditForm(record)}
                onDelete={() => handleDeletePayroll(record)}
                onMarkPaid={() => handleMarkPaid(record)}
                key={record.id}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function PayrollSummaryCard({ icon, label, value, text }) {
  return (
    <article className="payroll-summary-card">
      <div className="payroll-summary-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{text}</small>
    </article>
  )
}

function PayrollRecordRow({ record, currency, onEdit, onDelete, onMarkPaid }) {
  return (
    <article className="payroll-record-row">
      <div className="payroll-staff-cell">
        <div className="payroll-staff-avatar">
          {record.staff?.staff_name?.slice(0, 2)?.toUpperCase() || 'ST'}
        </div>
        <div>
          <strong>{record.staff?.staff_name || 'Staff member'}</strong>
          <span>{formatStaffRole(record.staff?.staff_role)}</span>
          {record.staff?.phone && <small>{record.staff.phone}</small>}
        </div>
      </div>

      <div className="payroll-money-grid">
        <MoneyLabel label="Gross" value={record.gross_pay} currency={currency} />
        <MoneyLabel label="Net" value={record.net_pay} currency={currency} />
        <MoneyLabel label="Paid" value={record.paid_amount} currency={currency} />
        <MoneyLabel label="Balance" value={record.balance_amount} currency={currency} highlight />
      </div>

      <div className="payroll-record-meta">
        <span className={`payroll-status status-${record.status || 'pending'}`}>
          {formatPayrollStatus(record.status)}
        </span>
        <small>
          <CreditCard size={13} /> {formatPaymentMethod(record.payment_method)}
        </small>
        <small>
          <CalendarDays size={13} /> {record.paid_at ? formatDate(record.paid_at) : 'Not paid'}
        </small>
      </div>

      <div className="payroll-row-actions">
        {record.status !== 'paid' && record.status !== 'cancelled' && (
          <button type="button" className="mark-paid" onClick={onMarkPaid}>
            <Banknote size={15} /> Paid
          </button>
        )}
        <button type="button" onClick={onEdit}>
          <Pencil size={15} /> Edit
        </button>
        <button type="button" className="danger" onClick={onDelete}>
          <Trash2 size={15} /> Delete
        </button>
      </div>
    </article>
  )
}

function MoneyLabel({ label, value, currency, highlight = false }) {
  return (
    <div className={highlight ? 'highlight' : ''}>
      <span>{label}</span>
      <strong>{currency} {Number(value || 0).toFixed(2)}</strong>
    </div>
  )
}

function calculatePayrollValues(form) {
  const grossPay =
    toNumber(form.base_salary) +
    toNumber(form.allowances) +
    toNumber(form.bonus_amount) +
    toNumber(form.overtime_amount)

  const netPay = Math.max(
    grossPay - toNumber(form.deductions) - toNumber(form.advance_paid),
    0,
  )

  const paidAmount = Math.min(toNumber(form.paid_amount), netPay)
  const balanceAmount = Math.max(netPay - paidAmount, 0)

  return {
    grossPay,
    netPay,
    paidAmount,
    balanceAmount,
  }
}

function getFinalPayrollStatus(status, calculated) {
  if (status === 'cancelled') return 'cancelled'
  if (calculated.netPay <= 0) return 'paid'
  if (calculated.paidAmount >= calculated.netPay) return 'paid'
  if (calculated.paidAmount > 0) return 'partially_paid'
  return status === 'paid' ? 'pending' : status || 'pending'
}

function toNumber(value) {
  const numberValue = Number(value || 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function numberToInput(value) {
  const numberValue = Number(value || 0)
  return numberValue > 0 ? String(numberValue) : ''
}

function formatPayrollStatus(status) {
  if (status === 'partially_paid') return 'Partially paid'
  if (status === 'paid') return 'Paid'
  if (status === 'cancelled') return 'Cancelled'
  return 'Pending'
}

function formatStaffRole(role) {
  return String(role || 'staff')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatPaymentMethod(method) {
  if (method === 'bank') return 'Bank transfer'
  if (method === 'upi') return 'UPI'
  return String(method || 'cash')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value) {
  if (!value) return 'Not paid'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function formatMonthTitle(value) {
  if (!value) return 'Current month'

  try {
    const [year, month] = value.split('-')
    return new Intl.DateTimeFormat('en-AE', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(Number(year), Number(month) - 1, 1))
  } catch {
    return value
  }
}

function getCurrentMonthValue() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function getTodayDateValue() {
  return new Date().toISOString().slice(0, 10)
}

export default PayrollManagement
