import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Layers3,
  Link2,
  ListPlus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './ModifierGroupsManagement.css'

const emptyForm = {
  id: null,
  name: '',
  description: '',
  selection_type: 'single',
  is_required: false,
  min_select: 0,
  max_select: 1,
  sort_order: 0,
  is_active: true,
  options: [createEmptyOption()],
  linkedItemIds: [],
}

function createEmptyOption() {
  return {
    localId: `option-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    id: null,
    name: '',
    price_delta: 0,
    is_default: false,
    is_available: true,
    sort_order: 0,
  }
}

function ModifierGroupsManagement({ restaurant }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [groups, setGroups] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const currency = restaurant?.currency || 'AED'

  const loadData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [itemsResponse, groupsResponse, optionsResponse, linksResponse] =
      await Promise.all([
        supabase
          .from('menu_items')
          .select('id, name, price, is_available, category:menu_categories(name)')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('restaurant_modifier_groups')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false }),
        supabase
          .from('restaurant_modifier_options')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false)
          .order('sort_order', { ascending: true }),
        supabase
          .from('restaurant_item_modifier_groups')
          .select('id, item_id, group_id')
          .eq('restaurant_id', restaurant.id),
      ])

    if (itemsResponse.error || groupsResponse.error) {
      setMessage(
        itemsResponse.error?.message ||
          groupsResponse.error?.message ||
          'Unable to load modifier groups.',
      )
      setGroups([])
      setMenuItems([])
      setLoading(false)
      return
    }

    const options = optionsResponse.data || []
    const links = linksResponse.data || []

    const hydratedGroups = (groupsResponse.data || []).map((group) => ({
      ...group,
      options: options.filter((option) => option.group_id === group.id),
      linkedItemIds: links
        .filter((link) => link.group_id === group.id)
        .map((link) => link.item_id),
    }))

    setMenuItems(itemsResponse.data || [])
    setGroups(hydratedGroups)
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!message) return undefined

    const timer = window.setTimeout(() => setMessage(''), 3200)
    return () => window.clearTimeout(timer)
  }, [message])

  const filteredGroups = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return groups

    return groups.filter((group) => {
      const optionNames = (group.options || [])
        .map((option) => option.name)
        .join(' ')
      const linkedItemNames = menuItems
        .filter((item) => group.linkedItemIds?.includes(item.id))
        .map((item) => item.name)
        .join(' ')

      return [group.name, group.description, optionNames, linkedItemNames]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    })
  }, [groups, menuItems, search])

  const filteredMenuItems = useMemo(() => {
    const keyword = itemSearch.trim().toLowerCase()

    if (!keyword) return menuItems

    return menuItems.filter((item) =>
      [item.name, item.category?.name]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    )
  }, [itemSearch, menuItems])

  const stats = useMemo(() => {
    const activeGroups = groups.filter((group) => group.is_active).length
    const requiredGroups = groups.filter((group) => group.is_required).length
    const linkedItems = new Set(
      groups.flatMap((group) => group.linkedItemIds || []),
    ).size
    const optionCount = groups.reduce(
      (total, group) => total + Number(group.options?.length || 0),
      0,
    )

    return { activeGroups, requiredGroups, linkedItems, optionCount }
  }, [groups])

  const startNew = () => {
    setForm({ ...emptyForm, options: [createEmptyOption()], linkedItemIds: [] })
    setItemSearch('')
    setFormOpen(true)
  }

  const startEdit = (group) => {
    setForm({
      id: group.id,
      name: group.name || '',
      description: group.description || '',
      selection_type: group.selection_type || 'single',
      is_required: Boolean(group.is_required),
      min_select: Number(group.min_select || 0),
      max_select: Number(group.max_select || 1),
      sort_order: Number(group.sort_order || 0),
      is_active: group.is_active !== false,
      options:
        group.options?.length > 0
          ? group.options.map((option) => ({
              ...option,
              localId: option.id || createEmptyOption().localId,
              price_delta: Number(option.price_delta || 0),
              sort_order: Number(option.sort_order || 0),
              is_default: Boolean(option.is_default),
              is_available: option.is_available !== false,
            }))
          : [createEmptyOption()],
      linkedItemIds: group.linkedItemIds || [],
    })
    setItemSearch('')
    setFormOpen(true)
  }

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const updateOption = (localId, key, value) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option) =>
        option.localId === localId ? { ...option, [key]: value } : option,
      ),
    }))
  }

  const addOption = () => {
    setForm((current) => ({
      ...current,
      options: [
        ...current.options,
        {
          ...createEmptyOption(),
          sort_order: current.options.length,
        },
      ],
    }))
  }

  const removeOption = (localId) => {
    setForm((current) => {
      if (current.options.length === 1) {
        return {
          ...current,
          options: [createEmptyOption()],
        }
      }

      return {
        ...current,
        options: current.options.filter((option) => option.localId !== localId),
      }
    })
  }

  const toggleLinkedItem = (itemId) => {
    setForm((current) => {
      const selected = current.linkedItemIds.includes(itemId)

      return {
        ...current,
        linkedItemIds: selected
          ? current.linkedItemIds.filter((id) => id !== itemId)
          : [...current.linkedItemIds, itemId],
      }
    })
  }

  const handleSave = async (event) => {
    event.preventDefault()

    if (!restaurant?.id) return

    const cleanName = form.name.trim()
    const cleanOptions = form.options
      .map((option, index) => ({
        id: option.id || undefined,
        restaurant_id: restaurant.id,
        group_id: form.id || null,
        name: option.name.trim(),
        price_delta: Number(option.price_delta || 0),
        is_default: Boolean(option.is_default),
        is_available: option.is_available !== false,
        sort_order: Number(option.sort_order || index),
        is_deleted: false,
      }))
      .filter((option) => option.name)

    if (!cleanName) {
      setMessage('Modifier group name is required.')
      return
    }

    if (cleanOptions.length === 0) {
      setMessage('Add at least one option.')
      return
    }

    const minSelect = Math.max(Number(form.min_select || 0), 0)
    const maxSelect =
      form.selection_type === 'single'
        ? 1
        : Math.max(Number(form.max_select || 1), minSelect || 1)

    setSaving(true)

    const payload = {
      restaurant_id: restaurant.id,
      name: cleanName,
      description: form.description.trim() || null,
      selection_type: form.selection_type,
      is_required: Boolean(form.is_required),
      min_select: form.is_required ? Math.max(minSelect, 1) : minSelect,
      max_select: maxSelect,
      sort_order: Number(form.sort_order || 0),
      is_active: Boolean(form.is_active),
      is_deleted: false,
    }

    let savedGroupId = form.id
    let groupError = null

    if (form.id) {
      const { error } = await supabase
        .from('restaurant_modifier_groups')
        .update(payload)
        .eq('id', form.id)
        .eq('restaurant_id', restaurant.id)

      groupError = error
    } else {
      const { data, error } = await supabase
        .from('restaurant_modifier_groups')
        .insert(payload)
        .select('id')
        .single()

      groupError = error
      savedGroupId = data?.id
    }

    if (groupError || !savedGroupId) {
      setSaving(false)
      setMessage(groupError?.message || 'Unable to save modifier group.')
      return
    }

    const deleteOptions = await supabase
      .from('restaurant_modifier_options')
      .update({ is_deleted: true })
      .eq('group_id', savedGroupId)
      .eq('restaurant_id', restaurant.id)

    if (deleteOptions.error) {
      setSaving(false)
      setMessage(deleteOptions.error.message)
      return
    }

    const optionRows = cleanOptions.map((option, index) => ({
      restaurant_id: restaurant.id,
      group_id: savedGroupId,
      name: option.name,
      price_delta: option.price_delta,
      is_default: option.is_default,
      is_available: option.is_available,
      sort_order: Number(option.sort_order || index),
      is_deleted: false,
    }))

    const { error: optionError } = await supabase
      .from('restaurant_modifier_options')
      .insert(optionRows)

    if (optionError) {
      setSaving(false)
      setMessage(optionError.message)
      return
    }

    const { error: linkDeleteError } = await supabase
      .from('restaurant_item_modifier_groups')
      .delete()
      .eq('group_id', savedGroupId)
      .eq('restaurant_id', restaurant.id)

    if (linkDeleteError) {
      setSaving(false)
      setMessage(linkDeleteError.message)
      return
    }

    if (form.linkedItemIds.length > 0) {
      const linkRows = form.linkedItemIds.map((itemId, index) => ({
        restaurant_id: restaurant.id,
        item_id: itemId,
        group_id: savedGroupId,
        sort_order: index,
      }))

      const { error: linkError } = await supabase
        .from('restaurant_item_modifier_groups')
        .insert(linkRows)

      if (linkError) {
        setSaving(false)
        setMessage(linkError.message)
        return
      }
    }

    setSaving(false)
    setMessage('Modifier group saved.')
    setFormOpen(false)
    await loadData()
  }

  const handleToggleActive = async (group) => {
    const { error } = await supabase
      .from('restaurant_modifier_groups')
      .update({ is_active: !group.is_active })
      .eq('id', group.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setGroups((current) =>
      current.map((item) =>
        item.id === group.id ? { ...item, is_active: !item.is_active } : item,
      ),
    )
  }

  const handleDelete = async (group) => {
    const { error } = await supabase
      .from('restaurant_modifier_groups')
      .update({ is_deleted: true, is_active: false })
      .eq('id', group.id)
      .eq('restaurant_id', restaurant.id)

    if (error) {
      setMessage(error.message)
      return
    }

    setGroups((current) => current.filter((item) => item.id !== group.id))
    setMessage('Modifier group deleted.')
  }

  const getLinkedItemNames = (group) => {
    const linked = menuItems.filter((item) => group.linkedItemIds?.includes(item.id))

    if (linked.length === 0) return 'Not linked to items yet'
    if (linked.length <= 3) return linked.map((item) => item.name).join(', ')

    return `${linked.slice(0, 3).map((item) => item.name).join(', ')} +${
      linked.length - 3
    } more`
  }

  return (
    <section className="modifiers-page">
      {message && <div className="modifiers-toast">{message}</div>}

      <div className="modifiers-hero">
        <div>
          <p>Menu add-ons</p>
          <h1>Modifiers & add-ons</h1>
          <span>
            Create spice levels, sauces, toppings, sizes, extras and required
            choices for menu items.
          </span>
        </div>

        <div className="modifiers-hero-actions">
          <button type="button" className="ghost" onClick={loadData}>
            <RefreshCw size={17} />
            Refresh
          </button>
          <button type="button" onClick={startNew}>
            <Plus size={17} />
            New Modifier Group
          </button>
        </div>
      </div>

      <div className="modifiers-stats-grid">
        <ModifierStat icon={<Layers3 size={18} />} label="Groups" value={groups.length} />
        <ModifierStat icon={<ListPlus size={18} />} label="Options" value={stats.optionCount} />
        <ModifierStat icon={<Link2 size={18} />} label="Linked items" value={stats.linkedItems} />
        <ModifierStat icon={<Settings2 size={18} />} label="Required" value={stats.requiredGroups} />
      </div>

      <div className="modifiers-toolbar">
        <div className="modifiers-search">
          <Search size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search modifiers, options or menu items..."
          />
        </div>
      </div>

      {formOpen && (
        <form className="modifier-form-panel" onSubmit={handleSave}>
          <div className="modifier-form-head">
            <div>
              <p>{form.id ? 'Edit modifier group' : 'New modifier group'}</p>
              <h2>{form.id ? form.name || 'Modifier group' : 'Create add-ons'}</h2>
            </div>

            <button
              type="button"
              className="modifier-icon-button"
              onClick={() => setFormOpen(false)}
            >
              <X size={18} />
            </button>
          </div>

          <div className="modifier-form-grid">
            <label className="modifier-field wide">
              <span>Group name</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => updateForm('name', event.target.value)}
                placeholder="Example: Spice level, Sauces, Toppings"
              />
            </label>

            <label className="modifier-field wide">
              <span>Description</span>
              <input
                type="text"
                value={form.description}
                onChange={(event) => updateForm('description', event.target.value)}
                placeholder="Short note for staff/customer"
              />
            </label>

            <label className="modifier-field">
              <span>Selection type</span>
              <select
                value={form.selection_type}
                onChange={(event) =>
                  updateForm('selection_type', event.target.value)
                }
              >
                <option value="single">Single choice</option>
                <option value="multiple">Multiple choice</option>
              </select>
            </label>

            <label className="modifier-field">
              <span>Minimum select</span>
              <input
                type="number"
                min="0"
                value={form.min_select}
                onChange={(event) => updateForm('min_select', event.target.value)}
              />
            </label>

            <label className="modifier-field">
              <span>Maximum select</span>
              <input
                type="number"
                min="1"
                value={form.selection_type === 'single' ? 1 : form.max_select}
                disabled={form.selection_type === 'single'}
                onChange={(event) => updateForm('max_select', event.target.value)}
              />
            </label>

            <label className="modifier-field">
              <span>Sort order</span>
              <input
                type="number"
                value={form.sort_order}
                onChange={(event) => updateForm('sort_order', event.target.value)}
              />
            </label>
          </div>

          <div className="modifier-switch-row">
            <button
              type="button"
              className={`modifier-switch ${form.is_required ? 'active' : ''}`}
              onClick={() => updateForm('is_required', !form.is_required)}
            >
              <span />
              Required choice
            </button>

            <button
              type="button"
              className={`modifier-switch ${form.is_active ? 'active' : ''}`}
              onClick={() => updateForm('is_active', !form.is_active)}
            >
              <span />
              Active
            </button>
          </div>

          <section className="modifier-options-card">
            <div className="modifier-card-title">
              <div>
                <h3>Options</h3>
                <p>Add choices with optional extra price.</p>
              </div>

              <button type="button" onClick={addOption}>
                <Plus size={16} />
                Add option
              </button>
            </div>

            <div className="modifier-options-list">
              {form.options.map((option, index) => (
                <div className="modifier-option-row" key={option.localId}>
                  <div className="modifier-option-number">{index + 1}</div>

                  <input
                    type="text"
                    value={option.name}
                    onChange={(event) =>
                      updateOption(option.localId, 'name', event.target.value)
                    }
                    placeholder="Option name"
                  />

                  <div className="modifier-price-input">
                    <CircleDollarSign size={16} />
                    <input
                      type="number"
                      step="0.01"
                      value={option.price_delta}
                      onChange={(event) =>
                        updateOption(
                          option.localId,
                          'price_delta',
                          event.target.value,
                        )
                      }
                      placeholder="0.00"
                    />
                  </div>

                  <button
                    type="button"
                    className={`modifier-mini-toggle ${
                      option.is_default ? 'active' : ''
                    }`}
                    onClick={() =>
                      updateOption(option.localId, 'is_default', !option.is_default)
                    }
                  >
                    Default
                  </button>

                  <button
                    type="button"
                    className={`modifier-mini-toggle ${
                      option.is_available ? 'active' : ''
                    }`}
                    onClick={() =>
                      updateOption(
                        option.localId,
                        'is_available',
                        !option.is_available,
                      )
                    }
                  >
                    Available
                  </button>

                  <button
                    type="button"
                    className="modifier-icon-button danger"
                    onClick={() => removeOption(option.localId)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="modifier-options-card">
            <div className="modifier-card-title">
              <div>
                <h3>Apply to menu items</h3>
                <p>Link this group to dishes where these choices should appear.</p>
              </div>

              <strong>{form.linkedItemIds.length} selected</strong>
            </div>

            <div className="modifiers-search compact">
              <Search size={16} />
              <input
                type="search"
                value={itemSearch}
                onChange={(event) => setItemSearch(event.target.value)}
                placeholder="Search menu items..."
              />
            </div>

            <div className="modifier-items-grid">
              {filteredMenuItems.map((item) => {
                const selected = form.linkedItemIds.includes(item.id)

                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`modifier-item-pill ${selected ? 'selected' : ''}`}
                    onClick={() => toggleLinkedItem(item.id)}
                  >
                    <span>{item.name}</span>
                    <small>
                      {item.category?.name || 'Uncategorised'} • {currency}{' '}
                      {Number(item.price || 0).toFixed(2)}
                    </small>
                  </button>
                )
              })}
            </div>
          </section>

          <div className="modifier-form-actions">
            <button type="button" className="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={saving}>
              <Save size={17} />
              {saving ? 'Saving...' : 'Save modifier group'}
            </button>
          </div>
        </form>
      )}

      <section className="modifier-groups-list">
        {loading ? (
          <div className="modifier-empty-state">Loading modifier groups...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="modifier-empty-state">
            <ListPlus size={36} />
            <h3>No modifier groups yet</h3>
            <p>
              Create choices like spicy level, extra cheese, sauce selection,
              bread type or combo add-ons.
            </p>
            <button type="button" onClick={startNew}>
              <Plus size={16} />
              Create first group
            </button>
          </div>
        ) : (
          filteredGroups.map((group) => (
            <ModifierGroupCard
              key={group.id}
              group={group}
              currency={currency}
              linkedItemsText={getLinkedItemNames(group)}
              onEdit={() => startEdit(group)}
              onToggle={() => handleToggleActive(group)}
              onDelete={() => handleDelete(group)}
            />
          ))
        )}
      </section>
    </section>
  )
}

function ModifierStat({ icon, label, value }) {
  return (
    <div className="modifier-stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ModifierGroupCard({
  group,
  currency,
  linkedItemsText,
  onEdit,
  onToggle,
  onDelete,
}) {
  const [open, setOpen] = useState(false)

  return (
    <article className={`modifier-group-card ${group.is_active ? '' : 'muted'}`}>
      <div className="modifier-group-main">
        <button
          type="button"
          className="modifier-expand-button"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        <div className="modifier-group-info">
          <div className="modifier-group-title-row">
            <h3>{group.name}</h3>
            <span className={group.selection_type === 'single' ? 'single' : 'multiple'}>
              {group.selection_type === 'single' ? 'Single' : 'Multiple'}
            </span>
            {group.is_required && <span className="required">Required</span>}
            {!group.is_active && <span className="hidden">Hidden</span>}
          </div>

          <p>{group.description || 'No description added.'}</p>
          <small>{linkedItemsText}</small>
        </div>

        <div className="modifier-group-meta">
          <strong>{group.options?.length || 0}</strong>
          <span>options</span>
        </div>

        <div className="modifier-group-actions">
          <button type="button" onClick={onToggle}>
            {group.is_active ? 'Hide' : 'Show'}
          </button>
          <button type="button" onClick={onEdit}>
            <Pencil size={16} />
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {open && (
        <div className="modifier-group-options-preview">
          {(group.options || []).map((option) => (
            <div key={option.id}>
              <span>{option.name}</span>
              <strong>
                {Number(option.price_delta || 0) > 0
                  ? `+${currency} ${Number(option.price_delta || 0).toFixed(2)}`
                  : 'Free'}
              </strong>
              {option.is_default && <small>Default</small>}
              {option.is_available === false && <small>Unavailable</small>}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

export default ModifierGroupsManagement
