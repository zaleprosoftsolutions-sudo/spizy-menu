import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  Printer,
  RefreshCw,
  Save,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './StaffShiftClosingManagement.css'

const defaultShiftForm = {
  staff_id: '',
  staff_name: '',
  staff_role: '',
  shift_name: 'Main shift',
  opening_cash: '',
  cash_sales_recorded: '',
  card_collections: '',
  online_collections: '',
  expenses_paid: '',
  counted_cash: '',
  handover_notes: '',
}

function StaffShiftClosingManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => getTodayInputDate())
  const [staffList, setStaffList] = useState([])
  const [shiftClosings, setShiftClosings] = useState([])
  const [closingShift, setClosingShift] = useState(null)
  const [form, setForm] = useState(defaultShiftForm)

  const currency = restaurant?.currency || 'AED'

  const loadShiftData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [staffResult, shiftsResult] = await Promise.all([
      supabase
        .from('restaurant_staffs')
        .select('id, staff_name, staff_role, email, phone, is_active')
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .order('staff_name', { ascending: true }),
      supabase
        .from('restaurant_staff_shift_closings')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('shift_date', selectedDate)
        .eq('is_deleted', false)
        .order('opened_at', { ascending: false }),
    ])

    if (staffResult.error && staffResult.error.code !== '42P01') {
      showToast({
        type: 'error',
        title: 'Staff loading failed',
        message: staffResult.error.message,
      })
    }

    if (shiftsResult.error) {
      setShiftClosings([])
      if (shiftsResult.error.code !== '42P01') {
        showToast({
          type: 'error',
          title: 'Shift closing loading failed',
          message: shiftsResult.error.message,
        })
      }
    } else {
      setShiftClosings(shiftsResult.data || [])
    }

    setStaffList(staffResult.data || [])
    setLoading(false)
  }, [restaurant?.id, selectedDate, showToast])

  useEffect(() => {
    loadShiftData()
  }, [loadShiftData])

  const summary = useMemo(() => buildShiftSummary(shiftClosings), [shiftClosings])

  const selectedStaff = useMemo(
    () => staffList.find((staff) => staff.id === form.staff_id) || null,
    [form.staff_id, staffList],
  )

  const shiftPreview = useMemo(
    () => buildShiftCashPreview(form),
    [form],
  )

  const updateForm = (key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value }

      if (key === 'staff_id') {
        const staff = staffList.find((item) => item.id === value)
        next.staff_name = staff?.staff_name || ''
        next.staff_role = staff?.staff_role || ''
      }

      return next
    })
  }

  const resetForm = () => {
    setClosingShift(null)
    setForm(defaultShiftForm)
  }

  const handleOpenShift = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const staffName = (selectedStaff?.staff_name || form.staff_name || '').trim()

    if (!staffName) {
      showToast({
        type: 'warning',
        title: 'Staff name required',
        message: 'Select a staff member or enter cashier/waiter name before opening a shift.',
      })
      return
    }

    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()
    const openingCash = getSafeAmount(form.opening_cash)

    const { error } = await supabase.from('restaurant_staff_shift_closings').insert({
      restaurant_id: restaurant.id,
      staff_id: form.staff_id || null,
      staff_name: staffName,
      staff_role: selectedStaff?.staff_role || form.staff_role || null,
      shift_name: form.shift_name.trim() || 'Main shift',
      shift_date: selectedDate,
      status: 'open',
      opened_at: new Date().toISOString(),
      opening_cash: openingCash,
      cash_sales_recorded: 0,
      card_collections: 0,
      online_collections: 0,
      expenses_paid: 0,
      counted_cash: 0,
      expected_cash: openingCash,
      cash_variance: 0,
      handover_notes: form.handover_notes.trim() || null,
      created_by: userData?.user?.id || null,
    })

    setSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Shift opening failed',
        message: error.message,
      })
      return
    }

    resetForm()
    await loadShiftData()

    showToast({
      type: 'success',
      title: 'Shift opened',
      message: `${staffName} shift is now open for today.`,
    })
  }

  const startCloseShift = (shift) => {
    setClosingShift(shift)
    setForm({
      staff_id: shift.staff_id || '',
      staff_name: shift.staff_name || '',
      staff_role: shift.staff_role || '',
      shift_name: shift.shift_name || 'Main shift',
      opening_cash: numberToInput(shift.opening_cash),
      cash_sales_recorded: numberToInput(shift.cash_sales_recorded),
      card_collections: numberToInput(shift.card_collections),
      online_collections: numberToInput(shift.online_collections),
      expenses_paid: numberToInput(shift.expenses_paid),
      counted_cash: numberToInput(shift.counted_cash),
      handover_notes: shift.handover_notes || '',
    })
  }

  const handleCloseShift = async (event) => {
    event.preventDefault()

    if (!restaurant?.id || !closingShift?.id) return

    const countedCash = getSafeAmount(form.counted_cash)
    const preview = buildShiftCashPreview(form)

    const confirmed = await confirmAction({
      title: 'Close staff shift?',
      message: `Expected cash is ${formatMoney(currency, preview.expectedCash)} and counted cash is ${formatMoney(currency, countedCash)}. This will lock the shift as closed.`,
      confirmText: 'Close Shift',
      cancelText: 'Review Again',
      tone: preview.variance === 0 ? 'success' : 'warning',
    })

    if (!confirmed) return

    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('restaurant_staff_shift_closings')
      .update({
        staff_id: form.staff_id || closingShift.staff_id || null,
        staff_name: form.staff_name.trim() || closingShift.staff_name,
        staff_role: form.staff_role.trim() || closingShift.staff_role || null,
        shift_name: form.shift_name.trim() || closingShift.shift_name || 'Main shift',
        status: 'closed',
        closed_at: new Date().toISOString(),
        opening_cash: preview.openingCash,
        cash_sales_recorded: preview.cashSalesRecorded,
        card_collections: preview.cardCollections,
        online_collections: preview.onlineCollections,
        expenses_paid: preview.expensesPaid,
        counted_cash: countedCash,
        expected_cash: preview.expectedCash,
        cash_variance: preview.variance,
        handover_notes: form.handover_notes.trim() || null,
        closed_by: userData?.user?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', closingShift.id)
      .eq('restaurant_id', restaurant.id)

    setSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Shift closing failed',
        message: error.message,
      })
      return
    }

    resetForm()
    await loadShiftData()

    showToast({
      type: 'success',
      title: 'Shift closed',
      message:
        preview.variance === 0
          ? 'Shift closed with no cash variance.'
          : `Shift closed with variance ${formatMoney(currency, preview.variance)}.`,
    })
  }

  const printShiftReport = (shift) => {
    const html = buildShiftPrintHtml({ restaurant, shift, currency })
    const printWindow = window.open('', '_blank', 'width=920,height=720')

    if (!printWindow) {
      showToast({
        type: 'warning',
        title: 'Popup blocked',
        message: 'Allow popups to print the shift closing report.',
      })
      return
    }

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
  }

  const exportShiftCsv = () => {
    const headers = [
      'Shift Date',
      'Staff',
      'Role',
      'Shift',
      'Status',
      'Opening Cash',
      'Cash Sales',
      'Card Collections',
      'Online Collections',
      'Expenses Paid',
      'Expected Cash',
      'Counted Cash',
      'Variance',
      'Opened At',
      'Closed At',
      'Handover Notes',
    ]

    const rows = shiftClosings.map((shift) => [
      shift.shift_date,
      shift.staff_name,
      shift.staff_role,
      shift.shift_name,
      shift.status,
      shift.opening_cash,
      shift.cash_sales_recorded,
      shift.card_collections,
      shift.online_collections,
      shift.expenses_paid,
      shift.expected_cash,
      shift.counted_cash,
      shift.cash_variance,
      shift.opened_at,
      shift.closed_at,
      shift.handover_notes,
    ])

    downloadCsv(`spizy-shift-closing-${selectedDate}.csv`, [headers, ...rows])
  }

  return (
    <section className="staff-shift-page">
      <div className="staff-shift-hero">
        <div>
          <p className="pricing-label">Staff Shift Closing</p>
          <h1>Cashier / waiter shift handover</h1>
          <span>
            Open staff shifts, close cash drawer totals, capture variance and print a shift Z report before Day Closing.
          </span>
        </div>

        <div className="staff-shift-date-card">
          <label htmlFor="shift-date">Shift date</label>
          <input
            id="shift-date"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
          <button type="button" onClick={loadShiftData} disabled={loading}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <div className="staff-shift-metrics">
        <ShiftMetric icon={<Clock3 />} label="Open shifts" value={summary.openShiftCount} tone={summary.openShiftCount > 0 ? 'warning' : 'neutral'} />
        <ShiftMetric icon={<CheckCircle2 />} label="Closed shifts" value={summary.closedShiftCount} tone="success" />
        <ShiftMetric icon={<Banknote />} label="Expected cash" value={formatMoney(currency, summary.expectedCash)} />
        <ShiftMetric icon={<WalletCards />} label="Card / online" value={formatMoney(currency, summary.nonCashCollections)} />
        <ShiftMetric icon={<AlertTriangle />} label="Total variance" value={formatMoney(currency, summary.cashVariance)} tone={summary.cashVariance === 0 ? 'success' : 'warning'} />
      </div>

      <div className="staff-shift-layout">
        <form className="staff-shift-form" onSubmit={closingShift ? handleCloseShift : handleOpenShift}>
          <div className="staff-shift-form-head">
            <div>
              <p className="pricing-label">{closingShift ? 'Close Shift' : 'Open Shift'}</p>
              <h2>{closingShift ? closingShift.staff_name : 'Start staff cash drawer'}</h2>
            </div>
            {closingShift && (
              <button type="button" className="staff-shift-reset" onClick={resetForm}>
                <X size={16} />
                Cancel
              </button>
            )}
          </div>

          <label>
            Staff member
            <select value={form.staff_id} onChange={(event) => updateForm('staff_id', event.target.value)} disabled={Boolean(closingShift)}>
              <option value="">Manual staff name</option>
              {staffList.map((staff) => (
                <option value={staff.id} key={staff.id}>
                  {staff.staff_name} {staff.staff_role ? `• ${staff.staff_role}` : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="staff-shift-two-cols">
            <label>
              Staff name
              <input
                type="text"
                value={form.staff_name}
                onChange={(event) => updateForm('staff_name', event.target.value)}
                placeholder="Cashier / waiter name"
                disabled={Boolean(selectedStaff) || Boolean(closingShift?.staff_id)}
              />
            </label>

            <label>
              Role
              <input
                type="text"
                value={form.staff_role}
                onChange={(event) => updateForm('staff_role', event.target.value)}
                placeholder="Cashier / waiter"
                disabled={Boolean(selectedStaff) || Boolean(closingShift?.staff_id)}
              />
            </label>
          </div>

          <div className="staff-shift-two-cols">
            <label>
              Shift name
              <input
                type="text"
                value={form.shift_name}
                onChange={(event) => updateForm('shift_name', event.target.value)}
                placeholder="Morning / Evening / Counter 1"
              />
            </label>

            <label>
              Opening cash
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.opening_cash}
                onChange={(event) => updateForm('opening_cash', event.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>

          {closingShift && (
            <>
              <div className="staff-shift-two-cols">
                <label>
                  Cash sales / cash collected
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cash_sales_recorded}
                    onChange={(event) => updateForm('cash_sales_recorded', event.target.value)}
                    placeholder="0.00"
                  />
                </label>

                <label>
                  Expenses paid from drawer
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.expenses_paid}
                    onChange={(event) => updateForm('expenses_paid', event.target.value)}
                    placeholder="0.00"
                  />
                </label>
              </div>

              <div className="staff-shift-two-cols">
                <label>
                  Card collections
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.card_collections}
                    onChange={(event) => updateForm('card_collections', event.target.value)}
                    placeholder="0.00"
                  />
                </label>

                <label>
                  Online / wallet collections
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.online_collections}
                    onChange={(event) => updateForm('online_collections', event.target.value)}
                    placeholder="0.00"
                  />
                </label>
              </div>

              <div className="staff-shift-preview-box">
                <span>Expected cash</span>
                <strong>{formatMoney(currency, shiftPreview.expectedCash)}</strong>
                <small>Opening cash + cash sales - expenses paid</small>
              </div>

              <label>
                Counted cash at handover
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.counted_cash}
                  onChange={(event) => updateForm('counted_cash', event.target.value)}
                  placeholder="0.00"
                />
              </label>

              <div className={`staff-shift-variance ${shiftPreview.variance === 0 ? 'balanced' : 'warning'}`}>
                <span>Variance</span>
                <strong>{formatMoney(currency, shiftPreview.variance)}</strong>
              </div>
            </>
          )}

          <label>
            Handover notes
            <textarea
              rows="3"
              value={form.handover_notes}
              onChange={(event) => updateForm('handover_notes', event.target.value)}
              placeholder="Shortage reason, cash handed to manager, pending COD, printer issue, etc."
            />
          </label>

          <button type="submit" className="primary-button" disabled={saving}>
            {closingShift ? <ClipboardCheck size={18} /> : <Save size={18} />}
            {saving ? 'Saving...' : closingShift ? 'Close Shift' : 'Open Shift'}
          </button>
        </form>

        <div className="staff-shift-list-card">
          <div className="staff-shift-list-head">
            <div>
              <p className="pricing-label">Shift Z Reports</p>
              <h2>{formatDateLabel(selectedDate)}</h2>
            </div>

            <button type="button" className="secondary-button" onClick={exportShiftCsv} disabled={!shiftClosings.length}>
              <Download size={16} />
              Export CSV
            </button>
          </div>

          {loading ? (
            <div className="staff-shift-empty">
              <RefreshCw size={20} />
              <span>Loading staff shift closings...</span>
            </div>
          ) : shiftClosings.length === 0 ? (
            <div className="staff-shift-empty">
              <UserRound size={22} />
              <div>
                <strong>No shifts opened yet</strong>
                <span>Open cashier/waiter shift here before staff handover.</span>
              </div>
            </div>
          ) : (
            <div className="staff-shift-list">
              {shiftClosings.map((shift) => {
                const isClosed = shift.status === 'closed'
                const variance = Number(shift.cash_variance || 0)

                return (
                  <article className="staff-shift-row" key={shift.id}>
                    <div className="staff-shift-row-main">
                      <div className={`staff-shift-status ${isClosed ? 'closed' : 'open'}`}>
                        {isClosed ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}
                        {isClosed ? 'Closed' : 'Open'}
                      </div>

                      <div>
                        <h3>{shift.staff_name}</h3>
                        <span>{shift.shift_name || 'Shift'} • {shift.staff_role || 'Staff'} • Opened {formatTime(shift.opened_at)}</span>
                      </div>
                    </div>

                    <div className="staff-shift-row-grid">
                      <small>Expected <strong>{formatMoney(currency, shift.expected_cash)}</strong></small>
                      <small>Counted <strong>{formatMoney(currency, shift.counted_cash)}</strong></small>
                      <small className={variance === 0 ? 'ok' : 'warn'}>Variance <strong>{formatMoney(currency, variance)}</strong></small>
                    </div>

                    {shift.handover_notes && <p className="staff-shift-note">{shift.handover_notes}</p>}

                    <div className="staff-shift-actions">
                      {!isClosed && (
                        <button type="button" className="tiny-button" onClick={() => startCloseShift(shift)}>
                          Close / Handover
                        </button>
                      )}
                      <button type="button" className="tiny-button secondary" onClick={() => printShiftReport(shift)}>
                        <Printer size={14} />
                        Print Z
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function ShiftMetric({ icon, label, value, tone = 'neutral' }) {
  return (
    <article className={`staff-shift-metric ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function buildShiftSummary(shifts) {
  return shifts.reduce(
    (summary, shift) => {
      const isClosed = shift.status === 'closed'
      summary.openShiftCount += isClosed ? 0 : 1
      summary.closedShiftCount += isClosed ? 1 : 0
      summary.expectedCash += getSafeAmount(shift.expected_cash)
      summary.nonCashCollections += getSafeAmount(shift.card_collections) + getSafeAmount(shift.online_collections)
      summary.cashVariance += getSafeAmount(shift.cash_variance)
      return summary
    },
    {
      openShiftCount: 0,
      closedShiftCount: 0,
      expectedCash: 0,
      nonCashCollections: 0,
      cashVariance: 0,
    },
  )
}

function buildShiftCashPreview(form) {
  const openingCash = getSafeAmount(form.opening_cash)
  const cashSalesRecorded = getSafeAmount(form.cash_sales_recorded)
  const cardCollections = getSafeAmount(form.card_collections)
  const onlineCollections = getSafeAmount(form.online_collections)
  const expensesPaid = getSafeAmount(form.expenses_paid)
  const countedCash = getSafeAmount(form.counted_cash)
  const expectedCash = openingCash + cashSalesRecorded - expensesPaid

  return {
    openingCash,
    cashSalesRecorded,
    cardCollections,
    onlineCollections,
    expensesPaid,
    countedCash,
    expectedCash,
    variance: countedCash - expectedCash,
  }
}

function buildShiftPrintHtml({ restaurant, shift, currency }) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Shift Z Report - ${escapeHtml(shift.staff_name || 'Staff')}</title>
        <style>
          body { margin: 0; padding: 24px; background: #f4f4f5; color: #111827; font-family: Arial, sans-serif; }
          .report { max-width: 780px; margin: 0 auto; background: #fff; border-radius: 18px; padding: 26px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14); }
          .head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111827; padding-bottom: 16px; }
          h1, h2, p { margin: 0; }
          h1 { font-size: 22px; }
          h2 { margin-top: 6px; font-size: 18px; }
          .muted { color: #64748b; white-space: pre-line; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
          .metric { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; }
          .metric span { display: block; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
          .metric strong { display: block; margin-top: 8px; font-size: 17px; }
          .variance { background: #fff7ed; color: #9a3412; border-color: #fed7aa; }
          .variance.balanced { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
          .notes { border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px; margin-top: 18px; min-height: 70px; }
          .actions { margin-top: 22px; display: flex; gap: 10px; }
          button { padding: 10px 14px; border: 0; border-radius: 8px; color: #fff; background: #111; font-weight: 800; cursor: pointer; }
          @media print { body { padding: 12px; background: #fff; } .report { max-width: none; box-shadow: none; padding: 0; } .actions { display: none; } }
        </style>
      </head>
      <body>
        <div class="report">
          <div class="head">
            <div>
              <h1>${escapeHtml(restaurant?.name || 'Restaurant')}</h1>
              <p class="muted">${escapeHtml(restaurant?.address || '')}</p>
              <h2>Staff Shift Z Report</h2>
            </div>
            <div class="muted">
              Date: ${escapeHtml(formatDateLabel(shift.shift_date))}\nStaff: ${escapeHtml(shift.staff_name || 'Staff')}\nShift: ${escapeHtml(shift.shift_name || 'Shift')}\nStatus: ${escapeHtml(shift.status || 'open')}
            </div>
          </div>

          <div class="grid">
            <div class="metric"><span>Opening cash</span><strong>${escapeHtml(formatMoney(currency, shift.opening_cash))}</strong></div>
            <div class="metric"><span>Cash sales</span><strong>${escapeHtml(formatMoney(currency, shift.cash_sales_recorded))}</strong></div>
            <div class="metric"><span>Expenses paid</span><strong>${escapeHtml(formatMoney(currency, shift.expenses_paid))}</strong></div>
            <div class="metric"><span>Expected cash</span><strong>${escapeHtml(formatMoney(currency, shift.expected_cash))}</strong></div>
            <div class="metric"><span>Counted cash</span><strong>${escapeHtml(formatMoney(currency, shift.counted_cash))}</strong></div>
            <div class="metric variance ${Number(shift.cash_variance || 0) === 0 ? 'balanced' : ''}"><span>Variance</span><strong>${escapeHtml(formatMoney(currency, shift.cash_variance))}</strong></div>
            <div class="metric"><span>Card collections</span><strong>${escapeHtml(formatMoney(currency, shift.card_collections))}</strong></div>
            <div class="metric"><span>Online collections</span><strong>${escapeHtml(formatMoney(currency, shift.online_collections))}</strong></div>
            <div class="metric"><span>Closed at</span><strong>${escapeHtml(formatDateTime(shift.closed_at) || 'Not closed')}</strong></div>
          </div>

          <div class="notes">
            <strong>Handover Notes</strong>
            <p class="muted">${escapeHtml(shift.handover_notes || 'No handover notes added.')}</p>
          </div>

          <div class="actions">
            <button onclick="window.print()">Print Shift Z Report</button>
            <button onclick="window.close()">Close</button>
          </div>
        </div>
      </body>
    </html>
  `
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','))
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

function getTodayInputDate() {
  return new Date().toISOString().slice(0, 10)
}

function getSafeAmount(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? amount : 0
}

function numberToInput(value) {
  if (value === null || value === undefined || value === '') return ''
  return String(Number(value || 0))
}

function formatMoney(currency, amount) {
  return `${currency || 'AED'} ${Number(amount || 0).toFixed(2)}`
}

function formatDateLabel(value) {
  if (!value) return 'Today'
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

function formatTime(value) {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('en-AE', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

function formatDateTime(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export default StaffShiftClosingManagement
