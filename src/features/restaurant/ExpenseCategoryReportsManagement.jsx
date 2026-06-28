import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  Printer,
  RefreshCw,
  Search,
  WalletCards,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './ExpenseCategoryReportsManagement.css'

const expenseCategories = [
  {
    key: 'rent',
    label: 'Rent',
    helper: 'Shop rent, lease and property charges',
    keywords: ['rent', 'lease', 'mall', 'shop rent', 'property'],
  },
  {
    key: 'salary',
    label: 'Salary',
    helper: 'Staff salary, payroll, allowance and incentives',
    keywords: ['salary', 'payroll', 'wage', 'staff', 'employee', 'allowance', 'incentive'],
  },
  {
    key: 'utilities',
    label: 'Utilities',
    helper: 'Electricity, water, gas, internet and phone bills',
    keywords: ['utility', 'utilities', 'electric', 'electricity', 'water', 'gas', 'internet', 'wifi', 'phone', 'du', 'etisalat'],
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    helper: 'Repair, cleaning, AMC and equipment service',
    keywords: ['maintenance', 'repair', 'cleaning', 'amc', 'service', 'equipment', 'fix'],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    helper: 'Ads, promotions, influencers and campaign spend',
    keywords: ['marketing', 'ads', 'advertising', 'promotion', 'campaign', 'poster', 'design', 'influencer'],
  },
  {
    key: 'delivery',
    label: 'Delivery',
    helper: 'Rider, delivery partner, logistics and fuel cost',
    keywords: ['delivery', 'rider', 'logistics', 'fuel', 'petrol', 'courier', 'driver'],
  },
  {
    key: 'packaging',
    label: 'Packaging',
    helper: 'Boxes, bags, cups, cutlery and labels',
    keywords: ['packaging', 'box', 'bag', 'cups', 'cutlery', 'container', 'label', 'sticker'],
  },
  {
    key: 'supplier_purchases',
    label: 'Supplier Purchases',
    helper: 'Ingredients, food purchases and supplier bills',
    keywords: ['supplier', 'purchase', 'food', 'ingredient', 'stock', 'vegetable', 'meat', 'rice', 'grocery'],
  },
  {
    key: 'other',
    label: 'Other Operating Costs',
    helper: 'All other operating cost entries',
    keywords: ['other', 'misc', 'miscellaneous', 'general'],
  },
]

const categoryMap = new Map(expenseCategories.map((category) => [category.key, category]))

