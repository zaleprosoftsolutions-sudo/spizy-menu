import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  Calculator,
  CheckCircle2,
  Download,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  Utensils,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './COGSManagement.css'

const units = ['kg', 'g', 'ltr', 'ml', 'pcs', 'pack', 'portion', 'unit']

const emptyRecipeForm = {
  menu_item_id: '',
  ingredient_name: '',
  unit: 'kg',
  quantity_per_item: '',
  cost_per_unit: '',
  wastage_percent: '',
  notes: '',
}

function COGSManagement({ restaurant }) {
  const [loading, setLoading] = useState(true)
  const [savingRecipe, setSavingRecipe] = useState(false)
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [monthKey, setMonthKey] = useState(() => getCurrentMonthInput())
  const [menuItems, setMenuItems] = useState([])
  const [recipeItems, setRecipeItems] = useState([])
  const [orders, setOrders] = useState([])
  const [orderItems, setOrderItems] = useState([])
  const [snapshots, setSnapshots] = useState([])
  const [search, setSearch] = useState('')
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('')
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState(emptyRecipeForm)

  const currency = restaurant?.currency || 'AED'
  const { startDate, endDate, startIso, endIso } = useMemo(
    () => getMonthDateRange(monthKey),
    [monthKey],
  )

  const loadCogsData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)
    setMessage(null)

    const [menuResult, recipeResult, ordersResult, snapshotResult] = await Promise.all([
      supabase
        .from('menu_items')
        .select('id, name, price, category_id, is_available, is_deleted, category:menu_categories(id, name)')
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .order('name', { ascending: true }),
      supabase
        .from('restaurant_recipe_cost_items')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true }),
      supabase
        .from('restaurant_orders')
        .select('id, order_code, status, payment_status, total_amount, created_at')
        .eq('restaurant_id', restaurant.id)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: false }),
      supabase
        .from('restaurant_cogs_snapshots')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('period_key', monthKey)
        .order('created_at', { ascending: false }),
    ])

    const setupErrors = [recipeResult.error, snapshotResult.error].filter(
      (error) => error && error.code === '42P01',
    )

    if (setupErrors.length > 0) {
      setMessage({
        type: 'warning',
        title: 'COGS tables are not active yet',
        text: 'Run the included SQL file first, then refresh this page.',
      })
    }

    const otherErrors = [
      ['Menu items', menuResult.error],
      ['Recipe costing', recipeResult.error],
      ['Orders', ordersResult.error],
      ['COGS snapshots', snapshotResult.error],
    ].filter(([, error]) => error && error.code !== '42P01')

    if (otherErrors.length > 0) {
      setMessage({
        type: 'error',
        title: 'COGS data loading failed',
        text: otherErrors.map(([label, error]) => `${label}: ${error.message}`).join(' | '),
      })
    }

    const loadedOrders = ordersResult.data || []
    let loadedOrderItems = []

    if (loadedOrders.length > 0) {
      const { data: itemData, error: itemError } = await supabase
        .from('restaurant_order_items')
        .select('*')
        .in('order_id', loadedOrders.map((order) => order.id))
        .order('created_at', { ascending: true })

      if (itemError) {
        setMessage({
          type: 'error',
          title: 'Order items loading failed',
          text: itemError.message,
        })
      }

      loadedOrderItems = itemData || []
    }

    const normalizedMenuItems = menuResult.data || []

    setMenuItems(normalizedMenuItems)
    setRecipeItems(recipeResult.data || [])
    setOrders(loadedOrders)
    setOrderItems(loadedOrderItems)
    setSnapshots(snapshotResult.data || [])

    setForm((current) => ({
      ...current,
      menu_item_id: current.menu_item_id || normalizedMenuItems[0]?.id || '',
    }))
    setSelectedMenuItemId((current) => current || normalizedMenuItems[0]?.id || '')
    setLoading(false)
  }, [endIso, monthKey, restaurant?.id, startIso])

  useEffect(() => {
    loadCogsData()
  }, [loadCogsData])

  const recipeCostByItem = useMemo(
    () => buildRecipeCostByItem(recipeItems),
    [recipeItems],
  )

  const soldRows = useMemo(
    () => buildSoldItemRows({ orders, orderItems, menuItems, recipeCostByItem }),
    [menuItems, orderItems, orders, recipeCostByItem],
  )

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return soldRows

    return soldRows.filter((row) =>
      [row.itemName, row.categoryName, row.statusLabel].some((value) =>
        String(value || '').toLowerCase().includes(keyword),
      ),
    )
  }, [search, soldRows])

  const cogsSummary = useMemo(() => buildCogsSummary(soldRows), [soldRows])

  const selectedMenuItem = useMemo(
    () => menuItems.find((item) => item.id === selectedMenuItemId) || menuItems[0] || null,
    [menuItems, selectedMenuItemId],
  )

  const selectedRecipeRows = useMemo(() => {
    if (!selectedMenuItem?.id) return []

    return recipeItems.filter((item) => item.menu_item_id === selectedMenuItem.id)
  }, [recipeItems, selectedMenuItem?.id])

  const selectedRecipeCost = useMemo(
    () => recipeCostByItem[selectedMenuItem?.id]?.totalRecipeCost || 0,
    [recipeCostByItem, selectedMenuItem?.id],
  )

  const cogsWarnings = useMemo(
    () => buildCogsWarnings({ soldRows, menuItems, recipeItems, cogsSummary }),
    [cogsSummary, menuItems, recipeItems, soldRows],
  )

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    setMessage(null)
  }

  const handleAddRecipeItem = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const menuItemId = form.menu_item_id || selectedMenuItem?.id || ''
    const ingredientName = form.ingredient_name.trim()
    const quantityPerItem = Number(form.quantity_per_item || 0)
    const costPerUnit = Number(form.cost_per_unit || 0)
    const wastagePercent = Number(form.wastage_percent || 0)

    if (!menuItemId) {
      setMessage({ type: 'warning', title: 'Select menu item', text: 'Choose the product for this recipe cost line.' })
      return
    }

    if (!ingredientName) {
      setMessage({ type: 'warning', title: 'Ingredient required', text: 'Enter ingredient or packaging name.' })
      return
    }

    if (quantityPerItem <= 0 || costPerUnit < 0) {
      setMessage({
        type: 'warning',
        title: 'Check quantity and cost',
        text: 'Quantity per item should be greater than zero, and cost cannot be negative.',
      })
      return
    }

    setSavingRecipe(true)

    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('restaurant_recipe_cost_items').insert({
      restaurant_id: restaurant.id,
      menu_item_id: menuItemId,
      ingredient_name: ingredientName,
      unit: form.unit || 'unit',
      quantity_per_item: quantityPerItem,
      cost_per_unit: costPerUnit,
      wastage_percent: Math.max(0, wastagePercent),
      notes: form.notes.trim() || null,
      created_by: userData?.user?.id || null,
    })

    setSavingRecipe(false)

    if (error) {
      setMessage({ type: 'error', title: 'Recipe cost save failed', text: error.message })
      return
    }

    setForm({
      ...emptyRecipeForm,
      menu_item_id: menuItemId,
    })
    setSelectedMenuItemId(menuItemId)
    await loadCogsData()
    setMessage({ type: 'success', title: 'Recipe cost added', text: `${ingredientName} added to recipe costing.` })
  }

  const handleDeleteRecipeItem = async (recipeItem) => {
    if (!recipeItem?.id) return

    const { error } = await supabase
      .from('restaurant_recipe_cost_items')
      .update({ is_deleted: true, is_active: false, updated_at: new Date().toISOString() })
      .eq('id', recipeItem.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      setMessage({ type: 'error', title: 'Recipe cost delete failed', text: error.message })
      return
    }

    await loadCogsData()
    setMessage({ type: 'success', title: 'Recipe cost removed', text: 'The ingredient line was removed safely.' })
  }

  const saveMonthlySnapshot = async () => {
    if (!restaurant?.id) return

    const rowsToSave = soldRows.filter((row) => row.menuItemId)

    if (rowsToSave.length === 0) {
      setMessage({ type: 'warning', title: 'No rows to snapshot', text: 'There are no menu-item rows with sales for this month.' })
      return
    }

    setSavingSnapshot(true)

    const { data: userData } = await supabase.auth.getUser()
    const payload = rowsToSave.map((row) => ({
      restaurant_id: restaurant.id,
      period_key: monthKey,
      period_start: startDate,
      period_end: endDate,
      menu_item_id: row.menuItemId,
      item_name: row.itemName,
      category_name: row.categoryName || null,
      quantity_sold: row.quantitySold,
      net_sales: row.netSales,
      recipe_cost_per_item: row.recipeCostPerItem,
      estimated_cogs: row.estimatedCogs,
      gross_profit: row.grossProfit,
      gross_margin_percent: row.grossMarginPercent,
      metadata: {
        source: 'spizy_cogs_foundation',
        order_count: row.orderCount,
        missing_recipe: row.missingRecipe,
      },
      created_by: userData?.user?.id || null,
    }))

    const { error } = await supabase
      .from('restaurant_cogs_snapshots')
      .upsert(payload, { onConflict: 'restaurant_id,period_key,menu_item_id' })

    setSavingSnapshot(false)

    if (error) {
      setMessage({ type: 'error', title: 'Snapshot save failed', text: error.message })
      return
    }

    await loadCogsData()
    setMessage({ type: 'success', title: 'COGS snapshot saved', text: `${payload.length} product margin row${payload.length === 1 ? '' : 's'} saved for ${formatMonthLabel(monthKey)}.` })
  }

  const exportCsv = () => {
    const header = [
      'Item',
      'Category',
      'Qty sold',
      'Net sales',
      'Recipe cost/item',
      'Estimated COGS',
      'Gross profit',
      'Gross margin %',
      'Recipe status',
    ]

    const rows = filteredRows.map((row) => [
      row.itemName,
      row.categoryName || '',
      row.quantitySold,
      row.netSales.toFixed(2),
      row.recipeCostPerItem.toFixed(2),
      row.estimatedCogs.toFixed(2),
      row.grossProfit.toFixed(2),
      row.grossMarginPercent.toFixed(2),
      row.statusLabel,
    ])

    downloadCsv(`spizy-cogs-${monthKey}.csv`, [header, ...rows])
  }

  const printReport = () => {
    window.print()
  }

  if (loading) {
    return (
      <section className="cogs-shell">
        <div className="cogs-loading-card">
          <RefreshCw className="spin" size={20} />
          <span>Loading recipe costing and COGS...</span>
        </div>
      </section>
    )
  }

  return (
    <section className="cogs-shell">
      <div className="cogs-hero">
        <div>
          <p className="pricing-label">Inventory → COGS → Profit</p>
          <h1>Recipe Costing & Gross Margin</h1>
          <p>
            Connect menu items with ingredient cost, estimate food cost from sold items,
            and understand gross profit before deep inventory automation.
          </p>
        </div>

        <div className="cogs-hero-actions">
          <label>
            Month
            <input
              type="month"
              value={monthKey}
              onChange={(event) => setMonthKey(event.target.value)}
            />
          </label>
          <button type="button" className="tiny-button ghost" onClick={loadCogsData}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className={`cogs-message ${message.type}`}>
          <strong>{message.title}</strong>
          <span>{message.text}</span>
        </div>
      )}

      <div className="cogs-summary-grid">
        <MetricCard
          icon={<BarChart3 size={20} />}
          label="Net sales"
          value={formatMoney(cogsSummary.netSales, currency)}
          helper={`${cogsSummary.quantitySold} items sold`}
        />
        <MetricCard
          icon={<Calculator size={20} />}
          label="Estimated COGS"
          value={formatMoney(cogsSummary.estimatedCogs, currency)}
          helper={`${cogsSummary.cogsPercent.toFixed(1)}% of sales`}
        />
        <MetricCard
          icon={<CheckCircle2 size={20} />}
          label="Gross profit"
          value={formatMoney(cogsSummary.grossProfit, currency)}
          helper={`${cogsSummary.grossMarginPercent.toFixed(1)}% margin`}
        />
        <MetricCard
          icon={<AlertTriangle size={20} />}
          label="Missing recipe"
          value={String(cogsSummary.missingRecipeCount)}
          helper="Sold items without cost setup"
        />
      </div>

      <div className="cogs-layout-grid">
        <section className="cogs-panel">
          <div className="cogs-panel-head">
            <div>
              <p className="pricing-label">Recipe setup</p>
              <h2>Ingredient cost per menu item</h2>
            </div>
          </div>

          <div className="cogs-menu-selector">
            <label>
              Menu item
              <select
                value={selectedMenuItem?.id || ''}
                onChange={(event) => {
                  setSelectedMenuItemId(event.target.value)
                  updateForm('menu_item_id', event.target.value)
                }}
              >
                {menuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} • {formatMoney(item.price, currency)}
                  </option>
                ))}
              </select>
            </label>

            <div className="cogs-cost-pill">
              <span>Recipe cost / item</span>
              <strong>{formatMoney(selectedRecipeCost, currency)}</strong>
            </div>
          </div>

          <form className="cogs-recipe-form" onSubmit={handleAddRecipeItem}>
            <input
              type="text"
              value={form.ingredient_name}
              onChange={(event) => updateForm('ingredient_name', event.target.value)}
              placeholder="Ingredient / packaging"
            />
            <select value={form.unit} onChange={(event) => updateForm('unit', event.target.value)}>
              {units.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.quantity_per_item}
              onChange={(event) => updateForm('quantity_per_item', event.target.value)}
              placeholder="Qty/item"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.cost_per_unit}
              onChange={(event) => updateForm('cost_per_unit', event.target.value)}
              placeholder="Cost/unit"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.wastage_percent}
              onChange={(event) => updateForm('wastage_percent', event.target.value)}
              placeholder="Waste %"
            />
            <button type="submit" className="tiny-button" disabled={savingRecipe}>
              {savingRecipe ? <RefreshCw className="spin" size={16} /> : <Plus size={16} />}
              Add
            </button>
          </form>

          <div className="cogs-recipe-lines">
            {selectedRecipeRows.length === 0 ? (
              <div className="cogs-empty-state">
                <BookOpenCheck size={22} />
                <strong>No recipe cost yet</strong>
                <span>Add ingredients or packaging cost for this item to calculate COGS.</span>
              </div>
            ) : (
              selectedRecipeRows.map((line) => {
                const lineCost = getRecipeLineCost(line)

                return (
                  <article className="cogs-recipe-line" key={line.id}>
                    <div>
                      <strong>{line.ingredient_name}</strong>
                      <span>
                        {formatNumber(line.quantity_per_item)} {line.unit || 'unit'} × {formatMoney(line.cost_per_unit, currency)}
                        {Number(line.wastage_percent || 0) > 0 ? ` + ${formatNumber(line.wastage_percent)}% waste` : ''}
                      </span>
                    </div>
                    <strong>{formatMoney(lineCost, currency)}</strong>
                    <button type="button" className="icon-button danger" onClick={() => handleDeleteRecipeItem(line)}>
                      <Trash2 size={15} />
                    </button>
                  </article>
                )
              })
            )}
          </div>
        </section>

        <section className="cogs-panel">
          <div className="cogs-panel-head">
            <div>
              <p className="pricing-label">Smart alerts</p>
              <h2>Food-cost attention list</h2>
            </div>
          </div>

          <div className="cogs-warning-list">
            {cogsWarnings.map((warning) => (
              <article className={`cogs-warning ${warning.tone}`} key={warning.key}>
                <warning.icon size={18} />
                <div>
                  <strong>{warning.title}</strong>
                  <span>{warning.text}</span>
                </div>
              </article>
            ))}
          </div>

          <div className="cogs-snapshot-box">
            <div>
              <strong>Month snapshot</strong>
              <span>{snapshots.length} saved row{snapshots.length === 1 ? '' : 's'} for {formatMonthLabel(monthKey)}</span>
            </div>
            <button type="button" className="tiny-button" onClick={saveMonthlySnapshot} disabled={savingSnapshot}>
              {savingSnapshot ? <RefreshCw className="spin" size={16} /> : <CheckCircle2 size={16} />}
              Save Snapshot
            </button>
          </div>
        </section>
      </div>

      <section className="cogs-panel cogs-report-panel">
        <div className="cogs-panel-head wrap">
          <div>
            <p className="pricing-label">COGS report</p>
            <h2>Product-wise gross margin</h2>
          </div>

          <div className="cogs-report-actions">
            <div className="cogs-search-box">
              <Search size={16} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search item or category..."
              />
            </div>
            <button type="button" className="tiny-button ghost" onClick={exportCsv}>
              <Download size={16} /> CSV
            </button>
            <button type="button" className="tiny-button ghost" onClick={printReport}>
              <Printer size={16} /> Print
            </button>
          </div>
        </div>

        <div className="cogs-table-wrap">
          <table className="cogs-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Sales</th>
                <th>Cost/item</th>
                <th>COGS</th>
                <th>Gross profit</th>
                <th>Margin</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className="cogs-empty-state compact">
                      <Utensils size={18} />
                      <span>No sold item rows found for this month.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <strong>{row.itemName}</strong>
                      <span>{row.categoryName || 'Uncategorised'}</span>
                    </td>
                    <td>{formatNumber(row.quantitySold)}</td>
                    <td>{formatMoney(row.netSales, currency)}</td>
                    <td>{formatMoney(row.recipeCostPerItem, currency)}</td>
                    <td>{formatMoney(row.estimatedCogs, currency)}</td>
                    <td>{formatMoney(row.grossProfit, currency)}</td>
                    <td>{formatNumber(row.grossMarginPercent)}%</td>
                    <td><span className={`cogs-status ${row.statusTone}`}>{row.statusLabel}</span></td>
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

