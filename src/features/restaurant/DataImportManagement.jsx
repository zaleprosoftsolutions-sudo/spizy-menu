import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './DataImportManagement.css'

const importTypes = [
  {
    id: 'categories',
    title: 'Menu Categories',
    description: 'Bulk upload food categories like Biriyani, Drinks, Desserts.',
    tableName: 'menu_categories',
    requiredHeaders: ['name'],
    optionalHeaders: ['description', 'is_active'],
    templateRows: [
      ['name', 'description', 'is_active'],
      ['Biriyani', 'Rice specials and family packs', 'true'],
      ['Fresh Juices', 'Cold drinks and juices', 'true'],
    ],
  },
  {
    id: 'items',
    title: 'Menu Items / Products',
    description: 'Bulk upload food items with price, stock and category mapping.',
    tableName: 'menu_items',
    requiredHeaders: ['name', 'price'],
    optionalHeaders: [
      'category_name',
      'description',
      'compare_price',
      'is_available',
      'track_stock',
      'stock_quantity',
      'low_stock_quantity',
      'stock_unit',
    ],
    templateRows: [
      [
        'name',
        'category_name',
        'description',
        'price',
        'compare_price',
        'is_available',
        'track_stock',
        'stock_quantity',
        'low_stock_quantity',
        'stock_unit',
      ],
      [
        'Chicken Biriyani',
        'Biriyani',
        'Chicken biriyani with raita',
        '18.00',
        '22.00',
        'true',
        'true',
        '50',
        '10',
        'pcs',
      ],
      [
        'Mango Juice',
        'Fresh Juices',
        'Fresh mango juice',
        '8.00',
        '',
        'true',
        'false',
        '',
        '',
        'pcs',
      ],
    ],
  },
  {
    id: 'customers',
    title: 'Customers',
    description: 'Import customer phone numbers and opening reward points.',
    tableName: 'restaurant_customers',
    requiredHeaders: ['customer_phone'],
    optionalHeaders: ['customer_name', 'reward_points', 'total_orders', 'total_spend'],
    templateRows: [
      ['customer_name', 'customer_phone', 'reward_points', 'total_orders', 'total_spend'],
      ['Rahul', '+971501234567', '25', '2', '80.00'],
      ['Asha', '+919876543210', '0', '0', '0'],
    ],
  },
  {
    id: 'suppliers',
    title: 'Suppliers',
    description: 'Bulk upload suppliers for purchases and payments.',
    tableName: 'restaurant_suppliers',
    requiredHeaders: ['name'],
    optionalHeaders: ['phone', 'email', 'tax_number', 'address', 'notes', 'is_active'],
    templateRows: [
      ['name', 'phone', 'email', 'tax_number', 'address', 'notes', 'is_active'],
      ['Fresh Meat Supplier', '+971501112233', 'sales@example.com', 'TRN123', 'Dubai', 'Weekly supplier', 'true'],
      ['Vegetable Market', '+971509998888', '', '', 'Sharjah', '', 'true'],
    ],
  },
]

