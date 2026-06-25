import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Utensils,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'

function MenuItemsManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingCategory, setSavingCategory] = useState(false)
  const [savingItem, setSavingItem] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
  })
  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    imageUrl: '',
    categoryId: '',
    price: '',
    comparePrice: '',
    trackStock: false,
    stockQuantity: '',
    isAvailable: true,
  })

  const loadMenuData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data: categoryData, error: categoryError } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (categoryError) {
      showToast({
        type: 'error',
        title: 'Categories loading failed',
        message: categoryError.message,
      })
    }

    const { data: itemData, error: itemError } = await supabase
      .from('menu_items')
      .select(
        `
          *,
          category:menu_categories (
            id,
            name
          )
        `,
      )
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (itemError) {
      showToast({
        type: 'error',
        title: 'Items loading failed',
        message: itemError.message,
      })
    }

    setCategories(categoryData || [])
    setItems(itemData || [])
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadMenuData()
  }, [loadMenuData])

  const updateCategoryForm = (key, value) => {
    setCategoryForm((current) => ({ ...current, [key]: value }))
  }

  const updateItemForm = (key, value) => {
    setItemForm((current) => ({ ...current, [key]: value }))
  }

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return items

    return items.filter((item) => {
      const values = [
        item.name,
        item.description,
        item.price,
        item.compare_price,
        item.category?.name,
      ]

      return values.some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [items, search])

  const handleAddCategory = async (event) => {
    event.preventDefault()

    const name = categoryForm.name.trim()

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

    setSavingCategory(true)

    const { error } = await supabase.from('menu_categories').insert({
      restaurant_id: restaurant.id,
      name,
      description: categoryForm.description.trim() || null,
    })

    setSavingCategory(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Category add failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Category added',
      message: `${name} category is ready.`,
    })

    setCategoryForm({
      name: '',
      description: '',
    })

    await loadMenuData()
  }

  const handleAddItem = async (event) => {
    event.preventDefault()

    const name = itemForm.name.trim()
    const price = Number(itemForm.price)
    const comparePrice = itemForm.comparePrice
      ? Number(itemForm.comparePrice)
      : null

    if (!restaurant?.id) {
      showToast({
        type: 'warning',
        title: 'Restaurant missing',
        message: 'Restaurant profile is required before adding items.',
      })
      return
    }

    if (!name) {
      showToast({
        type: 'warning',
        title: 'Item name required',
        message: 'Please enter the food/item name.',
      })
      return
    }

    if (!price || price <= 0) {
      showToast({
        type: 'warning',
        title: 'Valid price required',
        message: 'Please enter an item price greater than zero.',
      })
      return
    }

    setSavingItem(true)

    const { error } = await supabase.from('menu_items').insert({
      restaurant_id: restaurant.id,
      category_id: itemForm.categoryId || null,
      name,
      description: itemForm.description.trim() || null,
      image_url: itemForm.imageUrl.trim() || null,
      price,
      compare_price: comparePrice,
      currency: restaurant.currency || 'AED',
      track_stock: itemForm.trackStock,
      stock_quantity: itemForm.trackStock
        ? Number(itemForm.stockQuantity || 0)
        : 0,
      is_available: itemForm.isAvailable,
    })

    setSavingItem(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Item add failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Item added',
      message: `${name} is now added to your menu.`,
    })

    setItemForm({
      name: '',
      description: '',
      imageUrl: '',
      categoryId: '',
      price: '',
      comparePrice: '',
      trackStock: false,
      stockQuantity: '',
      isAvailable: true,
    })

    await loadMenuData()
  }

  const handleToggleItemAvailability = async (item) => {
    const nextAvailability = !item.is_available

    const { error } = await supabase
      .from('menu_items')
      .update({
        is_available: nextAvailability,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Availability update failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: nextAvailability ? 'Item available' : 'Item unavailable',
      message: `${item.name} is now ${
        nextAvailability ? 'available' : 'shown as out of stock'
      }.`,
    })

    await loadMenuData()
  }

  const handleDeleteItem = async (item) => {
    const confirmed = await confirmAction({
      title: 'Delete this item?',
      message: `${item.name} will disappear from the customer menu.`,
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
        title: 'Item delete failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Item deleted',
      message: `${item.name} has been removed from your menu.`,
    })

    await loadMenuData()
  }

  const handleDeleteCategory = async (category) => {
    const confirmed = await confirmAction({
      title: 'Delete this category?',
      message: `${category.name} will be hidden. Existing items under this category will remain but category will be removed.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('menu_categories')
      .update({
        is_deleted: true,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', category.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Category delete failed',
        message: error.message,
      })
      return
    }

    showToast({
      type: 'success',
      title: 'Category deleted',
      message: `${category.name} has been hidden.`,
    })

    await loadMenuData()
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
          <p className="pricing-label">Menu Management</p>
          <h2>Categories & items</h2>
          <span>
            Add food categories, menu items, prices, images, stock tracking and
            item availability for the customer QR menu.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadMenuData}
          disabled={loading}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="menu-manager-grid">
        <form className="expense-form" onSubmit={handleAddCategory}>
          <div className="mini-form-head">
            <Utensils size={22} />
            <div>
              <h3>Add category</h3>
              <p>Example: Starters, Biryani, Juices, Desserts</p>
            </div>
          </div>

          <label>
            Category name
            <input
              type="text"
              value={categoryForm.name}
              onChange={(event) =>
                updateCategoryForm('name', event.target.value)
              }
              placeholder="Example: Biryani"
              required
            />
          </label>

          <label>
            Description
            <textarea
              value={categoryForm.description}
              onChange={(event) =>
                updateCategoryForm('description', event.target.value)
              }
              placeholder="Optional category description"
              rows="3"
            />
          </label>

          <button
            type="submit"
            className="primary-button"
            disabled={savingCategory}
          >
            <Plus size={18} />
            {savingCategory ? 'Adding...' : 'Add Category'}
          </button>
        </form>

        <form className="expense-form" onSubmit={handleAddItem}>
          <div className="mini-form-head">
            <Utensils size={22} />
            <div>
              <h3>Add item</h3>
              <p>Manage price, image, stock and availability</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Item name
              <input
                type="text"
                value={itemForm.name}
                onChange={(event) => updateItemForm('name', event.target.value)}
                placeholder="Example: Chicken Biryani"
                required
              />
            </label>

            <label>
              Category
              <select
                value={itemForm.categoryId}
                onChange={(event) =>
                  updateItemForm('categoryId', event.target.value)
                }
              >
                <option value="">No category</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Description
            <textarea
              value={itemForm.description}
              onChange={(event) =>
                updateItemForm('description', event.target.value)
              }
              placeholder="Short item description"
              rows="3"
            />
          </label>

          <label>
            Image URL
            <input
              type="url"
              value={itemForm.imageUrl}
              onChange={(event) =>
                updateItemForm('imageUrl', event.target.value)
              }
              placeholder="Temporary image URL. R2 upload will come later."
            />
          </label>

          <div className="form-grid three">
            <label>
              Price
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemForm.price}
                onChange={(event) =>
                  updateItemForm('price', event.target.value)
                }
                placeholder="24.00"
                required
              />
            </label>

            <label>
              Compare price
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemForm.comparePrice}
                onChange={(event) =>
                  updateItemForm('comparePrice', event.target.value)
                }
                placeholder="Optional"
              />
            </label>

            <label>
              Stock quantity
              <input
                type="number"
                min="0"
                value={itemForm.stockQuantity}
                onChange={(event) =>
                  updateItemForm('stockQuantity', event.target.value)
                }
                placeholder="Optional"
                disabled={!itemForm.trackStock}
              />
            </label>
          </div>

          <div className="toggle-row">
            <label>
              <input
                type="checkbox"
                checked={itemForm.trackStock}
                onChange={(event) =>
                  updateItemForm('trackStock', event.target.checked)
                }
              />
              Track stock
            </label>

            <label>
              <input
                type="checkbox"
                checked={itemForm.isAvailable}
                onChange={(event) =>
                  updateItemForm('isAvailable', event.target.checked)
                }
              />
              Available
            </label>
          </div>

          <button type="submit" className="primary-button" disabled={savingItem}>
            <Plus size={18} />
            {savingItem ? 'Adding item...' : 'Add Item'}
          </button>
        </form>
      </div>

      <div className="category-chip-wrap">
        {categories.length === 0 ? (
          <div className="empty-state compact">No categories added yet.</div>
        ) : (
          categories.map((category) => (
            <div className="category-chip" key={category.id}>
              <div>
                <strong>{category.name}</strong>
                <span>{category.description || 'No description'}</span>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteCategory(category)}
                aria-label={`Delete ${category.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="management-toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search item, category, price..."
          />
        </div>

        <div className="table-count-pill">
          {filteredItems.length} item{filteredItems.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="restaurants-table-wrap">
        {loading ? (
          <div className="empty-state">Loading menu items...</div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-state">
            No menu items found. Add your first food item above.
          </div>
        ) : (
          <table className="restaurants-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Availability</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <span>{item.description || 'No description'}</span>
                  </td>

                  <td>
                    <strong>{item.category?.name || 'No category'}</strong>
                    <span>{item.currency || restaurant.currency || 'AED'}</span>
                  </td>

                  <td>
                    <strong>
                      {item.currency || restaurant.currency || 'AED'}{' '}
                      {Number(item.price).toFixed(2)}
                    </strong>
                    <span>
                      {item.compare_price
                        ? `Compare: ${Number(item.compare_price).toFixed(2)}`
                        : 'No compare price'}
                    </span>
                  </td>

                  <td>
                    <strong>
                      {item.track_stock ? item.stock_quantity : 'Not tracked'}
                    </strong>
                    <span>{item.track_stock ? 'Tracking on' : 'Tracking off'}</span>
                  </td>

                  <td>
                    <span
                      className={`status-pill ${
                        item.is_available ? 'active' : 'suspended'
                      }`}
                    >
                      {item.is_available ? 'Available' : 'Out of stock'}
                    </span>
                  </td>

                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className={`tiny-button ${
                          item.is_available ? 'danger' : 'success'
                        }`}
                        onClick={() => handleToggleItemAvailability(item)}
                      >
                        {item.is_available ? (
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default MenuItemsManagement