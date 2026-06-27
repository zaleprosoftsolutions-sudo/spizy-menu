import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgePercent,
  CalendarClock,
  CheckCircle2,
  Copy,
  Edit3,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './ComboDealsManagement.css'

const emptyComboForm = {
  comboName: '',
  comboCode: '',
  description: '',
  bundlePrice: '',
  discountPercentage: '',
  discountAmount: '',
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  isActive: true,
  isPublic: true,
  items: [createEmptyItemRow()],
}

function ComboDealsManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [combos, setCombos] = useState([])
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingCombo, setEditingCombo] = useState(null)
  const [form, setForm] = useState(emptyComboForm)

  const currency = restaurant?.currency || 'AED'

  const loadData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data: productData, error: productError } = await supabase
      .from('menu_items')
      .select(
        `
          id,
          name,
          price,
          image_url,
          is_available,
          has_variations,
          category:menu_categories (
            id,
            name
          ),
          variations:menu_item_variations (
            id,
            name,
            price,
            is_available,
            sort_order
          )
        `,
      )
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('name', { ascending: true })

    const { data: comboData, error: comboError } = await supabase
      .from('restaurant_combo_deals')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    let itemData = []

    if (comboData?.length) {
      const { data, error: itemError } = await supabase
        .from('restaurant_combo_deal_items')
        .select('*')
        .in(
          'combo_id',
          comboData.map((combo) => combo.id),
        )
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (itemError) {
        showToast({
          type: 'error',
          title: 'Combo items loading failed',
          message: itemError.message,
        })
      }

      itemData = data || []
    }

    if (productError) {
      showToast({
        type: 'error',
        title: 'Menu items loading failed',
        message: productError.message,
      })
    }

    if (comboError) {
      showToast({
        type: 'error',
        title: 'Combo deals loading failed',
        message: comboError.message,
      })
    }

    const normalizedProducts = (productData || []).map((product) => ({
      ...product,
      variations: getAvailableVariations(product),
    }))

    const productsById = new Map(
      normalizedProducts.map((product) => [product.id, product]),
    )

    const itemsByCombo = itemData.reduce((map, item) => {
      const product = productsById.get(item.menu_item_id)
      const variation = product?.variations?.find(
        (option) => option.id === item.variation_id,
      )
      const unitPrice = Number(variation?.price ?? product?.price ?? 0)

      const comboItem = {
        ...item,
        menuItemName: product?.name || 'Deleted item',
        variationName: variation?.name || '',
        imageUrl: product?.image_url || '',
        unitPrice,
        lineTotal: unitPrice * Number(item.quantity || 0),
      }

      if (!map[item.combo_id]) map[item.combo_id] = []
      map[item.combo_id].push(comboItem)
      return map
    }, {})

    setProducts(normalizedProducts)
    setCombos(
      (comboData || []).map((combo) => ({
        ...combo,
        items: itemsByCombo[combo.id] || [],
      })),
    )
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredCombos = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return combos.filter((combo) => {
      const status = getComboStatus(combo)

      if (statusFilter !== 'all' && status !== statusFilter) return false

      if (!keyword) return true

      return [
        combo.combo_name,
        combo.combo_code,
        combo.description,
        combo.items?.map((item) => item.menuItemName).join(' '),
      ].some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  }, [combos, search, statusFilter])

  const formSummary = useMemo(() => {
    return calculateComboValue(form.items, products, Number(form.bundlePrice || 0))
  }, [form.bundlePrice, form.items, products])

  const summaryCards = useMemo(() => {
    const activeCount = combos.filter((combo) => getComboStatus(combo) === 'active').length
    const upcomingCount = combos.filter((combo) => getComboStatus(combo) === 'upcoming').length
    const inactiveCount = combos.filter((combo) => !combo.is_active).length

    return {
      total: combos.length,
      active: activeCount,
      upcoming: upcomingCount,
      inactive: inactiveCount,
    }
  }, [combos])

  const openNewForm = () => {
    setEditingCombo(null)
    setForm({ ...emptyComboForm, items: [createEmptyItemRow()] })
    setShowForm(true)
  }

  const openEditForm = (combo) => {
    setEditingCombo(combo)
    setForm({
      comboName: combo.combo_name || '',
      comboCode: combo.combo_code || '',
      description: combo.description || '',
      bundlePrice: combo.bundle_price ?? '',
      discountPercentage: combo.discount_percentage ?? '',
      discountAmount: combo.discount_amount ?? '',
      startDate: toInputDate(combo.start_at),
      startTime: toInputTime(combo.start_at),
      endDate: toInputDate(combo.end_at),
      endTime: toInputTime(combo.end_at),
      isActive: combo.is_active !== false,
      isPublic: combo.is_public !== false,
      items:
        combo.items?.length > 0
          ? combo.items.map((item) => ({
              uid: item.id || createRowId(),
              itemId: item.menu_item_id || '',
              variationId: item.variation_id || '',
              quantity: String(item.quantity || 1),
              groupName: item.group_name || '',
              isRequired: item.is_required !== false,
            }))
          : [createEmptyItemRow()],
    })
    setShowForm(true)
  }

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const updateItemRow = (uid, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.uid === uid
          ? {
              ...item,
              [key]: value,
              ...(key === 'itemId' ? { variationId: '' } : {}),
            }
          : item,
      ),
    }))
  }

  const addItemRow = () => {
    setForm((current) => ({
      ...current,
      items: [...current.items, createEmptyItemRow()],
    }))
  }

  const removeItemRow = (uid) => {
    setForm((current) => ({
      ...current,
      items:
        current.items.length === 1
          ? [createEmptyItemRow()]
          : current.items.filter((item) => item.uid !== uid),
    }))
  }

  const handleCopyCode = async (code) => {
    if (!code) return

    try {
      await navigator.clipboard.writeText(code)
      showToast({
        type: 'success',
        title: 'Combo code copied',
        message: code,
      })
    } catch {
      showToast({
        type: 'info',
        title: 'Combo code',
        message: code,
      })
    }
  }

  const handleSaveCombo = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const cleanName = form.comboName.trim()
    const cleanCode = sanitizeComboCode(form.comboCode || cleanName)
    const validItems = form.items.filter((item) => item.itemId)
    const bundlePrice = Number(form.bundlePrice || 0)

    if (!cleanName) {
      showToast({
        type: 'warning',
        title: 'Combo name required',
        message: 'Enter a clear name like Family Meal or Burger Combo.',
      })
      return
    }

    if (!cleanCode) {
      showToast({
        type: 'warning',
        title: 'Combo code required',
        message: 'Add a short code for this combo deal.',
      })
      return
    }

    if (validItems.length === 0) {
      showToast({
        type: 'warning',
        title: 'Add combo items',
        message: 'Choose at least one menu item for this combo.',
      })
      return
    }

    if (bundlePrice <= 0) {
      showToast({
        type: 'warning',
        title: 'Bundle price required',
        message: 'Enter the selling price for this combo deal.',
      })
      return
    }

    setSaving(true)

    const comboPayload = {
      restaurant_id: restaurant.id,
      combo_name: cleanName,
      combo_code: cleanCode,
      description: form.description.trim() || null,
      bundle_price: bundlePrice,
      discount_percentage: form.discountPercentage === '' ? null : Number(form.discountPercentage || 0),
      discount_amount: form.discountAmount === '' ? null : Number(form.discountAmount || 0),
      start_at: combineDateTime(form.startDate, form.startTime),
      end_at: combineDateTime(form.endDate, form.endTime),
      is_active: Boolean(form.isActive),
      is_public: Boolean(form.isPublic),
      updated_at: new Date().toISOString(),
    }

    let comboId = editingCombo?.id || null

    if (editingCombo?.id) {
      const { error } = await supabase
        .from('restaurant_combo_deals')
        .update(comboPayload)
        .eq('id', editingCombo.id)
        .eq('restaurant_id', restaurant.id)

      if (error) {
        setSaving(false)
        showToast({
          type: 'error',
          title: 'Combo update failed',
          message: error.message,
        })
        return
      }
    } else {
      const { data, error } = await supabase
        .from('restaurant_combo_deals')
        .insert(comboPayload)
        .select('id')
        .single()

      if (error) {
        setSaving(false)
        showToast({
          type: 'error',
          title: 'Combo creation failed',
          message: error.message,
        })
        return
      }

      comboId = data.id
    }

    const { error: deleteItemsError } = await supabase
      .from('restaurant_combo_deal_items')
      .delete()
      .eq('combo_id', comboId)
      .eq('restaurant_id', restaurant.id)

    if (deleteItemsError) {
      setSaving(false)
      showToast({
        type: 'error',
        title: 'Combo item update failed',
        message: deleteItemsError.message,
      })
      return
    }

    const itemPayload = validItems.map((item, index) => ({
      restaurant_id: restaurant.id,
      combo_id: comboId,
      menu_item_id: item.itemId,
      variation_id: item.variationId || null,
      quantity: Number(item.quantity || 1),
      group_name: item.groupName.trim() || null,
      is_required: item.isRequired !== false,
      sort_order: index + 1,
    }))

    const { error: insertItemsError } = await supabase
      .from('restaurant_combo_deal_items')
      .insert(itemPayload)

    setSaving(false)

    if (insertItemsError) {
      showToast({
        type: 'error',
        title: 'Combo item save failed',
        message: insertItemsError.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: editingCombo ? 'Combo updated' : 'Combo created',
      message: `${cleanName} is ready.`,
    })

    setShowForm(false)
    setEditingCombo(null)
    setForm({ ...emptyComboForm, items: [createEmptyItemRow()] })
    await loadData()
  }

  const toggleComboStatus = async (combo) => {
    const { error } = await supabase
      .from('restaurant_combo_deals')
      .update({
        is_active: !combo.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', combo.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Status update failed',
        message: error.message,
      })
      return
    }

    setCombos((current) =>
      current.map((item) =>
        item.id === combo.id ? { ...item, is_active: !combo.is_active } : item,
      ),
    )
  }

  const deleteCombo = async (combo) => {
    const confirmed = await confirmAction({
      title: 'Delete combo deal?',
      message: `${combo.combo_name} will be hidden from your combo list.`,
      confirmText: 'Delete',
      cancelText: 'Keep',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('restaurant_combo_deals')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', combo.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Delete failed',
        message: error.message,
      })
      return
    }

    setCombos((current) => current.filter((item) => item.id !== combo.id))
  }

  return (
    <section className="combo-deals-page">
      <div className="combo-deals-head">
        <div>
          <p className="pricing-label">Combo Deals</p>
          <h2>Meal bundles and value offers</h2>
          <span>
            Create family meals, lunch combos and set menus. Public menu and POS
            checkout connection can use this foundation next.
          </span>
        </div>

        <div className="combo-head-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={18} />
            Refresh
          </button>

          <button type="button" className="primary-button" onClick={openNewForm}>
            <Plus size={18} />
            New Combo
          </button>
        </div>
      </div>

      <div className="combo-summary-grid">
        <ComboSummaryCard label="Total combos" value={summaryCards.total} />
        <ComboSummaryCard label="Active now" value={summaryCards.active} tone="green" />
        <ComboSummaryCard label="Upcoming" value={summaryCards.upcoming} tone="blue" />
        <ComboSummaryCard label="Inactive" value={summaryCards.inactive} tone="red" />
      </div>

      <div className="combo-toolbar">
        <div className="combo-search-box">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search combo, code, item..."
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All status</option>
          <option value="active">Active now</option>
          <option value="upcoming">Upcoming</option>
          <option value="expired">Expired</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loading ? (
        <div className="combo-empty-state">Loading combo deals...</div>
      ) : filteredCombos.length === 0 ? (
        <div className="combo-empty-state">
          <PackageCheck size={34} />
          <strong>No combo deals found</strong>
          <span>Create your first meal bundle or family offer.</span>
        </div>
      ) : (
        <div className="combo-card-grid">
          {filteredCombos.map((combo) => (
            <ComboDealCard
              combo={combo}
              currency={currency}
              onEdit={() => openEditForm(combo)}
              onDelete={() => deleteCombo(combo)}
              onToggle={() => toggleComboStatus(combo)}
              onCopy={() => handleCopyCode(combo.combo_code)}
              key={combo.id}
            />
          ))}
        </div>
      )}

      {showForm && (
        <div className="combo-modal-overlay" onClick={() => setShowForm(false)}>
          <form
            className="combo-modal"
            onSubmit={handleSaveCombo}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="combo-modal-head">
              <div>
                <p className="pricing-label">
                  {editingCombo ? 'Edit Combo' : 'New Combo'}
                </p>
                <h3>{editingCombo ? 'Update meal bundle' : 'Create meal bundle'}</h3>
                <span>Set the items, bundle price and active period.</span>
              </div>

              <button
                type="button"
                className="tiny-button danger"
                onClick={() => setShowForm(false)}
              >
                <X size={15} />
                Close
              </button>
            </div>

            <div className="combo-form-grid">
              <label>
                Combo name
                <input
                  type="text"
                  value={form.comboName}
                  onChange={(event) => {
                    updateForm('comboName', event.target.value)
                    if (!editingCombo && !form.comboCode) {
                      updateForm('comboCode', sanitizeComboCode(event.target.value))
                    }
                  }}
                  placeholder="Family Meal Deal"
                />
              </label>

              <label>
                Combo code
                <input
                  type="text"
                  value={form.comboCode}
                  onChange={(event) =>
                    updateForm('comboCode', sanitizeComboCode(event.target.value))
                  }
                  placeholder="FAMILY-MEAL"
                />
              </label>

              <label className="full">
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => updateForm('description', event.target.value)}
                  placeholder="Example: 2 burgers, fries and 2 drinks at a special price."
                  rows="3"
                />
              </label>

              <label>
                Bundle selling price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.bundlePrice}
                  onChange={(event) => updateForm('bundlePrice', event.target.value)}
                  placeholder="0.00"
                />
              </label>

              <label>
                Optional discount %
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discountPercentage}
                  onChange={(event) =>
                    updateForm('discountPercentage', event.target.value)
                  }
                  placeholder="Example: 10"
                />
              </label>

              <label>
                Optional discount amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discountAmount}
                  onChange={(event) => updateForm('discountAmount', event.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>

            <div className="combo-date-panel">
              <div>
                <CalendarClock size={18} />
                <strong>Active period</strong>
                <span>Leave blank for always available.</span>
              </div>

              <div className="combo-date-grid">
                <label>
                  Start date
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(event) => updateForm('startDate', event.target.value)}
                  />
                </label>

                <label>
                  Start time
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(event) => updateForm('startTime', event.target.value)}
                  />
                </label>

                <label>
                  End date
                  <input
                    type="date"
                    value={form.endDate}
                    onChange={(event) => updateForm('endDate', event.target.value)}
                  />
                </label>

                <label>
                  End time
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(event) => updateForm('endTime', event.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="combo-switch-row">
              <label className="combo-switch-card">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => updateForm('isActive', event.target.checked)}
                />
                <span>
                  <strong>Active</strong>
                  <small>Allow this combo to be used when connected.</small>
                </span>
              </label>

              <label className="combo-switch-card">
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(event) => updateForm('isPublic', event.target.checked)}
                />
                <span>
                  <strong>Show on public menu</strong>
                  <small>Ready for customer-side combo connection.</small>
                </span>
              </label>
            </div>

            <div className="combo-items-panel">
              <div className="combo-items-head">
                <div>
                  <strong>Combo items</strong>
                  <span>Add menu items included in this bundle.</span>
                </div>

                <button type="button" className="secondary-button" onClick={addItemRow}>
                  <Plus size={17} />
                  Add Item
                </button>
              </div>

              <div className="combo-item-row-list">
                {form.items.map((item) => {
                  const selectedProduct = products.find(
                    (product) => product.id === item.itemId,
                  )

                  return (
                    <div className="combo-item-row" key={item.uid}>
                      <label>
                        Menu item
                        <select
                          value={item.itemId}
                          onChange={(event) =>
                            updateItemRow(item.uid, 'itemId', event.target.value)
                          }
                        >
                          <option value="">Choose item</option>
                          {products.map((product) => (
                            <option value={product.id} key={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Variation
                        <select
                          value={item.variationId}
                          onChange={(event) =>
                            updateItemRow(item.uid, 'variationId', event.target.value)
                          }
                          disabled={!selectedProduct?.variations?.length}
                        >
                          <option value="">Default</option>
                          {selectedProduct?.variations?.map((variation) => (
                            <option value={variation.id} key={variation.id}>
                              {variation.name} • {currency}{' '}
                              {Number(variation.price || 0).toFixed(2)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Qty
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={item.quantity}
                          onChange={(event) =>
                            updateItemRow(item.uid, 'quantity', event.target.value)
                          }
                        />
                      </label>

                      <label>
                        Group label
                        <input
                          type="text"
                          value={item.groupName}
                          onChange={(event) =>
                            updateItemRow(item.uid, 'groupName', event.target.value)
                          }
                          placeholder="Main / Drink"
                        />
                      </label>

                      <button
                        type="button"
                        className="tiny-button danger"
                        onClick={() => removeItemRow(item.uid)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="combo-value-preview">
              <div>
                <span>Menu value</span>
                <strong>{currency} {formSummary.menuValue.toFixed(2)}</strong>
              </div>

              <div>
                <span>Bundle price</span>
                <strong>{currency} {formSummary.bundlePrice.toFixed(2)}</strong>
              </div>

              <div className={formSummary.savings > 0 ? 'positive' : ''}>
                <span>Customer savings</span>
                <strong>{currency} {formSummary.savings.toFixed(2)}</strong>
              </div>
            </div>

            <div className="combo-form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>

              <button type="submit" className="primary-button" disabled={saving}>
                <CheckCircle2 size={18} />
                {saving ? 'Saving...' : 'Save Combo'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

function ComboSummaryCard({ label, value, tone = '' }) {
  return (
    <div className={`combo-summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ComboDealCard({ combo, currency, onEdit, onDelete, onToggle, onCopy }) {
  const menuValue = (combo.items || []).reduce(
    (sum, item) => sum + Number(item.lineTotal || 0),
    0,
  )
  const savings = Math.max(menuValue - Number(combo.bundle_price || 0), 0)
  const status = getComboStatus(combo)

  return (
    <article className={`combo-deal-card status-${status}`}>
      <div className="combo-card-head">
        <div className="combo-icon-box">
          <BadgePercent size={22} />
        </div>

        <div>
          <span className={`combo-status-pill ${status}`}>{formatComboStatus(status)}</span>
          <h3>{combo.combo_name}</h3>
          {combo.description && <p>{combo.description}</p>}
        </div>
      </div>

      <div className="combo-code-row">
        <span>{combo.combo_code}</span>
        <button type="button" onClick={onCopy}>
          <Copy size={14} />
          Copy
        </button>
      </div>

      <div className="combo-price-row">
        <div>
          <span>Menu value</span>
          <strong>{currency} {menuValue.toFixed(2)}</strong>
        </div>

        <div>
          <span>Bundle price</span>
          <strong>{currency} {Number(combo.bundle_price || 0).toFixed(2)}</strong>
        </div>

        <div className="save">
          <span>Savings</span>
          <strong>{currency} {savings.toFixed(2)}</strong>
        </div>
      </div>

      <div className="combo-item-list-preview">
        {(combo.items || []).slice(0, 5).map((item) => (
          <div key={item.id}>
            <span>{Number(item.quantity || 1)}× {item.menuItemName}</span>
            <small>{item.variationName || item.group_name || 'Default'}</small>
          </div>
        ))}

        {(combo.items || []).length > 5 && (
          <strong>+{(combo.items || []).length - 5} more items</strong>
        )}
      </div>

      <div className="combo-date-row">
        <span>{formatRange(combo.start_at, combo.end_at)}</span>
      </div>

      <div className="combo-card-actions">
        <button type="button" className="secondary-button" onClick={onToggle}>
          {combo.is_active ? 'Disable' : 'Enable'}
        </button>

        <button type="button" className="secondary-button" onClick={onEdit}>
          <Edit3 size={16} />
          Edit
        </button>

        <button type="button" className="tiny-button danger" onClick={onDelete}>
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  )
}

function createRowId() {
  return `row-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createEmptyItemRow() {
  return {
    uid: createRowId(),
    itemId: '',
    variationId: '',
    quantity: '1',
    groupName: '',
    isRequired: true,
  }
}

function getAvailableVariations(product) {
  if (!Array.isArray(product.variations)) return []

  return [...product.variations]
    .filter((variation) => variation.is_available !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
}

function calculateComboValue(items, products, bundlePrice) {
  const menuValue = items.reduce((sum, item) => {
    const product = products.find((entry) => entry.id === item.itemId)
    if (!product) return sum

    const variation = product.variations?.find(
      (entry) => entry.id === item.variationId,
    )
    const unitPrice = Number(variation?.price ?? product.price ?? 0)

    return sum + unitPrice * Number(item.quantity || 0)
  }, 0)

  return {
    menuValue,
    bundlePrice: Number(bundlePrice || 0),
    savings: Math.max(menuValue - Number(bundlePrice || 0), 0),
  }
}

function sanitizeComboCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

function combineDateTime(dateValue, timeValue) {
  if (!dateValue) return null

  const safeTime = timeValue || '00:00'
  const date = new Date(`${dateValue}T${safeTime}:00`)

  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}

function toInputDate(value) {
  if (!value) return ''

  try {
    return new Date(value).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

function toInputTime(value) {
  if (!value) return ''

  try {
    return new Date(value).toTimeString().slice(0, 5)
  } catch {
    return ''
  }
}

function getComboStatus(combo) {
  if (!combo?.is_active) return 'inactive'

  const now = Date.now()
  const startAt = combo.start_at ? new Date(combo.start_at).getTime() : null
  const endAt = combo.end_at ? new Date(combo.end_at).getTime() : null

  if (startAt && startAt > now) return 'upcoming'
  if (endAt && endAt < now) return 'expired'

  return 'active'
}

function formatComboStatus(value) {
  if (value === 'upcoming') return 'Upcoming'
  if (value === 'expired') return 'Expired'
  if (value === 'inactive') return 'Inactive'
  return 'Active'
}

function formatDate(value) {
  if (!value) return ''

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

function formatRange(startAt, endAt) {
  if (!startAt && !endAt) return 'Always available'
  if (startAt && !endAt) return `Starts ${formatDate(startAt)}`
  if (!startAt && endAt) return `Ends ${formatDate(endAt)}`
  return `${formatDate(startAt)} → ${formatDate(endAt)}`
}

export default ComboDealsManagement
