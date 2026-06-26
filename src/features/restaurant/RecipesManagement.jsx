import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BookOpenCheck,
  Calculator,
  ChefHat,
  DollarSign,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './RecipesManagement.css'

const emptyRecipeForm = {
  id: null,
  recipeName: '',
  yieldQuantity: 1,
  yieldUnit: 'portion',
  prepTimeMinutes: 10,
  cookTimeMinutes: 15,
  instructions: '',
  notes: '',
  isActive: true,
}

const defaultIngredientUnits = [
  'pcs',
  'kg',
  'g',
  'ltr',
  'ml',
  'box',
  'pack',
  'portion',
  'tbsp',
  'tsp',
]

function RecipesManagement({ restaurant }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [menuItems, setMenuItems] = useState([])
  const [recipes, setRecipes] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [recipeForm, setRecipeForm] = useState(emptyRecipeForm)
  const [ingredientRows, setIngredientRows] = useState([])
  const currency = restaurant?.currency || 'AED'

  const menuItemMap = useMemo(() => {
    return new Map(menuItems.map((item) => [item.id, item]))
  }, [menuItems])

  const recipeMap = useMemo(() => {
    return new Map(recipes.map((recipe) => [recipe.menu_item_id, recipe]))
  }, [recipes])

  const selectedItem = useMemo(() => {
    return menuItems.find((item) => item.id === selectedItemId) || null
  }, [menuItems, selectedItemId])

  const selectedRecipe = useMemo(() => {
    return recipeMap.get(selectedItemId) || null
  }, [recipeMap, selectedItemId])

  const selectedRecipeIngredients = useMemo(() => {
    if (!selectedRecipe?.id) return []

    return ingredients.filter(
      (ingredient) => ingredient.recipe_id === selectedRecipe.id,
    )
  }, [ingredients, selectedRecipe?.id])

  const filteredMenuItems = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return menuItems.filter((item) => {
      if (!keyword) return true

      return [item.name, item.category?.name].some((value) =>
        String(value || '').toLowerCase().includes(keyword),
      )
    })
  }, [menuItems, search])

  const recipeStats = useMemo(() => {
    const totalCost = ingredientRows.reduce(
      (total, row) => total + calculateIngredientTotal(row),
      0,
    )
    const sellingPrice = Number(selectedItem?.price || 0)
    const margin = sellingPrice - totalCost
    const costPercent = sellingPrice > 0 ? (totalCost / sellingPrice) * 100 : 0
    const suggestedPrice = totalCost > 0 ? totalCost * 3 : 0

    return {
      totalCost,
      sellingPrice,
      margin,
      costPercent,
      suggestedPrice,
      ingredientCount: ingredientRows.filter((row) => row.ingredientItemId).length,
    }
  }, [ingredientRows, selectedItem?.price])

  const loadData = useCallback(async (preferredItemId = '') => {
    if (!restaurant?.id) return

    setLoading(true)

    const [{ data: itemData, error: itemError }, { data: recipeData, error: recipeError }] =
      await Promise.all([
        supabase
          .from('menu_items')
          .select(
            `
              id,
              name,
              price,
              image_url,
              track_stock,
              stock_quantity,
              low_stock_quantity,
              stock_unit,
              category:menu_categories ( id, name )
            `,
          )
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('restaurant_recipes')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('updated_at', { ascending: false }),
      ])

    if (itemError || recipeError) {
      setMenuItems([])
      setRecipes([])
      setIngredients([])
      setLoading(false)
      return
    }

    const loadedRecipes = recipeData || []
    const recipeIds = loadedRecipes.map((recipe) => recipe.id)
    let ingredientData = []

    if (recipeIds.length > 0) {
      const { data } = await supabase
        .from('restaurant_recipe_ingredients')
        .select('*')
        .in('recipe_id', recipeIds)
        .order('created_at', { ascending: true })

      ingredientData = data || []
    }

    setMenuItems(itemData || [])
    setRecipes(loadedRecipes)
    setIngredients(ingredientData)

    const firstItemId = preferredItemId || itemData?.[0]?.id || ''
    if (firstItemId) {
      applySelectedItem(firstItemId, loadedRecipes, ingredientData, itemData || [])
    }

    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadData(selectedItemId)
  }, [loadData])

  const applySelectedItem = (itemId, recipeList = recipes, ingredientList = ingredients, itemList = menuItems) => {
    const item = itemList.find((entry) => entry.id === itemId)
    const recipe = recipeList.find((entry) => entry.menu_item_id === itemId)
    const recipeIngredients = recipe
      ? ingredientList.filter((entry) => entry.recipe_id === recipe.id)
      : []

    setSelectedItemId(itemId)
    setRecipeForm(
      recipe
        ? {
            id: recipe.id,
            recipeName: recipe.recipe_name || item?.name || '',
            yieldQuantity: Number(recipe.yield_quantity || 1),
            yieldUnit: recipe.yield_unit || 'portion',
            prepTimeMinutes: Number(recipe.prep_time_minutes || 0),
            cookTimeMinutes: Number(recipe.cook_time_minutes || 0),
            instructions: recipe.instructions || '',
            notes: recipe.notes || '',
            isActive: recipe.is_active !== false,
          }
        : {
            ...emptyRecipeForm,
            recipeName: item?.name || '',
          },
    )
    setIngredientRows(
      recipeIngredients.length > 0
        ? recipeIngredients.map(normalizeIngredientRow)
        : [createEmptyIngredientRow(item?.stock_unit || 'pcs')],
    )
  }

  const updateRecipeForm = (key, value) => {
    setRecipeForm((current) => ({ ...current, [key]: value }))
  }

  const updateIngredientRow = (localId, key, value) => {
    setIngredientRows((current) =>
      current.map((row) => {
        if (row.localId !== localId) return row

        if (key === 'ingredientItemId') {
          const item = menuItemMap.get(value)
          return {
            ...row,
            ingredientItemId: value,
            ingredientName: item?.name || '',
            unit: item?.stock_unit || row.unit || 'pcs',
          }
        }

        return { ...row, [key]: value }
      }),
    )
  }

  const addIngredientRow = () => {
    setIngredientRows((current) => [...current, createEmptyIngredientRow()])
  }

  const removeIngredientRow = (localId) => {
    setIngredientRows((current) =>
      current.length === 1
        ? [createEmptyIngredientRow()]
        : current.filter((row) => row.localId !== localId),
    )
  }

  const handleSaveRecipe = async () => {
    if (!restaurant?.id || !selectedItemId) return

    const cleanRows = ingredientRows
      .map((row) => ({
        ...row,
        quantity: Number(row.quantity || 0),
        wastagePercent: Number(row.wastagePercent || 0),
        unitCost: Number(row.unitCost || 0),
      }))
      .filter((row) => row.ingredientItemId && row.quantity > 0)

    setSaving(true)

    const recipePayload = {
      restaurant_id: restaurant.id,
      menu_item_id: selectedItemId,
      recipe_name: recipeForm.recipeName.trim() || selectedItem?.name || 'Recipe',
      yield_quantity: Number(recipeForm.yieldQuantity || 1),
      yield_unit: recipeForm.yieldUnit || 'portion',
      prep_time_minutes: Number(recipeForm.prepTimeMinutes || 0),
      cook_time_minutes: Number(recipeForm.cookTimeMinutes || 0),
      instructions: recipeForm.instructions.trim() || null,
      notes: recipeForm.notes.trim() || null,
      is_active: Boolean(recipeForm.isActive),
      total_food_cost: Number(recipeStats.totalCost || 0),
      food_cost_percent: Number(recipeStats.costPercent || 0),
      suggested_price: Number(recipeStats.suggestedPrice || 0),
      updated_at: new Date().toISOString(),
    }

    let recipeId = recipeForm.id
    let recipeError = null

    if (recipeId) {
      const { error } = await supabase
        .from('restaurant_recipes')
        .update(recipePayload)
        .eq('id', recipeId)
        .eq('restaurant_id', restaurant.id)

      recipeError = error
    } else {
      const { data, error } = await supabase
        .from('restaurant_recipes')
        .insert(recipePayload)
        .select('*')
        .single()

      recipeId = data?.id
      recipeError = error
    }

    if (recipeError || !recipeId) {
      setSaving(false)
      showRecipeMessage(recipeError?.message || 'Recipe save failed.')
      return
    }

    await supabase
      .from('restaurant_recipe_ingredients')
      .delete()
      .eq('recipe_id', recipeId)
      .eq('restaurant_id', restaurant.id)

    if (cleanRows.length > 0) {
      const ingredientPayload = cleanRows.map((row) => {
        const ingredientItem = menuItemMap.get(row.ingredientItemId)
        const totalCost = calculateIngredientTotal(row)

        return {
          recipe_id: recipeId,
          restaurant_id: restaurant.id,
          ingredient_item_id: row.ingredientItemId,
          ingredient_name: ingredientItem?.name || row.ingredientName || 'Ingredient',
          quantity: row.quantity,
          unit: row.unit || ingredientItem?.stock_unit || 'pcs',
          wastage_percent: row.wastagePercent,
          unit_cost: row.unitCost,
          total_cost: Number(totalCost || 0),
          notes: row.notes?.trim() || null,
        }
      })

      const { error: ingredientError } = await supabase
        .from('restaurant_recipe_ingredients')
        .insert(ingredientPayload)

      if (ingredientError) {
        setSaving(false)
        showRecipeMessage(ingredientError.message)
        return
      }
    }

    const savedRecipe = {
      id: recipeId,
      ...recipePayload,
    }
    const savedIngredients = cleanRows.map((row) => ({
      id: row.id || createLocalId(),
      recipe_id: recipeId,
      restaurant_id: restaurant.id,
      ingredient_item_id: row.ingredientItemId,
      ingredient_name: menuItemMap.get(row.ingredientItemId)?.name || row.ingredientName || 'Ingredient',
      quantity: row.quantity,
      unit: row.unit || 'pcs',
      wastage_percent: row.wastagePercent,
      unit_cost: row.unitCost,
      total_cost: calculateIngredientTotal(row),
      notes: row.notes || null,
    }))

    setRecipes((current) => {
      const others = current.filter((recipe) => recipe.id !== recipeId)
      return [savedRecipe, ...others]
    })
    setIngredients((current) => {
      const others = current.filter((ingredient) => ingredient.recipe_id !== recipeId)
      return [...others, ...savedIngredients]
    })
    setRecipeForm((current) => ({ ...current, id: recipeId }))
    setIngredientRows(
      savedIngredients.length > 0
        ? savedIngredients.map(normalizeIngredientRow)
        : [createEmptyIngredientRow()],
    )

    setSaving(false)
    showRecipeMessage('Recipe and costing saved.')
  }

  const handleDeactivateRecipe = async () => {
    if (!selectedRecipe?.id) return

    setSaving(true)

    const { error } = await supabase
      .from('restaurant_recipes')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', selectedRecipe.id)
      .eq('restaurant_id', restaurant.id)

    setSaving(false)

    if (error) {
      showRecipeMessage(error.message)
      return
    }

    setRecipes((current) =>
      current.map((recipe) =>
        recipe.id === selectedRecipe.id ? { ...recipe, is_active: false } : recipe,
      ),
    )
    updateRecipeForm('isActive', false)
    showRecipeMessage('Recipe hidden.')
  }

  if (loading) {
    return (
      <div className="recipes-page">
        <div className="recipes-loader">Loading recipes and costing...</div>
      </div>
    )
  }

  return (
    <div className="recipes-page">
      <RecipeMessage />

      <header className="recipes-hero">
        <div>
          <span className="recipes-kicker">Menu Engineering</span>
          <h1>Recipes & Costing</h1>
          <p>
            Build standard recipes, calculate food cost, control margin and keep kitchen preparation consistent.
          </p>
        </div>

        <button type="button" className="recipes-refresh-button" onClick={() => loadData(selectedItemId)}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      <section className="recipes-summary-grid">
        <RecipeSummaryCard
          icon={<BookOpenCheck size={18} />}
          label="Recipe cards"
          value={recipes.length}
          text="Menu items with recipe foundation"
        />
        <RecipeSummaryCard
          icon={<Package size={18} />}
          label="Ingredients"
          value={ingredients.length}
          text="Linked stock items inside recipes"
        />
        <RecipeSummaryCard
          icon={<DollarSign size={18} />}
          label="Selected food cost"
          value={`${currency} ${recipeStats.totalCost.toFixed(2)}`}
          text={`${recipeStats.costPercent.toFixed(1)}% of selling price`}
        />
        <RecipeSummaryCard
          icon={<Calculator size={18} />}
          label="Gross margin"
          value={`${currency} ${recipeStats.margin.toFixed(2)}`}
          text="Selling price minus ingredients"
        />
      </section>

      <div className="recipes-shell">
        <aside className="recipes-items-panel">
          <div className="recipes-search-box">
            <Search size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search menu item..."
            />
          </div>

          <div className="recipes-item-list">
            {filteredMenuItems.length === 0 ? (
              <div className="recipes-empty-state">No menu items found.</div>
            ) : (
              filteredMenuItems.map((item) => {
                const recipe = recipeMap.get(item.id)
                const active = item.id === selectedItemId

                return (
                  <button
                    type="button"
                    className={`recipes-menu-item ${active ? 'active' : ''}`}
                    key={item.id}
                    onClick={() => applySelectedItem(item.id)}
                  >
                    <div className="recipes-menu-thumb">
                      {item.image_url ? <img src={item.image_url} alt={item.name} /> : item.name.slice(0, 2).toUpperCase()}
                    </div>

                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.category?.name || 'Uncategorized'}</span>
                      <small>{currency} {Number(item.price || 0).toFixed(2)}</small>
                    </div>

                    {recipe ? (
                      <em className={recipe.is_active ? 'ready' : 'hidden'}>
                        {recipe.is_active ? 'Recipe' : 'Hidden'}
                      </em>
                    ) : (
                      <em>New</em>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <section className="recipes-editor-card">
          {selectedItem ? (
            <>
              <div className="recipes-editor-head">
                <div>
                  <span className="recipes-kicker">Recipe Card</span>
                  <h2>{selectedItem.name}</h2>
                  <p>
                    Selling price: {currency} {Number(selectedItem.price || 0).toFixed(2)} • Stock unit: {selectedItem.stock_unit || 'pcs'}
                  </p>
                </div>

                <div className="recipes-editor-actions">
                  {selectedRecipe?.id && (
                    <button
                      type="button"
                      className="recipes-danger-button"
                      onClick={handleDeactivateRecipe}
                      disabled={saving}
                    >
                      Hide
                    </button>
                  )}

                  <button
                    type="button"
                    className="recipes-save-button"
                    onClick={handleSaveRecipe}
                    disabled={saving}
                  >
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save Recipe'}
                  </button>
                </div>
              </div>

              <div className="recipes-form-grid">
                <label>
                  Recipe name
                  <input
                    type="text"
                    value={recipeForm.recipeName}
                    onChange={(event) => updateRecipeForm('recipeName', event.target.value)}
                    placeholder="Example: Chicken mandi plate"
                  />
                </label>

                <label>
                  Yield qty
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={recipeForm.yieldQuantity}
                    onChange={(event) => updateRecipeForm('yieldQuantity', event.target.value)}
                  />
                </label>

                <label>
                  Yield unit
                  <select
                    value={recipeForm.yieldUnit}
                    onChange={(event) => updateRecipeForm('yieldUnit', event.target.value)}
                  >
                    <option value="portion">portion</option>
                    <option value="plate">plate</option>
                    <option value="serving">serving</option>
                    <option value="kg">kg</option>
                    <option value="ltr">ltr</option>
                  </select>
                </label>

                <label>
                  Prep mins
                  <input
                    type="number"
                    min="0"
                    value={recipeForm.prepTimeMinutes}
                    onChange={(event) => updateRecipeForm('prepTimeMinutes', event.target.value)}
                  />
                </label>

                <label>
                  Cook mins
                  <input
                    type="number"
                    min="0"
                    value={recipeForm.cookTimeMinutes}
                    onChange={(event) => updateRecipeForm('cookTimeMinutes', event.target.value)}
                  />
                </label>

                <label className="recipes-toggle-label">
                  <span>Visible recipe</span>
                  <button
                    type="button"
                    className={`recipes-toggle ${recipeForm.isActive ? 'on' : ''}`}
                    onClick={() => updateRecipeForm('isActive', !recipeForm.isActive)}
                  >
                    {recipeForm.isActive ? 'Active' : 'Hidden'}
                  </button>
                </label>
              </div>

              <section className="recipes-cost-panel">
                <div className="recipes-cost-card">
                  <span>Food cost</span>
                  <strong>{currency} {recipeStats.totalCost.toFixed(2)}</strong>
                </div>
                <div className="recipes-cost-card">
                  <span>Cost %</span>
                  <strong>{recipeStats.costPercent.toFixed(1)}%</strong>
                </div>
                <div className="recipes-cost-card">
                  <span>Margin</span>
                  <strong>{currency} {recipeStats.margin.toFixed(2)}</strong>
                </div>
                <div className="recipes-cost-card recommended">
                  <span>Suggested price</span>
                  <strong>{currency} {recipeStats.suggestedPrice.toFixed(2)}</strong>
                </div>
              </section>

              {recipeStats.costPercent > 40 && (
                <div className="recipes-warning-box">
                  <AlertTriangle size={18} />
                  Food cost is above 40%. Consider increasing price, reducing wastage or changing ingredient quantity.
                </div>
              )}

              <section className="recipes-ingredients-card">
                <div className="recipes-section-head">
                  <div>
                    <h3>Ingredients</h3>
                    <p>Choose stock items and enter quantity used for one recipe yield.</p>
                  </div>

                  <button type="button" onClick={addIngredientRow}>
                    <Plus size={16} />
                    Add Ingredient
                  </button>
                </div>

                <div className="recipes-ingredient-table">
                  <div className="recipes-ingredient-head">
                    <span>Ingredient</span>
                    <span>Qty</span>
                    <span>Unit</span>
                    <span>Wastage %</span>
                    <span>Unit cost</span>
                    <span>Total</span>
                    <span />
                  </div>

                  {ingredientRows.map((row) => {
                    const stockItem = menuItemMap.get(row.ingredientItemId)
                    const total = calculateIngredientTotal(row)

                    return (
                      <div className="recipes-ingredient-row" key={row.localId}>
                        <select
                          value={row.ingredientItemId}
                          onChange={(event) => updateIngredientRow(row.localId, 'ingredientItemId', event.target.value)}
                        >
                          <option value="">Select stock item</option>
                          {menuItems.map((item) => (
                            <option value={item.id} key={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>

                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={row.quantity}
                          onChange={(event) => updateIngredientRow(row.localId, 'quantity', event.target.value)}
                        />

                        <select
                          value={row.unit}
                          onChange={(event) => updateIngredientRow(row.localId, 'unit', event.target.value)}
                        >
                          {defaultIngredientUnits.map((unit) => (
                            <option value={unit} key={unit}>{unit}</option>
                          ))}
                        </select>

                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={row.wastagePercent}
                          onChange={(event) => updateIngredientRow(row.localId, 'wastagePercent', event.target.value)}
                        />

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.unitCost}
                          onChange={(event) => updateIngredientRow(row.localId, 'unitCost', event.target.value)}
                        />

                        <strong>{currency} {total.toFixed(2)}</strong>

                        <button
                          type="button"
                          className="recipes-row-delete"
                          onClick={() => removeIngredientRow(row.localId)}
                        >
                          <Trash2 size={15} />
                        </button>

                        {stockItem?.track_stock && Number(stockItem.stock_quantity || 0) <= Number(stockItem.low_stock_quantity || 0) && (
                          <small className="recipes-low-stock-note">Low stock: {Number(stockItem.stock_quantity || 0).toFixed(2)} {stockItem.stock_unit}</small>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>

              <div className="recipes-notes-grid">
                <label>
                  Preparation steps
                  <textarea
                    value={recipeForm.instructions}
                    onChange={(event) => updateRecipeForm('instructions', event.target.value)}
                    rows="5"
                    placeholder="Step 1: Prepare ingredients..."
                  />
                </label>

                <label>
                  Internal notes
                  <textarea
                    value={recipeForm.notes}
                    onChange={(event) => updateRecipeForm('notes', event.target.value)}
                    rows="5"
                    placeholder="Kitchen notes, plating, allergen reminder..."
                  />
                </label>
              </div>
            </>
          ) : (
            <div className="recipes-empty-editor">
              <ChefHat size={42} />
              <h2>Select a menu item</h2>
              <p>Choose an item from the left to create recipe and costing.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function RecipeSummaryCard({ icon, label, value, text }) {
  return (
    <article className="recipes-summary-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{text}</p>
    </article>
  )
}

function RecipeMessage() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    const handler = (event) => {
      setMessage(event.detail || 'Updated.')
      window.setTimeout(() => setMessage(''), 2800)
    }

    window.addEventListener('spizy-recipe-message', handler)
    return () => window.removeEventListener('spizy-recipe-message', handler)
  }, [])

  if (!message) return null

  return <div className="recipes-toast">{message}</div>
}

function showRecipeMessage(message) {
  window.dispatchEvent(
    new CustomEvent('spizy-recipe-message', {
      detail: message,
    }),
  )
}

function createLocalId() {
  return window.crypto?.randomUUID?.() || `row-${Date.now()}-${Math.random()}`
}

function createEmptyIngredientRow(unit = 'pcs') {
  return {
    localId: createLocalId(),
    id: null,
    ingredientItemId: '',
    ingredientName: '',
    quantity: 1,
    unit,
    wastagePercent: 0,
    unitCost: 0,
    notes: '',
  }
}

function normalizeIngredientRow(ingredient) {
  return {
    localId: ingredient.id || createLocalId(),
    id: ingredient.id || null,
    ingredientItemId: ingredient.ingredient_item_id || '',
    ingredientName: ingredient.ingredient_name || '',
    quantity: Number(ingredient.quantity || 0),
    unit: ingredient.unit || 'pcs',
    wastagePercent: Number(ingredient.wastage_percent || 0),
    unitCost: Number(ingredient.unit_cost || 0),
    notes: ingredient.notes || '',
  }
}

function calculateIngredientTotal(row) {
  const quantity = Number(row.quantity || 0)
  const wastagePercent = Number(row.wastagePercent || 0)
  const unitCost = Number(row.unitCost || 0)
  const wastageMultiplier = 1 + Math.max(wastagePercent, 0) / 100

  return quantity * unitCost * wastageMultiplier
}

export default RecipesManagement
