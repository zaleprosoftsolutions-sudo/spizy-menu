import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FilePlus2,
  HandCoins,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Truck,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './PurchasesManagement.css'

const emptySupplierDraft = {
  name: '',
  phone: '',
  email: '',
  address: '',
  taxNumber: '',
  notes: '',
}

const emptyPurchaseDraft = {
  supplierId: '',
  invoiceNumber: '',
  purchaseDate: getLocalDateTimeValue(new Date()),
  paymentStatus: 'unpaid',
  paymentMethod: 'cash',
  amountPaid: '0',
  taxAmount: '0',
  discountAmount: '0',
  notes: '',
}

const paymentStatuses = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
]

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'online', label: 'Online' },
  { value: 'credit', label: 'Supplier credit' },
]

function PurchasesManagement({ restaurant }) {
  const [suppliers, setSuppliers] = useState([])
  const [items, setItems] = useState([])
  const [purchases, setPurchases] = useState([])
  const [purchaseItems, setPurchaseItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [receivingId, setReceivingId] = useState('')
  const [supplierPanelOpen, setSupplierPanelOpen] = useState(false)
  const [purchasePanelOpen, setPurchasePanelOpen] = useState(false)
  const [supplierDraft, setSupplierDraft] = useState(emptySupplierDraft)
  const [purchaseDraft, setPurchaseDraft] = useState(emptyPurchaseDraft)
  const [purchaseRows, setPurchaseRows] = useState([createPurchaseRow()])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [message, setMessage] = useState('')

  const showMessage = (text) => {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 3200)
  }

  const loadPurchases = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [supplierResult, itemResult, purchaseResult, purchaseItemResult] =
      await Promise.all([
        supabase
          .from('restaurant_suppliers')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('menu_items')
          .select(
            `
              id,
              name,
              price,
              image_url,
              stock_unit,
              track_stock,
              stock_quantity,
              category:menu_categories (
                id,
                name
              )
            `,
          )
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false)
          .order('name', { ascending: true }),
        supabase
          .from('restaurant_purchases')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('purchase_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('restaurant_purchase_items')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: true }),
      ])

    setLoading(false)

    if (supplierResult.error) {
      showMessage(supplierResult.error.message)
      return
    }

    if (itemResult.error) {
      showMessage(itemResult.error.message)
      return
    }

    if (purchaseResult.error) {
      showMessage(purchaseResult.error.message)
      return
    }

    setSuppliers(supplierResult.data || [])
    setItems(itemResult.data || [])
    setPurchases(purchaseResult.data || [])
    setPurchaseItems(purchaseItemResult.data || [])
  }, [restaurant?.id])

  useEffect(() => {
    loadPurchases()
  }, [loadPurchases])

  const itemLookup = useMemo(() => {
    return items.reduce((map, item) => {
      map[item.id] = item
      return map
    }, {})
  }, [items])

  const supplierLookup = useMemo(() => {
    return suppliers.reduce((map, supplier) => {
      map[supplier.id] = supplier
      return map
    }, {})
  }, [suppliers])

  const purchaseItemsByPurchaseId = useMemo(() => {
    return purchaseItems.reduce((map, item) => {
      if (!map[item.purchase_id]) map[item.purchase_id] = []
      map[item.purchase_id].push(item)
      return map
    }, {})
  }, [purchaseItems])

  const purchaseTotals = useMemo(() => {
    return purchaseRows.reduce(
      (total, row) => {
        const quantity = Number(row.quantity || 0)
        const unitCost = Number(row.unitCost || 0)
        const lineTotal = quantity * unitCost

        total.subtotal += lineTotal
        total.quantity += quantity
        return total
      },
      { subtotal: 0, quantity: 0 },
    )
  }, [purchaseRows])

  const grandTotal = useMemo(() => {
    return Math.max(
      Number(purchaseTotals.subtotal || 0) +
        Number(purchaseDraft.taxAmount || 0) -
        Number(purchaseDraft.discountAmount || 0),
      0,
    )
  }, [purchaseDraft.discountAmount, purchaseDraft.taxAmount, purchaseTotals.subtotal])

  const stats = useMemo(() => {
    const receivedPurchases = purchases.filter(
      (purchase) => purchase.status === 'received',
    )
    const draftPurchases = purchases.filter((purchase) => purchase.status === 'draft')
    const paidTotal = purchases.reduce(
      (sum, purchase) => sum + Number(purchase.amount_paid || 0),
      0,
    )
    const totalValue = purchases.reduce(
      (sum, purchase) => sum + Number(purchase.total_amount || 0),
      0,
    )

    return {
      suppliers: suppliers.filter((supplier) => supplier.is_active !== false).length,
      received: receivedPurchases.length,
      draft: draftPurchases.length,
      totalValue,
      due: Math.max(totalValue - paidTotal, 0),
    }
  }, [purchases, suppliers])

  const filteredPurchases = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return purchases.filter((purchase) => {
      if (statusFilter !== 'all' && purchase.status !== statusFilter) return false

      if (!keyword) return true

      const relatedItems = purchaseItemsByPurchaseId[purchase.id] || []
      const itemText = relatedItems.map((item) => item.item_name).join(' ')

      return [
        purchase.supplier_name,
        purchase.invoice_number,
        purchase.payment_status,
        purchase.payment_method,
        purchase.notes,
        itemText,
      ].some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  }, [purchaseItemsByPurchaseId, purchases, search, statusFilter])

  const resetPurchaseForm = () => {
    setPurchaseDraft({
      ...emptyPurchaseDraft,
      purchaseDate: getLocalDateTimeValue(new Date()),
      supplierId: suppliers[0]?.id || '',
    })
    setPurchaseRows([createPurchaseRow()])
  }

  const openPurchasePanel = () => {
    setPurchaseDraft({
      ...emptyPurchaseDraft,
      purchaseDate: getLocalDateTimeValue(new Date()),
      supplierId: suppliers[0]?.id || '',
    })
    setPurchaseRows([createPurchaseRow()])
    setPurchasePanelOpen(true)
  }

  const handleSupplierDraftChange = (key, value) => {
    setSupplierDraft((current) => ({ ...current, [key]: value }))
  }

  const handlePurchaseDraftChange = (key, value) => {
    setPurchaseDraft((current) => ({ ...current, [key]: value }))
  }

  const handlePurchaseRowChange = (rowId, key, value) => {
    setPurchaseRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) return row

        const nextRow = { ...row, [key]: value }

        if (key === 'itemId') {
          const selectedItem = itemLookup[value]
          nextRow.itemName = selectedItem?.name || ''
          nextRow.stockUnit = selectedItem?.stock_unit || 'pcs'
          if (!nextRow.unitCost) {
            nextRow.unitCost = selectedItem?.price ? String(selectedItem.price) : ''
          }
        }

        return nextRow
      }),
    )
  }

  const addPurchaseRow = () => {
    setPurchaseRows((current) => [...current, createPurchaseRow()])
  }

  const removePurchaseRow = (rowId) => {
    setPurchaseRows((current) =>
      current.length === 1
        ? [createPurchaseRow()]
        : current.filter((row) => row.id !== rowId),
    )
  }

  const handleCreateSupplier = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const supplierName = supplierDraft.name.trim()

    if (!supplierName) {
      showMessage('Supplier name is required.')
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from('restaurant_suppliers')
      .insert({
        restaurant_id: restaurant.id,
        name: supplierName,
        phone: supplierDraft.phone.trim() || null,
        email: supplierDraft.email.trim() || null,
        address: supplierDraft.address.trim() || null,
        tax_number: supplierDraft.taxNumber.trim() || null,
        notes: supplierDraft.notes.trim() || null,
        is_active: true,
      })
      .select('*')
      .single()

    setSaving(false)

    if (error) {
      showMessage(error.message)
      return
    }

    setSuppliers((current) => [data, ...current])
    setSupplierDraft(emptySupplierDraft)
    setSupplierPanelOpen(false)
    setPurchaseDraft((current) => ({ ...current, supplierId: data.id }))
    showMessage('Supplier added.')
  }

  const handleSavePurchase = async ({ receiveNow = false }) => {
    if (!restaurant?.id) return

    const cleanedRows = purchaseRows
      .map((row) => {
        const selectedItem = itemLookup[row.itemId]
        const quantity = Number(row.quantity || 0)
        const unitCost = Number(row.unitCost || 0)

        return {
          ...row,
          itemName: selectedItem?.name || row.itemName || '',
          stockUnit: selectedItem?.stock_unit || row.stockUnit || 'pcs',
          quantity,
          unitCost,
          totalCost: quantity * unitCost,
        }
      })
      .filter((row) => row.itemId && row.quantity > 0 && row.unitCost >= 0)

    if (cleanedRows.length === 0) {
      showMessage('Add at least one item with quantity.')
      return
    }

    const selectedSupplier = supplierLookup[purchaseDraft.supplierId]

    setSaving(true)

    const purchasePayload = {
      restaurant_id: restaurant.id,
      supplier_id: selectedSupplier?.id || null,
      supplier_name: selectedSupplier?.name || 'Direct purchase',
      invoice_number: purchaseDraft.invoiceNumber.trim() || null,
      purchase_date: purchaseDraft.purchaseDate
        ? new Date(purchaseDraft.purchaseDate).toISOString()
        : new Date().toISOString(),
      status: 'draft',
      payment_status: purchaseDraft.paymentStatus,
      payment_method: purchaseDraft.paymentMethod,
      subtotal_amount: Number(purchaseTotals.subtotal || 0),
      tax_amount: Number(purchaseDraft.taxAmount || 0),
      discount_amount: Number(purchaseDraft.discountAmount || 0),
      total_amount: grandTotal,
      amount_paid: Number(purchaseDraft.amountPaid || 0),
      notes: purchaseDraft.notes.trim() || null,
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from('restaurant_purchases')
      .insert(purchasePayload)
      .select('*')
      .single()

    if (purchaseError) {
      setSaving(false)
      showMessage(purchaseError.message)
      return
    }

    const itemPayload = cleanedRows.map((row) => ({
      purchase_id: purchase.id,
      restaurant_id: restaurant.id,
      item_id: row.itemId,
      item_name: row.itemName,
      quantity: row.quantity,
      unit_cost: row.unitCost,
      total_cost: row.totalCost,
      stock_unit: row.stockUnit,
    }))

    const { data: insertedItems, error: itemError } = await supabase
      .from('restaurant_purchase_items')
      .insert(itemPayload)
      .select('*')

    if (itemError) {
      setSaving(false)
      showMessage(itemError.message)
      return
    }

    let finalPurchase = purchase

    if (receiveNow) {
      const { error: receiveError } = await supabase.rpc(
        'receive_restaurant_purchase',
        {
          p_purchase_id: purchase.id,
        },
      )

      if (receiveError) {
        setSaving(false)
        showMessage(receiveError.message)
        return
      }

      finalPurchase = {
        ...purchase,
        status: 'received',
        received_at: new Date().toISOString(),
      }
    }

    setSaving(false)
    setPurchases((current) => [finalPurchase, ...current])
    setPurchaseItems((current) => [...current, ...(insertedItems || [])])
    resetPurchaseForm()
    setPurchasePanelOpen(false)
    showMessage(receiveNow ? 'Purchase saved and stock received.' : 'Purchase draft saved.')

    if (receiveNow) {
      loadPurchases()
    }
  }

  const handleReceivePurchase = async (purchaseId) => {
    setReceivingId(purchaseId)

    const { error } = await supabase.rpc('receive_restaurant_purchase', {
      p_purchase_id: purchaseId,
    })

    setReceivingId('')

    if (error) {
      showMessage(error.message)
      return
    }

    setPurchases((current) =>
      current.map((purchase) =>
        purchase.id === purchaseId
          ? {
              ...purchase,
              status: 'received',
              received_at: new Date().toISOString(),
            }
          : purchase,
      ),
    )
    showMessage('Purchase received and stock updated.')
    loadPurchases()
  }

  const handleCancelPurchase = async (purchaseId) => {
    const { error } = await supabase
      .from('restaurant_purchases')
      .update({ status: 'cancelled' })
      .eq('id', purchaseId)
      .eq('restaurant_id', restaurant.id)
      .eq('status', 'draft')

    if (error) {
      showMessage(error.message)
      return
    }

    setPurchases((current) =>
      current.map((purchase) =>
        purchase.id === purchaseId ? { ...purchase, status: 'cancelled' } : purchase,
      ),
    )
    showMessage('Draft purchase cancelled.')
  }

  const handleToggleSupplier = async (supplier) => {
    const nextStatus = !supplier.is_active

    const { error } = await supabase
      .from('restaurant_suppliers')
      .update({ is_active: nextStatus })
      .eq('id', supplier.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showMessage(error.message)
      return
    }

    setSuppliers((current) =>
      current.map((item) =>
        item.id === supplier.id ? { ...item, is_active: nextStatus } : item,
      ),
    )
  }

  return (
    <section className="purchases-page">
      {message && <div className="purchases-toast">{message}</div>}

      <div className="purchases-hero">
        <div>
          <p className="purchases-kicker">SUPPLIERS & STOCK-IN</p>
          <h1>Purchases</h1>
          <span>
            Record supplier bills, receive stock and keep inventory movements clean.
          </span>
        </div>

        <div className="purchases-hero-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setSupplierPanelOpen(true)}
          >
            <Building2 size={18} />
            Add supplier
          </button>

          <button type="button" onClick={openPurchasePanel}>
            <FilePlus2 size={18} />
            New purchase
          </button>
        </div>
      </div>

      <div className="purchases-stat-grid">
        <PurchaseStatCard
          icon={<Truck size={22} />}
          label="Active suppliers"
          value={stats.suppliers}
        />
        <PurchaseStatCard
          icon={<PackageCheck size={22} />}
          label="Received purchases"
          value={stats.received}
        />
        <PurchaseStatCard
          icon={<ClipboardList size={22} />}
          label="Draft bills"
          value={stats.draft}
        />
        <PurchaseStatCard
          icon={<HandCoins size={22} />}
          label="Supplier due"
          value={`${restaurant?.currency || 'AED'} ${stats.due.toFixed(2)}`}
        />
      </div>

      <div className="purchases-work-grid">
        <div className="purchases-main-card">
          <div className="purchases-toolbar">
            <div className="purchases-search-box">
              <Search size={18} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search supplier, invoice, item or payment..."
              />
            </div>

            <div className="purchases-filter-row">
              {['all', 'draft', 'received', 'cancelled'].map((status) => (
                <button
                  type="button"
                  key={status}
                  className={statusFilter === status ? 'active' : ''}
                  onClick={() => setStatusFilter(status)}
                >
                  {formatPurchaseStatus(status)}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="purchases-empty">Loading purchases...</div>
          ) : filteredPurchases.length === 0 ? (
            <div className="purchases-empty">
              <PackageCheck size={34} />
              <strong>No purchases found</strong>
              <span>Create your first supplier bill and receive stock.</span>
            </div>
          ) : (
            <div className="purchases-list">
              {filteredPurchases.map((purchase) => (
                <PurchaseCard
                  purchase={purchase}
                  items={purchaseItemsByPurchaseId[purchase.id] || []}
                  currency={restaurant?.currency || 'AED'}
                  receiving={receivingId === purchase.id}
                  onReceive={() => handleReceivePurchase(purchase.id)}
                  onCancel={() => handleCancelPurchase(purchase.id)}
                  key={purchase.id}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="purchases-side-card">
          <div className="purchases-side-head">
            <div>
              <p className="purchases-kicker">SUPPLIERS</p>
              <h3>Supplier list</h3>
            </div>
            <button type="button" onClick={() => setSupplierPanelOpen(true)}>
              <Plus size={16} />
            </button>
          </div>

          {suppliers.length === 0 ? (
            <div className="purchases-side-empty">
              Add suppliers to track purchase bills and credit dues.
            </div>
          ) : (
            <div className="purchases-supplier-list">
              {suppliers.slice(0, 12).map((supplier) => (
                <article
                  className={`purchases-supplier-card ${
                    supplier.is_active === false ? 'inactive' : ''
                  }`}
                  key={supplier.id}
                >
                  <div>
                    <strong>{supplier.name}</strong>
                    <span>{supplier.phone || supplier.email || 'No contact added'}</span>
                  </div>
                  <button type="button" onClick={() => handleToggleSupplier(supplier)}>
                    {supplier.is_active === false ? 'Activate' : 'Active'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </aside>
      </div>

      {supplierPanelOpen && (
        <div className="purchases-modal-overlay" onClick={() => setSupplierPanelOpen(false)}>
          <form
            className="purchases-modal supplier"
            onSubmit={handleCreateSupplier}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="purchases-modal-head">
              <div>
                <p className="purchases-kicker">NEW SUPPLIER</p>
                <h2>Add supplier</h2>
              </div>
              <button type="button" onClick={() => setSupplierPanelOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="purchases-form-grid two">
              <label>
                Supplier name
                <input
                  type="text"
                  value={supplierDraft.name}
                  onChange={(event) =>
                    handleSupplierDraftChange('name', event.target.value)
                  }
                  placeholder="Fresh Foods Trading"
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  value={supplierDraft.phone}
                  onChange={(event) =>
                    handleSupplierDraftChange('phone', event.target.value)
                  }
                  placeholder="+971..."
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={supplierDraft.email}
                  onChange={(event) =>
                    handleSupplierDraftChange('email', event.target.value)
                  }
                  placeholder="supplier@example.com"
                />
              </label>
              <label>
                TRN / Tax number
                <input
                  type="text"
                  value={supplierDraft.taxNumber}
                  onChange={(event) =>
                    handleSupplierDraftChange('taxNumber', event.target.value)
                  }
                  placeholder="Optional"
                />
              </label>
              <label className="wide">
                Address
                <textarea
                  value={supplierDraft.address}
                  onChange={(event) =>
                    handleSupplierDraftChange('address', event.target.value)
                  }
                  rows="3"
                  placeholder="Supplier address"
                />
              </label>
              <label className="wide">
                Notes
                <textarea
                  value={supplierDraft.notes}
                  onChange={(event) =>
                    handleSupplierDraftChange('notes', event.target.value)
                  }
                  rows="3"
                  placeholder="Payment terms, contact person, delivery notes..."
                />
              </label>
            </div>

            <button type="submit" className="purchases-save-button" disabled={saving}>
              <Save size={17} />
              {saving ? 'Saving...' : 'Save supplier'}
            </button>
          </form>
        </div>
      )}

      {purchasePanelOpen && (
        <div className="purchases-modal-overlay" onClick={() => setPurchasePanelOpen(false)}>
          <div
            className="purchases-modal purchase"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="purchases-modal-head">
              <div>
                <p className="purchases-kicker">NEW PURCHASE</p>
                <h2>Supplier bill / stock-in</h2>
              </div>
              <button type="button" onClick={() => setPurchasePanelOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="purchases-form-grid three">
              <label>
                Supplier
                <select
                  value={purchaseDraft.supplierId}
                  onChange={(event) =>
                    handlePurchaseDraftChange('supplierId', event.target.value)
                  }
                >
                  <option value="">Direct purchase / no supplier</option>
                  {suppliers
                    .filter((supplier) => supplier.is_active !== false)
                    .map((supplier) => (
                      <option value={supplier.id} key={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                </select>
              </label>

              <label>
                Invoice number
                <input
                  type="text"
                  value={purchaseDraft.invoiceNumber}
                  onChange={(event) =>
                    handlePurchaseDraftChange('invoiceNumber', event.target.value)
                  }
                  placeholder="INV-1001"
                />
              </label>

              <label>
                Purchase date/time
                <input
                  type="datetime-local"
                  value={purchaseDraft.purchaseDate}
                  onChange={(event) =>
                    handlePurchaseDraftChange('purchaseDate', event.target.value)
                  }
                />
              </label>
            </div>

            <div className="purchases-items-editor">
              <div className="purchases-items-editor-head">
                <div>
                  <strong>Items received</strong>
                  <span>Select menu items and enter purchase quantity/cost.</span>
                </div>
                <button type="button" onClick={addPurchaseRow}>
                  <Plus size={16} />
                  Add item
                </button>
              </div>

              {purchaseRows.map((row, index) => {
                const quantity = Number(row.quantity || 0)
                const unitCost = Number(row.unitCost || 0)
                const lineTotal = quantity * unitCost

                return (
                  <div className="purchases-item-row" key={row.id}>
                    <label>
                      Item
                      <select
                        value={row.itemId}
                        onChange={(event) =>
                          handlePurchaseRowChange(row.id, 'itemId', event.target.value)
                        }
                      >
                        <option value="">Select item</option>
                        {items.map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name} {item.category?.name ? `• ${item.category.name}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Qty
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={row.quantity}
                        onChange={(event) =>
                          handlePurchaseRowChange(row.id, 'quantity', event.target.value)
                        }
                        placeholder="0"
                      />
                    </label>

                    <label>
                      Unit cost
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.unitCost}
                        onChange={(event) =>
                          handlePurchaseRowChange(row.id, 'unitCost', event.target.value)
                        }
                        placeholder="0.00"
                      />
                    </label>

                    <label>
                      Unit
                      <input
                        type="text"
                        value={row.stockUnit}
                        onChange={(event) =>
                          handlePurchaseRowChange(row.id, 'stockUnit', event.target.value)
                        }
                        placeholder="pcs"
                      />
                    </label>

                    <div className="purchases-line-total">
                      <span>Total</span>
                      <strong>
                        {restaurant?.currency || 'AED'} {lineTotal.toFixed(2)}
                      </strong>
                    </div>

                    <button
                      type="button"
                      className="purchases-row-remove"
                      onClick={() => removePurchaseRow(row.id)}
                      aria-label={`Remove row ${index + 1}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="purchases-form-grid four">
              <label>
                Payment status
                <select
                  value={purchaseDraft.paymentStatus}
                  onChange={(event) =>
                    handlePurchaseDraftChange('paymentStatus', event.target.value)
                  }
                >
                  {paymentStatuses.map((status) => (
                    <option value={status.value} key={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Payment method
                <select
                  value={purchaseDraft.paymentMethod}
                  onChange={(event) =>
                    handlePurchaseDraftChange('paymentMethod', event.target.value)
                  }
                >
                  {paymentMethods.map((method) => (
                    <option value={method.value} key={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Amount paid
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchaseDraft.amountPaid}
                  onChange={(event) =>
                    handlePurchaseDraftChange('amountPaid', event.target.value)
                  }
                />
              </label>

              <label>
                Tax amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchaseDraft.taxAmount}
                  onChange={(event) =>
                    handlePurchaseDraftChange('taxAmount', event.target.value)
                  }
                />
              </label>

              <label>
                Discount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchaseDraft.discountAmount}
                  onChange={(event) =>
                    handlePurchaseDraftChange('discountAmount', event.target.value)
                  }
                />
              </label>

              <label className="wide three-wide">
                Notes
                <input
                  type="text"
                  value={purchaseDraft.notes}
                  onChange={(event) =>
                    handlePurchaseDraftChange('notes', event.target.value)
                  }
                  placeholder="Purchase notes"
                />
              </label>
            </div>

            <div className="purchases-modal-total-card">
              <div>
                <span>Items</span>
                <strong>{purchaseRows.length}</strong>
              </div>
              <div>
                <span>Total quantity</span>
                <strong>{purchaseTotals.quantity.toFixed(3)}</strong>
              </div>
              <div>
                <span>Subtotal</span>
                <strong>
                  {restaurant?.currency || 'AED'} {purchaseTotals.subtotal.toFixed(2)}
                </strong>
              </div>
              <div className="grand">
                <span>Grand total</span>
                <strong>
                  {restaurant?.currency || 'AED'} {grandTotal.toFixed(2)}
                </strong>
              </div>
            </div>

            <div className="purchases-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => handleSavePurchase({ receiveNow: false })}
                disabled={saving}
              >
                <Save size={17} />
                {saving ? 'Saving...' : 'Save draft'}
              </button>
              <button
                type="button"
                onClick={() => handleSavePurchase({ receiveNow: true })}
                disabled={saving}
              >
                <CheckCircle2 size={17} />
                {saving ? 'Saving...' : 'Save & receive stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function PurchaseStatCard({ icon, label, value }) {
  return (
    <article className="purchases-stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function PurchaseCard({ purchase, items, currency, receiving, onReceive, onCancel }) {
  const statusClass = purchase.status || 'draft'

  return (
    <article className={`purchase-card status-${statusClass}`}>
      <div className="purchase-card-head">
        <div>
          <span>{purchase.supplier_name || 'Direct purchase'}</span>
          <strong>{purchase.invoice_number || 'No invoice number'}</strong>
          <small>{formatPurchaseDate(purchase.purchase_date)}</small>
        </div>

        <div className="purchase-card-total">
          <strong>
            {currency} {Number(purchase.total_amount || 0).toFixed(2)}
          </strong>
          <span>{formatPurchaseStatus(purchase.status)}</span>
        </div>
      </div>

      <div className="purchase-card-meta">
        <span>
          <CreditCard size={15} />
          {formatPaymentStatus(purchase.payment_status)} •{' '}
          {formatPaymentMethod(purchase.payment_method)}
        </span>
        <span>
          Paid {currency} {Number(purchase.amount_paid || 0).toFixed(2)}
        </span>
        {purchase.received_at && <span>Received {formatPurchaseDate(purchase.received_at)}</span>}
      </div>

      <div className="purchase-card-items">
        {items.length === 0 ? (
          <span>No items added.</span>
        ) : (
          items.slice(0, 4).map((item) => (
            <div key={item.id}>
              <span>{item.item_name}</span>
              <strong>
                {Number(item.quantity || 0).toFixed(3)} {item.stock_unit || 'pcs'} ×{' '}
                {currency} {Number(item.unit_cost || 0).toFixed(2)}
              </strong>
            </div>
          ))
        )}
        {items.length > 4 && <small>+{items.length - 4} more item(s)</small>}
      </div>

      {purchase.notes && <p className="purchase-card-note">{purchase.notes}</p>}

      {purchase.status === 'draft' && (
        <div className="purchase-card-actions">
          <button type="button" onClick={onCancel} className="secondary">
            Cancel draft
          </button>
          <button type="button" onClick={onReceive} disabled={receiving}>
            <RefreshCw size={16} />
            {receiving ? 'Receiving...' : 'Receive stock'}
          </button>
        </div>
      )}
    </article>
  )
}

function createPurchaseRow() {
  return {
    id: `row-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    itemId: '',
    itemName: '',
    quantity: '',
    unitCost: '',
    stockUnit: 'pcs',
  }
}

function getLocalDateTimeValue(date) {
  const nextDate = new Date(date)
  nextDate.setMinutes(nextDate.getMinutes() - nextDate.getTimezoneOffset())
  return nextDate.toISOString().slice(0, 16)
}

function formatPurchaseStatus(status) {
  if (status === 'all') return 'All'
  if (status === 'received') return 'Received'
  if (status === 'cancelled') return 'Cancelled'
  return 'Draft'
}

function formatPaymentStatus(status) {
  if (status === 'paid') return 'Paid'
  if (status === 'partial') return 'Partial'
  return 'Unpaid'
}

function formatPaymentMethod(method) {
  if (method === 'card') return 'Card'
  if (method === 'bank') return 'Bank transfer'
  if (method === 'online') return 'Online'
  if (method === 'credit') return 'Supplier credit'
  return 'Cash'
}

function formatPurchaseDate(value) {
  if (!value) return 'Not set'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Not set'
  }
}

export default PurchasesManagement