function MetricCard({ icon, label, value, helper }) {
  return (
    <article className="cogs-metric-card">
      <div className="cogs-metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
    </article>
  )
}

function buildRecipeCostByItem(recipeItems) {
  return recipeItems.reduce((map, item) => {
    if (!item.menu_item_id || item.is_deleted || item.is_active === false) return map

    const current = map[item.menu_item_id] || { lines: [], totalRecipeCost: 0 }
    const lineCost = getRecipeLineCost(item)

    map[item.menu_item_id] = {
      lines: [...current.lines, item],
      totalRecipeCost: current.totalRecipeCost + lineCost,
    }

    return map
  }, {})
}

function buildSoldItemRows({ orders, orderItems, menuItems, recipeCostByItem }) {
  const validOrderIds = new Set(
    orders
      .filter((order) => !isCancelledOrder(order))
      .map((order) => order.id),
  )
  const menuById = new Map(menuItems.map((item) => [item.id, item]))
  const rowMap = new Map()

  orderItems.forEach((item) => {
    if (!validOrderIds.has(item.order_id)) return

    const menuItemId = getOrderItemMenuItemId(item)
    const menuItem = menuById.get(menuItemId)
    const key = menuItemId || `manual-${normalizeOrderItemName(item)}`
    const quantity = getOrderItemQuantity(item)
    const total = getOrderItemTotal(item, menuItem)
    const current = rowMap.get(key) || {
      key,
      menuItemId,
      itemName: menuItem?.name || normalizeOrderItemName(item),
      categoryName: menuItem?.category?.name || item.category_name || '',
      quantitySold: 0,
      netSales: 0,
      orderIds: new Set(),
    }

    current.quantitySold += quantity
    current.netSales += total
    current.orderIds.add(item.order_id)
    rowMap.set(key, current)
  })

  return Array.from(rowMap.values())
    .map((row) => {
      const recipeCostPerItem = recipeCostByItem[row.menuItemId]?.totalRecipeCost || 0
      const estimatedCogs = recipeCostPerItem * row.quantitySold
      const grossProfit = row.netSales - estimatedCogs
      const grossMarginPercent = row.netSales > 0 ? (grossProfit / row.netSales) * 100 : 0
      const missingRecipe = row.menuItemId && recipeCostPerItem <= 0
      const statusLabel = missingRecipe ? 'Missing recipe cost' : row.menuItemId ? 'Cost ready' : 'Manual / unknown item'
      const statusTone = missingRecipe ? 'warning' : row.menuItemId ? 'success' : 'muted'

      return {
        ...row,
        orderCount: row.orderIds.size,
        recipeCostPerItem,
        estimatedCogs,
        grossProfit,
        grossMarginPercent,
        missingRecipe,
        statusLabel,
        statusTone,
      }
    })
    .sort((a, b) => Number(b.netSales || 0) - Number(a.netSales || 0))
}

