import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import ImageCropUpload from './ImageCropUpload'
import ToggleSwitch from './ToggleSwitch'
import { uploadProductImageToR2 } from '../../lib/r2Upload'

const createNewCategoryValue = '__create_new_category__'

const variationPresets = [
  {
    label: 'Small / Medium / Large',
    rows: [
      { name: 'Small', price: '', comparePrice: '' },
      { name: 'Medium', price: '', comparePrice: '' },
      { name: 'Large', price: '', comparePrice: '' },
    ],
  },
  {
    label: 'Half / Full',
    rows: [
      { name: 'Half', price: '', comparePrice: '' },
      { name: 'Full', price: '', comparePrice: '' },
    ],
  },
]

const emptyForm = {
  name: '',
  description: '',
  imageUrl: '',
  categoryId: '',
  price: '',
  comparePrice: '',
  trackStock: false,
  stockQuantity: '',
  isAvailable: true,
  hasVariations: false,
  variations: [],
}

function ProductsManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showProductForm, setShowProductForm] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showCategoryCreate, setShowCategoryCreate] = useState(false)
  const [quickCategoryName, setQuickCategoryName] = useState('')
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [updatingItemId, setUpdatingItemId] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const loadProducts = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data: categoryData, error: categoryError } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    const { data: itemData, error: itemError } = await supabase
      .from('menu_items')
      .select(
        `
          *,
          category:menu_categories (
            id,
            name
          ),
          variations:menu_item_variations (
            id,
            name,
            price,
            compare_price,
            is_available,
            sort_order
          )
        `,
      )
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (categoryError) {
      showToast({
        type: 'error',
        title: 'Categories loading failed',
        message: categoryError.message,
      })
    }

    if (itemError) {
      showToast({
        type: 'error',
        title: 'Products loading failed',
        message: itemError.message,
      })
    }

    setCategories(categoryData || [])
    setItems(itemData || [])
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const resetProductForm = () => {
    setForm(emptyForm)
    setEditingItem(null)
  }

  const handleToggleProductForm = () => {
    if (showProductForm) {
      setShowProductForm(false)
      resetProductForm()
      return
    }

    setShowProductForm(true)
  }

  const handleEditItem = (item) => {
    const variations = Array.isArray(item.variations)
      ? [...item.variations]
          .sort(
            (a, b) =>
              Number(a.sort_order || 0) - Number(b.sort_order || 0),
          )
          .map((variation) => ({
            name: variation.name || '',
            price:
              variation.price || variation.price === 0
                ? String(variation.price)
                : '',
            comparePrice:
              variation.compare_price || variation.compare_price === 0
                ? String(variation.compare_price)
                : '',
          }))
      : []

    setEditingItem(item)
    setForm({
      name: item.name || '',
      description: item.description || '',
      imageUrl: item.image_url || '',
      categoryId: item.category_id || '',
      price: item.price || item.price === 0 ? String(item.price) : '',
      comparePrice:
        item.compare_price || item.compare_price === 0
          ? String(item.compare_price)
          : '',
      trackStock: Boolean(item.track_stock),
      stockQuantity:
        item.stock_quantity || item.stock_quantity === 0
          ? String(item.stock_quantity)
          : '',
      isAvailable: Boolean(item.is_available),
      hasVariations: Boolean(item.has_variations),
      variations:
        Boolean(item.has_variations) && variations.length > 0
          ? variations
          : [],
    })

    setShowProductForm(true)
  }

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return items.filter((item) => {
      const matchesCategory =
        categoryFilter === 'all' ||
        (categoryFilter === 'none' && !item.category_id) ||
        item.category_id === categoryFilter

      if (!matchesCategory) return false

      if (!keyword) return true

      const variationNames = Array.isArray(item.variations)
        ? item.variations.map((variation) => variation.name).join(' ')
        : ''

      const values = [
        item.name,
        item.description,
        item.price,
        item.compare_price,
        item.category?.name,
        variationNames,
      ]

      return values.some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [categoryFilter, items, search])

  const handleCategorySelect = (value) => {
    if (value === createNewCategoryValue) {
      setShowCategoryCreate(true)
      return
    }

    updateForm('categoryId', value)
  }

  const handleFilterCategorySelect = (value) => {
    if (value === createNewCategoryValue) {
      setShowCategoryCreate(true)
      return
    }

    setCategoryFilter(value)
  }

  const handleCreateCategory = async () => {
    const name = quickCategoryName.trim()

    if (!restaurant?.id) {
      showToast({
        type: 'warning',
        title: 'Restaurant missing',
        message: 'Restaurant profile is required before adding categories.',
      })
      return
    }

    if (!name) {
      showToast({
        type: 'warning',
        title: 'Category name required',
        message: 'Please enter a category name.',
      })
      return
    }

    setCreatingCategory(true)

    const { data, error } = await supabase
      .from('menu_categories')
      .insert({
        restaurant_id: restaurant.id,
        name,
      })
      .select('*')
      .single()

    setCreatingCategory(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Category create failed',
        message: error.message,
      })
      return
    }

    setCategories((current) => [data, ...current])
    setQuickCategoryName('')
    setShowCategoryCreate(false)
    updateForm('categoryId', data.id)
    setCategoryFilter(data.id)

    showToast({
      type: 'success',
      title: 'Category created',
      message: `${name} is now available for products.`,
    })
  }

  const applyVariationPreset = (preset) => {
    setForm((current) => ({
      ...current,
      hasVariations: true,
      variations: preset.rows.map((row) => ({ ...row })),
    }))
  }

  const addVariationRow = () => {
    setForm((current) => ({
      ...current,
      hasVariations: true,
      variations: [
        ...current.variations,
        { name: '', price: '', comparePrice: '' },
      ],
    }))
  }

  const updateVariationRow = (index, key, value) => {
    setForm((current) => ({
      ...current,
      variations: current.variations.map((variation, variationIndex) =>
        variationIndex === index
          ? {
              ...variation,
              [key]: value,
            }
          : variation,
      ),
    }))
  }

  const removeVariationRow = (index) => {
    setForm((current) => {
      const nextVariations = current.variations.filter(
        (_, variationIndex) => variationIndex !== index,
      )

      return {
        ...current,
        variations: nextVariations,
        hasVariations: nextVariations.length > 0,
      }
    })
  }

  const handleSaveItem = async (event) => {
    event.preventDefault()

    const name = form.name.trim()
    const normalPrice = Number(form.price)
    const cleanVariations = form.variations
      .map((variation) => ({
        name: variation.name.trim(),
        price: Number(variation.price),
        comparePrice: variation.comparePrice
          ? Number(variation.comparePrice)
          : null,
      }))
      .filter((variation) => variation.name && variation.price > 0)

    const hasValidVariations = form.hasVariations && cleanVariations.length > 0
    const startingPrice = hasValidVariations
      ? Math.min(...cleanVariations.map((variation) => variation.price))
      : normalPrice

    const comparePrice = form.comparePrice ? Number(form.comparePrice) : null

    if (!restaurant?.id) {
      showToast({
        type: 'warning',
        title: 'Restaurant missing',
        message: 'Restaurant profile is required before saving products.',
      })
      return
    }

    if (!name) {
      showToast({
        type: 'warning',
        title: 'Product name required',
        message: 'Please enter the food/item name.',
      })
      return
    }

    if (form.hasVariations && !hasValidVariations) {
      showToast({
        type: 'warning',
        title: 'Variation required',
        message:
          'Please add at least one variation name with a valid price, or turn off variations.',
      })
      return
    }

    if (!form.hasVariations && (!normalPrice || normalPrice <= 0)) {
      showToast({
        type: 'warning',
        title: 'Valid price required',
        message: 'Please enter a price greater than zero.',
      })
      return
    }

    setSaving(true)

    let finalImageUrl = form.imageUrl || null

    try {
      if (form.imageUrl?.startsWith('data:image/')) {
        finalImageUrl = await uploadProductImageToR2({
          restaurantId: restaurant.id,
          imageDataUrl: form.imageUrl,
          fileName: `${form.name || 'product'}-image.jpg`,
        })
      }
    } catch (imageError) {
      setSaving(false)

      showToast({
        type: 'error',
        title: 'Image upload failed',
        message:
          imageError instanceof Error
            ? imageError.message
            : 'Please try uploading the image again.',
      })

      return
    }

    const productPayload = {
      restaurant_id: restaurant.id,
      category_id: form.categoryId || null,
      name,
      description: form.description.trim() || null,
      image_url: finalImageUrl,
      price: startingPrice,
      compare_price: comparePrice,
      currency: restaurant.currency || 'AED',
      has_variations: hasValidVariations,
      track_stock: form.trackStock,
      stock_quantity: form.trackStock ? Number(form.stockQuantity || 0) : 0,
      is_available: form.isAvailable,
      updated_at: new Date().toISOString(),
    }

    if (editingItem) {
      const { error: updateError } = await supabase
        .from('menu_items')
        .update(productPayload)
        .eq('id', editingItem.id)

      if (updateError) {
        setSaving(false)
        showToast({
          type: 'error',
          title: 'Product update failed',
          message: updateError.message,
        })
        return
      }

      const { error: deleteVariationError } = await supabase
        .from('menu_item_variations')
        .delete()
        .eq('item_id', editingItem.id)

      if (deleteVariationError) {
        setSaving(false)
        showToast({
          type: 'error',
          title: 'Variation update failed',
          message: deleteVariationError.message,
        })
        return
      }

      if (hasValidVariations) {
        const { error: variationError } = await supabase
          .from('menu_item_variations')
          .insert(
            cleanVariations.map((variation, index) => ({
              item_id: editingItem.id,
              name: variation.name,
              price: variation.price,
              compare_price: variation.comparePrice,
              sort_order: index,
            })),
          )

        if (variationError) {
          setSaving(false)
          showToast({
            type: 'error',
            title: 'Variation update failed',
            message: variationError.message,
          })
          return
        }
      }

      setSaving(false)

      showToast({
        type: 'success',
        title: 'Product updated',
        message: `${name} has been updated successfully.`,
      })

      resetProductForm()
      setShowProductForm(false)
      await loadProducts()
      return
    }

    const { data: createdItem, error } = await supabase
      .from('menu_items')
      .insert(productPayload)
      .select('id')
      .single()

    if (error) {
      setSaving(false)
      showToast({
        type: 'error',
        title: 'Product add failed',
        message: error.message,
      })
      return
    }

    if (hasValidVariations) {
      const { error: variationError } = await supabase
        .from('menu_item_variations')
        .insert(
          cleanVariations.map((variation, index) => ({
            item_id: createdItem.id,
            name: variation.name,
            price: variation.price,
            compare_price: variation.comparePrice,
            sort_order: index,
          })),
        )

      if (variationError) {
        showToast({
          type: 'warning',
          title: 'Product added, variation failed',
          message: variationError.message,
        })
      }
    }

    setSaving(false)

    showToast({
      type: 'success',
      title: 'Product added',
      message: `${name} is now added to your menu.`,
    })

    resetProductForm()
    setShowProductForm(false)
    await loadProducts()
  }

  const handleToggleItemAvailability = async (item) => {
    if (updatingItemId) return

    const nextAvailability = !item.is_available
    const previousItems = items

    setUpdatingItemId(item.id)

    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              is_available: nextAvailability,
            }
          : currentItem,
      ),
    )

    const { error } = await supabase
      .from('menu_items')
      .update({
        is_available: nextAvailability,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)

    setUpdatingItemId(null)

    if (error) {
      setItems(previousItems)

      showToast({
        type: 'error',
        title: 'Availability update failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: nextAvailability ? 'Product enabled' : 'Product disabled',
      message: `${item.name} is now ${
        nextAvailability ? 'available' : 'unavailable'
      }.`,
    })
  }

  const handleDeleteItem = async (item) => {
    const confirmed = await confirmAction({
      title: 'Delete this product?',
      message: `${item.name} will disappear from the customer menu and POS list.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('menu_items')
      .update({
        is_deleted: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Product delete failed',
        message: error.message,
      })
      return
    }

    setItems((current) =>
      current.filter((currentItem) => currentItem.id !== item.id),
    )

    showToast({
      type: 'success',
      title: 'Product deleted',
      message: `${item.name} has been removed.`,
    })
  }

  if (!restaurant?.id) {
    return (
      <section className="management-section">
        <div className="empty-state">
          Restaurant profile not found. Please complete restaurant setup first.
        </div>
      </section>
    )
  }

  return (
    <section className="management-section">
      <div className="management-header">
        <div>
          <p className="pricing-label">Products / Items</p>
          <h2>Product management</h2>
          <span>
            Add products with categories, images, prices, variations, stock and
            availability status.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadProducts}
          disabled={loading}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="product-action-header">
        <div className="search-box product-search-box">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product, variation, category, price..."
          />
        </div>

        <select
          className="product-filter-select"
          value={categoryFilter}
          onChange={(event) => handleFilterCategorySelect(event.target.value)}
        >
          <option value="all">All categories</option>
          <option value="none">No category</option>
          {categories.map((category) => (
            <option value={category.id} key={category.id}>
              {category.name}
            </option>
          ))}
          <option value={createNewCategoryValue}>+ Create new category</option>
        </select>

        <button
          type="button"
          className="primary-button product-add-button"
          onClick={handleToggleProductForm}
        >
          {showProductForm ? <X size={18} /> : <Plus size={18} />}
          {showProductForm ? 'Close' : 'Add Product'}
        </button>
      </div>

      {showCategoryCreate && (
        <div
          className="quick-category-modal-overlay"
          onClick={() => {
            setShowCategoryCreate(false)
            setQuickCategoryName('')
          }}
        >
          <div
            className="quick-category-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="quick-category-modal-head">
              <div className="feature-icon">
                <Plus size={22} />
              </div>

              <div>
                <p className="pricing-label">New Category</p>
                <h3>Create category</h3>
                <span>
                  Add a new food category. It will be selected automatically for this
                  product.
                </span>
              </div>
            </div>

            <label>
              Category name
              <input
                type="text"
                value={quickCategoryName}
                onChange={(event) => setQuickCategoryName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleCreateCategory()
                  }
                }}
                placeholder="Example: Grills"
                autoFocus
              />
            </label>

            <div className="quick-category-modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setShowCategoryCreate(false)
                  setQuickCategoryName('')
                }}
              >
                <X size={18} />
                Cancel
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={handleCreateCategory}
                disabled={creatingCategory}
              >
                <Plus size={18} />
                {creatingCategory ? 'Creating...' : 'Create Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductForm && (
        <form className="expense-form product-form" onSubmit={handleSaveItem}>
          <div className="product-form-grid">
            <div className="product-form-main">
              <div className="mini-form-head">
                <div className="feature-icon">
                  <Plus size={22} />
                </div>
                <div>
                  <h3>{editingItem ? 'Edit product' : 'Add product'}</h3>
                  <p>
                    {editingItem
                      ? 'Update price, image, variations, stock and customer visibility.'
                      : 'Manage price, image, variations, stock and customer visibility.'}
                  </p>
                </div>
              </div>

              <div className="form-grid">
                <label>
                  Product name
                  <input
                    type="text"
                    value={form.name}
                    onChange={(event) => updateForm('name', event.target.value)}
                    placeholder="Example: Chicken Biryani"
                    required
                  />
                </label>

                <label>
                  Category
                  <select
                    value={form.categoryId}
                    onChange={(event) =>
                      handleCategorySelect(event.target.value)
                    }
                  >
                    <option value="">No category</option>
                    {categories.map((category) => (
                      <option value={category.id} key={category.id}>
                        {category.name}
                      </option>
                    ))}
                    <option value={createNewCategoryValue}>
                      + Create new category
                    </option>
                  </select>
                </label>
              </div>

              <label>
                Description
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    updateForm('description', event.target.value)
                  }
                  placeholder="Short item description"
                  rows="3"
                />
              </label>

              <div className="form-grid three">
                <label>
                  {form.hasVariations ? 'Base price / starting price' : 'Price'}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(event) =>
                      updateForm('price', event.target.value)
                    }
                    placeholder={
                      form.hasVariations ? 'Auto from variations' : '24.00'
                    }
                    required={!form.hasVariations}
                  />
                </label>

                <label>
                  Compare price
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.comparePrice}
                    onChange={(event) =>
                      updateForm('comparePrice', event.target.value)
                    }
                    placeholder="Optional"
                  />
                </label>

                <label>
                  Stock quantity
                  <input
                    type="number"
                    min="0"
                    value={form.stockQuantity}
                    onChange={(event) =>
                      updateForm('stockQuantity', event.target.value)
                    }
                    placeholder="Optional"
                    disabled={!form.trackStock}
                  />
                </label>
              </div>

              <div className="modern-toggle-row">
                <ToggleSwitch
                  label="Track stock"
                  hint={form.trackStock ? 'Stock enabled' : 'No stock tracking'}
                  checked={form.trackStock}
                  onChange={(value) => updateForm('trackStock', value)}
                />

                <ToggleSwitch
                  label="Available"
                  hint={form.isAvailable ? 'Visible to customers' : 'Hidden'}
                  checked={form.isAvailable}
                  onChange={(value) => updateForm('isAvailable', value)}
                />

                <ToggleSwitch
                  label="Variations"
                  hint={
                    form.hasVariations
                      ? 'Customer must choose'
                      : 'Single price item'
                  }
                  checked={form.hasVariations}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      hasVariations: value,
                      variations:
                        value && current.variations.length === 0
                          ? [{ name: '', price: '', comparePrice: '' }]
                          : current.variations,
                    }))
                  }
                />
              </div>

              {form.hasVariations && (
                <div className="variation-panel">
                  <div className="variation-panel-head">
                    <div>
                      <strong>Product variations</strong>
                      <span>
                        Customers must select one variation before adding to cart.
                      </span>
                    </div>

                    <button
                      type="button"
                      className="tiny-button"
                      onClick={addVariationRow}
                    >
                      <Plus size={15} />
                      Add Row
                    </button>
                  </div>

                  <div className="variation-presets">
                    {variationPresets.map((preset) => (
                      <button
                        type="button"
                        className="tiny-button"
                        key={preset.label}
                        onClick={() => applyVariationPreset(preset)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="variation-row-list">
                    {form.variations.map((variation, index) => (
                      <div className="variation-row" key={index}>
                        <input
                          type="text"
                          value={variation.name}
                          onChange={(event) =>
                            updateVariationRow(index, 'name', event.target.value)
                          }
                          placeholder="Variation name"
                        />

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={variation.price}
                          onChange={(event) =>
                            updateVariationRow(
                              index,
                              'price',
                              event.target.value,
                            )
                          }
                          placeholder="Price"
                        />

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={variation.comparePrice}
                          onChange={(event) =>
                            updateVariationRow(
                              index,
                              'comparePrice',
                              event.target.value,
                            )
                          }
                          placeholder="Compare"
                        />

                        <button
                          type="button"
                          className="tiny-button danger"
                          onClick={() => removeVariationRow(index)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button type="submit" className="primary-button" disabled={saving}>
                <Plus size={18} />
                {saving
                  ? editingItem
                    ? 'Updating product...'
                    : 'Adding product...'
                  : editingItem
                    ? 'Update Product'
                    : 'Add Product'}
              </button>
            </div>

            <ImageCropUpload
              value={form.imageUrl}
              onChange={(value) => updateForm('imageUrl', value)}
              onError={(message) =>
                showToast({
                  type: 'warning',
                  title: 'Image upload issue',
                  message,
                })
              }
            />
          </div>
        </form>
      )}

      <div className="product-list-header">
        <div>
          <strong>Product list</strong>
          <span>
            {filteredItems.length} product
            {filteredItems.length === 1 ? '' : 's'} showing
          </span>
        </div>
      </div>

      <div className="restaurants-table-wrap product-table-wrap">
        {loading ? (
          <div className="empty-state">Loading products...</div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-state">
            No products found. Click Add Product to create your first item.
          </div>
        ) : (
          <table className="restaurants-table products-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>ON/OFF</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredItems.map((item) => {
                const variations = Array.isArray(item.variations)
                  ? [...item.variations].sort(
                      (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0),
                    )
                  : []

                return (
                  <tr key={item.id}>
                    <td>
                      <div className="product-name-cell">
                        <div className="product-thumb">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} />
                          ) : (
                            item.name.slice(0, 2).toUpperCase()
                          )}
                        </div>

                        <div>
                          <strong>{item.name}</strong>
                          <span>{item.description || 'No description'}</span>

                          {item.has_variations && (
                            <div className="variation-chip-row">
                              {variations.length === 0 ? (
                                <small>Variation setup pending</small>
                              ) : (
                                variations.map((variation) => (
                                  <small key={variation.id}>
                                    {variation.name}: {item.currency || 'AED'}{' '}
                                    {Number(variation.price).toFixed(2)}
                                  </small>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <strong>{item.category?.name || 'No category'}</strong>
                      <span>{item.currency || restaurant.currency || 'AED'}</span>
                    </td>

                    <td>
                      <strong>
                        {item.has_variations ? 'From ' : ''}
                        {item.currency || restaurant.currency || 'AED'}{' '}
                        {Number(item.price).toFixed(2)}
                      </strong>
                      <span>
                        {item.compare_price
                          ? `Compare: ${Number(item.compare_price).toFixed(2)}`
                          : item.has_variations
                            ? 'Variation pricing'
                            : 'No compare price'}
                      </span>
                    </td>

                    <td>
                      <strong>
                        {item.track_stock ? item.stock_quantity : 'Not tracked'}
                      </strong>
                      <span>
                        {item.track_stock ? 'Tracking on' : 'Tracking off'}
                      </span>
                    </td>

                    <td>
                      <ToggleSwitch
                        label={item.is_available ? 'ON' : 'OFF'}
                        checked={item.is_available}
                        disabled={updatingItemId === item.id}
                        onChange={() => handleToggleItemAvailability(item)}
                      />
                      {updatingItemId === item.id && (
                        <span className="row-loading-text">
                          <Loader2 size={13} className="spin-icon" />
                          Saving
                        </span>
                      )}
                    </td>

                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="tiny-button"
                          onClick={() => handleEditItem(item)}
                          disabled={updatingItemId === item.id}
                        >
                          <Pencil size={15} />
                          Edit
                        </button>

                        <button
                          type="button"
                          className={`tiny-button ${
                            item.is_available ? 'danger' : 'success'
                          }`}
                          onClick={() => handleToggleItemAvailability(item)}
                          disabled={updatingItemId === item.id}
                        >
                          {updatingItemId === item.id ? (
                            <Loader2 size={15} className="spin-icon" />
                          ) : item.is_available ? (
                            <EyeOff size={15} />
                          ) : (
                            <Eye size={15} />
                          )}
                          {item.is_available ? 'Hide' : 'Show'}
                        </button>

                        <button
                          type="button"
                          className="tiny-button danger"
                          onClick={() => handleDeleteItem(item)}
                        >
                          <Trash2 size={15} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default ProductsManagement