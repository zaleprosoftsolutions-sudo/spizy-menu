import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Download,
  FileText,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  WalletCards,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './DayClosingManagement.css'
import './DayClosingPaymentSnapshot.css'
import './DayClosingPrintReport.css'

const paymentLabels = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  online: 'Online',
  cod: 'COD',
  bank: 'Bank',
  wallet: 'Wallet',
  other: 'Other',
}

const defaultClosingForm = {
  opening_cash: '',
  counted_cash: '',
  card_settlement: '',
  online_settlement: '',
  notes: '',
}

function DayClosingManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => getTodayInputDate())
  const [orders, setOrders] = useState([])
  const [payments, setPayments] = useState([])
  const [expenses, setExpenses] = useState([])
  const [existingClosing, setExistingClosing] = useState(null)
  const [paymentSnapshot, setPaymentSnapshot] = useState(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [cashBankPosting, setCashBankPosting] = useState(null)
  const [postingCashBank, setPostingCashBank] = useState(false)
  const [reversingCashBank, setReversingCashBank] = useState(false)
  const [form, setForm] = useState(defaultClosingForm)

  const currency = restaurant?.currency || 'AED'

  const loadClosingData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { startIso, endIso } = getDateRangeIso(selectedDate)

    const [
      ordersResult,
      paymentsResult,
      expensesResult,
      closingResult,
      paymentSnapshotResult,
      cashBankPostingResult,
    ] = await Promise.all([
        supabase
          .from('restaurant_orders')
          .select(
            'id, order_code, order_type, status, payment_method, payment_status, total_amount, paid_amount, created_at',
          )
          .eq('restaurant_id', restaurant.id)
          .gte('created_at', startIso)
          .lt('created_at', endIso)
          .order('created_at', { ascending: false }),
        supabase
          .from('restaurant_customer_payments')
          .select(
            'id, amount, payment_method, customer_name, customer_phone, received_at, is_void',
          )
          .eq('restaurant_id', restaurant.id)
          .gte('received_at', startIso)
          .lt('received_at', endIso)
          .eq('is_void', false)
          .order('received_at', { ascending: false }),
        supabase
          .from('restaurant_expenses')
          .select('id, title, total_amount, payment_method, expense_date, is_deleted')
          .eq('restaurant_id', restaurant.id)
          .eq('expense_date', selectedDate)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('restaurant_day_closings')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .eq('closing_date', selectedDate)
          .maybeSingle(),
        supabase
          .from('restaurant_day_closing_payment_snapshots')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .eq('closing_date', selectedDate)
          .maybeSingle(),
        supabase
          .from('restaurant_day_closing_cash_bank_postings')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .eq('closing_date', selectedDate)
          .maybeSingle(),
      ])

    if (ordersResult.error) {
      showToast({
        type: 'error',
        title: 'Orders loading failed',
        message: ordersResult.error.message,
      })
    }

    if (paymentsResult.error && paymentsResult.error.code !== '42P01') {
      showToast({
        type: 'error',
        title: 'Payments loading failed',
        message: paymentsResult.error.message,
      })
    }

    if (expensesResult.error && expensesResult.error.code !== '42P01') {
      showToast({
        type: 'error',
        title: 'Expenses loading failed',
        message: expensesResult.error.message,
      })
    }

    if (closingResult.error && closingResult.error.code !== 'PGRST116') {
      showToast({
        type: 'error',
        title: 'Day closing loading failed',
        message: closingResult.error.message,
      })
    }

    if (
      paymentSnapshotResult.error &&
      !['42P01', 'PGRST116'].includes(paymentSnapshotResult.error.code)
    ) {
      showToast({
        type: 'error',
        title: 'Payment snapshot loading failed',
        message: paymentSnapshotResult.error.message,
      })
    }

    if (
      cashBankPostingResult.error &&
      !['42P01', 'PGRST116'].includes(cashBankPostingResult.error.code)
    ) {
      showToast({
        type: 'error',
        title: 'Cash & Bank posting loading failed',
        message: cashBankPostingResult.error.message,
      })
    }

    setOrders(ordersResult.data || [])
    setPayments(paymentsResult.data || [])
    setExpenses(expensesResult.data || [])
    setExistingClosing(closingResult.data || null)
    setPaymentSnapshot(paymentSnapshotResult.data || null)
    setCashBankPosting(cashBankPostingResult.data || null)

    if (closingResult.data) {
      setForm({
        opening_cash: numberToInput(closingResult.data.opening_cash),
        counted_cash: numberToInput(closingResult.data.counted_cash),
        card_settlement: numberToInput(closingResult.data.card_settlement),
        online_settlement: numberToInput(closingResult.data.online_settlement),
        notes: closingResult.data.notes || '',
      })
    } else {
      setForm(defaultClosingForm)
    }

    setLoading(false)
  }, [restaurant?.id, selectedDate, showToast])

  useEffect(() => {
    loadClosingData()
  }, [loadClosingData])

  const summary = useMemo(() => {
    return buildDayClosingSummary({
      orders,
      payments,
      expenses,
      form,
    })
  }, [orders, payments, expenses, form])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const saveClosing = async (status = 'draft') => {
    if (!restaurant?.id) return

    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()

    const payload = {
      restaurant_id: restaurant.id,
      closing_date: selectedDate,
      status,
      opening_cash: summary.openingCash,
      cash_sales: summary.cashSales,
      cash_collections: summary.cashCollections,
      cash_expenses: summary.cashExpenses,
      expected_cash: summary.expectedCash,
      counted_cash: summary.countedCash,
      cash_difference: summary.cashDifference,
      card_total: summary.cardTotal,
      online_total: summary.onlineTotal,
      upi_total: summary.upiTotal,
      cod_total: summary.codTotal,
      card_settlement: summary.cardSettlement,
      online_settlement: summary.onlineSettlement,
      total_sales: summary.totalSales,
      total_collections: summary.totalCollections,
      total_expenses: summary.totalExpenses,
      total_orders: summary.totalOrders,
      notes: form.notes.trim() || null,
      closed_by: status === 'closed' ? userData?.user?.id || null : null,
      closed_at: status === 'closed' ? new Date().toISOString() : null,
    }

    const { data, error } = await supabase
      .from('restaurant_day_closings')
      .upsert(payload, { onConflict: 'restaurant_id,closing_date' })
      .select('*')
      .single()

    setSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Closing save failed',
        message: error.message,
      })
      return
    }

    setExistingClosing(data)

    showToast({
      type: 'success',
      title: status === 'closed' ? 'Day closed' : 'Draft saved',
      message:
        status === 'closed'
          ? 'Daily sales and cash closing saved successfully.'
          : 'Day closing draft saved successfully.',
    })
  }

  const createPaymentSnapshot = async () => {
    if (!restaurant?.id) return

    setSnapshotLoading(true)

    const { data, error } = await supabase.functions.invoke(
      'create-day-closing-payment-snapshot',
      {
        body: {
          restaurant_id: restaurant.id,
          closing_date: selectedDate,
        },
      },
    )

    setSnapshotLoading(false)

    if (error || data?.error) {
      showToast({
        type: 'error',
        title: 'Payment snapshot failed',
        message:
          data?.error ||
          error?.message ||
          'Unable to create payment snapshot for this day.',
      })
      return
    }

    setPaymentSnapshot(data?.snapshot || null)

    showToast({
      type: 'success',
      title: 'Payment snapshot updated',
      message:
        data?.message ||
        'Collected, pending, refund and gateway totals are now updated for this day.',
    })
  }

  const postClosingToCashBank = async () => {
    if (!restaurant?.id) return

    if (!paymentSnapshot?.id) {
      showToast({
        type: 'warning',
        title: 'Payment snapshot required',
        message: 'Create the payment snapshot first, then post the closing collection to Cash & Bank.',
      })
      return
    }

    setPostingCashBank(true)

    const { data, error } = await supabase.functions.invoke(
      'post-day-closing-to-cash-bank',
      {
        body: {
          restaurant_id: restaurant.id,
          closing_date: selectedDate,
        },
      },
    )

    setPostingCashBank(false)

    if (error || data?.error) {
      showToast({
        type: 'error',
        title: 'Cash & Bank posting failed',
        message:
          data?.error ||
          error?.message ||
          'Unable to post this day closing to Cash & Bank.',
      })
      return
    }

    setCashBankPosting(data?.posting || null)

    if (data?.snapshot) setPaymentSnapshot(data.snapshot)
    if (data?.closing) setExistingClosing(data.closing)

    showToast({
      type: data?.already_posted ? 'info' : 'success',
      title: data?.already_posted ? 'Already posted' : 'Posted to Cash & Bank',
      message:
        data?.message ||
        'Daily cash, card, online gateway and refund entries are now linked to Cash & Bank.',
    })
  }

  const reverseCashBankPosting = async () => {
    if (!restaurant?.id || cashBankPosting?.status !== 'posted') return

    const confirmed = await confirmAction({
      title: 'Reverse Cash & Bank posting?',
      message:
        'This will void the Day Closing ledger entries for this date and mark the posting as reversed. You can post again after correcting the closing or snapshot.',
      confirmText: 'Reverse posting',
      cancelText: 'Keep posted',
      danger: true,
    })

    if (!confirmed) return

    setReversingCashBank(true)

    const { data, error } = await supabase.functions.invoke(
      'reverse-day-closing-cash-bank-posting',
      {
        body: {
          restaurant_id: restaurant.id,
          closing_date: selectedDate,
          reason: 'Reversed from Day Closing screen before correction/reposting.',
        },
      },
    )

    setReversingCashBank(false)

    if (error || data?.error) {
      showToast({
        type: 'error',
        title: 'Cash & Bank reversal failed',
        message:
          data?.error ||
          error?.message ||
          'Unable to reverse this Day Closing posting.',
      })
      return
    }

    setCashBankPosting(data?.posting || null)

    if (data?.snapshot) setPaymentSnapshot(data.snapshot)
    if (data?.closing) setExistingClosing(data.closing)

    showToast({
      type: 'success',
      title: 'Posting reversed',
      message:
        data?.message ||
        'Cash & Bank entries from this Day Closing were voided and the day is ready for correction.',
    })
  }

  const exportCsv = () => {
    const lines = [
      ['Metric', 'Amount'],
      ['Date', selectedDate],
      ['Orders', summary.totalOrders],
      ['Total sales', summary.totalSales.toFixed(2)],
      ['Total collections', summary.totalCollections.toFixed(2)],
      ['Cash sales', summary.cashSales.toFixed(2)],
      ['Cash collections', summary.cashCollections.toFixed(2)],
      ['Cash expenses', summary.cashExpenses.toFixed(2)],
      ['Expected cash', summary.expectedCash.toFixed(2)],
      ['Counted cash', summary.countedCash.toFixed(2)],
      ['Difference', summary.cashDifference.toFixed(2)],
      ['Card total', summary.cardTotal.toFixed(2)],
      ['Online total', summary.onlineTotal.toFixed(2)],
      ['UPI total', summary.upiTotal.toFixed(2)],
      ['COD total', summary.codTotal.toFixed(2)],
      ['Expenses', summary.totalExpenses.toFixed(2)],
      ['Snapshot collected total', Number(paymentSnapshot?.collected_total || 0).toFixed(2)],
      ['Snapshot COD pending', Number(paymentSnapshot?.cod_pending || 0).toFixed(2)],
      ['Snapshot online pending', Number(paymentSnapshot?.online_pending || 0).toFixed(2)],
      ['Snapshot refunds', Number(paymentSnapshot?.refund_total || 0).toFixed(2)],
      ['Snapshot net collected', Number(paymentSnapshot?.net_collected || 0).toFixed(2)],
      ['Cash & Bank posting status', formatPostingStatus(cashBankPosting?.status)],
      ['Cash & Bank posted', cashBankPosting?.status === 'posted' ? 'Yes' : 'No'],
      ['Cash & Bank net posted', Number(cashBankPosting?.net_posted || 0).toFixed(2)],
      ['Cash & Bank reversed at', cashBankPosting?.reversed_at || ''],
    ]

    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `spizy-day-closing-${selectedDate}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const printZReport = () => {
    const reportWindow = window.open('', '_blank', 'width=460,height=780')

    if (!reportWindow) {
      showToast({
        type: 'error',
        title: 'Print blocked',
        message: 'Allow popups for this site and try printing the Z report again.',
      })
      return
    }

    reportWindow.document.write(
      buildZReportHtml({
        restaurant,
        selectedDate,
        currency,
        summary,
        paymentSnapshot,
        existingClosing,
        cashBankPosting,
        form,
        orders,
        payments,
        expenses,
      }),
    )
    reportWindow.document.close()
    reportWindow.focus()
  }

  if (!restaurant?.id) {
    return (
      <section className="management-section">
        <div className="empty-state">
          Restaurant profile not found. Please complete restaurant setup first.
        </div>
      </section>
    )
  }

  return (
    <section className="day-closing-page">
      <div className="day-closing-hero">
        <div>
          <p className="pricing-label">Day Closing</p>
          <h2>Cash drawer & Z report</h2>
          <span>
            Compare expected cash, counted cash, collections, expenses and sales for one business day.
          </span>
        </div>

        <div className="day-closing-actions">
          <label className="day-date-picker">
            <CalendarDays size={17} />
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>

          <button
            type="button"
            className="secondary-button"
            onClick={loadClosingData}
            disabled={loading}
          >
            <RefreshCw size={17} />
            Refresh
          </button>

          <button
            type="button"
            className="secondary-button day-snapshot-button"
            onClick={createPaymentSnapshot}
            disabled={loading || snapshotLoading}
          >
            <WalletCards size={17} />
            {snapshotLoading ? 'Updating snapshot...' : 'Payment Snapshot'}
          </button>

          <button
            type="button"
            className="secondary-button day-cash-bank-post-button"
            onClick={postClosingToCashBank}
            disabled={loading || postingCashBank || !paymentSnapshot?.id || cashBankPosting?.status === 'posted'}
          >
            <WalletCards size={17} />
            {postingCashBank
              ? 'Posting...'
              : cashBankPosting?.status === 'posted'
                ? 'Posted to Cash & Bank'
                : 'Post to Cash & Bank'}
          </button>

          {cashBankPosting?.status === 'posted' && (
            <button
              type="button"
              className="secondary-button day-cash-bank-reverse-button"
              onClick={reverseCashBankPosting}
              disabled={loading || reversingCashBank}
            >
              <RotateCcw size={17} />
              {reversingCashBank ? 'Reversing...' : 'Reverse Posting'}
            </button>
          )}
        </div>
      </div>

      <div className="day-status-strip">
        <div className={`day-status-pill ${existingClosing?.status || 'open'}`}>
          <CheckCircle2 size={17} />
          {existingClosing?.status === 'closed'
            ? 'Closed'
            : existingClosing?.status === 'draft'
              ? 'Draft saved'
              : 'Open day'}
        </div>

        <span>
          {existingClosing?.closed_at
            ? `Closed ${formatDateTime(existingClosing.closed_at)}`
            : 'Save a draft during the day or close after counting cash.'}
        </span>
      </div>

      <div
        className={`day-cash-bank-posting-strip ${cashBankPosting?.status === 'posted' ? 'posted' : ''} ${cashBankPosting?.status === 'reversed' ? 'reversed' : ''}`}
      >
        <div>
          <strong>{getPostingStripTitle(cashBankPosting)}</strong>
          <span>{getPostingStripMessage({ cashBankPosting, paymentSnapshot })}</span>
        </div>

        {cashBankPosting?.status === 'reversed' ? (
          <strong>Reversed</strong>
        ) : cashBankPosting?.net_posted !== undefined ? (
          <strong>{formatMoney(currency, cashBankPosting.net_posted)}</strong>
        ) : null}
      </div>

      <div className="day-closing-summary-grid">
        <DayMetricCard
          icon={<WalletCards size={20} />}
          label="Total sales"
          value={formatMoney(currency, summary.totalSales)}
          note={`${summary.totalOrders} order${summary.totalOrders === 1 ? '' : 's'}`}
        />
        <DayMetricCard
          icon={<Banknote size={20} />}
          label="Expected cash"
          value={formatMoney(currency, summary.expectedCash)}
          note="Opening + cash in - cash expenses"
          strong
        />
        <DayMetricCard
          icon={<ClipboardCheck size={20} />}
          label="Cash difference"
          value={formatMoney(currency, summary.cashDifference)}
          note={summary.cashDifference === 0 ? 'Balanced' : 'Check cash drawer'}
          warning={summary.cashDifference !== 0}
        />
        <DayMetricCard
          icon={<CreditCard size={20} />}
          label="Card / online / UPI"
          value={formatMoney(
            currency,
            summary.cardTotal + summary.onlineTotal + summary.upiTotal,
          )}
          note="Non-cash collections"
        />
      </div>

      <div className="day-payment-snapshot-panel">
        <div className="day-payment-snapshot-head">
          <div>
            <p className="pricing-label">Payment Snapshot</p>
            <h3>Collections, pending payments & refunds</h3>
            <span>
              Create a payment snapshot before closing the day to lock COD, online gateway, refund and net collection totals.
            </span>
          </div>

          <div className="day-payment-snapshot-status">
            <strong>{paymentSnapshot ? 'Snapshot ready' : 'No snapshot yet'}</strong>
            <span>{getSnapshotUpdatedLabel(paymentSnapshot)}</span>
          </div>
        </div>

        {paymentSnapshot ? (
          <>
            <div className="day-payment-snapshot-grid">
              <DaySnapshotCard
                label="Collected"
                value={formatMoney(currency, paymentSnapshot.collected_total)}
                note={`${Number(paymentSnapshot.paid_order_count || 0)} paid order${Number(paymentSnapshot.paid_order_count || 0) === 1 ? '' : 's'}`}
                strong
              />
              <DaySnapshotCard
                label="Net collected"
                value={formatMoney(currency, paymentSnapshot.net_collected)}
                note="Collected minus refunds"
                strong
              />
              <DaySnapshotCard
                label="COD pending"
                value={formatMoney(currency, paymentSnapshot.cod_pending)}
                note="Cash/card collection still pending"
                warning={Number(paymentSnapshot.cod_pending || 0) > 0}
              />
              <DaySnapshotCard
                label="Online pending"
                value={formatMoney(currency, paymentSnapshot.online_pending)}
                note="Gateway confirmation pending"
                warning={Number(paymentSnapshot.online_pending || 0) > 0}
              />
              <DaySnapshotCard
                label="Refunds"
                value={formatMoney(currency, paymentSnapshot.refund_total)}
                note={`${Number(paymentSnapshot.refund_count || 0)} refund record${Number(paymentSnapshot.refund_count || 0) === 1 ? '' : 's'}`}
                warning={Number(paymentSnapshot.refund_total || 0) > 0}
              />
            </div>

            <div className="day-payment-breakdown-grid">
              <DaySnapshotBreakdown
                title="Gateway / method breakdown"
                entries={getSnapshotBreakdownEntries(paymentSnapshot.gateway_breakdown)}
                currency={currency}
                emptyText="No paid gateway collections in this snapshot."
              />
              <DaySnapshotBreakdown
                title="Issues needing attention"
                entries={getSnapshotBreakdownEntries(paymentSnapshot.issue_breakdown)}
                currency={currency}
                emptyText="No pending payment issues found."
              />
            </div>
          </>
        ) : (
          <div className="day-payment-snapshot-empty">
            <WalletCards size={20} />
            <div>
              <strong>Create today’s payment snapshot</strong>
              <span>
                Use the Payment Snapshot button before Save Draft or Close Day to compare collected, pending, refunded and net payment totals.
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="day-closing-layout">
        <div className="day-closing-panel">
          <div className="day-panel-head">
            <div>
              <h3>Cash count</h3>
              <p>Enter opening and counted cash. Spizy calculates the difference instantly.</p>
            </div>
          </div>

          <div className="day-cash-grid">
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

            <label>
              Counted cash in drawer
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.counted_cash}
                onChange={(event) => updateForm('counted_cash', event.target.value)}
                placeholder="0.00"
              />
            </label>

            <label>
              Card settlement amount
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.card_settlement}
                onChange={(event) => updateForm('card_settlement', event.target.value)}
                placeholder="Optional"
              />
            </label>

            <label>
              Online gateway settlement
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.online_settlement}
                onChange={(event) => updateForm('online_settlement', event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="day-calculation-card">
            <div>
              <span>Cash sales</span>
              <strong>{formatMoney(currency, summary.cashSales)}</strong>
            </div>
            <div>
              <span>Customer cash collections</span>
              <strong>{formatMoney(currency, summary.cashCollections)}</strong>
            </div>
            <div>
              <span>Cash expenses</span>
              <strong>- {formatMoney(currency, summary.cashExpenses)}</strong>
            </div>
            <div className="total">
              <span>Expected drawer cash</span>
              <strong>{formatMoney(currency, summary.expectedCash)}</strong>
            </div>
          </div>

          <label className="day-notes-field">
            Manager notes
            <textarea
              value={form.notes}
              onChange={(event) => updateForm('notes', event.target.value)}
              placeholder="Cash shortage reason, settlement notes, handover details..."
              rows="4"
            />
          </label>

          <div className="day-save-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={exportCsv}
              disabled={loading}
            >
              <Download size={17} />
              Export CSV
            </button>

            <button
              type="button"
              className="secondary-button day-print-button"
              onClick={printZReport}
              disabled={loading}
            >
              <Printer size={17} />
              Print Z Report
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={() => saveClosing('draft')}
              disabled={saving || loading}
            >
              <Save size={17} />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>

            <button
              type="button"
              className="primary-button"
              onClick={() => saveClosing('closed')}
              disabled={saving || loading}
            >
              <ClipboardCheck size={17} />
              {saving ? 'Closing...' : 'Close Day'}
            </button>
          </div>
        </div>

        <div className="day-closing-panel compact">
          <div className="day-panel-head">
            <div>
              <h3>Collection split</h3>
              <p>Payment method summary for the selected day.</p>
            </div>
          </div>

          <div className="day-split-list">
            {summary.paymentSplits.map((split) => (
              <div className="day-split-row" key={split.method}>
                <div>
                  <strong>{paymentLabels[split.method] || split.method.toUpperCase()}</strong>
                  <span>{split.count} transaction{split.count === 1 ? '' : 's'}</span>
                </div>
                <strong>{formatMoney(currency, split.amount)}</strong>
              </div>
            ))}
          </div>

          <div className="day-mini-report">
            <FileText size={19} />
            <div>
              <strong>Z report note</strong>
              <span>
                This report is a management closing foundation. Later we can connect automatic account ledger posting, shift-wise closing and printable Z reports.
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="day-closing-panel full-width">
        <div className="day-panel-head">
          <div>
            <h3>Today’s closing details</h3>
            <p>Recent orders, customer payments and expense records used in this closing.</p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Loading day closing...</div>
        ) : (
          <div className="day-detail-grid">
            <DayDetailList
              title="Orders"
              items={orders.slice(0, 8).map((order) => ({
                id: order.id,
                title: order.order_code || 'Order',
                meta: `${formatOrderType(order.order_type)} • ${paymentLabels[order.payment_method] || order.payment_method || 'Payment'}`,
                amount: Number(order.total_amount || 0),
              }))}
              currency={currency}
              emptyText="No orders found for this date."
            />

            <DayDetailList
              title="Customer payments"
              items={payments.slice(0, 8).map((payment) => ({
                id: payment.id,
                title: payment.customer_name || payment.customer_phone || 'Customer payment',
                meta: `${paymentLabels[payment.payment_method] || payment.payment_method || 'Payment'} • ${formatDateTime(payment.received_at)}`,
                amount: Number(payment.amount || 0),
              }))}
              currency={currency}
              emptyText="No extra collections found for this date."
            />

            <DayDetailList
              title="Expenses"
              items={expenses.slice(0, 8).map((expense) => ({
                id: expense.id,
                title: expense.title || 'Expense',
                meta: paymentLabels[expense.payment_method] || expense.payment_method || 'Payment',
                amount: Number(expense.total_amount || 0),
                negative: true,
              }))}
              currency={currency}
              emptyText="No expenses found for this date."
            />
          </div>
        )}
      </div>
    </section>
  )
}

function DayMetricCard({ icon, label, value, note, strong = false, warning = false }) {
  return (
    <article className={`day-metric-card ${strong ? 'strong' : ''} ${warning ? 'warning' : ''}`}>
      <div className="day-metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function DaySnapshotCard({ label, value, note, strong = false, warning = false }) {
  return (
    <article className={`day-snapshot-card ${strong ? 'strong' : ''} ${warning ? 'warning' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function DaySnapshotBreakdown({ title, entries, currency, emptyText }) {
  return (
    <div className="day-snapshot-breakdown">
      <h4>{title}</h4>

      {entries.length === 0 ? (
        <div className="day-snapshot-breakdown-empty">{emptyText}</div>
      ) : (
        entries.map((entry) => (
          <div className="day-snapshot-breakdown-row" key={entry.key}>
            <div>
              <strong>{formatSnapshotKey(entry.key)}</strong>
              <span>{entry.count} record{entry.count === 1 ? '' : 's'}</span>
            </div>
            <strong>{formatMoney(currency, entry.amount)}</strong>
          </div>
        ))
      )}
    </div>
  )
}

function DayDetailList({ title, items, currency, emptyText }) {
  return (
    <div className="day-detail-list">
      <h4>{title}</h4>

      {items.length === 0 ? (
        <div className="day-detail-empty">{emptyText}</div>
      ) : (
        items.map((item) => (
          <div className="day-detail-row" key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <span>{item.meta}</span>
            </div>
            <strong className={item.negative ? 'negative' : ''}>
              {item.negative ? '- ' : ''}{formatMoney(currency, item.amount)}
            </strong>
          </div>
        ))
      )}
    </div>
  )
}

function buildDayClosingSummary({ orders, payments, expenses, form }) {
  const activeOrders = orders.filter(
    (order) => !['cancelled'].includes(String(order.status || '').toLowerCase()),
  )

  const totalOrders = activeOrders.length
  const totalSales = sumBy(activeOrders, 'total_amount')
  const totalExpenses = sumBy(expenses, 'total_amount')
  const openingCash = Number(form.opening_cash || 0)
  const countedCash = Number(form.counted_cash || 0)
  const cardSettlement = Number(form.card_settlement || 0)
  const onlineSettlement = Number(form.online_settlement || 0)

  const orderCollectionMap = new Map()
  const paymentCollectionMap = new Map()

  activeOrders.forEach((order) => {
    const method = order.payment_method || 'cash'
    const amount = order.payment_status === 'paid'
      ? Number(order.paid_amount || order.total_amount || 0)
      : 0

    if (amount > 0) {
      orderCollectionMap.set(method, Number(orderCollectionMap.get(method) || 0) + amount)
    }
  })

  payments.forEach((payment) => {
    const method = payment.payment_method || 'cash'
    const amount = Number(payment.amount || 0)

    if (amount > 0) {
      paymentCollectionMap.set(method, Number(paymentCollectionMap.get(method) || 0) + amount)
    }
  })

  const allMethods = new Set([
    ...Array.from(orderCollectionMap.keys()),
    ...Array.from(paymentCollectionMap.keys()),
  ])

  const paymentSplits = Array.from(allMethods)
    .map((method) => {
      const orderAmount = Number(orderCollectionMap.get(method) || 0)
      const paymentAmount = Number(paymentCollectionMap.get(method) || 0)
      const orderCount = activeOrders.filter(
        (order) => order.payment_method === method && order.payment_status === 'paid',
      ).length
      const paymentCount = payments.filter((payment) => payment.payment_method === method).length

      return {
        method,
        amount: orderAmount + paymentAmount,
        count: orderCount + paymentCount,
      }
    })
    .filter((split) => split.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  const cashSales = Number(orderCollectionMap.get('cash') || 0)
  const cashCollections = Number(paymentCollectionMap.get('cash') || 0)
  const cashExpenses = expenses
    .filter((expense) => expense.payment_method === 'cash')
    .reduce((total, expense) => total + Number(expense.total_amount || 0), 0)

  const cardTotal = Number(orderCollectionMap.get('card') || 0) + Number(paymentCollectionMap.get('card') || 0)
  const onlineTotal =
    Number(orderCollectionMap.get('online') || 0) +
    Number(paymentCollectionMap.get('online') || 0) +
    Number(orderCollectionMap.get('bank') || 0) +
    Number(paymentCollectionMap.get('bank') || 0) +
    Number(orderCollectionMap.get('wallet') || 0) +
    Number(paymentCollectionMap.get('wallet') || 0)
  const upiTotal = Number(orderCollectionMap.get('upi') || 0) + Number(paymentCollectionMap.get('upi') || 0)
  const codTotal = activeOrders
    .filter((order) => order.payment_method === 'cod' && order.payment_status !== 'paid')
    .reduce((total, order) => total + Number(order.total_amount || 0), 0)
  const totalCollections = paymentSplits.reduce((total, split) => total + split.amount, 0)
  const expectedCash = Math.max(openingCash + cashSales + cashCollections - cashExpenses, 0)
  const cashDifference = countedCash > 0 ? countedCash - expectedCash : 0

  return {
    totalOrders,
    totalSales,
    totalExpenses,
    openingCash,
    countedCash,
    cardSettlement,
    onlineSettlement,
    cashSales,
    cashCollections,
    cashExpenses,
    expectedCash,
    cashDifference,
    cardTotal,
    onlineTotal,
    upiTotal,
    codTotal,
    totalCollections,
    paymentSplits,
  }
}

function getSnapshotBreakdownEntries(value) {
  if (!value || typeof value !== 'object') return []

  return Object.entries(value)
    .map(([key, row]) => ({
      key,
      count: Number(row?.count || 0),
      amount: Number(row?.amount || 0),
    }))
    .filter((row) => row.count > 0 || row.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}

function formatSnapshotKey(value) {
  return String(value || 'Unknown')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getSnapshotUpdatedLabel(snapshot) {
  if (!snapshot?.updated_at && !snapshot?.created_at) {
    return 'Create one before closing the day'
  }

  return `Updated ${formatDateTime(snapshot.updated_at || snapshot.created_at)}`
}



function formatPostingStatus(status) {
  if (status === 'posted') return 'Posted'
  if (status === 'reversed') return 'Reversed'
  if (status === 'posting') return 'Posting'
  return 'Not posted'
}

function getPostingStripTitle(posting) {
  if (posting?.status === 'posted') return 'Cash & Bank posted'
  if (posting?.status === 'reversed') return 'Cash & Bank posting reversed'
  return 'Cash & Bank not posted'
}

function getPostingStripMessage({ cashBankPosting, paymentSnapshot }) {
  if (cashBankPosting?.status === 'posted') {
    return cashBankPosting?.posted_at
      ? `Posted ${formatDateTime(cashBankPosting.posted_at)}. Duplicate posting is blocked unless you reverse it first.`
      : 'Posted to Cash & Bank. Duplicate posting is blocked unless you reverse it first.'
  }

  if (cashBankPosting?.status === 'reversed') {
    return cashBankPosting?.reversed_at
      ? `Reversed ${formatDateTime(cashBankPosting.reversed_at)}. Correct the closing or snapshot, then post again.`
      : 'Posting was reversed. Correct the closing or snapshot, then post again.'
  }

  return paymentSnapshot
    ? 'Ready to post this day’s cash, card, online and refund entries to Cash & Bank.'
    : 'Create a payment snapshot first to enable Cash & Bank posting.'
}

function buildZReportHtml({
  restaurant,
  selectedDate,
  currency,
  summary,
  paymentSnapshot,
  existingClosing,
  cashBankPosting,
  form,
  orders,
  payments,
  expenses,
}) {
  const gatewayRows = getSnapshotBreakdownEntries(paymentSnapshot?.gateway_breakdown)
  const issueRows = getSnapshotBreakdownEntries(paymentSnapshot?.issue_breakdown)
  const statusLabel = existingClosing?.status === 'closed'
    ? 'Closed'
    : existingClosing?.status === 'draft'
      ? 'Draft'
      : 'Open'
  const snapshotLabel = paymentSnapshot
    ? getSnapshotUpdatedLabel(paymentSnapshot)
    : 'No payment snapshot created'

  return `
    <!doctype html>
    <html>
      <head>
        <title>Spizy Z Report - ${escapeHtml(selectedDate)}</title>
        <style>
          body {
            width: 320px;
            margin: 0 auto;
            padding: 14px;
            font-family: Arial, sans-serif;
            color: #111;
            background: #fff;
          }

          h1, h2, p {
            margin: 0;
            text-align: center;
          }

          h1 {
            font-size: 18px;
            letter-spacing: -0.02em;
          }

          h2 {
            margin-top: 4px;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
          }

          .muted {
            color: #555;
            font-size: 11px;
            line-height: 1.35;
          }

          .section {
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px dashed #999;
          }

          .section-title {
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 7px;
          }

          .row {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            padding: 4px 0;
            font-size: 12px;
          }

          .row strong {
            text-align: right;
            white-space: nowrap;
          }

          .grand {
            margin-top: 6px;
            padding-top: 8px;
            border-top: 2px solid #111;
            font-size: 14px;
            font-weight: 800;
          }

          .note {
            margin-top: 10px;
            padding: 8px;
            border: 1px dashed #999;
            font-size: 11px;
            white-space: pre-wrap;
          }

          .actions {
            margin-top: 16px;
            display: grid;
            gap: 8px;
          }

          button {
            width: 100%;
            padding: 10px;
            border: 0;
            border-radius: 8px;
            color: #fff;
            background: #111;
            font-weight: 800;
            cursor: pointer;
          }

          @media print {
            body {
              width: 72mm;
              padding: 4mm;
            }

            .actions {
              display: none;
            }
          }
        </style>
      </head>

      <body>
        <h1>${escapeHtml(restaurant?.name || 'Restaurant')}</h1>
        <p class="muted">${escapeHtml(restaurant?.address || '')}</p>
        <h2>Z Report / Day Closing</h2>
        <p class="muted">Date: ${escapeHtml(selectedDate)} • Status: ${escapeHtml(statusLabel)}</p>
        <p class="muted">Printed: ${escapeHtml(formatDateTime(new Date().toISOString()))}</p>

        <div class="section">
          <div class="section-title">Sales Summary</div>
          ${printRow('Total orders', summary.totalOrders)}
          ${printRow('Total sales', formatMoney(currency, summary.totalSales))}
          ${printRow('Total collections', formatMoney(currency, summary.totalCollections))}
          ${printRow('Total expenses', formatMoney(currency, summary.totalExpenses))}
        </div>

        <div class="section">
          <div class="section-title">Cash Drawer</div>
          ${printRow('Opening cash', formatMoney(currency, summary.openingCash))}
          ${printRow('Cash sales', formatMoney(currency, summary.cashSales))}
          ${printRow('Cash collections', formatMoney(currency, summary.cashCollections))}
          ${printRow('Cash expenses', `- ${formatMoney(currency, summary.cashExpenses)}`)}
          ${printRow('Expected cash', formatMoney(currency, summary.expectedCash))}
          ${printRow('Counted cash', formatMoney(currency, summary.countedCash))}
          ${printRow('Difference', formatMoney(currency, summary.cashDifference), true)}
        </div>

        <div class="section">
          <div class="section-title">Payment Snapshot</div>
          <p class="muted" style="text-align:left;margin-bottom:6px;">${escapeHtml(snapshotLabel)}</p>
          ${printRow('Collected', formatMoney(currency, paymentSnapshot?.collected_total || 0))}
          ${printRow('Net collected', formatMoney(currency, paymentSnapshot?.net_collected || 0))}
          ${printRow('COD pending', formatMoney(currency, paymentSnapshot?.cod_pending || 0))}
          ${printRow('Online pending', formatMoney(currency, paymentSnapshot?.online_pending || 0))}
          ${printRow('Refunds', formatMoney(currency, paymentSnapshot?.refund_total || 0))}
        </div>

        <div class="section">
          <div class="section-title">Collection Split</div>
          ${summary.paymentSplits.length ? summary.paymentSplits.map((split) => printRow(paymentLabels[split.method] || formatSnapshotKey(split.method), formatMoney(currency, split.amount))).join('') : '<p class="muted" style="text-align:left;">No paid collections found.</p>'}
        </div>

        <div class="section">
          <div class="section-title">Gateway Breakdown</div>
          ${gatewayRows.length ? gatewayRows.map((row) => printRow(`${formatSnapshotKey(row.key)} (${row.count})`, formatMoney(currency, row.amount))).join('') : '<p class="muted" style="text-align:left;">No gateway breakdown available.</p>'}
        </div>

        <div class="section">
          <div class="section-title">Issues Needing Attention</div>
          ${issueRows.length ? issueRows.map((row) => printRow(`${formatSnapshotKey(row.key)} (${row.count})`, formatMoney(currency, row.amount))).join('') : '<p class="muted" style="text-align:left;">No payment issues found.</p>'}
        </div>

        <div class="section">
          <div class="section-title">Record Counts</div>
          ${printRow('Orders loaded', orders.length)}
          ${printRow('Customer payments', payments.length)}
          ${printRow('Expenses', expenses.length)}
          ${printRow('Card settlement', formatMoney(currency, summary.cardSettlement))}
          ${printRow('Online settlement', formatMoney(currency, summary.onlineSettlement))}
        </div>

        <div class="section">
          <div class="section-title">Cash & Bank Posting</div>
          ${printRow('Posting status', formatPostingStatus(cashBankPosting?.status))}
          ${printRow('Net posted', formatMoney(currency, cashBankPosting?.net_posted || 0))}
          ${cashBankPosting?.posted_at ? printRow('Posted at', formatDateTime(cashBankPosting.posted_at)) : ''}
          ${cashBankPosting?.reversed_at ? printRow('Reversed at', formatDateTime(cashBankPosting.reversed_at)) : ''}
        </div>

        ${form.notes?.trim() ? `<div class="note"><strong>Manager notes</strong><br/>${escapeHtml(form.notes.trim())}</div>` : ''}

        <div class="section grand">
          ${printRow('Net closing amount', formatMoney(currency, paymentSnapshot?.net_collected || summary.totalCollections))}
        </div>

        <p class="muted" style="margin-top:12px;">Generated by Spizy Menu</p>

        <div class="actions">
          <button onclick="window.print()">Print Z Report</button>
          <button onclick="window.close()">Close</button>
        </div>
      </body>
    </html>
  `
}

function printRow(label, value, grand = false) {
  return `
    <div class="row ${grand ? 'grand' : ''}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function sumBy(items, key) {
  return items.reduce((total, item) => total + Number(item?.[key] || 0), 0)
}

function getTodayInputDate() {
  return new Date().toISOString().slice(0, 10)
}

function getDateRangeIso(dateValue) {
  const start = new Date(`${dateValue}T00:00:00`)
  const end = new Date(start)
  end.setDate(start.getDate() + 1)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

function numberToInput(value) {
  const numberValue = Number(value || 0)

  return numberValue > 0 ? String(numberValue) : ''
}

function formatMoney(currency, amount) {
  return `${currency || 'AED'} ${Number(amount || 0).toFixed(2)}`
}

function formatDateTime(value) {
  if (!value) return 'Just now'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Just now'
  }
}

function formatOrderType(type) {
  if (type === 'dine_in') return 'Dine-in'
  if (type === 'delivery') return 'Delivery'
  return 'Counter'
}

export default DayClosingManagement
