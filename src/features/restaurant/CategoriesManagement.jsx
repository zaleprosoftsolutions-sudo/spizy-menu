import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'

function CategoriesManagement({ restaurant }) {
  const { confirmAction, showToast } = useAppFeedback()
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    name: '',
    description: '',
  })

  const loadCategories = useCallback(async () => {
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
      .select('id, category_id')
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)

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
        title: 'Category item count failed',
        message: itemError.message,
      })
    }

    setCategories(categoryData || [])
    setItems(itemData || [])
    setLoading(false)
  }, [restaurant?.id, showToast])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  const filteredCategories = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return categories

    return categories.filter((category) => {
      return [category.name, category.description].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword),
      )
    })
  }, [categories, search])

  const getItemCount = (categoryId) => {
    return items.filter((item) => item.category_id === categoryId).length
  }

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleAddCategory = async (event) => {
    event.preventDefault()

    const name = form.name.trim()

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

    setSaving(true)

    const { error } = await supabase.from('menu_categories').insert({
      restaurant_id: restaurant.id,
      name,
      description: form.description.trim() || null,
    })

    setSaving(false)

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

    setForm({
      name: '',
      description: '',
    })

    await loadCategories()
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

    await loadCategories()
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
          <p className="pricing-label">Categories</p>
          <h2>Food category management</h2>
          <span>
            Create and manage categories like Starters, Biryani, Juices,
            Desserts and Specials.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadCategories}
          disabled={loading}
        >
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>

      <div className="category-manager-grid">
        <form className="expense-form" onSubmit={handleAddCategory}>
          <div className="mini-form-head">
            <div className="feature-icon">
              <Plus size={22} />
            </div>
            <div>
              <h3>Add category</h3>
              <p>Keep products organized for POS and QR menu.</p>
            </div>
          </div>

          <label>
            Category name
            <input
              type="text"
              value={form.name}
              onChange={(event) => updateForm('name', event.target.value)}
              placeholder="Example: Biryani"
              required
            />
          </label>

          <label>
            Description
            <textarea
              value={form.description}
              onChange={(event) =>
                updateForm('description', event.target.value)
              }
              placeholder="Optional category description"
              rows="4"
            />
          </label>

          <button type="submit" className="primary-button" disabled={saving}>
            <Plus size={18} />
            {saving ? 'Adding...' : 'Add Category'}
          </button>
        </form>

        <div className="category-list-panel">
          <div className="management-toolbar compact-toolbar">
            <div className="search-box">
              <Search size={18} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search categories..."
              />
            </div>

            <div className="table-count-pill">
              {filteredCategories.length} categor
              {filteredCategories.length === 1 ? 'y' : 'ies'}
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Loading categories...</div>
          ) : filteredCategories.length === 0 ? (
            <div className="empty-state">No categories found.</div>
          ) : (
            <div className="category-list-grid">
              {filteredCategories.map((category) => (
                <article className="category-card" key={category.id}>
                  <div>
                    <strong>{category.name}</strong>
                    <p>{category.description || 'No description'}</p>
                    <span>{getItemCount(category.id)} items connected</span>
                  </div>

                  <button
                    type="button"
                    className="tiny-button danger"
                    onClick={() => handleDeleteCategory(category)}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default CategoriesManagement