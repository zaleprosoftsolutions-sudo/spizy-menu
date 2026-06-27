import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  Leaf,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Utensils,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './NutritionLabelsManagement.css'

const dietaryOptions = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'halal', label: 'Halal' },
  { value: 'gluten_free', label: 'Gluten free' },
  { value: 'dairy_free', label: 'Dairy free' },
  { value: 'nut_free', label: 'Nut free' },
  { value: 'sugar_free', label: 'Sugar free' },
  { value: 'keto', label: 'Keto friendly' },
  { value: 'organic', label: 'Organic' },
]

const allergenOptions = [
  { value: 'nuts', label: 'Tree nuts' },
  { value: 'peanuts', label: 'Peanuts' },
  { value: 'dairy', label: 'Dairy / milk' },
  { value: 'gluten', label: 'Gluten / wheat' },
  { value: 'egg', label: 'Egg' },
  { value: 'soy', label: 'Soy' },
  { value: 'seafood', label: 'Fish / seafood' },
  { value: 'shellfish', label: 'Shellfish' },
  { value: 'sesame', label: 'Sesame' },
  { value: 'mustard', label: 'Mustard' },
]

const spiceOptions = [
  { value: 'none', label: 'No spice' },
  { value: 'mild', label: 'Mild' },
  { value: 'medium', label: 'Medium' },
  { value: 'hot', label: 'Hot' },
  { value: 'extra_hot', label: 'Extra hot' },
]

const emptyDraft = {
  dietaryTags: [],
  allergenTags: [],
  spiceLevel: 'none',
  calories: '',
  proteinGrams: '',
  carbsGrams: '',
  fatGrams: '',
  prepTimeMinutes: '',
  servingSize: '',
  nutritionNote: '',
  isVisible: true,
}

function NutritionLabelsManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [labels, setLabels] = useState([])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [draft, setDraft] = useState(emptyDraft)

  const loadNutritionData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [categoryResult, itemResult, labelResult] = await Promise.all([
      supabase
        .from('menu_categories')
        .select('id, name')
        .eq('restaurant_id', restaurant.id)
        .eq('is_deleted', false)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false }),
      supabase
        .from('menu_items')
        .select(
          `
            id,
            name,
            price,
            image_url,
            category_id,
            is_available,
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
        .from('restaurant_menu_item_labels')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('updated_at', { ascending: false }),
    ])

    if (categoryResult.error) {
      showToast({
        type: 'error',
        title: 'Categories failed',
        message: categoryResult.error.message,
      })
    }

    if (itemResult.error) {
      showToast({
        type: 'error',
        title: 'Menu items failed',
        message: itemResult.error.message,
      })
    }

    if (labelResult.error) {
      showToast({
        type: 'error',
        title: 'Labels failed',
        message: labelResult.error.message,
      })
    }

    setCategories(categoryResult.data || [])
    setItems(itemResult.data || [])
    setLabels(labelResult.data || [])
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadNutritionData()
  }, [loadNutritionData])

  const labelsByItemId = useMemo(() => {
    return labels.reduce((accumulator, label) => {
      accumulator[label.menu_item_id] = label
      return accumulator
    }, {})
  }, [labels])

  const selectedItem = useMemo(() => {
    return items.find((item) => item.id === selectedItemId) || null
  }, [items, selectedItemId])

  useEffect(() => {
    if (!selectedItemId) {
      setDraft(emptyDraft)
      return
    }

    const label = labelsByItemId[selectedItemId]

    if (!label) {
      setDraft(emptyDraft)
      return
    }

    setDraft({
      dietaryTags: Array.isArray(label.dietary_tags) ? label.dietary_tags : [],
      allergenTags: Array.isArray(label.allergen_tags) ? label.allergen_tags : [],
      spiceLevel: label.spice_level || 'none',
      calories: valueToInput(label.calories),
      proteinGrams: valueToInput(label.protein_grams),
      carbsGrams: valueToInput(label.carbs_grams),
      fatGrams: valueToInput(label.fat_grams),
      prepTimeMinutes: valueToInput(label.prep_time_minutes),
      servingSize: label.serving_size || '',
      nutritionNote: label.nutrition_note || '',
      isVisible: label.is_visible !== false,
    })
  }, [labelsByItemId, selectedItemId])

  const stats = useMemo(() => {
    const labeled = labels.length
    const visible = labels.filter((label) => label.is_visible !== false).length
    const allergenWarnings = labels.filter(
      (label) => Array.isArray(label.allergen_tags) && label.allergen_tags.length > 0,
    ).length
    const healthyTags = labels.filter((label) => {
      const tags = Array.isArray(label.dietary_tags) ? label.dietary_tags : []
      return tags.includes('vegetarian') || tags.includes('vegan') || tags.includes('gluten_free')
    }).length

    return {
      items: items.length,
      labeled,
      visible,
      missing: Math.max(items.length - labeled, 0),
      allergenWarnings,
      healthyTags,
    }
  }, [items.length, labels])

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return items.filter((item) => {
      const matchesCategory =
        categoryFilter === 'all' ||
        (categoryFilter === 'none' && !item.category_id) ||
        item.category_id === categoryFilter

      if (!matchesCategory) return false
      if (!keyword) return true

      const label = labelsByItemId[item.id]
      const tagText = [
        ...(label?.dietary_tags || []),
        ...(label?.allergen_tags || []),
        label?.spice_level,
        label?.nutrition_note,
      ].join(' ')

      return [item.name, item.category?.name, tagText].some((value) =>
        String(value || '').toLowerCase().includes(keyword),
      )
    })
  }, [categoryFilter, items, labelsByItemId, search])

  const updateDraft = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const toggleTag = (key, value) => {
    setDraft((current) => {
      const currentValues = Array.isArray(current[key]) ? current[key] : []
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value]

      return {
        ...current,
        [key]: nextValues,
      }
    })
  }

  const handleSave = async () => {
    if (!restaurant?.id || !selectedItem?.id) {
      showToast({
        type: 'warning',
        title: 'Choose item',
        message: 'Select a menu item before saving labels.',
      })
      return
    }

    setSaving(true)

    const { data: userData } = await supabase.auth.getUser()

    const payload = {
      restaurant_id: restaurant.id,
      menu_item_id: selectedItem.id,
      dietary_tags: draft.dietaryTags,
      allergen_tags: draft.allergenTags,
      spice_level: draft.spiceLevel || 'none',
      calories: numberOrNull(draft.calories),
      protein_grams: numberOrNull(draft.proteinGrams),
      carbs_grams: numberOrNull(draft.carbsGrams),
      fat_grams: numberOrNull(draft.fatGrams),
      prep_time_minutes: integerOrNull(draft.prepTimeMinutes),
      serving_size: draft.servingSize.trim() || null,
      nutrition_note: draft.nutritionNote.trim() || null,
      is_visible: draft.isVisible,
      updated_by: userData?.user?.id || null,
    }

    if (!labelsByItemId[selectedItem.id]) {
      payload.created_by = userData?.user?.id || null
    }

    const { data, error } = await supabase
      .from('restaurant_menu_item_labels')
      .upsert(payload, { onConflict: 'restaurant_id,menu_item_id' })
      .select('*')
      .single()

    setSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Save failed',
        message: error.message,
      })
      return
    }

    setLabels((current) => {
      const exists = current.some((label) => label.id === data.id)
      if (exists) {
        return current.map((label) => (label.id === data.id ? data : label))
      }

      return [data, ...current]
    })

    showToast({
      type: 'success',
      title: 'Labels saved',
      message: `${selectedItem.name} nutrition and allergen labels updated.`,
    })
  }

  const handleDelete = async () => {
    const activeLabel = labelsByItemId[selectedItemId]

    if (!activeLabel?.id) return

    const confirmed = await confirmAction({
      title: 'Remove labels?',
      message: 'This will remove nutrition and allergen labels from the selected item.',
      confirmText: 'Remove',
      cancelText: 'Keep',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('restaurant_menu_item_labels')
      .delete()
      .eq('id', activeLabel.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Remove failed',
        message: error.message,
      })
      return
    }

    setLabels((current) => current.filter((label) => label.id !== activeLabel.id))
    setDraft(emptyDraft)

    showToast({
      type: 'success',
      title: 'Labels removed',
      message: 'The selected item is back to no labels.',
    })
  }

  if (!restaurant?.id) {
    return (
      <section className="nutrition-labels-page">
        <div className="nutrition-empty-state">Restaurant profile not found.</div>
      </section>
    )
  }

  return (
    <section className="nutrition-labels-page">
      <div className="nutrition-hero">
        <div>
          <p className="pricing-label">Menu Safety</p>
          <h2>Nutrition & Allergens</h2>
          <span>
            Add dietary labels, allergen warnings, spice level, calories and prep time for each menu item.
          </span>
        </div>

        <div className="nutrition-hero-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={loadNutritionData}
            disabled={loading}
          >
            <RefreshCw size={18} />
            Refresh
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={handleSave}
            disabled={saving || !selectedItem}
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Labels'}
          </button>
        </div>
      </div>

      <div className="nutrition-stat-grid">
        <NutritionStat icon={<Utensils />} label="Menu items" value={stats.items} />
        <NutritionStat icon={<CheckCircle2 />} label="Labeled items" value={stats.labeled} />
        <NutritionStat icon={<AlertTriangle />} label="Allergen warnings" value={stats.allergenWarnings} />
        <NutritionStat icon={<Leaf />} label="Healthy tags" value={stats.healthyTags} />
      </div>

      <div className="nutrition-workspace-grid">
        <div className="nutrition-list-card">
          <div className="nutrition-list-head">
            <div>
              <h3>Menu items</h3>
              <span>{stats.missing} items still need labels.</span>
            </div>
          </div>

          <div className="nutrition-filter-row">
            <div className="nutrition-search-box">
              <Search size={17} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search item, tag or allergen..."
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="all">All categories</option>
              <option value="none">No category</option>
              {categories.map((category) => (
                <option value={category.id} key={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="nutrition-item-list">
            {loading ? (
              <div className="nutrition-empty-state compact">Loading menu items...</div>
            ) : filteredItems.length === 0 ? (
              <div className="nutrition-empty-state compact">No matching menu item found.</div>
            ) : (
              filteredItems.map((item) => {
                const label = labelsByItemId[item.id]
                const isSelected = selectedItemId === item.id
                const dietaryCount = label?.dietary_tags?.length || 0
                const allergenCount = label?.allergen_tags?.length || 0

                return (
                  <button
                    type="button"
                    className={`nutrition-item-row ${isSelected ? 'active' : ''}`}
                    key={item.id}
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <div className="nutrition-item-avatar">
                      {item.image_url ? <img src={item.image_url} alt={item.name} /> : item.name.slice(0, 2).toUpperCase()}
                    </div>

                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.category?.name || 'No category'}</span>
                      <div className="nutrition-mini-chips">
                        {label ? (
                          <>
                            {dietaryCount > 0 && <small>{dietaryCount} dietary</small>}
                            {allergenCount > 0 && <small className="danger">{allergenCount} allergens</small>}
                            {label.spice_level && label.spice_level !== 'none' && <small className="hot">{formatSpice(label.spice_level)}</small>}
                          </>
                        ) : (
                          <small>Not labeled</small>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="nutrition-editor-card">
          {selectedItem ? (
            <>
              <div className="nutrition-editor-head">
                <div>
                  <p className="pricing-label">Selected item</p>
                  <h3>{selectedItem.name}</h3>
                  <span>{selectedItem.category?.name || 'No category'} • {restaurant.currency || 'AED'} {Number(selectedItem.price || 0).toFixed(2)}</span>
                </div>

                {labelsByItemId[selectedItem.id] && (
                  <button type="button" className="tiny-button danger" onClick={handleDelete}>
                    <Trash2 size={15} />
                    Remove
                  </button>
                )}
              </div>

              <div className="nutrition-editor-section">
                <div className="nutrition-section-title">
                  <Leaf size={19} />
                  <div>
                    <strong>Dietary labels</strong>
                    <span>Good for quick customer decisions.</span>
                  </div>
                </div>

                <div className="nutrition-chip-grid">
                  {dietaryOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={draft.dietaryTags.includes(option.value) ? 'active' : ''}
                      onClick={() => toggleTag('dietaryTags', option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="nutrition-editor-section warning">
                <div className="nutrition-section-title">
                  <AlertTriangle size={19} />
                  <div>
                    <strong>Allergen warnings</strong>
                    <span>Show clear warnings for sensitive customers.</span>
                  </div>
                </div>

                <div className="nutrition-chip-grid allergen">
                  {allergenOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={draft.allergenTags.includes(option.value) ? 'active' : ''}
                      onClick={() => toggleTag('allergenTags', option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="nutrition-editor-section">
                <div className="nutrition-section-title">
                  <Flame size={19} />
                  <div>
                    <strong>Spice, calories and prep</strong>
                    <span>Useful for public menu and staff guidance.</span>
                  </div>
                </div>

                <div className="nutrition-field-grid">
                  <label>
                    Spice level
                    <select
                      value={draft.spiceLevel}
                      onChange={(event) => updateDraft('spiceLevel', event.target.value)}
                    >
                      {spiceOptions.map((option) => (
                        <option value={option.value} key={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Calories
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={draft.calories}
                      onChange={(event) => updateDraft('calories', event.target.value)}
                      placeholder="Example: 450"
                    />
                  </label>

                  <label>
                    Prep time minutes
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={draft.prepTimeMinutes}
                      onChange={(event) => updateDraft('prepTimeMinutes', event.target.value)}
                      placeholder="Example: 15"
                    />
                  </label>

                  <label>
                    Serving size
                    <input
                      type="text"
                      value={draft.servingSize}
                      onChange={(event) => updateDraft('servingSize', event.target.value)}
                      placeholder="Example: 1 bowl / 250g"
                    />
                  </label>

                  <label>
                    Protein g
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={draft.proteinGrams}
                      onChange={(event) => updateDraft('proteinGrams', event.target.value)}
                      placeholder="Optional"
                    />
                  </label>

                  <label>
                    Carbs g
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={draft.carbsGrams}
                      onChange={(event) => updateDraft('carbsGrams', event.target.value)}
                      placeholder="Optional"
                    />
                  </label>

                  <label>
                    Fat g
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={draft.fatGrams}
                      onChange={(event) => updateDraft('fatGrams', event.target.value)}
                      placeholder="Optional"
                    />
                  </label>

                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={draft.isVisible}
                      onChange={(event) => updateDraft('isVisible', event.target.checked)}
                    />
                    Show labels on public menu later
                  </label>
                </div>
              </div>

              <div className="nutrition-editor-section">
                <div className="nutrition-section-title">
                  <Sparkles size={19} />
                  <div>
                    <strong>Customer note</strong>
                    <span>Example: contains mild spice, ask staff for allergy details.</span>
                  </div>
                </div>

                <textarea
                  value={draft.nutritionNote}
                  onChange={(event) => updateDraft('nutritionNote', event.target.value)}
                  placeholder="Optional nutrition or kitchen note"
                  rows="4"
                />
              </div>

              <div className="nutrition-editor-actions">
                <button type="button" className="secondary-button" onClick={() => setDraft(emptyDraft)}>
                  Reset Form
                </button>

                <button type="button" className="primary-button" onClick={handleSave} disabled={saving}>
                  <Save size={18} />
                  {saving ? 'Saving...' : 'Save Labels'}
                </button>
              </div>
            </>
          ) : (
            <div className="nutrition-empty-editor">
              <div>
                <Utensils size={36} />
              </div>
              <h3>Choose a menu item</h3>
              <p>Select an item from the left side to add allergens, diet tags, calories and prep time.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function NutritionStat({ icon, label, value }) {
  return (
    <div className="nutrition-stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function numberOrNull(value) {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) && String(value).trim() !== '' ? parsedValue : null
}

function integerOrNull(value) {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) && String(value).trim() !== ''
    ? Math.max(Math.round(parsedValue), 0)
    : null
}

function valueToInput(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function formatSpice(value) {
  if (value === 'extra_hot') return 'Extra hot'
  return String(value || 'none').replaceAll('_', ' ')
}

export default NutritionLabelsManagement