function buildCogsSummary(rows) {
  const quantitySold = rows.reduce((total, row) => total + Number(row.quantitySold || 0), 0)
  const netSales = rows.reduce((total, row) => total + Number(row.netSales || 0), 0)
  const estimatedCogs = rows.reduce((total, row) => total + Number(row.estimatedCogs || 0), 0)
  const grossProfit = netSales - estimatedCogs
  const grossMarginPercent = netSales > 0 ? (grossProfit / netSales) * 100 : 0
  const cogsPercent = netSales > 0 ? (estimatedCogs / netSales) * 100 : 0
  const missingRecipeCount = rows.filter((row) => row.missingRecipe).length

  return {
    quantitySold,
    netSales,
    estimatedCogs,
    grossProfit,
    grossMarginPercent,
    cogsPercent,
    missingRecipeCount,
  }
}

function buildCogsWarnings({ soldRows, menuItems, recipeItems, cogsSummary }) {
  const warnings = []
  const menuItemsWithRecipe = new Set(recipeItems.map((item) => item.menu_item_id))
  const missingRecipeRows = soldRows.filter((row) => row.missingRecipe)

  if (missingRecipeRows.length > 0) {
    warnings.push({
      key: 'missing-recipe',
      tone: 'warning',
      icon: AlertTriangle,
      title: `${missingRecipeRows.length} sold item${missingRecipeRows.length === 1 ? '' : 's'} missing recipe cost`,
      text: 'Add ingredient cost for best-selling items first to improve profit accuracy.',
    })
  }

  const setupCoverage = menuItems.length > 0 ? (menuItemsWithRecipe.size / menuItems.length) * 100 : 0

  if (setupCoverage < 60) {
    warnings.push({
      key: 'coverage',
      tone: 'notice',
      icon: BookOpenCheck,
      title: `${setupCoverage.toFixed(0)}% recipe setup coverage`,
      text: 'Build recipes for high-selling products before relying on COGS reports.',
    })
  }

  if (cogsSummary.cogsPercent > 45) {
    warnings.push({
      key: 'high-cogs',
      tone: 'danger',
      icon: Calculator,
      title: 'High food-cost percentage',
      text: `Estimated COGS is ${cogsSummary.cogsPercent.toFixed(1)}% of sales. Review pricing, wastage and supplier costs.`,
    })
  }

  if (warnings.length === 0) {
    warnings.push({
      key: 'healthy',
      tone: 'success',
      icon: CheckCircle2,
      title: 'COGS foundation looks healthy',
      text: 'Sold items have recipe cost coverage and margin is within a normal review range.',
    })
  }

  return warnings
}