function ExpenseCategoryReportsManagement({ restaurant }) {
  const [loading, setLoading] = useState(true)
  const [loadErrors, setLoadErrors] = useState([])
  const [expenses, setExpenses] = useState([])
  const [purchaseTaxRecords, setPurchaseTaxRecords] = useState([])
  const [ledgerExpenses, setLedgerExpenses] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthInput())
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const currency = restaurant?.currency || 'AED'

  const loadExpenseReport = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { startDate, endDate } = getMonthDateRange(selectedMonth)

    const [expensesResult, purchaseTaxResult, ledgerResult] = await Promise.all([
      supabase
        .from('restaurant_expenses')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .gte('expense_date', startDate)
        .lte('expense_date', endDate)
        .eq('is_deleted', false)
        .order('expense_date', { ascending: false }),
      supabase
        .from('restaurant_purchase_tax_records')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .gte('purchase_date', startDate)
        .lte('purchase_date', endDate)
        .eq('is_voided', false)
        .order('purchase_date', { ascending: false }),
      supabase
        .from('restaurant_account_transactions')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .gte('transaction_date', startDate)
        .lte('transaction_date', endDate)
        .in('transaction_type', ['expense', 'adjustment_out'])
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    const nextErrors = [
      normalizeLoadError('Expenses', expensesResult.error),
      normalizeLoadError('Purchase VAT / supplier bills', purchaseTaxResult.error),
      normalizeLoadError('Cash & Bank expense ledger', ledgerResult.error),
    ].filter(Boolean)

    setExpenses(expensesResult.data || [])
    setPurchaseTaxRecords(purchaseTaxResult.data || [])
    setLedgerExpenses(ledgerResult.data || [])
    setLoadErrors(nextErrors)
    setLoading(false)
  }, [restaurant?.id, selectedMonth])

  useEffect(() => {
    loadExpenseReport()
  }, [loadExpenseReport])

  const normalizedEntries = useMemo(
    () =>
      buildNormalizedExpenseEntries({
        expenses,
        purchaseTaxRecords,
        ledgerExpenses,
        currency,
      }),
    [currency, expenses, ledgerExpenses, purchaseTaxRecords],
  )

  const filteredEntries = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return normalizedEntries.filter((entry) => {
      if (sourceFilter !== 'all' && entry.source !== sourceFilter) return false
      if (categoryFilter !== 'all' && entry.categoryKey !== categoryFilter) return false

      if (!keyword) return true

      return [
        entry.title,
        entry.vendor,
        entry.reference,
        entry.categoryLabel,
        entry.sourceLabel,
        entry.paymentMethod,
        entry.notes,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [categoryFilter, normalizedEntries, search, sourceFilter])

  const reportSummary = useMemo(
    () => buildExpenseCategoryReportSummary(filteredEntries),
    [filteredEntries],
  )

  const monthlyTrend = useMemo(
    () => buildExpenseDailyTrend(filteredEntries),
    [filteredEntries],
  )

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    const csv = buildExpenseReportCsv(filteredEntries, reportSummary, selectedMonth, currency)
    downloadTextFile(`spizy-expense-report-${selectedMonth}.csv`, csv)
  }

  return (
    <section className="expense-report-shell">
      <div className="expense-report-hero">
        <div>
          <p className="pricing-label">Expense Reports</p>
          <h1>Operating Cost Command Center</h1>
          <p>
            Track rent, salary, utilities, maintenance, marketing, delivery,
            packaging, supplier purchases and other operating costs in one monthly report.
          </p>
        </div>

        <div className="expense-report-hero-actions">
          <label>
            <span>Report month</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            />
          </label>
          <button type="button" onClick={loadExpenseReport} disabled={loading}>
            <RefreshCw size={16} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {loadErrors.length > 0 && (
        <div className="expense-report-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>Some expense sources could not be loaded</strong>
            <span>{loadErrors.join(' • ')}</span>
          </div>
        </div>
      )}

      <div className="expense-report-kpi-grid">
        <ExpenseReportKpiCard
          icon={<WalletCards size={21} />}
          label="Total Operating Cost"
          value={formatMoney(currency, reportSummary.totalExpense)}
          note={`${filteredEntries.length} expense record${filteredEntries.length === 1 ? '' : 's'}`}
          tone="gold"
        />
        <ExpenseReportKpiCard
          icon={<BarChart3 size={21} />}
          label="Top Cost Category"
          value={reportSummary.topCategory?.label || 'No cost yet'}
          note={formatMoney(currency, reportSummary.topCategory?.amount || 0)}
          tone="blue"
        />
        <ExpenseReportKpiCard
          icon={<CalendarDays size={21} />}
          label="Avg Daily Cost"
          value={formatMoney(currency, reportSummary.averageDailyExpense)}
          note="Based on days with records"
          tone="neutral"
        />
        <ExpenseReportKpiCard
          icon={<AlertTriangle size={21} />}
          label="Uncategorised Risk"
          value={formatMoney(currency, reportSummary.uncategorizedAmount)}
          note={`${reportSummary.uncategorizedCount} record${reportSummary.uncategorizedCount === 1 ? '' : 's'} need review`}
          tone={reportSummary.uncategorizedAmount > 0 ? 'warning' : 'green'}
        />
      </div>

      <div className="expense-report-toolbar">
        <label className="expense-report-search">
          <Search size={16} />
          <input
            type="search"
            value={search}
            placeholder="Search title, vendor, category or reference..."
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
          <option value="all">All sources</option>
          <option value="expense">Expenses module</option>
          <option value="purchase_tax">Purchase VAT / supplier bills</option>
          <option value="ledger">Cash & Bank ledger</option>
        </select>

        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">All categories</option>
          {expenseCategories.map((category) => (
            <option value={category.key} key={category.key}>
              {category.label}
            </option>
          ))}
        </select>

        <button type="button" onClick={handlePrint}>
          <Printer size={16} />
          Print
        </button>
        <button type="button" onClick={handleExportCsv}>
          <Download size={16} />
          CSV
        </button>
      </div>

      {loading ? (
        <div className="expense-report-loading">
          <RefreshCw size={20} />
          Loading expense category report...
        </div>
      ) : (
        <>
          <section className="expense-report-main-grid">
            <div className="expense-report-panel">
              <div className="expense-report-panel-head">
                <div>
                  <p className="pricing-label">Category Breakdown</p>
                  <h2>Where the money went</h2>
                </div>
              </div>

              <div className="expense-category-list">
                {reportSummary.categoryRows.map((row) => (
                  <article className="expense-category-row" key={row.key}>
                    <div>
                      <strong>{row.label}</strong>
                      <span>{row.helper}</span>
                    </div>
                    <div className="expense-category-bar-wrap">
                      <span style={{ width: `${row.percent}%` }} />
                    </div>
                    <div>
                      <strong>{formatMoney(currency, row.amount)}</strong>
                      <span>{row.percent.toFixed(1)}% • {row.count} record{row.count === 1 ? '' : 's'}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="expense-report-panel">
              <div className="expense-report-panel-head">
                <div>
                  <p className="pricing-label">Daily Trend</p>
                  <h2>Cost movement</h2>
                </div>
              </div>

              <div className="expense-trend-list">
                {monthlyTrend.length === 0 ? (
                  <div className="expense-report-empty">
                    <CheckCircle2 size={18} />
                    <span>No expense records found for this month.</span>
                  </div>
                ) : (
                  monthlyTrend.slice(0, 12).map((row) => (
                    <article className="expense-trend-row" key={row.date}>
                      <div>
                        <strong>{formatSimpleDate(row.date)}</strong>
                        <span>{row.count} record{row.count === 1 ? '' : 's'}</span>
                      </div>
                      <div className="expense-trend-bar-wrap">
                        <span style={{ width: `${row.percent}%` }} />
                      </div>
                      <strong>{formatMoney(currency, row.amount)}</strong>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="expense-report-panel expense-report-table-panel">
            <div className="expense-report-panel-head">
              <div>
                <p className="pricing-label">Expense Records</p>
                <h2>Detailed category report</h2>
              </div>
              <span>{filteredEntries.length} record{filteredEntries.length === 1 ? '' : 's'}</span>
            </div>

            <div className="expense-report-table-wrap">
              <table className="expense-report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Title / Vendor</th>
                    <th>Source</th>
                    <th>Payment</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan="6">
                        <div className="expense-report-empty">
                          <FileText size={18} />
                          <span>No matching expense records found.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((entry) => (
                      <tr key={entry.key}>
                        <td>{formatSimpleDate(entry.date)}</td>
                        <td>
                          <span className={`expense-category-chip ${entry.categoryKey}`}>
                            {entry.categoryLabel}
                          </span>
                        </td>
                        <td>
                          <strong>{entry.title}</strong>
                          <span>{entry.vendor || entry.reference || entry.notes || 'No extra details'}</span>
                        </td>
                        <td>{entry.sourceLabel}</td>
                        <td>{formatPaymentMethod(entry.paymentMethod)}</td>
                        <td>{formatMoney(entry.currency || currency, entry.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  )
}

function ExpenseReportKpiCard({ icon, label, value, note, tone = 'neutral' }) {
  return (
    <article className={`expense-report-kpi ${tone}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function buildNormalizedExpenseEntries({ expenses, purchaseTaxRecords, ledgerExpenses, currency }) {
  const expenseRows = (expenses || []).map((expense) => {
    const categoryKey = resolveExpenseCategoryKey(expense)

    return {
      key: `expense-${expense.id}`,
      source: 'expense',
      sourceLabel: 'Expenses module',
      id: expense.id,
      date: expense.expense_date || getDateOnly(expense.created_at),
      title: expense.title || expense.expense_title || expense.description || 'Expense',
      vendor: expense.vendor_name || expense.supplier_name || expense.payee_name || '',
      reference: expense.invoice_number || expense.reference || expense.receipt_number || '',
      paymentMethod: expense.payment_method || expense.payment_mode || '',
      categoryKey,
      categoryLabel: getCategoryLabel(categoryKey),
      amount: getFirstNumericValue(expense, ['total_amount', 'amount', 'gross_amount', 'net_amount']),
      currency: expense.currency || currency,
      notes: expense.notes || expense.description || '',
    }
  })

  const purchaseRows = (purchaseTaxRecords || []).map((record) => {
    const categoryKey = normalizeCategoryKey(record.category) || 'supplier_purchases'

    return {
      key: `purchase-tax-${record.id}`,
      source: 'purchase_tax',
      sourceLabel: 'Purchase VAT / supplier bill',
      id: record.id,
      date: record.purchase_date || getDateOnly(record.created_at),
      title: record.invoice_number ? `Purchase invoice ${record.invoice_number}` : 'Supplier purchase',
      vendor: record.supplier_name || '',
      reference: record.invoice_number || '',
      paymentMethod: record.payment_method || '',
      categoryKey: categoryMap.has(categoryKey) ? categoryKey : 'supplier_purchases',
      categoryLabel: getCategoryLabel(categoryMap.has(categoryKey) ? categoryKey : 'supplier_purchases'),
      amount: getFirstNumericValue(record, ['gross_amount', 'total_amount', 'amount']),
      currency: record.currency || currency,
      notes: record.notes || '',
    }
  })

  const ledgerRows = (ledgerExpenses || []).map((transaction) => {
    const categoryKey = resolveExpenseCategoryKey(transaction)

    return {
      key: `ledger-${transaction.id}`,
      source: 'ledger',
      sourceLabel: 'Cash & Bank ledger',
      id: transaction.id,
      date: transaction.transaction_date || getDateOnly(transaction.created_at),
      title: transaction.title || 'Ledger expense',
      vendor: transaction.vendor_name || transaction.supplier_name || '',
      reference: transaction.external_reference || transaction.reference || '',
      paymentMethod: transaction.payment_method || transaction.account_type || '',
      categoryKey,
      categoryLabel: getCategoryLabel(categoryKey),
      amount: Number(transaction.amount || 0),
      currency: transaction.currency || currency,
      notes: transaction.description || transaction.notes || '',
    }
  })

  return [...expenseRows, ...purchaseRows, ...ledgerRows]
    .filter((entry) => Number(entry.amount || 0) > 0)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
}

function buildExpenseCategoryReportSummary(entries) {
  const totalExpense = sumValues(entries.map((entry) => entry.amount))
  const daysWithRecords = new Set(entries.map((entry) => entry.date).filter(Boolean)).size
  const averageDailyExpense = daysWithRecords > 0 ? totalExpense / daysWithRecords : 0

  const categoryRows = expenseCategories.map((category) => {
    const categoryEntries = entries.filter((entry) => entry.categoryKey === category.key)
    const amount = sumValues(categoryEntries.map((entry) => entry.amount))
    const percent = totalExpense > 0 ? (amount / totalExpense) * 100 : 0

    return {
      ...category,
      amount,
      count: categoryEntries.length,
      percent,
    }
  })

  const topCategory = [...categoryRows]
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount)[0]

  const uncategorizedEntries = entries.filter((entry) => entry.categoryKey === 'other')

  return {
    totalExpense,
    averageDailyExpense,
    categoryRows,
    topCategory,
    uncategorizedAmount: sumValues(uncategorizedEntries.map((entry) => entry.amount)),
    uncategorizedCount: uncategorizedEntries.length,
  }
}

function buildExpenseDailyTrend(entries) {
  const dailyMap = new Map()

  entries.forEach((entry) => {
    const date = entry.date || 'Unknown'
    const current = dailyMap.get(date) || { date, amount: 0, count: 0 }
    current.amount += Number(entry.amount || 0)
    current.count += 1
    dailyMap.set(date, current)
  })

  const rows = [...dailyMap.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const maxAmount = Math.max(...rows.map((row) => row.amount), 0)

  return rows.map((row) => ({
    ...row,
    percent: maxAmount > 0 ? Math.max((row.amount / maxAmount) * 100, 4) : 0,
  }))
}

function buildExpenseReportCsv(entries, summary, selectedMonth, currency) {
  const rows = [
    ['Spizy Expense Category Report'],
    ['Month', selectedMonth],
    ['Total Operating Cost', formatMoney(currency, summary.totalExpense)],
    ['Top Category', summary.topCategory?.label || 'No cost yet'],
    [],
    ['Date', 'Category', 'Title', 'Vendor', 'Reference', 'Source', 'Payment Method', 'Amount', 'Currency'],
    ...entries.map((entry) => [
      entry.date || '',
      entry.categoryLabel,
      entry.title,
      entry.vendor || '',
      entry.reference || '',
      entry.sourceLabel,
      formatPaymentMethod(entry.paymentMethod),
      Number(entry.amount || 0).toFixed(2),
      entry.currency || currency,
    ]),
  ]

  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
}

function resolveExpenseCategoryKey(row) {
  const explicitCategory = normalizeCategoryKey(
    row?.expense_category || row?.category || row?.expense_type || row?.cost_category || row?.metadata?.category,
  )

  if (explicitCategory && categoryMap.has(explicitCategory)) return explicitCategory

  const searchText = [
    row?.title,
    row?.expense_title,
    row?.description,
    row?.notes,
    row?.vendor_name,
    row?.supplier_name,
    row?.payee_name,
    row?.invoice_number,
    row?.reference,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const matchedCategory = expenseCategories.find((category) =>
    category.key !== 'other' && category.key !== 'supplier_purchases'
      ? category.keywords.some((keyword) => searchText.includes(keyword))
      : false,
  )

  if (matchedCategory) return matchedCategory.key

  const supplierCategory = expenseCategories.find((category) => category.key === 'supplier_purchases')
  if (supplierCategory?.keywords.some((keyword) => searchText.includes(keyword))) {
    return 'supplier_purchases'
  }

  return 'other'
}

function normalizeCategoryKey(value) {
  if (!value) return ''

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  const aliases = {
    food_purchase: 'supplier_purchases',
    food_purchases: 'supplier_purchases',
    ingredient_purchase: 'supplier_purchases',
    ingredients: 'supplier_purchases',
    supplier_purchase: 'supplier_purchases',
    purchases: 'supplier_purchases',
    utility: 'utilities',
    software_subscription: 'other',
    misc: 'other',
    miscellaneous: 'other',
  }

  return aliases[normalized] || normalized
}

function getCategoryLabel(key) {
  return categoryMap.get(key)?.label || 'Other Operating Costs'
}

function normalizeLoadError(label, error) {
  if (!error || ['42P01', 'PGRST116'].includes(error.code)) return ''

  return `${label}: ${error.message}`
}

function getCurrentMonthInput() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')

  return `${date.getFullYear()}-${month}`
}

function getMonthDateRange(monthInput) {
  const safeMonth = /^\d{4}-\d{2}$/.test(monthInput || '') ? monthInput : getCurrentMonthInput()
  const [year, month] = safeMonth.split('-').map(Number)
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDateObject = new Date(year, month, 0)
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(endDateObject.getDate()).padStart(2, '0')}`

  return { startDate, endDate }
}

function getDateOnly(value) {
  if (!value) return ''

  return String(value).slice(0, 10)
}

function getFirstNumericValue(source, keys) {
  if (!source) return 0

  for (const key of keys) {
    const value = Number(source[key] || 0)
    if (value > 0) return value
  }

  return 0
}

function sumValues(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0)
}

function formatMoney(currency, value) {
  return `${currency || 'AED'} ${Number(value || 0).toFixed(2)}`
}

function formatSimpleDate(value) {
  if (!value) return 'Not set'

  try {
    return new Intl.DateTimeFormat('en', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${value}T00:00:00`))
  } catch (error) {
    return value
  }
}

function formatPaymentMethod(value) {
  if (!value) return 'Not set'

  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function escapeCsvValue(value) {
  const text = String(value ?? '')

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default ExpenseCategoryReportsManagement
