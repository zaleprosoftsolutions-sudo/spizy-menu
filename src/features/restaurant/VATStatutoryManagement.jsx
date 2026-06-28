import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Download,
  FileText,
  Lock,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './VATStatutoryManagement.css'

const defaultVatSettings = {
  tax_registration_number: '',
  tax_invoice_prefix: 'SPZ',
  tax_invoice_next_number: '1',
  tax_invoice_number_padding: '5',
  vat_pricing_mode: 'tax_inclusive',
  vat_return_frequency: 'quarterly',
  vat_accountant_email: '',
  default_tax_rate: '5',
}

const vatCategories = [
  { key: 'standard', label: 'Standard rated', rate: 5, note: 'Normal UAE VAT taxable sales.' },
  { key: 'zero_rated', label: 'Zero-rated', rate: 0, note: 'Eligible zero-rated supply.' },
  { key: 'exempt', label: 'Exempt', rate: 0, note: 'Exempt supply, no output VAT.' },
  { key: 'out_of_scope', label: 'Out of scope', rate: 0, note: 'Not part of UAE VAT return.' },
]

function VATStatutoryManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingPeriod, setSavingPeriod] = useState(false)
  const [orders, setOrders] = useState([])
  const [inputTaxRecords, setInputTaxRecords] = useState([])
  const [periodRecord, setPeriodRecord] = useState(null)
  const [settings, setSettings] = useState(defaultVatSettings)
  const [periodStart, setPeriodStart] = useState(() => getQuarterStartDate())
  const [periodEnd, setPeriodEnd] = useState(() => getQuarterEndDate())
  const [message, setMessage] = useState('')

  const currency = restaurant?.currency || 'AED'

  const loadVatData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)
    setMessage('')

    const { startIso, endIso } = getDateRangeIso(periodStart, periodEnd)

    const [restaurantResult, ordersResult, inputTaxResult, periodResult] = await Promise.all([
      supabase
        .from('restaurants')
        .select(
          `
            id,
            tax_registration_number,
            tax_invoice_prefix,
            tax_invoice_next_number,
            tax_invoice_number_padding,
            vat_pricing_mode,
            vat_return_frequency,
            vat_accountant_email,
            tax_rate
          `,
        )
        .eq('id', restaurant.id)
        .maybeSingle(),
      supabase
        .from('restaurant_orders')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true }),
      supabase
        .from('restaurant_purchase_tax_records')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .gte('purchase_date', periodStart)
        .lte('purchase_date', periodEnd)
        .eq('is_voided', false)
        .order('purchase_date', { ascending: true }),
      supabase
        .from('restaurant_vat_filing_periods')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .maybeSingle(),
    ])

    const errors = [
      normalizeLoadError('Restaurant VAT settings', restaurantResult.error),
      normalizeLoadError('Orders', ordersResult.error),
      normalizeLoadError('Input tax records', inputTaxResult.error),
      normalizeLoadError('VAT filing period', periodResult.error),
    ].filter(Boolean)

    if (errors.length > 0) setMessage(errors.join(' • '))

    const restaurantData = restaurantResult.data || {}

    setSettings({
      tax_registration_number: restaurantData.tax_registration_number || '',
      tax_invoice_prefix: restaurantData.tax_invoice_prefix || 'SPZ',
      tax_invoice_next_number: String(restaurantData.tax_invoice_next_number || 1),
      tax_invoice_number_padding: String(restaurantData.tax_invoice_number_padding || 5),
      vat_pricing_mode: restaurantData.vat_pricing_mode || 'tax_inclusive',
      vat_return_frequency: restaurantData.vat_return_frequency || 'quarterly',
      vat_accountant_email: restaurantData.vat_accountant_email || '',
      default_tax_rate: String(restaurantData.tax_rate ?? 5),
    })

    setOrders(ordersResult.data || [])
    setInputTaxRecords(inputTaxResult.data || [])
    setPeriodRecord(periodResult.data || null)
    setLoading(false)
  }, [periodEnd, periodStart, restaurant?.id])

  useEffect(() => {
    loadVatData()
  }, [loadVatData])

  const vatSummary = useMemo(
    () =>
      buildVatSummary({
        orders,
        inputTaxRecords,
        taxRate: Number(settings.default_tax_rate || 5),
        pricingMode: settings.vat_pricing_mode,
      }),
    [inputTaxRecords, orders, settings.default_tax_rate, settings.vat_pricing_mode],
  )

  const readiness = useMemo(
    () =>
      buildVatReadiness({
        settings,
        periodRecord,
        vatSummary,
      }),
    [periodRecord, settings, vatSummary],
  )

  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  const saveVatSettings = async (event) => {
    event.preventDefault()
    if (!restaurant?.id) return

    setSavingSettings(true)

    const payload = {
      tax_registration_number: settings.tax_registration_number.trim() || null,
      tax_invoice_prefix: settings.tax_invoice_prefix.trim() || 'SPZ',
      tax_invoice_next_number: Math.max(Number(settings.tax_invoice_next_number || 1), 1),
      tax_invoice_number_padding: Math.min(Math.max(Number(settings.tax_invoice_number_padding || 5), 3), 10),
      vat_pricing_mode: settings.vat_pricing_mode,
      vat_return_frequency: settings.vat_return_frequency,
      vat_accountant_email: settings.vat_accountant_email.trim() || null,
      tax_rate: Number(settings.default_tax_rate || 5),
    }

    const { error } = await supabase
      .from('restaurants')
      .update(payload)
      .eq('id', restaurant.id)

    setSavingSettings(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'VAT settings failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'VAT settings saved',
      message: 'TRN, invoice numbering and VAT settings were updated.',
    })

    await loadVatData()
  }

  const savePeriod = async (status) => {
    if (!restaurant?.id) return

    if (status === 'closed') {
      const confirmed = await confirmAction({
        title: 'Close VAT period?',
        message: 'This locks the period for owner/accountant review. You can reopen it later if corrections are required.',
        confirmLabel: 'Close period',
        cancelLabel: 'Keep open',
        tone: 'warning',
      })

      if (!confirmed) return
    }

    setSavingPeriod(true)

    const { data: userData } = await supabase.auth.getUser()
    const nowIso = new Date().toISOString()

    const payload = {
      restaurant_id: restaurant.id,
      period_start: periodStart,
      period_end: periodEnd,
      status,
      currency,
      trn: settings.tax_registration_number.trim() || null,
      pricing_mode: settings.vat_pricing_mode,
      taxable_sales: vatSummary.taxableSales,
      zero_rated_sales: vatSummary.zeroRatedSales,
      exempt_sales: vatSummary.exemptSales,
      output_tax: vatSummary.outputTax,
      input_tax: vatSummary.inputTax,
      estimated_vat_payable: vatSummary.vatPayable,
      total_sales_gross: vatSummary.grossSales,
      total_purchase_gross: vatSummary.purchaseGross,
      return_payload: buildVatReturnPayload({ vatSummary, settings, periodStart, periodEnd }),
      reviewed_by: status === 'reviewed' ? userData?.user?.id || null : periodRecord?.reviewed_by || null,
      reviewed_at: status === 'reviewed' ? nowIso : periodRecord?.reviewed_at || null,
      closed_by: status === 'closed' ? userData?.user?.id || null : status === 'open' ? null : periodRecord?.closed_by || null,
      closed_at: status === 'closed' ? nowIso : status === 'open' ? null : periodRecord?.closed_at || null,
    }

    const { data, error } = await supabase
      .from('restaurant_vat_filing_periods')
      .upsert(payload, { onConflict: 'restaurant_id,period_start,period_end' })
      .select('*')
      .single()

    setSavingPeriod(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'VAT period save failed',
        message: error.message,
      })
      return
    }

    setPeriodRecord(data)
    showToast({
      type: 'success',
      title: 'VAT period updated',
      message: `VAT period is now ${formatStatus(status)}.`,
    })
  }

  const exportCsv = () => {
    const rows = [
      ['Spizy VAT statutory period report'],
      ['Period', `${periodStart} to ${periodEnd}`],
      ['TRN', settings.tax_registration_number || 'Not set'],
      ['Status', formatStatus(periodRecord?.status || 'open')],
      [],
      ['Metric', 'Amount'],
      ['Gross sales', vatSummary.grossSales],
      ['Taxable sales', vatSummary.taxableSales],
      ['Zero-rated sales', vatSummary.zeroRatedSales],
      ['Exempt sales', vatSummary.exemptSales],
      ['Output VAT', vatSummary.outputTax],
      ['Input VAT', vatSummary.inputTax],
      ['Estimated VAT payable', vatSummary.vatPayable],
      [],
      ['Order', 'Date', 'Customer', 'VAT category', 'Gross', 'Output VAT'],
      ...vatSummary.orderRows.map((row) => [
        row.code,
        row.date,
        row.customer,
        row.category,
        row.gross,
        row.outputTax,
      ]),
      [],
      ['Purchase date', 'Supplier', 'Invoice', 'Category', 'Gross', 'Input VAT'],
      ...vatSummary.inputRows.map((row) => [
        row.purchase_date,
        row.supplier_name,
        row.invoice_number,
        row.category,
        row.gross_amount,
        row.tax_amount,
      ]),
    ]

    downloadCsv(`spizy-vat-period-${periodStart}-to-${periodEnd}.csv`, rows)
  }

  const printReport = () => {
    if (typeof window !== 'undefined') window.print()
  }

  return (
    <section className="vat-statutory-shell">
      <div className="vat-statutory-hero">
        <div>
          <p className="pricing-label">Tax / VAT Statutory Upgrade</p>
          <h1>UAE VAT Filing Foundation</h1>
          <p>
            Manage TRN, invoice numbering, VAT categories, period locks, accountant review and FTA-style export preparation.
            This is a statutory workflow foundation, not final tax advice.
          </p>
        </div>

        <div className={`vat-statutory-status ${readiness.tone}`}>
          <ShieldCheck size={21} />
          <span>Readiness</span>
          <strong>{readiness.score}/100</strong>
        </div>
      </div>

      {message && (
        <div className="vat-statutory-warning">
          <AlertTriangle size={18} />
          <span>{message}</span>
        </div>
      )}

      <div className="vat-statutory-period-card">
        <div>
          <span>VAT period</span>
          <strong>{formatDate(periodStart)} → {formatDate(periodEnd)}</strong>
        </div>
        <label>
          Start
          <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
        </label>
        <label>
          End
          <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
        </label>
        <button type="button" onClick={loadVatData} disabled={loading}>
          <RefreshCw size={16} />
          {loading ? 'Loading...' : 'Load period'}
        </button>
      </div>

      <form className="vat-statutory-settings" onSubmit={saveVatSettings}>
        <div className="vat-statutory-panel-head">
          <div>
            <p className="pricing-label">Restaurant VAT Identity</p>
            <h2>TRN and invoice numbering</h2>
          </div>
          <button type="submit" disabled={savingSettings}>
            <Save size={16} />
            {savingSettings ? 'Saving...' : 'Save VAT Settings'}
          </button>
        </div>

        <div className="vat-statutory-form-grid">
          <label>
            TRN
            <input
              value={settings.tax_registration_number}
              onChange={(event) => updateSetting('tax_registration_number', event.target.value)}
              placeholder="100000000000003"
            />
          </label>
          <label>
            Invoice prefix
            <input
              value={settings.tax_invoice_prefix}
              onChange={(event) => updateSetting('tax_invoice_prefix', event.target.value.toUpperCase())}
              placeholder="SPZ"
            />
          </label>
          <label>
            Next invoice number
            <input
              type="number"
              min="1"
              value={settings.tax_invoice_next_number}
              onChange={(event) => updateSetting('tax_invoice_next_number', event.target.value)}
            />
          </label>
          <label>
            Number padding
            <input
              type="number"
              min="3"
              max="10"
              value={settings.tax_invoice_number_padding}
              onChange={(event) => updateSetting('tax_invoice_number_padding', event.target.value)}
            />
          </label>
          <label>
            Pricing mode
            <select value={settings.vat_pricing_mode} onChange={(event) => updateSetting('vat_pricing_mode', event.target.value)}>
              <option value="tax_inclusive">VAT inclusive menu prices</option>
              <option value="tax_exclusive">VAT exclusive menu prices</option>
            </select>
          </label>
          <label>
            VAT return frequency
            <select value={settings.vat_return_frequency} onChange={(event) => updateSetting('vat_return_frequency', event.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </label>
          <label>
            Default VAT rate %
            <input
              type="number"
              min="0"
              step="0.01"
              value={settings.default_tax_rate}
              onChange={(event) => updateSetting('default_tax_rate', event.target.value)}
            />
          </label>
          <label>
            Accountant email
            <input
              type="email"
              value={settings.vat_accountant_email}
              onChange={(event) => updateSetting('vat_accountant_email', event.target.value)}
              placeholder="accountant@example.com"
            />
          </label>
        </div>
      </form>

      <div className="vat-statutory-kpi-grid">
        <VatMetricCard icon={<FileText size={20} />} label="Gross sales" value={formatMoney(currency, vatSummary.grossSales)} note={`${vatSummary.orderRows.length} orders`} />
        <VatMetricCard icon={<Calculator size={20} />} label="Output VAT" value={formatMoney(currency, vatSummary.outputTax)} note="Estimated sales VAT" tone="gold" />
        <VatMetricCard icon={<Download size={20} />} label="Input VAT" value={formatMoney(currency, vatSummary.inputTax)} note={`${vatSummary.inputRows.length} purchase records`} tone="blue" />
        <VatMetricCard icon={<ShieldCheck size={20} />} label="VAT payable" value={formatMoney(currency, vatSummary.vatPayable)} note="Output minus input" tone={vatSummary.vatPayable > 0 ? 'warning' : 'green'} />
      </div>

      <div className="vat-statutory-main-grid">
        <section className="vat-statutory-panel">
          <div className="vat-statutory-panel-head">
            <div>
              <p className="pricing-label">VAT Categories</p>
              <h2>Classification foundation</h2>
            </div>
          </div>

          <div className="vat-statutory-category-grid">
            {vatCategories.map((category) => (
              <article key={category.key}>
                <strong>{category.label}</strong>
                <span>{category.rate}% VAT</span>
                <p>{category.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="vat-statutory-panel">
          <div className="vat-statutory-panel-head">
            <div>
              <p className="pricing-label">Period Lock</p>
              <h2>Review and close VAT period</h2>
            </div>
            <StatusBadge status={periodRecord?.status || 'open'} />
          </div>

          <div className="vat-statutory-readiness-list">
            {readiness.items.map((item) => (
              <div className={item.ready ? 'ready' : 'warning'} key={item.key}>
                {item.ready ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          <div className="vat-statutory-period-actions">
            <button type="button" onClick={() => savePeriod('open')} disabled={savingPeriod}>
              <RotateCcw size={16} />
              Reopen
            </button>
            <button type="button" onClick={() => savePeriod('reviewed')} disabled={savingPeriod}>
              <CheckCircle2 size={16} />
              Mark Reviewed
            </button>
            <button type="button" onClick={() => savePeriod('closed')} disabled={savingPeriod}>
              <Lock size={16} />
              Close Period
            </button>
          </div>
        </section>
      </div>

      <section className="vat-statutory-panel vat-statutory-print-area">
        <div className="vat-statutory-panel-head">
          <div>
            <p className="pricing-label">FTA-style Workpaper</p>
            <h2>VAT return preparation summary</h2>
          </div>
          <div className="vat-statutory-actions">
            <button type="button" onClick={printReport}>
              <Printer size={16} />
              Print
            </button>
            <button type="button" onClick={exportCsv}>
              <Download size={16} />
              Export CSV
            </button>
          </div>
        </div>

        <div className="vat-statutory-return-grid">
          <ReturnRow label="Box 1 - Standard-rated taxable sales" value={formatMoney(currency, vatSummary.taxableSales)} />
          <ReturnRow label="Output VAT on standard-rated sales" value={formatMoney(currency, vatSummary.outputTax)} />
          <ReturnRow label="Zero-rated sales" value={formatMoney(currency, vatSummary.zeroRatedSales)} />
          <ReturnRow label="Exempt sales" value={formatMoney(currency, vatSummary.exemptSales)} />
          <ReturnRow label="Recoverable input VAT" value={formatMoney(currency, vatSummary.inputTax)} />
          <ReturnRow label="Estimated VAT payable" value={formatMoney(currency, vatSummary.vatPayable)} strong />
        </div>

        <div className="vat-statutory-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Customer</th>
                <th>VAT category</th>
                <th>Gross</th>
                <th>Output VAT</th>
              </tr>
            </thead>
            <tbody>
              {vatSummary.orderRows.length === 0 ? (
                <tr><td colSpan="6">No sales rows found for this period.</td></tr>
              ) : (
                vatSummary.orderRows.slice(0, 80).map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.customer}</td>
                    <td>{row.category}</td>
                    <td>{formatMoney(currency, row.gross)}</td>
                    <td>{formatMoney(currency, row.outputTax)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function VatMetricCard({ icon, label, value, note, tone = 'neutral' }) {
  return (
    <article className={`vat-statutory-kpi-card ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function StatusBadge({ status }) {
  return <div className={`vat-statutory-status-badge ${status}`}>{formatStatus(status)}</div>
}

function ReturnRow({ label, value, strong = false }) {
  return (
    <div className={strong ? 'strong' : ''}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function buildVatSummary({ orders, inputTaxRecords, taxRate, pricingMode }) {
  const normalizedRate = Number.isFinite(taxRate) ? taxRate : 5
  const rateMultiplier = normalizedRate / 100

  const orderRows = (orders || []).map((order) => {
    const gross = getOrderTotal(order)
    const category = order.tax_category || order.vat_category || 'standard'
    const isTaxable = category === 'standard'
    const outputTax = isTaxable
      ? pricingMode === 'tax_exclusive'
        ? gross * rateMultiplier
        : gross - gross / (1 + rateMultiplier)
      : 0

    return {
      id: order.id,
      code: order.order_code || order.public_order_number || 'Order',
      date: String(order.created_at || '').slice(0, 10),
      customer: order.customer_name || order.customer_phone || 'Walk-in / guest',
      category: formatVatCategory(category),
      gross,
      outputTax,
      taxableAmount: isTaxable
        ? pricingMode === 'tax_exclusive'
          ? gross
          : gross - outputTax
        : 0,
      zeroRatedAmount: category === 'zero_rated' ? gross : 0,
      exemptAmount: category === 'exempt' ? gross : 0,
    }
  })

  const inputRows = (inputTaxRecords || []).map((record) => ({
    ...record,
    gross_amount: Number(record.gross_amount || 0),
    tax_amount: Number(record.tax_amount || 0),
  }))

  const grossSales = sumValues(orderRows.map((row) => row.gross))
  const taxableSales = sumValues(orderRows.map((row) => row.taxableAmount))
  const zeroRatedSales = sumValues(orderRows.map((row) => row.zeroRatedAmount))
  const exemptSales = sumValues(orderRows.map((row) => row.exemptAmount))
  const outputTax = sumValues(orderRows.map((row) => row.outputTax))
  const inputTax = sumValues(inputRows.map((row) => row.tax_amount))
  const purchaseGross = sumValues(inputRows.map((row) => row.gross_amount))

  return {
    grossSales,
    taxableSales,
    zeroRatedSales,
    exemptSales,
    outputTax,
    inputTax,
    purchaseGross,
    vatPayable: outputTax - inputTax,
    orderRows,
    inputRows,
  }
}

function buildVatReadiness({ settings, periodRecord, vatSummary }) {
  const items = [
    {
      key: 'trn',
      label: settings.tax_registration_number ? 'TRN is configured' : 'TRN is missing',
      ready: Boolean(settings.tax_registration_number),
    },
    {
      key: 'invoice',
      label: settings.tax_invoice_prefix && Number(settings.tax_invoice_next_number) > 0 ? 'Invoice sequence is ready' : 'Invoice sequence needs setup',
      ready: Boolean(settings.tax_invoice_prefix && Number(settings.tax_invoice_next_number) > 0),
    },
    {
      key: 'sales',
      label: vatSummary.orderRows.length > 0 ? 'Sales rows loaded' : 'No sales rows in this period',
      ready: vatSummary.orderRows.length > 0,
    },
    {
      key: 'input-tax',
      label: vatSummary.inputRows.length > 0 ? 'Input tax records loaded' : 'Input tax records can be added from Cash & Bank',
      ready: true,
    },
    {
      key: 'period',
      label: periodRecord?.status === 'closed' ? 'VAT period is closed' : 'VAT period is open for review',
      ready: Boolean(periodRecord),
    },
  ]

  const readyCount = items.filter((item) => item.ready).length
  const score = Math.round((readyCount / items.length) * 100)

  return {
    items,
    score,
    tone: score >= 80 ? 'good' : score >= 50 ? 'warning' : 'danger',
  }
}

function buildVatReturnPayload({ vatSummary, settings, periodStart, periodEnd }) {
  return {
    period_start: periodStart,
    period_end: periodEnd,
    trn: settings.tax_registration_number || null,
    pricing_mode: settings.vat_pricing_mode,
    vat_return_frequency: settings.vat_return_frequency,
    boxes: {
      standard_rated_sales: roundMoney(vatSummary.taxableSales),
      output_tax: roundMoney(vatSummary.outputTax),
      zero_rated_sales: roundMoney(vatSummary.zeroRatedSales),
      exempt_sales: roundMoney(vatSummary.exemptSales),
      input_tax: roundMoney(vatSummary.inputTax),
      estimated_vat_payable: roundMoney(vatSummary.vatPayable),
    },
  }
}

function getOrderTotal(order) {
  return Number(
    order.total_amount ??
      order.grand_total ??
      order.payable_amount ??
      order.net_amount ??
      0,
  )
}

function getDateRangeIso(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  end.setDate(end.getDate() + 1)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

function getQuarterStartDate(date = new Date()) {
  const month = date.getMonth()
  const quarterStartMonth = Math.floor(month / 3) * 3
  return formatDateInput(new Date(date.getFullYear(), quarterStartMonth, 1))
}

function getQuarterEndDate(date = new Date()) {
  const month = date.getMonth()
  const quarterStartMonth = Math.floor(month / 3) * 3
  return formatDateInput(new Date(date.getFullYear(), quarterStartMonth + 3, 0))
}

function formatDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMoney(currency, value) {
  return `${currency || 'AED'} ${roundMoney(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatStatus(value) {
  const labels = {
    open: 'Open',
    reviewed: 'Reviewed',
    closed: 'Closed',
  }

  return labels[value] || 'Open'
}

function formatVatCategory(value) {
  const match = vatCategories.find((category) => category.key === value)
  return match?.label || 'Standard rated'
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function sumValues(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0)
}

function normalizeLoadError(label, error) {
  if (!error) return ''
  if (['42P01', 'PGRST116', '42703'].includes(error.code)) return ''
  return `${label}: ${error.message}`
}

function escapeCsvValue(value) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
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

export default VATStatutoryManagement