function DataImportManagement({ restaurant }) {
  const { showToast } = useAppFeedback()
  const fileInputRef = useRef(null)
  const [selectedTypeId, setSelectedTypeId] = useState('items')
  const [rawCsv, setRawCsv] = useState('')
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [skipExisting, setSkipExisting] = useState(true)
  const [createMissingCategories, setCreateMissingCategories] = useState(true)
  const [importResult, setImportResult] = useState(null)

  const selectedType = useMemo(
    () => importTypes.find((item) => item.id === selectedTypeId) || importTypes[0],
    [selectedTypeId],
  )

  const parsedRows = useMemo(() => {
    if (!rawCsv.trim()) return { headers: [], rows: [], errors: [] }

    return parseCsvWithHeaders(rawCsv)
  }, [rawCsv])

  const validation = useMemo(() => {
    return validateImportRows(selectedType, parsedRows)
  }, [parsedRows, selectedType])

  const previewRows = parsedRows.rows.slice(0, 8)

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]

    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      showToast({
        type: 'warning',
        title: 'CSV file required',
        message: 'Please upload a .csv file only.',
      })
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast({
        type: 'warning',
        title: 'File too large',
        message: 'Keep CSV files below 2 MB for fast import.',
      })
      return
    }

    const text = await file.text()
    setRawCsv(text)
    setFileName(file.name)
    setImportResult(null)
  }

  const clearUpload = () => {
    setRawCsv('')
    setFileName('')
    setImportResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const downloadTemplate = () => {
    const csv = selectedType.templateRows
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\n')

    downloadTextFile(csv, `spizy-${selectedType.id}-import-template.csv`, 'text/csv')
  }

  const handleImport = async () => {
    if (!restaurant?.id) {
      showToast({
        type: 'warning',
        title: 'Restaurant missing',
        message: 'Restaurant profile is required before import.',
      })
      return
    }

    if (validation.blocked) {
      showToast({
        type: 'warning',
        title: 'Fix CSV first',
        message: validation.errors[0] || 'Required CSV columns are missing.',
      })
      return
    }

    setImporting(true)

    try {
      let result

      if (selectedType.id === 'categories') {
        result = await importCategories({ restaurant, rows: parsedRows.rows, skipExisting })
      } else if (selectedType.id === 'items') {
        result = await importMenuItems({
          restaurant,
          rows: parsedRows.rows,
          skipExisting,
          createMissingCategories,
        })
      } else if (selectedType.id === 'customers') {
        result = await importCustomers({ restaurant, rows: parsedRows.rows })
      } else if (selectedType.id === 'suppliers') {
        result = await importSuppliers({ restaurant, rows: parsedRows.rows, skipExisting })
      }

      setImportResult(result)

      showToast({
        type: 'success',
        title: 'Import completed',
        message: `${result?.inserted || 0} added, ${result?.updated || 0} updated, ${result?.skipped || 0} skipped.`,
      })
    } catch (error) {
      showToast({
        type: 'error',
        title: 'Import failed',
        message: error.message,
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <section className="data-import-page">
      <div className="data-import-hero">
        <div>
          <p className="pricing-label">Data Import</p>
          <h2>Bulk upload center</h2>
          <span>
            Import categories, products, customers and suppliers from CSV without manually typing every record.
          </span>
        </div>

        <div className="data-import-hero-icon">
          <Upload size={30} />
        </div>
      </div>

      <div className="data-import-grid">
        <aside className="import-type-panel">
          <div className="import-type-head">
            <FileSpreadsheet size={18} />
            <strong>Choose import type</strong>
          </div>

          {importTypes.map((type) => (
            <button
              type="button"
              key={type.id}
              className={selectedTypeId === type.id ? 'active' : ''}
              onClick={() => {
                setSelectedTypeId(type.id)
                setImportResult(null)
              }}
            >
              <strong>{type.title}</strong>
              <span>{type.description}</span>
            </button>
          ))}
        </aside>

        <div className="import-main-panel">
          <div className="import-card">
            <div className="import-card-head">
              <div>
                <h3>{selectedType.title}</h3>
                <p>{selectedType.description}</p>
              </div>

              <button type="button" className="secondary-button" onClick={downloadTemplate}>
                <Download size={17} />
                Template
              </button>
            </div>

            <div className="required-columns-card">
              <div>
                <strong>Required columns</strong>
                <span>{selectedType.requiredHeaders.join(', ')}</span>
              </div>

              <div>
                <strong>Optional columns</strong>
                <span>{selectedType.optionalHeaders.join(', ')}</span>
              </div>
            </div>

            <label className="import-drop-zone">
              <input
                type="file"
                accept=".csv,text/csv"
                ref={fileInputRef}
                onChange={handleFileChange}
              />

              <div className="import-drop-icon">
                <Upload size={26} />
              </div>

              <strong>{fileName || 'Upload CSV file'}</strong>
              <span>CSV only • recommended below 2 MB • first row must be column names</span>
            </label>

            {rawCsv && (
              <div className="import-options-row">
                {(selectedType.id === 'categories' || selectedType.id === 'items' || selectedType.id === 'suppliers') && (
                  <label className="import-check-option">
                    <input
                      type="checkbox"
                      checked={skipExisting}
                      onChange={(event) => setSkipExisting(event.target.checked)}
                    />
                    Skip existing names
                  </label>
                )}

                {selectedType.id === 'items' && (
                  <label className="import-check-option">
                    <input
                      type="checkbox"
                      checked={createMissingCategories}
                      onChange={(event) =>
                        setCreateMissingCategories(event.target.checked)
                      }
                    />
                    Auto-create missing categories
                  </label>
                )}

                <button type="button" className="tiny-button danger" onClick={clearUpload}>
                  <X size={15} />
                  Clear
                </button>
              </div>
            )}
          </div>

          <ImportValidationPanel validation={validation} parsedRows={parsedRows} />

          {previewRows.length > 0 && (
            <div className="import-preview-card">
              <div className="import-card-head compact">
                <div>
                  <h3>Preview</h3>
                  <p>Showing first {previewRows.length} rows before import.</p>
                </div>

                <div className="import-count-pill">
                  {parsedRows.rows.length} row{parsedRows.rows.length === 1 ? '' : 's'}
                </div>
              </div>

              <div className="import-preview-table-wrap">
                <table>
                  <thead>
                    <tr>
                      {parsedRows.headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {previewRows.map((row, index) => (
                      <tr key={`${index}-${row.__rowNumber}`}>
                        {parsedRows.headers.map((header) => (
                          <td key={header}>{row[header] || '-'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="import-action-bar">
            <div>
              <strong>Ready to import?</strong>
              <span>
                Spizy validates the CSV first, then uploads only restaurant-level data.
              </span>
            </div>

            <button
              type="button"
              className="primary-button"
              onClick={handleImport}
              disabled={importing || validation.blocked || parsedRows.rows.length === 0}
            >
              {importing ? <RefreshCw size={18} className="spin" /> : <Database size={18} />}
              {importing ? 'Importing...' : 'Start Import'}
            </button>
          </div>

          {importResult && <ImportResultCard result={importResult} />}
        </div>
      </div>
    </section>
  )
}

function ImportValidationPanel({ validation, parsedRows }) {
  if (!parsedRows.headers.length) {
    return (
      <div className="import-status-card muted">
        <FileSpreadsheet size={18} />
        <div>
          <strong>No CSV uploaded yet</strong>
          <span>Download a template, fill it, and upload it here.</span>
        </div>
      </div>
    )
  }

  if (validation.blocked) {
    return (
      <div className="import-status-card danger">
        <AlertTriangle size={18} />
        <div>
          <strong>CSV needs correction</strong>
          {validation.errors.map((error) => (
            <span key={error}>{error}</span>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="import-status-card success">
      <CheckCircle2 size={18} />
      <div>
        <strong>CSV looks ready</strong>
        <span>{parsedRows.rows.length} row{parsedRows.rows.length === 1 ? '' : 's'} ready for import.</span>
      </div>
    </div>
  )
}

function ImportResultCard({ result }) {
  const details = result.details || []

  return (
    <div className="import-result-card">
      <div className="import-result-grid">
        <div>
          <span>Inserted</span>
          <strong>{result.inserted || 0}</strong>
        </div>
        <div>
          <span>Updated</span>
          <strong>{result.updated || 0}</strong>
        </div>
        <div>
          <span>Skipped</span>
          <strong>{result.skipped || 0}</strong>
        </div>
        <div>
          <span>Errors</span>
          <strong>{result.errors || 0}</strong>
        </div>
      </div>

      {details.length > 0 && (
        <div className="import-result-details">
          {details.slice(0, 10).map((detail, index) => (
            <span key={`${detail}-${index}`}>{detail}</span>
          ))}
        </div>
      )}
    </div>
  )
}

async function importCategories({ restaurant, rows, skipExisting }) {
  const existingNames = await getExistingNameSet('menu_categories', restaurant.id)
  const payload = []
  const details = []
  let skipped = 0

  rows.forEach((row) => {
    const name = cleanText(row.name)

    if (!name) {
      skipped += 1
      return
    }

    if (skipExisting && existingNames.has(normalizeKey(name))) {
      skipped += 1
      details.push(`Skipped existing category: ${name}`)
      return
    }

    existingNames.add(normalizeKey(name))
    payload.push({
      restaurant_id: restaurant.id,
      name,
      description: cleanText(row.description) || null,
      is_active: parseBool(row.is_active, true),
      is_deleted: false,
    })
  })

  if (payload.length === 0) return { inserted: 0, updated: 0, skipped, errors: 0, details }

  const { error } = await supabase.from('menu_categories').insert(payload)

  if (error) throw error

  return { inserted: payload.length, updated: 0, skipped, errors: 0, details }
}

async function importMenuItems({
  restaurant,
  rows,
  skipExisting,
  createMissingCategories,
}) {
  const existingItemNames = await getExistingNameSet('menu_items', restaurant.id)
  let categoryMap = await getCategoryMap(restaurant.id)
  const missingCategoryNames = new Set()
  const details = []
  let skipped = 0

  rows.forEach((row) => {
    const categoryName = cleanText(row.category_name)
    if (categoryName && !categoryMap.has(normalizeKey(categoryName))) {
      missingCategoryNames.add(categoryName)
    }
  })

  if (missingCategoryNames.size > 0 && createMissingCategories) {
    const categoryPayload = [...missingCategoryNames].map((name) => ({
      restaurant_id: restaurant.id,
      name,
      is_active: true,
      is_deleted: false,
    }))

    const { error } = await supabase.from('menu_categories').insert(categoryPayload)
    if (error) throw error

    details.push(`Created ${categoryPayload.length} missing categor${categoryPayload.length === 1 ? 'y' : 'ies'}.`)
    categoryMap = await getCategoryMap(restaurant.id)
  }

  const payload = []

  rows.forEach((row) => {
    const name = cleanText(row.name)
    const price = parseMoney(row.price)

    if (!name || price === null) {
      skipped += 1
      return
    }

    if (skipExisting && existingItemNames.has(normalizeKey(name))) {
      skipped += 1
      details.push(`Skipped existing item: ${name}`)
      return
    }

    const categoryName = cleanText(row.category_name)
    const categoryId = categoryName ? categoryMap.get(normalizeKey(categoryName)) || null : null

    if (categoryName && !categoryId && !createMissingCategories) {
      skipped += 1
      details.push(`Skipped ${name}: category not found.`)
      return
    }

    existingItemNames.add(normalizeKey(name))

    payload.push({
      restaurant_id: restaurant.id,
      category_id: categoryId,
      name,
      description: cleanText(row.description) || null,
      price,
      compare_price: parseMoney(row.compare_price),
      is_available: parseBool(row.is_available, true),
      is_deleted: false,
      has_variations: false,
      track_stock: parseBool(row.track_stock, false),
      stock_quantity: parseNumber(row.stock_quantity, 0),
      low_stock_quantity: parseNumber(row.low_stock_quantity, 5),
      stock_unit: cleanText(row.stock_unit) || 'pcs',
    })
  })

  if (payload.length === 0) return { inserted: 0, updated: 0, skipped, errors: 0, details }

  const { error } = await supabase.from('menu_items').insert(payload)

  if (error) throw error

  return { inserted: payload.length, updated: 0, skipped, errors: 0, details }
}

async function importCustomers({ restaurant, rows }) {
  const payload = []
  let skipped = 0

  rows.forEach((row) => {
    const phone = cleanText(row.customer_phone)

    if (!phone) {
      skipped += 1
      return
    }

    payload.push({
      restaurant_id: restaurant.id,
      customer_name: cleanText(row.customer_name) || null,
      customer_phone: phone,
      reward_points: parseNumber(row.reward_points, 0),
      total_orders: Math.max(Math.round(parseNumber(row.total_orders, 0)), 0),
      total_spend: parseMoney(row.total_spend) || 0,
      updated_at: new Date().toISOString(),
    })
  })

  if (payload.length === 0) return { inserted: 0, updated: 0, skipped, errors: 0, details: [] }

  const { error } = await supabase
    .from('restaurant_customers')
    .upsert(payload, { onConflict: 'restaurant_id,customer_phone' })

  if (error) throw error

  return { inserted: 0, updated: payload.length, skipped, errors: 0, details: ['Customers are upserted by phone number.'] }
}

async function importSuppliers({ restaurant, rows, skipExisting }) {
  const existingNames = await getExistingNameSet('restaurant_suppliers', restaurant.id)
  const payload = []
  const details = []
  let skipped = 0

  rows.forEach((row) => {
    const name = cleanText(row.name)

    if (!name) {
      skipped += 1
      return
    }

    if (skipExisting && existingNames.has(normalizeKey(name))) {
      skipped += 1
      details.push(`Skipped existing supplier: ${name}`)
      return
    }

    existingNames.add(normalizeKey(name))
    payload.push({
      restaurant_id: restaurant.id,
      name,
      phone: cleanText(row.phone) || null,
      email: cleanText(row.email) || null,
      tax_number: cleanText(row.tax_number) || null,
      address: cleanText(row.address) || null,
      notes: cleanText(row.notes) || null,
      is_active: parseBool(row.is_active, true),
    })
  })

  if (payload.length === 0) return { inserted: 0, updated: 0, skipped, errors: 0, details }

  const { error } = await supabase.from('restaurant_suppliers').insert(payload)

  if (error) throw error

  return { inserted: payload.length, updated: 0, skipped, errors: 0, details }
}

async function getExistingNameSet(tableName, restaurantId) {
  const { data, error } = await supabase
    .from(tableName)
    .select('name')
    .eq('restaurant_id', restaurantId)

  if (error) throw error

  return new Set((data || []).map((item) => normalizeKey(item.name)))
}

async function getCategoryMap(restaurantId) {
  const { data, error } = await supabase
    .from('menu_categories')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .eq('is_deleted', false)

  if (error) throw error

  return new Map((data || []).map((item) => [normalizeKey(item.name), item.id]))
}

function validateImportRows(type, parsedRows) {
  const errors = [...parsedRows.errors]

  if (!parsedRows.headers.length) {
    return { blocked: true, errors: ['Upload a CSV file first.'] }
  }

  type.requiredHeaders.forEach((header) => {
    if (!parsedRows.headers.includes(header)) {
      errors.push(`Missing required column: ${header}`)
    }
  })

  if (parsedRows.rows.length === 0) {
    errors.push('CSV has no data rows.')
  }

  if (parsedRows.rows.length > 1000) {
    errors.push('Maximum 1000 rows allowed per import. Split larger files.')
  }

  return { blocked: errors.length > 0, errors }
}

function parseCsvWithHeaders(text) {
  try {
    const rows = parseCsvRows(text)
    const headers = (rows[0] || []).map((header) => normalizeHeader(header))
    const dataRows = rows
      .slice(1)
      .filter((row) => row.some((cell) => cleanText(cell)))
      .map((row, rowIndex) => {
        const record = { __rowNumber: rowIndex + 2 }

        headers.forEach((header, index) => {
          record[header] = cleanText(row[index])
        })

        return record
      })

    return { headers, rows: dataRows, errors: [] }
  } catch (error) {
    return { headers: [], rows: [], errors: [error.message] }
  }
}

function parseCsvRows(text) {
  const rows = []
  let row = []
  let cell = ''
  let insideQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"' && insideQuotes && nextChar === '"') {
      cell += '"'
      index += 1
      continue
    }

    if (char === '"') {
      insideQuotes = !insideQuotes
      continue
    }

    if (char === ',' && !insideQuotes) {
      row.push(cell)
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  row.push(cell)
  rows.push(row)

  return rows.filter((item) => item.some((cellValue) => cleanText(cellValue)))
}

function normalizeHeader(value) {
  return cleanText(value).toLowerCase().replaceAll(' ', '_')
}

function normalizeKey(value) {
  return cleanText(value).toLowerCase()
}

function cleanText(value) {
  return String(value ?? '').trim()
}

function parseMoney(value) {
  const cleaned = cleanText(value)
  if (!cleaned) return null
  const numberValue = Number(cleaned.replace(/,/g, ''))
  return Number.isFinite(numberValue) ? Math.max(numberValue, 0) : null
}

function parseNumber(value, fallback = 0) {
  const cleaned = cleanText(value)
  if (!cleaned) return fallback
  const numberValue = Number(cleaned.replace(/,/g, ''))
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function parseBool(value, fallback = false) {
  const cleaned = cleanText(value).toLowerCase()
  if (!cleaned) return fallback
  if (['true', 'yes', 'y', '1', 'active', 'available'].includes(cleaned)) return true
  if (['false', 'no', 'n', '0', 'inactive', 'hidden'].includes(cleaned)) return false
  return fallback
}

function escapeCsvCell(value) {
  const text = String(value ?? '')
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function downloadTextFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default DataImportManagement
