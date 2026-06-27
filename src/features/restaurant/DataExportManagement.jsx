import { useMemo, useState } from 'react'
import {
  Archive,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileDown,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './DataExportManagement.css'

const rangeOptions = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
]

const exportGroups = [
  {
    title: 'Sales & customer data',
    description: 'Orders, order items, collections, customers and reviews.',
    items: [
      {
        id: 'orders',
        label: 'Orders',
        table: 'restaurant_orders',
        dateColumn: 'created_at',
      },
      {
        id: 'order_items',
        label: 'Order items',
        table: 'restaurant_order_items',
        dateColumn: 'created_at',
      },
      {
        id: 'customer_payments',
        label: 'Customer payments',
        table: 'restaurant_customer_payments',
        dateColumn: 'created_at',
      },
      {
        id: 'customers',
        label: 'Customers',
        table: 'restaurant_customers',
        dateColumn: 'created_at',
      },
      {
        id: 'reviews',
        label: 'Reviews',
        table: 'restaurant_reviews',
        dateColumn: 'created_at',
      },
      {
        id: 'reservations',
        label: 'Reservations',
        table: 'restaurant_reservations',
        dateColumn: 'created_at',
      },
      {
        id: 'service_requests',
        label: 'Service requests',
        table: 'restaurant_service_requests',
        dateColumn: 'created_at',
      },
    ],
  },
  {
    title: 'Menu, offers & growth',
    description: 'Products, categories, recipes, add-ons, coupons and campaigns.',
    items: [
      {
        id: 'menu_items',
        label: 'Menu items',
        table: 'menu_items',
        dateColumn: 'created_at',
      },
      {
        id: 'menu_categories',
        label: 'Menu categories',
        table: 'menu_categories',
        dateColumn: 'created_at',
      },
      {
        id: 'menu_variations',
        label: 'Menu variations',
        table: 'menu_item_variations',
        dateColumn: 'created_at',
        select: '*, item:menu_items!inner(restaurant_id, name)',
        restaurantFilter: 'item.restaurant_id',
      },
      {
        id: 'recipes',
        label: 'Recipes',
        table: 'restaurant_recipes',
        dateColumn: 'created_at',
      },
      {
        id: 'recipe_items',
        label: 'Recipe ingredients',
        table: 'restaurant_recipe_ingredients',
        dateColumn: 'created_at',
      },
      {
        id: 'modifiers',
        label: 'Modifier groups',
        table: 'restaurant_modifier_groups',
        dateColumn: 'created_at',
      },
      {
        id: 'modifier_options',
        label: 'Modifier options',
        table: 'restaurant_modifier_options',
        dateColumn: 'created_at',
      },
      {
        id: 'discounts',
        label: 'Discount coupons',
        table: 'restaurant_discounts',
        dateColumn: 'created_at',
      },
      {
        id: 'campaigns',
        label: 'Campaign banners',
        table: 'restaurant_campaigns',
        dateColumn: 'created_at',
      },
    ],
  },
  {
    title: 'Inventory, purchases & suppliers',
    description: 'Stock, stock movements, suppliers, purchase bills and payments.',
    items: [
      {
        id: 'inventory_movements',
        label: 'Inventory movements',
        table: 'restaurant_inventory_movements',
        dateColumn: 'created_at',
      },
      {
        id: 'stock_deductions',
        label: 'Stock deductions',
        table: 'restaurant_stock_deductions',
        dateColumn: 'created_at',
      },
      {
        id: 'suppliers',
        label: 'Suppliers',
        table: 'restaurant_suppliers',
        dateColumn: 'created_at',
      },
      {
        id: 'purchases',
        label: 'Purchase bills',
        table: 'restaurant_purchases',
        dateColumn: 'created_at',
      },
      {
        id: 'purchase_items',
        label: 'Purchase items',
        table: 'restaurant_purchase_items',
        dateColumn: 'created_at',
      },
      {
        id: 'supplier_payments',
        label: 'Supplier payments',
        table: 'restaurant_supplier_payments',
        dateColumn: 'created_at',
      },
    ],
  },
  {
    title: 'Finance, staff & admin',
    description: 'Expenses, accounts, day closing, staff, payroll and audit logs.',
    items: [
      {
        id: 'expenses',
        label: 'Expenses',
        table: 'restaurant_expenses',
        dateColumn: 'expense_date',
      },
      {
        id: 'expense_categories',
        label: 'Expense categories',
        table: 'restaurant_expense_categories',
        dateColumn: 'created_at',
      },
      {
        id: 'cash_accounts',
        label: 'Cash & bank accounts',
        table: 'restaurant_cash_accounts',
        dateColumn: 'created_at',
      },
      {
        id: 'cash_ledger',
        label: 'Cash & bank ledger',
        table: 'restaurant_cash_account_ledger',
        dateColumn: 'created_at',
      },
      {
        id: 'day_closings',
        label: 'Day closings',
        table: 'restaurant_day_closings',
        dateColumn: 'closing_date',
      },
      {
        id: 'staff',
        label: 'Staff',
        table: 'restaurant_staffs',
        dateColumn: 'created_at',
      },
      {
        id: 'attendance',
        label: 'Attendance',
        table: 'restaurant_staff_attendance',
        dateColumn: 'work_date',
      },
      {
        id: 'payroll',
        label: 'Payroll',
        table: 'restaurant_payrolls',
        dateColumn: 'created_at',
      },
      {
        id: 'activity_logs',
        label: 'Activity logs',
        table: 'restaurant_activity_logs',
        dateColumn: 'created_at',
      },
    ],
  },
]

