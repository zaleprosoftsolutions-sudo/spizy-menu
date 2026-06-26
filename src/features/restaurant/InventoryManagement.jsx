import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  History,
  Minus,
  PackagePlus,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './InventoryManagement.css'

const movementOptions = [
  {
    value: 'opening',
    label: 'Set opening stock',
    helper: 'Replace current stock with this value.',
  },
  {
    value: 'purchase',
    label: 'Add purchased stock',
    helper: 'Increase stock after buying new ingredients/items.',
  },
  {
    value: 'adjustment_add',
    label: 'Add adjustment',
    helper: 'Increase stock for correction or returned stock.',
  },
  {
    value: 'adjustment_remove',
    label: 'Remove adjustment',
    helper: 'Reduce stock for correction.',
  },
  {
    value: 'waste',
    label: 'Wastage / damaged',
    helper: 'Reduce stock for spoiled or damaged items.',
  },
]

const unitOptions = ['pcs', 'plates', 'packs', 'kg', 'g', 'ltr', 'ml', 'box']

const defaultStockDraft = {
  track_stock: false,
  stock_quantity: '0',
  low_stock_quantity: '5',
  stock_unit: 'pcs',
}

function InventoryManagement({ restaurant }) {
  const [items, setItems] = useState([])
  const [movements, setMovements] = useState([])
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingItemId, setSavingItemId] = useState('')
  const [adjustItem, setAdjustItem] = useState(null)
  const [adjustDraft, setAdjustDraft] = useState({
    movementType: 'purchase',
    quantity: '',
    reason: '',
  })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [message, setMessage] = useState('')

  const showMessage = (text) => {
    setMessage(text)
    window.setTimeout(() => setMessage(''), 3200)
  }

  const loadInventory = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [{ data: itemData, error: itemError }, { data: movementData }] =
      await Promise.all([
        supabase
          .from('menu_items')
          .select(
            `
              id,
              restaurant_id,
              name,
              price,
              image_url,
              is_available,
              is_deleted,
              track_stock,
              stock_quantity,
              low_stock_quantity,
              stock_unit,
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
          .from('inventory_movements')
          .select(
            `
              id,
              movement_type,
              quantity_delta,
              previous_stock,
              new_stock,
              reason,
              created_at,
              item:menu_items (
                id,
                name,
                stock_unit
              )
            `,
          )
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: false })
          .limit(30),
      ])

    if (itemError) {
      showMessage(itemError.message)
      setItems([])
      setMovements([])
      setLoading(false)
      return
    }

    const nextItems = itemData || []
    const nextDrafts = {}

    nextItems.forEach((item) => {
      nextDrafts[item.id] = buildStockDraft(item)
    })

    setItems(nextItems)
    setDrafts(nextDrafts)
    setMovements(movementData || [])
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return items.filter((item) => {
      const draft = drafts[item.id] || buildStockDraft(item)
      const stockQuantity = Number(draft.stock_quantity || 0)
      const lowStockQuantity = Number(draft.low_stock_quantity || 0)
      const isTracked = Boolean(draft.track_stock)
      const isLow = isTracked && stockQuantity <= lowStockQuantity

      if (filter === 'tracked' && !isTracked) return false
      if (filter === 'low' && !isLow) return false
      if (filter === 'off' && isTracked) return false

      if (!keyword) return true

      return [item.name, item.category?.name, item.stock_unit]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
  }, [drafts, filter, items, search])

  const inventoryStats = useMemo(() => {
    const trackedItems = items.filter((item) => {
      const draft = drafts[item.id] || buildStockDraft(item)
      return Boolean(draft.track_stock)
    })

    const lowStockItems = trackedItems.filter((item) => {
      const draft = drafts[item.id] || buildStockDraft(item)
      return Number(draft.stock_quantity || 0) <= Number(draft.low_stock_quantity || 0)
    })

    const totalUnits = trackedItems.reduce((sum, item) => {
      const draft = drafts[item.id] || buildStockDraft(item)
      return sum + Number(draft.stock_quantity || 0)
    }, 0)

    const estimatedValue = trackedItems.reduce((sum, item) => {
      const draft = drafts[item.id] || buildStockDraft(item)
      return sum + Number(draft.stock_quantity || 0) * Number(item.price || 0)
    }, 0)

    return {
      totalItems: items.length,
      trackedItems: trackedItems.length,
      lowStockItems: lowStockItems.length,
      totalUnits,
      estimatedValue,
    }
  }, [drafts, items])

  const updateDraft = (itemId, key, value) => {
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || defaultStockDraft),
        [key]: value,
      },
    }))
  }

  const saveStockSettings = async (item) => {
    if (!restaurant?.id || !item?.id) return

    const draft = drafts[item.id] || buildStockDraft(item)

    setSavingItemId(item.id)

    const { error } = await supabase
      .from('menu_items')
      .update({
        track_stock: Boolean(draft.track_stock),
        stock_quantity: safeNumber(draft.stock_quantity),
        low_stock_quantity: safeNumber(draft.low_stock_quantity),
        stock_unit: draft.stock_unit || 'pcs',
      })
      .eq('id', item.id)
      .eq('restaurant_id', restaurant.id)

    setSavingItemId('')

    if (error) {
      showMessage(error.message)
      return
    }

    setItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              track_stock: Boolean(draft.track_stock),
              stock_quantity: safeNumber(draft.stock_quantity),
              low_stock_quantity: safeNumber(draft.low_stock_quantity),
              stock_unit: draft.stock_unit || 'pcs',
            }
          : currentItem,
      ),
    )

    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [item.id]: {
        track_stock: Boolean(draft.track_stock),
        stock_quantity: String(safeNumber(draft.stock_quantity)),
        low_stock_quantity: String(safeNumber(draft.low_stock_quantity)),
        stock_unit: draft.stock_unit || 'pcs',
      },
    }))

    showMessage('Stock settings saved.')
  }

  const openAdjustment = (item, movementType = 'purchase') => {
    setAdjustItem(item)
    setAdjustDraft({
      movementType,
      quantity: '',
      reason: '',
    })
  }

  const applyStockAdjustment = async () => {
    if (!restaurant?.id || !adjustItem?.id) return

    const quantity = safeNumber(adjustDraft.quantity)

    if (quantity <= 0) {
      showMessage('Enter a quantity greater than zero.')
      return
    }

    setSavingItemId(adjustItem.id)

    const { data, error } = await supabase.rpc('adjust_inventory_stock', {
      p_restaurant_id: restaurant.id,
      p_item_id: adjustItem.id,
      p_movement_type: adjustDraft.movementType,
      p_quantity: quantity,
      p_reason: adjustDraft.reason.trim() || null,
    })

    setSavingItemId('')

    if (error) {
      showMessage(error.message)
      return
    }

    const result = Array.isArray(data) ? data[0] : data
    const nextStock = safeNumber(result?.new_stock ?? adjustItem.stock_quantity)
    const delta = Number(result?.quantity_delta ?? 0)

    setItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === adjustItem.id
          ? {
              ...currentItem,
              track_stock: true,
              stock_quantity: nextStock,
            }
          : currentItem,
      ),
    )

    setDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[adjustItem.id] || buildStockDraft(adjustItem)

      return {
        ...currentDrafts,
        [adjustItem.id]: {
          ...currentDraft,
          track_stock: true,
          stock_quantity: String(nextStock),
        },
      }
    })

    setMovements((currentMovements) => [
      {
        id: result?.movement_id || `local-${Date.now()}`,
        movement_type: adjustDraft.movementType,
        quantity_delta: delta,
        previous_stock: result?.previous_stock ?? adjustItem.stock_quantity ?? 0,
        new_stock: nextStock,
        reason: adjustDraft.reason.trim() || null,
        created_at: new Date().toISOString(),
        item: {
          id: adjustItem.id,
          name: adjustItem.name,
          stock_unit: (drafts[adjustItem.id] || buildStockDraft(adjustItem)).stock_unit || 'pcs',
        },
      },
      ...currentMovements,
    ].slice(0, 30))

    setAdjustItem(null)
    showMessage('Inventory updated.')
  }

  return (
    <div className="inventory-page">
      {message && <div className="inventory-toast">{message}</div>}

      <section className="inventory-hero">
        <div>
          <p className="inventory-kicker">Inventory</p>
          <h1>Stock control</h1>
          <span>
            Track stock levels, low-stock alerts, purchases, adjustments and
            wastage from one screen.
          </span>
        </div>

        <button type="button" onClick={loadInventory} disabled={loading}>
          <RefreshCw size={17} />
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </section>

      <section className="inventory-stat-grid">
        <InventoryStatCard
          label="Menu items"
          value={inventoryStats.totalItems}
          icon={<Archive size={18} />}
        />
        <InventoryStatCard
          label="Tracked items"
          value={inventoryStats.trackedItems}
          icon={<CheckCircle2 size={18} />}
        />
        <InventoryStatCard
          label="Low stock"
          value={inventoryStats.lowStockItems}
          icon={<AlertTriangle size={18} />}
          danger={inventoryStats.lowStockItems > 0}
        />
        <InventoryStatCard
          label="Estimated stock value"
          value={`${restaurant?.currency || 'AED'} ${Number(
            inventoryStats.estimatedValue || 0,
          ).toFixed(2)}`}
          icon={<PackagePlus size={18} />}
        />
      </section>

      <section className="inventory-toolbar">
        <div className="inventory-search">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search item, category or unit..."
          />
        </div>

        <div className="inventory-filter-tabs">
          {[
            ['all', 'All'],
            ['tracked', 'Tracked'],
            ['low', 'Low stock'],
            ['off', 'Not tracked'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="inventory-content-grid">
        <div className="inventory-items-panel">
          <div className="inventory-section-head">
            <div>
              <h2>Item stock</h2>
              <p>Enable tracking only for items where stock count is needed.</p>
            </div>
          </div>

          {loading ? (
            <div className="inventory-loading">Loading inventory...</div>
          ) : filteredItems.length === 0 ? (
            <div className="inventory-empty-state">
              No inventory items found for this filter.
            </div>
          ) : (
            <div className="inventory-item-list">
              {filteredItems.map((item) => {
                const draft = drafts[item.id] || buildStockDraft(item)
                const isTracked = Boolean(draft.track_stock)
                const stockQuantity = Number(draft.stock_quantity || 0)
                const lowStockQuantity = Number(draft.low_stock_quantity || 0)
                const isLow = isTracked && stockQuantity <= lowStockQuantity

                return (
                  <article
                    className={`inventory-item-card ${isLow ? 'low' : ''}`}
                    key={item.id}
                  >
                    <div className="inventory-item-top">
                      <div className="inventory-item-image">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} />
                        ) : (
                          item.name.slice(0, 2).toUpperCase()
                        )}
                      </div>

                      <div className="inventory-item-title">
                        <span>{item.category?.name || 'Uncategorised'}</span>
                        <strong>{item.name}</strong>
                        <small>
                          {restaurant?.currency || 'AED'}{' '}
                          {Number(item.price || 0).toFixed(2)}
                        </small>
                      </div>

                      {isLow && (
                        <div className="inventory-low-pill">
                          <AlertTriangle size={14} />
                          Low
                        </div>
                      )}
                    </div>

                    <div className="inventory-stock-summary">
                      <div>
                        <span>Current</span>
                        <strong>{formatStockNumber(stockQuantity)}</strong>
                      </div>
                      <div>
                        <span>Alert</span>
                        <strong>{formatStockNumber(lowStockQuantity)}</strong>
                      </div>
                      <div>
                        <span>Unit</span>
                        <strong>{draft.stock_unit || 'pcs'}</strong>
                      </div>
                    </div>

                    <div className="inventory-stock-controls">
                      <label className="inventory-track-toggle">
                        <input
                          type="checkbox"
                          checked={isTracked}
                          onChange={(event) =>
                            updateDraft(
                              item.id,
                              'track_stock',
                              event.target.checked,
                            )
                          }
                        />
                        <span>Track stock</span>
                      </label>

                      <div className="inventory-field-grid">
                        <label>
                          <span>Current stock</span>
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={draft.stock_quantity}
                            onChange={(event) =>
                              updateDraft(
                                item.id,
                                'stock_quantity',
                                event.target.value,
                              )
                            }
                          />
                        </label>

                        <label>
                          <span>Low alert</span>
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={draft.low_stock_quantity}
                            onChange={(event) =>
                              updateDraft(
                                item.id,
                                'low_stock_quantity',
                                event.target.value,
                              )
                            }
                          />
                        </label>

                        <label>
                          <span>Unit</span>
                          <select
                            value={draft.stock_unit}
                            onChange={(event) =>
                              updateDraft(item.id, 'stock_unit', event.target.value)
                            }
                          >
                            {unitOptions.map((unit) => (
                              <option value={unit} key={unit}>
                                {unit}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="inventory-card-actions">
                      <button
                        type="button"
                        className="save"
                        onClick={() => saveStockSettings(item)}
                        disabled={savingItemId === item.id}
                      >
                        <Save size={15} />
                        {savingItemId === item.id ? 'Saving...' : 'Save'}
                      </button>

                      <button
                        type="button"
                        onClick={() => openAdjustment(item, 'purchase')}
                      >
                        <Plus size={15} />
                        Add
                      </button>

                      <button
                        type="button"
                        onClick={() => openAdjustment(item, 'waste')}
                      >
                        <Minus size={15} />
                        Reduce
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        <aside className="inventory-history-panel">
          <div className="inventory-section-head compact">
            <div>
              <h2>Recent movements</h2>
              <p>Purchases, corrections and wastage logs.</p>
            </div>
            <History size={20} />
          </div>

          {movements.length === 0 ? (
            <div className="inventory-empty-state small">
              No stock movements yet.
            </div>
          ) : (
            <div className="inventory-history-list">
              {movements.map((movement) => (
                <InventoryMovementRow
                  movement={movement}
                  key={movement.id}
                />
              ))}
            </div>
          )}
        </aside>
      </section>

      {adjustItem && (
        <div className="inventory-modal-overlay" onClick={() => setAdjustItem(null)}>
          <div
            className="inventory-adjust-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="inventory-modal-head">
              <div>
                <p className="inventory-kicker">Stock adjustment</p>
                <h2>{adjustItem.name}</h2>
              </div>

              <button type="button" onClick={() => setAdjustItem(null)}>
                <X size={18} />
              </button>
            </div>

            <label className="inventory-modal-field">
              <span>Movement type</span>
              <select
                value={adjustDraft.movementType}
                onChange={(event) =>
                  setAdjustDraft((current) => ({
                    ...current,
                    movementType: event.target.value,
                  }))
                }
              >
                {movementOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small>
                {
                  movementOptions.find(
                    (option) => option.value === adjustDraft.movementType,
                  )?.helper
                }
              </small>
            </label>

            <label className="inventory-modal-field">
              <span>Quantity</span>
              <input
                type="number"
                min="0"
                step="0.001"
                value={adjustDraft.quantity}
                onChange={(event) =>
                  setAdjustDraft((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
                placeholder="Example: 10"
              />
            </label>

            <label className="inventory-modal-field">
              <span>Reason / note</span>
              <textarea
                value={adjustDraft.reason}
                onChange={(event) =>
                  setAdjustDraft((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                placeholder="Example: Morning purchase, damaged stock, correction..."
                rows="3"
              />
            </label>

            <button
              type="button"
              className="inventory-primary-action"
              onClick={applyStockAdjustment}
              disabled={savingItemId === adjustItem.id}
            >
              <Settings2 size={17} />
              {savingItemId === adjustItem.id ? 'Updating...' : 'Update Stock'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function InventoryStatCard({ label, value, icon, danger = false }) {
  return (
    <div className={`inventory-stat-card ${danger ? 'danger' : ''}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function InventoryMovementRow({ movement }) {
  const delta = Number(movement.quantity_delta || 0)
  const isPositive = delta >= 0
  const unit = movement.item?.stock_unit || 'pcs'

  return (
    <article className={`inventory-history-row ${isPositive ? 'plus' : 'minus'}`}>
      <div>
        <strong>{movement.item?.name || 'Menu item'}</strong>
        <span>{formatMovementType(movement.movement_type)}</span>
        {movement.reason && <small>{movement.reason}</small>}
        <small>{formatInventoryDate(movement.created_at)}</small>
      </div>

      <div>
        <strong>
          {isPositive ? '+' : ''}
          {formatStockNumber(delta)} {unit}
        </strong>
        <span>
          {formatStockNumber(movement.previous_stock)} →{' '}
          {formatStockNumber(movement.new_stock)}
        </span>
      </div>
    </article>
  )
}

function buildStockDraft(item) {
  return {
    track_stock: Boolean(item?.track_stock),
    stock_quantity: String(item?.stock_quantity ?? 0),
    low_stock_quantity: String(item?.low_stock_quantity ?? 5),
    stock_unit: item?.stock_unit || 'pcs',
  }
}

function safeNumber(value) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue)) return 0

  return Math.max(numberValue, 0)
}

function formatMovementType(type) {
  if (type === 'opening') return 'Opening stock'
  if (type === 'purchase') return 'Purchase added'
  if (type === 'adjustment_add') return 'Adjustment added'
  if (type === 'adjustment_remove') return 'Adjustment removed'
  if (type === 'waste') return 'Wastage / damaged'
  if (type === 'return') return 'Returned stock'
  if (type === 'sale') return 'Sale deduction'
  return 'Stock movement'
}

function formatStockNumber(value) {
  const numberValue = Number(value || 0)

  if (Number.isInteger(numberValue)) return String(numberValue)

  return numberValue.toFixed(2)
}

function formatInventoryDate(value) {
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

export default InventoryManagement