function getRecipeLineCost(item) {
  const quantity = Number(item.quantity_per_item || 0)
  const cost = Number(item.cost_per_unit || 0)
  const wastage = Math.max(Number(item.wastage_percent || 0), 0)

  return quantity * cost * (1 + wastage / 100)
}

function isCancelledOrder(order) {
  return ['cancelled', 'voided', 'rejected'].includes(String(order.status || '').toLowerCase())
}

function getOrderItemMenuItemId(item) {
  return item.menu_item_id || item.item_id || item.product_id || item.menu_product_id || ''
}

function normalizeOrderItemName(item) {
  return item.item_name || item.product_name || item.name || 'Order item'
}

function getOrderItemQuantity(item) {
  const quantity = Number(item.quantity ?? item.qty ?? item.item_quantity ?? 1)
  return quantity > 0 ? quantity : 1
}

function getOrderItemTotal(item, menuItem) {
  const directTotal = Number(
    item.total_price ??
      item.line_total ??
      item.total_amount ??
      item.subtotal ??
      item.amount ??
      0,
  )

  if (directTotal > 0) return directTotal

  const quantity = getOrderItemQuantity(item)
  const price = Number(item.unit_price ?? item.price ?? menuItem?.price ?? 0)

  return quantity * price
}

function getMonthDateRange(monthKey) {
  const safeMonth = /^\d{4}-\d{2}$/.test(monthKey) ? monthKey : getCurrentMonthInput()
  const [year, month] = safeMonth.split('-').map(Number)
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0))
  const lastDate = new Date(Date.UTC(year, month, 0, 0, 0, 0))

  return {
    startDate: `${safeMonth}-01`,
    endDate: lastDate.toISOString().slice(0, 10),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

function getCurrentMonthInput() {
  return new Date().toISOString().slice(0, 7)
}

function formatMonthLabel(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey || '')) return monthKey || 'selected month'

  const [year, month] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  )
}

function formatMoney(value, currency = 'AED') {
  return `${currency} ${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
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

export default COGSManagement