const allExportItems = exportGroups.flatMap((group) => group.items)

function DataExportManagement({ restaurant }) {
  const { showToast } = useAppFeedback()
  const [rangeFilter, setRangeFilter] = useState('30d')
  const [selectedIds, setSelectedIds] = useState(() =>
    allExportItems
      .filter((item) =>
        ['orders', 'order_items', 'menu_items', 'customers', 'expenses'].includes(
          item.id,
        ),
      )
      .map((item) => item.id),
  )
  const [exportingId, setExportingId] = useState('')
  const [bulkExporting, setBulkExporting] = useState(false)
  const [lastResults, setLastResults] = useState([])

  const selectedItems = useMemo(() => {
    const selectedSet = new Set(selectedIds)
    return allExportItems.filter((item) => selectedSet.has(item.id))
  }, [selectedIds])

  const backupSummary = useMemo(() => {
    const rangeLabel =
      rangeOptions.find((range) => range.value === rangeFilter)?.label ||
      'Selected range'

    return [
      `Spizy data export plan for ${restaurant?.name || 'restaurant'}`,
      `Range: ${rangeLabel}`,
      `Selected datasets: ${selectedItems.map((item) => item.label).join(', ') || 'None'}`,
      `Generated: ${new Date().toLocaleString('en-AE')}`,
    ].join('\n')
  }, [rangeFilter, restaurant?.name, selectedItems])

  if (!restaurant?.id) {
    return (
      <section className="management-section">
        <div className="empty-state">
          Restaurant profile not found. Please complete restaurant setup first.
        </div>
      </section>
    )
  }

  const toggleDataset = (datasetId) => {
    setSelectedIds((current) =>
      current.includes(datasetId)
        ? current.filter((id) => id !== datasetId)
        : [...current, datasetId],
    )
  }

  const selectGroup = (items) => {
    setSelectedIds((current) => {
      const nextSet = new Set(current)
      const allGroupSelected = items.every((item) => nextSet.has(item.id))

      if (allGroupSelected) {
        items.forEach((item) => nextSet.delete(item.id))
      } else {
        items.forEach((item) => nextSet.add(item.id))
      }

      return Array.from(nextSet)
    })
  }

  const selectAll = () => {
    setSelectedIds(allExportItems.map((item) => item.id))
  }

  const clearSelection = () => {
    setSelectedIds([])
  }

  const exportSingleDataset = async (item) => {
    setExportingId(item.id)

    const result = await exportDataset({
      item,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      rangeFilter,
    })

    setExportingId('')
    setLastResults((current) => [result, ...current].slice(0, 12))

    if (result.ok) {
      showToast({
        type: 'success',
        title: 'CSV downloaded',
        message: `${item.label}: ${result.count} row${result.count === 1 ? '' : 's'} exported.`,
      })
    } else {
      showToast({
        type: 'error',
        title: `${item.label} export failed`,
        message: result.error,
      })
    }
  }

  const exportSelectedDatasets = async () => {
    if (selectedItems.length === 0) {
      showToast({
        type: 'warning',
        title: 'No datasets selected',
        message: 'Choose at least one dataset to export.',
      })
      return
    }

    setBulkExporting(true)

    const results = []

    for (const item of selectedItems) {
      // eslint-disable-next-line no-await-in-loop
      const result = await exportDataset({
        item,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        rangeFilter,
      })

      results.push(result)
    }

    setBulkExporting(false)
    setLastResults(results)

    const successCount = results.filter((result) => result.ok).length
    const failedCount = results.length - successCount

    showToast({
      type: failedCount > 0 ? 'warning' : 'success',
      title: 'Export completed',
      message: `${successCount} file${successCount === 1 ? '' : 's'} downloaded. ${failedCount} skipped/failed.`,
    })
  }

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(backupSummary)
      showToast({
        type: 'success',
        title: 'Copied',
        message: 'Backup summary copied to clipboard.',
      })
    } catch {
      showToast({
        type: 'warning',
        title: 'Copy failed',
        message: 'Browser clipboard permission is not available.',
      })
    }
  }

  return (
    <section className="data-export-screen">
      <div className="data-export-hero">
        <div>
          <p className="pricing-label">Backup & export</p>
          <h2>Data Export Center</h2>
          <span>
            Download clean CSV backups for sales, menu, customers, inventory,
            purchases, finance, staff and activity logs.
          </span>
        </div>

        <div className="data-export-hero-actions">
          <select
            value={rangeFilter}
            onChange={(event) => setRangeFilter(event.target.value)}
          >
            {rangeOptions.map((range) => (
              <option value={range.value} key={range.value}>
                {range.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="primary-button"
            onClick={exportSelectedDatasets}
            disabled={bulkExporting || selectedItems.length === 0}
          >
            {bulkExporting ? <RefreshCw size={18} /> : <Download size={18} />}
            {bulkExporting ? 'Exporting...' : 'Export selected'}
          </button>
        </div>
      </div>

      <div className="data-export-stat-grid">
        <DataStatCard
          icon={<Database size={22} />}
          label="Available datasets"
          value={allExportItems.length}
          text="Across restaurant OS"
        />
        <DataStatCard
          icon={<CheckCircle2 size={22} />}
          label="Selected"
          value={selectedItems.length}
          text="Ready to download"
        />
        <DataStatCard
          icon={<Archive size={22} />}
          label="Format"
          value="CSV"
          text="Spreadsheet friendly"
        />
        <DataStatCard
          icon={<ShieldCheck size={22} />}
          label="Scope"
          value="Safe"
          text="Only this restaurant"
        />
      </div>

      <div className="data-export-tool-card">
        <div>
          <h3>Quick selection</h3>
          <span>
            Export one CSV at a time, or select multiple datasets and download
            them together.
          </span>
        </div>

        <div className="data-export-tools">
          <button type="button" className="secondary-button" onClick={selectAll}>
            Select all
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={clearSelection}
          >
            Clear
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={copySummary}
          >
            <Copy size={17} />
            Copy summary
          </button>
        </div>
      </div>

      <div className="data-export-grid">
        {exportGroups.map((group) => {
          const allGroupSelected = group.items.every((item) =>
            selectedIds.includes(item.id),
          )

          return (
            <section className="data-export-group" key={group.title}>
              <div className="data-export-group-head">
                <div>
                  <h3>{group.title}</h3>
                  <span>{group.description}</span>
                </div>

                <button
                  type="button"
                  className="tiny-button"
                  onClick={() => selectGroup(group.items)}
                >
                  {allGroupSelected ? 'Unselect' : 'Select'}
                </button>
              </div>

              <div className="data-export-list">
                {group.items.map((item) => {
                  const selected = selectedIds.includes(item.id)
                  const exporting = exportingId === item.id

                  return (
                    <article
                      className={`data-export-row ${selected ? 'selected' : ''}`}
                      key={item.id}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleDataset(item.id)}
                        />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.table}</small>
                        </span>
                      </label>

                      <button
                        type="button"
                        className="data-export-download-button"
                        onClick={() => exportSingleDataset(item)}
                        disabled={exporting || bulkExporting}
                      >
                        {exporting ? <RefreshCw size={16} /> : <FileDown size={16} />}
                        CSV
                      </button>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <section className="data-export-history-card">
        <div>
          <h3>Recent export result</h3>
          <span>
            If any table is not created in your current build, Spizy will skip it
            and show the reason here.
          </span>
        </div>

        {lastResults.length === 0 ? (
          <div className="data-export-empty-result">
            No export has been started yet.
          </div>
        ) : (
          <div className="data-export-results">
            {lastResults.map((result) => (
              <div
                className={`data-export-result-row ${result.ok ? 'ok' : 'error'}`}
                key={`${result.id}-${result.timestamp}`}
              >
                <strong>{result.label}</strong>
                <span>
                  {result.ok
                    ? `${result.count} row${result.count === 1 ? '' : 's'} downloaded`
                    : result.error}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

function DataStatCard({ icon, label, value, text }) {
  return (
    <article className="data-export-stat-card">
      <div className="data-export-stat-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{text}</small>
      </div>
    </article>
  )
}

async function exportDataset({ item, restaurantId, restaurantName, rangeFilter }) {
  const timestamp = new Date().toISOString()

  try {
    let query = supabase
      .from(item.table)
      .select(item.select || '*')
      .eq(item.restaurantFilter || 'restaurant_id', restaurantId)
      .order(item.dateColumn || 'created_at', { ascending: false })
      .limit(5000)

    const dateFrom = getDateFromRange(rangeFilter)

    if (dateFrom && item.dateColumn) {
      query = query.gte(item.dateColumn, dateFrom.toISOString())
    }

    const { data, error } = await query

    if (error) {
      return {
        id: item.id,
        label: item.label,
        ok: false,
        error: error.message,
        timestamp,
      }
    }

    const rows = Array.isArray(data) ? data : []
    const csv = rowsToCsv(rows)
    const fileName = buildFileName({
      restaurantName,
      datasetId: item.id,
      rangeFilter,
    })

    downloadCsv(fileName, csv)

    return {
      id: item.id,
      label: item.label,
      ok: true,
      count: rows.length,
      timestamp,
    }
  } catch (error) {
    return {
      id: item.id,
      label: item.label,
      ok: false,
      error: error.message || 'Export failed',
      timestamp,
    }
  }
}

function getDateFromRange(range) {
  const now = new Date()

  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }

  if (range === '7d') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  }

  if (range === '30d') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }

  if (range === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }

  return null
}

function rowsToCsv(rows) {
  if (!rows.length) return ''

  const columns = Array.from(
    rows.reduce((columnSet, row) => {
      Object.keys(row || {}).forEach((key) => columnSet.add(key))
      return columnSet
    }, new Set()),
  )

  const header = columns.map(csvEscape).join(',')
  const body = rows
    .map((row) =>
      columns
        .map((column) => csvEscape(formatCsvValue(row?.[column])))
        .join(','),
    )
    .join('\n')

  return [header, body].filter(Boolean).join('\n')
}

function formatCsvValue(value) {
  if (value === null || value === undefined) return ''

  if (typeof value === 'object') return JSON.stringify(value)

  return String(value)
}

function csvEscape(value) {
  const stringValue = String(value ?? '')

  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`
  }

  return stringValue
}

function buildFileName({ restaurantName, datasetId, rangeFilter }) {
  const cleanRestaurant = String(restaurantName || 'restaurant')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const date = new Date().toISOString().slice(0, 10)

  return `${cleanRestaurant || 'restaurant'}-${datasetId}-${rangeFilter}-${date}.csv`
}

function downloadCsv(fileName, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default DataExportManagement
