import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
  Truck,
  XCircle,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './BranchStockTransfersManagement.css'

const emptyStockForm = {
  branchId: '',
  itemId: '',
  stockQuantity: '',
  lowStockQuantity: '5',
  stockUnit: 'pcs',
  reason: '',
}

const emptyTransferForm = {
  fromBranchId: '',
  toBranchId: '',
  itemId: '',
  quantity: '',
  notes: '',
}

function BranchStockTransfersManagement({ restaurant }) {
  const { showToast, confirmAction } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [savingStock, setSavingStock] = useState(false)
  const [savingTransfer, setSavingTransfer] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState('')
  const [branches, setBranches] = useState([])
  const [items, setItems] = useState([])
  const [stocks, setStocks] = useState([])
  const [transfers, setTransfers] = useState([])
  const [movements, setMovements] = useState([])
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [transferStatusFilter, setTransferStatusFilter] = useState('all')
  const [stockForm, setStockForm] = useState(emptyStockForm)
  const [transferForm, setTransferForm] = useState(emptyTransferForm)

  const currency = restaurant?.currency || 'AED'

  const loadData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [branchResult, itemResult, stockResult, transferResult, movementResult] =
      await Promise.all([
        supabase
          .from('restaurant_branches')
          .select('id, branch_name, branch_code, city, is_default, is_active')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false)
          .order('is_default', { ascending: false })
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('menu_items')
          .select('id, name, price, stock_unit, track_stock, image_url, category:menu_categories(id, name)')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false)
          .order('name', { ascending: true }),
        supabase
          .from('restaurant_branch_stock')
          .select('id, restaurant_id, branch_id, item_id, track_stock, stock_quantity, low_stock_quantity, stock_unit, updated_at')
          .eq('restaurant_id', restaurant.id)
          .order('updated_at', { ascending: false }),
        supabase
          .from('restaurant_branch_stock_transfers')
          .select('id, transfer_code, from_branch_id, to_branch_id, item_id, quantity, unit, status, notes, created_at, received_at, cancelled_at')
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('restaurant_branch_stock_movements')
          .select('id, branch_id, item_id, transfer_id, movement_type, quantity_delta, previous_stock, new_stock, reason, created_at')
          .eq('restaurant_id', restaurant.id)
          .order('created_at', { ascending: false })
          .limit(30),
      ])

    if (branchResult.error) {
      showToast({
        type: 'error',
        title: 'Branches loading failed',
        message: branchResult.error.message,
      })
    }

    if (itemResult.error) {
      showToast({
        type: 'error',
        title: 'Items loading failed',
        message: itemResult.error.message,
      })
    }

    if (stockResult.error) {
      showToast({
        type: 'error',
        title: 'Branch stock loading failed',
        message: stockResult.error.message,
      })
    }

    if (transferResult.error) {
      showToast({
        type: 'error',
        title: 'Transfers loading failed',
        message: transferResult.error.message,
      })
    }

    if (movementResult.error) {
      showToast({
        type: 'error',
        title: 'Movement history loading failed',
        message: movementResult.error.message,
      })
    }

    const loadedBranches = branchResult.data || []
    const loadedItems = itemResult.data || []

    setBranches(loadedBranches)
    setItems(loadedItems)
    setStocks(stockResult.data || [])
    setTransfers(transferResult.data || [])
    setMovements(movementResult.data || [])

    setStockForm((current) => ({
      ...current,
      branchId: current.branchId || loadedBranches[0]?.id || '',
      itemId: current.itemId || loadedItems[0]?.id || '',
    }))

    setTransferForm((current) => ({
      ...current,
      fromBranchId: current.fromBranchId || loadedBranches[0]?.id || '',
      toBranchId:
        current.toBranchId || loadedBranches.find((branch) => branch.id !== loadedBranches[0]?.id)?.id || '',
      itemId: current.itemId || loadedItems[0]?.id || '',
    }))

    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const branchMap = useMemo(() => mapById(branches), [branches])
  const itemMap = useMemo(() => mapById(items), [items])

  const stats = useMemo(() => {
    const trackedStocks = stocks.filter((stock) => stock.track_stock !== false)
    const lowStocks = trackedStocks.filter(
      (stock) =>
        Number(stock.stock_quantity || 0) <= Number(stock.low_stock_quantity || 0),
    )
    const inTransit = transfers.filter((transfer) => transfer.status === 'in_transit')
    const totalQty = trackedStocks.reduce(
      (sum, stock) => sum + Number(stock.stock_quantity || 0),
      0,
    )

    return {
      branches: branches.length,
      trackedItems: trackedStocks.length,
      lowStocks: lowStocks.length,
      inTransit: inTransit.length,
      totalQty,
    }
  }, [branches.length, stocks, transfers])

  const visibleStocks = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return stocks.filter((stock) => {
      const branch = branchMap.get(stock.branch_id)
      const item = itemMap.get(stock.item_id)

      if (branchFilter !== 'all' && stock.branch_id !== branchFilter) return false

      if (!keyword) return true

      return [
        branch?.branch_name,
        branch?.branch_code,
        branch?.city,
        item?.name,
        item?.category?.name,
      ].some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  }, [branchFilter, branchMap, itemMap, search, stocks])

  const visibleTransfers = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return transfers.filter((transfer) => {
      const fromBranch = branchMap.get(transfer.from_branch_id)
      const toBranch = branchMap.get(transfer.to_branch_id)
      const item = itemMap.get(transfer.item_id)

      if (
        transferStatusFilter !== 'all' &&
        transfer.status !== transferStatusFilter
      ) {
        return false
      }

      if (!keyword) return true

      return [
        transfer.transfer_code,
        fromBranch?.branch_name,
        toBranch?.branch_name,
        item?.name,
        transfer.notes,
      ].some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  }, [branchMap, itemMap, search, transferStatusFilter, transfers])

  const selectedSourceStock = useMemo(() => {
    return stocks.find(
      (stock) =>
        stock.branch_id === transferForm.fromBranchId &&
        stock.item_id === transferForm.itemId,
    )
  }, [stocks, transferForm.fromBranchId, transferForm.itemId])

  const updateStockForm = (key, value) => {
    setStockForm((current) => ({ ...current, [key]: value }))
  }

  const updateTransferForm = (key, value) => {
    setTransferForm((current) => ({ ...current, [key]: value }))
  }

  const handleSaveStock = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    if (!stockForm.branchId || !stockForm.itemId) {
      showToast({
        type: 'warning',
        title: 'Select branch and item',
        message: 'Choose the branch and item before saving stock.',
      })
      return
    }

    const quantity = Number(stockForm.stockQuantity)
    const lowQty = Number(stockForm.lowStockQuantity || 0)

    if (Number.isNaN(quantity) || quantity < 0) {
      showToast({
        type: 'warning',
        title: 'Invalid stock quantity',
        message: 'Stock quantity should be zero or more.',
      })
      return
    }

    setSavingStock(true)

    const { error } = await supabase.rpc('set_branch_item_stock', {
      p_restaurant_id: restaurant.id,
      p_branch_id: stockForm.branchId,
      p_item_id: stockForm.itemId,
      p_stock_quantity: quantity,
      p_low_stock_quantity: lowQty,
      p_stock_unit: stockForm.stockUnit || 'pcs',
      p_reason: stockForm.reason || 'Branch opening stock / adjustment',
    })

    setSavingStock(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Stock save failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Branch stock saved',
      message: 'Stock quantity updated for the selected branch.',
    })

    setStockForm((current) => ({
      ...current,
      stockQuantity: '',
      reason: '',
    }))

    await loadData()
  }

  const handleCreateTransfer = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    if (
      !transferForm.fromBranchId ||
      !transferForm.toBranchId ||
      !transferForm.itemId
    ) {
      showToast({
        type: 'warning',
        title: 'Complete transfer details',
        message: 'Choose source branch, destination branch and item.',
      })
      return
    }

    if (transferForm.fromBranchId === transferForm.toBranchId) {
      showToast({
        type: 'warning',
        title: 'Choose different branches',
        message: 'From branch and To branch cannot be the same.',
      })
      return
    }

    const quantity = Number(transferForm.quantity)

    if (Number.isNaN(quantity) || quantity <= 0) {
      showToast({
        type: 'warning',
        title: 'Invalid quantity',
        message: 'Transfer quantity should be greater than zero.',
      })
      return
    }

    setSavingTransfer(true)

    const { data, error } = await supabase.rpc('create_branch_stock_transfer', {
      p_restaurant_id: restaurant.id,
      p_from_branch_id: transferForm.fromBranchId,
      p_to_branch_id: transferForm.toBranchId,
      p_item_id: transferForm.itemId,
      p_quantity: quantity,
      p_notes: transferForm.notes || null,
    })

    setSavingTransfer(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Transfer failed',
        message: error.message,
      })
      return
    }

    const result = Array.isArray(data) ? data[0] : data

    showToast({
      type: 'success',
      title: 'Transfer dispatched',
      message: `${result?.transfer_code || 'Transfer'} is now in transit.`,
    })

    setTransferForm((current) => ({
      ...current,
      quantity: '',
      notes: '',
    }))

    await loadData()
  }

  const handleReceiveTransfer = async (transfer) => {
    const confirmed = await confirmAction({
      title: 'Receive transfer?',
      message: `${transfer.transfer_code} will be added to the destination branch stock.`,
      confirmText: 'Receive',
      cancelText: 'Cancel',
    })

    if (!confirmed) return

    setActionLoadingId(transfer.id)

    const { error } = await supabase.rpc('receive_branch_stock_transfer', {
      p_transfer_id: transfer.id,
    })

    setActionLoadingId('')

    if (error) {
      showToast({
        type: 'error',
        title: 'Receive failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Transfer received',
      message: 'Destination branch stock has been updated.',
    })

    await loadData()
  }

  const handleCancelTransfer = async (transfer) => {
    const confirmed = await confirmAction({
      title: 'Cancel transfer?',
      message:
        'The dispatched quantity will be returned to the source branch stock.',
      confirmText: 'Cancel transfer',
      cancelText: 'Keep',
      danger: true,
    })

    if (!confirmed) return

    setActionLoadingId(transfer.id)

    const { error } = await supabase.rpc('cancel_branch_stock_transfer', {
      p_transfer_id: transfer.id,
    })

    setActionLoadingId('')

    if (error) {
      showToast({
        type: 'error',
        title: 'Cancel failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Transfer cancelled',
      message: 'Source branch stock has been restored.',
    })

    await loadData()
  }

  if (!restaurant?.id) {
    return (
      <section className="branch-stock-page">
        <div className="branch-stock-empty">Restaurant profile not found.</div>
      </section>
    )
  }

  return (
    <section className="branch-stock-page">
      <div className="branch-stock-hero">
        <div>
          <p className="pricing-label">Branch Stock</p>
          <h2>Branch inventory & transfers</h2>
          <span>
            Set stock per branch, move items between locations and track in-transit transfers.
          </span>
        </div>

        <button
          type="button"
          className="branch-stock-refresh"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      <div className="branch-stock-stats">
        <StatCard icon={<PackageOpen size={21} />} label="Branches" value={stats.branches} />
        <StatCard icon={<ClipboardList size={21} />} label="Tracked stock rows" value={stats.trackedItems} />
        <StatCard icon={<Truck size={21} />} label="In transit" value={stats.inTransit} />
        <StatCard icon={<XCircle size={21} />} label="Low stock" value={stats.lowStocks} danger={stats.lowStocks > 0} />
      </div>

      <div className="branch-stock-actions-grid">
        <form className="branch-stock-card" onSubmit={handleSaveStock}>
          <div className="branch-stock-card-head">
            <div>
              <p className="pricing-label">Stock Setup</p>
              <h3>Set branch item stock</h3>
              <span>Use this for opening stock or stock correction per branch.</span>
            </div>
            <Plus size={22} />
          </div>

          <div className="branch-stock-form-grid">
            <label>
              Branch
              <select
                value={stockForm.branchId}
                onChange={(event) => updateStockForm('branchId', event.target.value)}
              >
                {branches.map((branch) => (
                  <option value={branch.id} key={branch.id}>
                    {branch.branch_name}{branch.is_default ? ' • Default' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Item
              <select
                value={stockForm.itemId}
                onChange={(event) => updateStockForm('itemId', event.target.value)}
              >
                {items.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Stock quantity
              <input
                type="number"
                min="0"
                step="0.001"
                value={stockForm.stockQuantity}
                onChange={(event) => updateStockForm('stockQuantity', event.target.value)}
                placeholder="Example: 25"
              />
            </label>

            <label>
              Low alert quantity
              <input
                type="number"
                min="0"
                step="0.001"
                value={stockForm.lowStockQuantity}
                onChange={(event) => updateStockForm('lowStockQuantity', event.target.value)}
                placeholder="Example: 5"
              />
            </label>

            <label>
              Unit
              <select
                value={stockForm.stockUnit}
                onChange={(event) => updateStockForm('stockUnit', event.target.value)}
              >
                {stockUnits.map((unit) => (
                  <option value={unit} key={unit}>{unit}</option>
                ))}
              </select>
            </label>

            <label className="wide">
              Reason
              <input
                type="text"
                value={stockForm.reason}
                onChange={(event) => updateStockForm('reason', event.target.value)}
                placeholder="Opening stock / correction note"
              />
            </label>
          </div>

          <button type="submit" className="branch-stock-primary" disabled={savingStock || loading}>
            {savingStock ? <Loader2 size={17} className="spin" /> : <CheckCircle2 size={17} />}
            Save branch stock
          </button>
        </form>

        <form className="branch-stock-card transfer" onSubmit={handleCreateTransfer}>
          <div className="branch-stock-card-head">
            <div>
              <p className="pricing-label">Transfer</p>
              <h3>Move stock between branches</h3>
              <span>Dispatch from one branch and receive at another branch.</span>
            </div>
            <ArrowLeftRight size={22} />
          </div>

          <div className="branch-stock-form-grid">
            <label>
              From branch
              <select
                value={transferForm.fromBranchId}
                onChange={(event) => updateTransferForm('fromBranchId', event.target.value)}
              >
                {branches.map((branch) => (
                  <option value={branch.id} key={branch.id}>{branch.branch_name}</option>
                ))}
              </select>
            </label>

            <label>
              To branch
              <select
                value={transferForm.toBranchId}
                onChange={(event) => updateTransferForm('toBranchId', event.target.value)}
              >
                {branches.map((branch) => (
                  <option value={branch.id} key={branch.id}>{branch.branch_name}</option>
                ))}
              </select>
            </label>

            <label className="wide">
              Item
              <select
                value={transferForm.itemId}
                onChange={(event) => updateTransferForm('itemId', event.target.value)}
              >
                {items.map((item) => (
                  <option value={item.id} key={item.id}>{item.name}</option>
                ))}
              </select>
            </label>

            <label>
              Transfer quantity
              <input
                type="number"
                min="0"
                step="0.001"
                value={transferForm.quantity}
                onChange={(event) => updateTransferForm('quantity', event.target.value)}
                placeholder="Example: 10"
              />
            </label>

            <div className="branch-source-stock-chip">
              <span>Source stock</span>
              <strong>
                {formatQty(selectedSourceStock?.stock_quantity)} {selectedSourceStock?.stock_unit || 'pcs'}
              </strong>
            </div>

            <label className="wide">
              Transfer note
              <input
                type="text"
                value={transferForm.notes}
                onChange={(event) => updateTransferForm('notes', event.target.value)}
                placeholder="Driver name, box number, dispatch note..."
              />
            </label>
          </div>

          <button type="submit" className="branch-stock-primary" disabled={savingTransfer || loading || branches.length < 2}>
            {savingTransfer ? <Loader2 size={17} className="spin" /> : <Truck size={17} />}
            Dispatch transfer
          </button>
        </form>
      </div>

      <div className="branch-stock-filter-row">
        <div className="branch-stock-search">
          <Search size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search branch, item, transfer code..."
          />
        </div>

        <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
          <option value="all">All branches</option>
          {branches.map((branch) => (
            <option value={branch.id} key={branch.id}>{branch.branch_name}</option>
          ))}
        </select>

        <select value={transferStatusFilter} onChange={(event) => setTransferStatusFilter(event.target.value)}>
          <option value="all">All transfers</option>
          <option value="in_transit">In transit</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="branch-stock-empty">Loading branch stock...</div>
      ) : branches.length < 2 ? (
        <div className="branch-stock-empty strong">
          Create at least two branches to use stock transfers.
        </div>
      ) : (
        <div className="branch-stock-content-grid">
          <section className="branch-stock-card list-card">
            <div className="branch-stock-card-head compact">
              <div>
                <p className="pricing-label">Stock Board</p>
                <h3>Branch stock levels</h3>
              </div>
              <span>{visibleStocks.length}</span>
            </div>

            <div className="branch-stock-table">
              <div className="branch-stock-table-head">
                <span>Item</span>
                <span>Branch</span>
                <span>Stock</span>
                <span>Status</span>
              </div>

              {visibleStocks.length === 0 ? (
                <div className="branch-stock-empty small">No branch stock rows yet.</div>
              ) : (
                visibleStocks.map((stock) => {
                  const branch = branchMap.get(stock.branch_id)
                  const item = itemMap.get(stock.item_id)
                  const isLow = Number(stock.stock_quantity || 0) <= Number(stock.low_stock_quantity || 0)

                  return (
                    <div className="branch-stock-row" key={stock.id}>
                      <div>
                        <strong>{item?.name || 'Item'}</strong>
                        <small>{item?.category?.name || 'No category'}</small>
                      </div>

                      <div>
                        <strong>{branch?.branch_name || 'Branch'}</strong>
                        <small>{branch?.city || branch?.branch_code || 'Location'}</small>
                      </div>

                      <div>
                        <strong>{formatQty(stock.stock_quantity)} {stock.stock_unit}</strong>
                        <small>Alert: {formatQty(stock.low_stock_quantity)}</small>
                      </div>

                      <StatusPill status={isLow ? 'low' : 'ok'} />
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <section className="branch-stock-card list-card transfers-card">
            <div className="branch-stock-card-head compact">
              <div>
                <p className="pricing-label">Transfers</p>
                <h3>Stock transfer history</h3>
              </div>
              <span>{visibleTransfers.length}</span>
            </div>

            <div className="branch-transfer-list">
              {visibleTransfers.length === 0 ? (
                <div className="branch-stock-empty small">No stock transfers found.</div>
              ) : (
                visibleTransfers.map((transfer) => {
                  const fromBranch = branchMap.get(transfer.from_branch_id)
                  const toBranch = branchMap.get(transfer.to_branch_id)
                  const item = itemMap.get(transfer.item_id)
                  const busy = actionLoadingId === transfer.id

                  return (
                    <article className={`branch-transfer-card ${transfer.status}`} key={transfer.id}>
                      <div className="branch-transfer-head">
                        <div>
                          <strong>{transfer.transfer_code}</strong>
                          <span>{formatDate(transfer.created_at)}</span>
                        </div>
                        <StatusPill status={transfer.status} />
                      </div>

                      <div className="branch-transfer-route">
                        <div>
                          <span>From</span>
                          <strong>{fromBranch?.branch_name || 'Source'}</strong>
                        </div>
                        <ArrowLeftRight size={17} />
                        <div>
                          <span>To</span>
                          <strong>{toBranch?.branch_name || 'Destination'}</strong>
                        </div>
                      </div>

                      <div className="branch-transfer-item-line">
                        <strong>{item?.name || 'Item'}</strong>
                        <span>{formatQty(transfer.quantity)} {transfer.unit || 'pcs'}</span>
                      </div>

                      {transfer.notes && <p>{transfer.notes}</p>}

                      {transfer.status === 'in_transit' && (
                        <div className="branch-transfer-actions">
                          <button
                            type="button"
                            onClick={() => handleReceiveTransfer(transfer)}
                            disabled={busy}
                          >
                            {busy ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                            Receive
                          </button>

                          <button
                            type="button"
                            className="danger"
                            onClick={() => handleCancelTransfer(transfer)}
                            disabled={busy}
                          >
                            <XCircle size={15} />
                            Cancel
                          </button>
                        </div>
                      )}
                    </article>
                  )
                })
              )}
            </div>
          </section>
        </div>
      )}

      <section className="branch-stock-card movements-card">
        <div className="branch-stock-card-head compact">
          <div>
            <p className="pricing-label">Recent Ledger</p>
            <h3>Branch stock movements</h3>
          </div>
          <span>{movements.length}</span>
        </div>

        <div className="branch-movement-list">
          {movements.length === 0 ? (
            <div className="branch-stock-empty small">No movements yet.</div>
          ) : (
            movements.map((movement) => {
              const branch = branchMap.get(movement.branch_id)
              const item = itemMap.get(movement.item_id)

              return (
                <div className="branch-movement-row" key={movement.id}>
                  <div>
                    <strong>{formatMovementType(movement.movement_type)}</strong>
                    <span>{branch?.branch_name || 'Branch'} • {item?.name || 'Item'}</span>
                  </div>
                  <div>
                    <strong className={Number(movement.quantity_delta || 0) >= 0 ? 'plus' : 'minus'}>
                      {Number(movement.quantity_delta || 0) >= 0 ? '+' : ''}{formatQty(movement.quantity_delta)}
                    </strong>
                    <small>{formatDate(movement.created_at)}</small>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>
    </section>
  )
}

function StatCard({ icon, label, value, danger = false }) {
  return (
    <div className={`branch-stock-stat ${danger ? 'danger' : ''}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StatusPill({ status }) {
  const labels = {
    low: 'Low stock',
    ok: 'Good',
    in_transit: 'In transit',
    received: 'Received',
    cancelled: 'Cancelled',
  }

  return <span className={`branch-status-pill ${status}`}>{labels[status] || status}</span>
}

function mapById(items) {
  return new Map((items || []).map((item) => [item.id, item]))
}

function formatQty(value) {
  const numberValue = Number(value || 0)

  if (Number.isInteger(numberValue)) return String(numberValue)

  return numberValue.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

function formatDate(value) {
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

function formatMovementType(type) {
  if (type === 'opening') return 'Opening / adjustment'
  if (type === 'adjustment_add') return 'Stock added'
  if (type === 'adjustment_remove') return 'Stock reduced'
  if (type === 'transfer_out') return 'Transfer out'
  if (type === 'transfer_in') return 'Transfer in'
  if (type === 'cancel_return') return 'Cancelled transfer return'
  return 'Stock movement'
}

const stockUnits = ['pcs', 'kg', 'g', 'ltr', 'ml', 'box', 'pack', 'tray', 'bottle', 'bag']

export default BranchStockTransfersManagement
