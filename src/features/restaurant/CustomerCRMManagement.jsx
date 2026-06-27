import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  MessageCircle,
  NotebookPen,
  Plus,
  Search,
  Tag,
  Trash2,
  UserRoundCheck,
} from 'lucide-react'
import { useAppFeedback } from '../../components/AppFeedback'
import { supabase } from '../../lib/supabaseClient'
import './CustomerCRMManagement.css'

const tagPalette = [
  '#f97316',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#eab308',
  '#ef4444',
  '#14b8a6',
]

const emptyNoteForm = {
  noteType: 'general',
  noteText: '',
  followUpAt: '',
}

function CustomerCRMManagement({ restaurant }) {
  const { showToast, confirmAction } = useAppFeedback()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customers, setCustomers] = useState([])
  const [tags, setTags] = useState([])
  const [tagLinks, setTagLinks] = useState([])
  const [notes, setNotes] = useState([])
  const [search, setSearch] = useState('')
  const [activeCustomerKey, setActiveCustomerKey] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(tagPalette[0])
  const [noteForm, setNoteForm] = useState(emptyNoteForm)

  const currency = restaurant?.currency || 'AED'

  const loadCRMData = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const [customersResult, tagsResult, linksResult, notesResult] =
      await Promise.all([
        supabase
          .from('restaurant_customers')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .order('updated_at', { ascending: false }),
        supabase
          .from('restaurant_customer_tags')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: true }),
        supabase
          .from('restaurant_customer_tag_links')
          .select('*')
          .eq('restaurant_id', restaurant.id),
        supabase
          .from('restaurant_customer_notes')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false }),
      ])

    if (customersResult.error) {
      showToast({
        type: 'error',
        title: 'Customers loading failed',
        message: customersResult.error.message,
      })
    }

    if (tagsResult.error || linksResult.error || notesResult.error) {
      showToast({
        type: 'error',
        title: 'CRM loading failed',
        message:
          tagsResult.error?.message ||
          linksResult.error?.message ||
          notesResult.error?.message,
      })
    }

    const nextCustomers = normalizeCustomers(customersResult.data || [])

    setCustomers(nextCustomers)
    setTags(tagsResult.data || [])
    setTagLinks(linksResult.data || [])
    setNotes(notesResult.data || [])
    setLoading(false)

    if (!activeCustomerKey && nextCustomers.length > 0) {
      setActiveCustomerKey(nextCustomers[0].customerKey)
    }
  }, [activeCustomerKey, restaurant?.id, showToast])

  useEffect(() => {
    loadCRMData()
  }, [loadCRMData])

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return customers

    return customers.filter((customer) =>
      [
        customer.displayName,
        customer.phone,
        customer.email,
        customer.customerKey,
      ].some((value) => String(value || '').toLowerCase().includes(keyword)),
    )
  }, [customers, search])

  const activeCustomer = useMemo(() => {
    return (
      customers.find((customer) => customer.customerKey === activeCustomerKey) ||
      filteredCustomers[0] ||
      null
    )
  }, [activeCustomerKey, customers, filteredCustomers])

  const activeCustomerTags = useMemo(() => {
    if (!activeCustomer) return []

    const activeLinks = tagLinks.filter((link) =>
      isSameCustomerLink(link, activeCustomer),
    )

    return tags.filter((tagItem) =>
      activeLinks.some((link) => link.tag_id === tagItem.id),
    )
  }, [activeCustomer, tagLinks, tags])

  const activeCustomerNotes = useMemo(() => {
    if (!activeCustomer) return []

    return notes.filter((note) => isSameCustomerLink(note, activeCustomer))
  }, [activeCustomer, notes])

  const followUps = useMemo(() => {
    const now = Date.now()

    return notes.filter((note) => {
      if (!note.follow_up_at || note.is_deleted) return false

      return new Date(note.follow_up_at).getTime() >= now - 86400000
    })
  }, [notes])

  const summary = useMemo(() => {
    return {
      customers: customers.length,
      tagged: new Set(tagLinks.map((link) => getLinkCustomerKey(link))).size,
      notes: notes.length,
      followUps: followUps.length,
    }
  }, [customers.length, followUps.length, notes.length, tagLinks])

  const handleCreateTag = async () => {
    const cleanTagName = newTagName.trim()

    if (!cleanTagName) {
      showToast({
        type: 'warning',
        title: 'Tag name required',
        message: 'Enter a tag name like VIP, Complaint, Follow-up or Catering.',
      })
      return
    }

    setSaving(true)

    const { data, error } = await supabase
      .from('restaurant_customer_tags')
      .insert({
        restaurant_id: restaurant.id,
        tag_name: cleanTagName,
        tag_color: newTagColor,
      })
      .select('*')
      .single()

    setSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Tag not saved',
        message: error.message,
      })
      return
    }

    setTags((current) => [...current, data])
    setNewTagName('')
    showToast({ type: 'success', title: 'Tag created' })
  }

  const handleToggleTag = async (tagItem) => {
    if (!activeCustomer) return

    const existingLink = tagLinks.find(
      (link) =>
        link.tag_id === tagItem.id && isSameCustomerLink(link, activeCustomer),
    )

    if (existingLink) {
      const { error } = await supabase
        .from('restaurant_customer_tag_links')
        .delete()
        .eq('id', existingLink.id)

      if (error) {
        showToast({
          type: 'error',
          title: 'Tag update failed',
          message: error.message,
        })
        return
      }

      setTagLinks((current) =>
        current.filter((link) => link.id !== existingLink.id),
      )
      return
    }

    const payload = buildCustomerPayload(restaurant.id, activeCustomer, {
      tag_id: tagItem.id,
    })

    const { data, error } = await supabase
      .from('restaurant_customer_tag_links')
      .insert(payload)
      .select('*')
      .single()

    if (error) {
      showToast({
        type: 'error',
        title: 'Tag update failed',
        message: error.message,
      })
      return
    }

    setTagLinks((current) => [...current, data])
  }

  const handleDeleteTag = async (tagItem) => {
    const confirmed = await confirmAction({
      title: 'Delete tag?',
      message: `This will remove the ${tagItem.tag_name} tag from CRM views.`,
      confirmText: 'Delete tag',
      cancelText: 'Keep tag',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('restaurant_customer_tags')
      .update({ is_deleted: true })
      .eq('id', tagItem.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Tag delete failed',
        message: error.message,
      })
      return
    }

    setTags((current) => current.filter((tag) => tag.id !== tagItem.id))
    setTagLinks((current) =>
      current.filter((link) => link.tag_id !== tagItem.id),
    )
  }

  const handleSaveNote = async () => {
    if (!activeCustomer) return

    const cleanNote = noteForm.noteText.trim()

    if (!cleanNote) {
      showToast({
        type: 'warning',
        title: 'Note is empty',
        message: 'Write a note before saving.',
      })
      return
    }

    setSaving(true)

    const payload = buildCustomerPayload(restaurant.id, activeCustomer, {
      note_type: noteForm.noteType,
      note_text: cleanNote,
      follow_up_at: noteForm.followUpAt || null,
    })

    const { data, error } = await supabase
      .from('restaurant_customer_notes')
      .insert(payload)
      .select('*')
      .single()

    setSaving(false)

    if (error) {
      showToast({
        type: 'error',
        title: 'Note not saved',
        message: error.message,
      })
      return
    }

    setNotes((current) => [data, ...current])
    setNoteForm(emptyNoteForm)
    showToast({ type: 'success', title: 'Customer note saved' })
  }

  const handleDeleteNote = async (note) => {
    const confirmed = await confirmAction({
      title: 'Delete note?',
      message: 'This CRM note will be hidden from the customer timeline.',
      confirmText: 'Delete note',
      cancelText: 'Keep note',
      danger: true,
    })

    if (!confirmed) return

    const { error } = await supabase
      .from('restaurant_customer_notes')
      .update({ is_deleted: true })
      .eq('id', note.id)

    if (error) {
      showToast({
        type: 'error',
        title: 'Note delete failed',
        message: error.message,
      })
      return
    }

    setNotes((current) => current.filter((item) => item.id !== note.id))
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
    <section className="crm-screen">
      <div className="crm-hero-card">
        <div>
          <p className="pricing-label">Customer CRM</p>
          <h2>Tags, notes and follow-ups</h2>
          <span>
            Keep VIP notes, complaint history, catering leads and follow-up reminders in one place.
          </span>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={loadCRMData}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="crm-summary-grid">
        <CRMStatCard icon={<UserRoundCheck size={21} />} label="Customers" value={summary.customers} />
        <CRMStatCard icon={<Tag size={21} />} label="Tagged" value={summary.tagged} />
        <CRMStatCard icon={<NotebookPen size={21} />} label="Notes" value={summary.notes} />
        <CRMStatCard icon={<CalendarClock size={21} />} label="Follow-ups" value={summary.followUps} />
      </div>

      <div className="crm-layout-grid">
        <aside className="crm-customer-panel">
          <div className="crm-panel-head">
            <div>
              <h3>Customers</h3>
              <span>Select a customer to add notes or tags.</span>
            </div>
          </div>

          <div className="crm-search-box">
            <Search size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, email..."
            />
          </div>

          <div className="crm-customer-list">
            {loading ? (
              <div className="crm-empty-card">Loading customers...</div>
            ) : filteredCustomers.length === 0 ? (
              <div className="crm-empty-card">No customers found yet.</div>
            ) : (
              filteredCustomers.map((customer) => {
                const customerTags = tags.filter((tagItem) =>
                  tagLinks.some(
                    (link) =>
                      link.tag_id === tagItem.id &&
                      isSameCustomerLink(link, customer),
                  ),
                )

                return (
                  <button
                    type="button"
                    className={`crm-customer-card ${
                      activeCustomer?.customerKey === customer.customerKey
                        ? 'active'
                        : ''
                    }`}
                    key={customer.customerKey}
                    onClick={() => setActiveCustomerKey(customer.customerKey)}
                  >
                    <div className="crm-customer-avatar">
                      {customer.displayName.slice(0, 2).toUpperCase()}
                    </div>

                    <div>
                      <strong>{customer.displayName}</strong>
                      <span>{customer.phone || customer.email || 'No contact saved'}</span>
                      <small>
                        {formatMoney(currency, customer.totalSpend)} • {customer.totalOrders} order{customer.totalOrders === 1 ? '' : 's'}
                      </small>

                      {customerTags.length > 0 && (
                        <div className="crm-mini-tags">
                          {customerTags.slice(0, 3).map((tagItem) => (
                            <em
                              key={tagItem.id}
                              style={{ '--tagColor': tagItem.tag_color || '#f97316' }}
                            >
                              {tagItem.tag_name}
                            </em>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <main className="crm-detail-panel">
          {!activeCustomer ? (
            <div className="crm-empty-detail">
              <MessageCircle size={34} />
              <h3>No customer selected</h3>
              <p>Customers will appear here after POS, QR menu or payment activity.</p>
            </div>
          ) : (
            <>
              <section className="crm-profile-card">
                <div className="crm-profile-main">
                  <div className="crm-profile-avatar">
                    {activeCustomer.displayName.slice(0, 2).toUpperCase()}
                  </div>

                  <div>
                    <p className="pricing-label">Selected Customer</p>
                    <h3>{activeCustomer.displayName}</h3>
                    <span>{activeCustomer.phone || activeCustomer.email || 'No contact saved'}</span>
                  </div>
                </div>

                <div className="crm-profile-metrics">
                  <div>
                    <span>Total spend</span>
                    <strong>{formatMoney(currency, activeCustomer.totalSpend)}</strong>
                  </div>
                  <div>
                    <span>Orders</span>
                    <strong>{activeCustomer.totalOrders}</strong>
                  </div>
                  <div>
                    <span>Last order</span>
                    <strong>{formatShortDate(activeCustomer.lastOrderAt)}</strong>
                  </div>
                </div>
              </section>

              <section className="crm-action-grid">
                <div className="crm-card">
                  <div className="crm-card-head">
                    <div>
                      <h3>Customer Tags</h3>
                      <span>Mark customers as VIP, follow-up, complaint, catering lead, etc.</span>
                    </div>
                  </div>

                  <div className="crm-tag-create-row">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(event) => setNewTagName(event.target.value)}
                      placeholder="New tag name"
                    />

                    <select
                      value={newTagColor}
                      onChange={(event) => setNewTagColor(event.target.value)}
                    >
                      {tagPalette.map((color) => (
                        <option value={color} key={color}>{color}</option>
                      ))}
                    </select>

                    <button type="button" onClick={handleCreateTag} disabled={saving}>
                      <Plus size={16} />
                      Add
                    </button>
                  </div>

                  <div className="crm-tag-cloud">
                    {tags.length === 0 ? (
                      <div className="crm-empty-card compact">Create your first CRM tag.</div>
                    ) : (
                      tags.map((tagItem) => {
                        const selected = activeCustomerTags.some(
                          (activeTag) => activeTag.id === tagItem.id,
                        )

                        return (
                          <div className="crm-tag-pill-wrap" key={tagItem.id}>
                            <button
                              type="button"
                              className={`crm-tag-pill ${selected ? 'selected' : ''}`}
                              style={{ '--tagColor': tagItem.tag_color || '#f97316' }}
                              onClick={() => handleToggleTag(tagItem)}
                            >
                              {selected && <CheckCircle2 size={14} />}
                              {tagItem.tag_name}
                            </button>

                            <button
                              type="button"
                              className="crm-tag-delete"
                              onClick={() => handleDeleteTag(tagItem)}
                              title="Delete tag"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="crm-card">
                  <div className="crm-card-head">
                    <div>
                      <h3>Add Note / Follow-up</h3>
                      <span>Save service notes, allergy notes, complaints or future reminders.</span>
                    </div>
                  </div>

                  <div className="crm-note-form">
                    <select
                      value={noteForm.noteType}
                      onChange={(event) =>
                        setNoteForm((current) => ({
                          ...current,
                          noteType: event.target.value,
                        }))
                      }
                    >
                      <option value="general">General note</option>
                      <option value="preference">Preference</option>
                      <option value="complaint">Complaint</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="catering">Catering / bulk lead</option>
                    </select>

                    <input
                      type="datetime-local"
                      value={noteForm.followUpAt}
                      onChange={(event) =>
                        setNoteForm((current) => ({
                          ...current,
                          followUpAt: event.target.value,
                        }))
                      }
                    />

                    <textarea
                      value={noteForm.noteText}
                      onChange={(event) =>
                        setNoteForm((current) => ({
                          ...current,
                          noteText: event.target.value,
                        }))
                      }
                      placeholder="Example: Customer prefers less spicy biryani. Call before sending large orders."
                      rows="4"
                    />

                    <button type="button" onClick={handleSaveNote} disabled={saving}>
                      <NotebookPen size={16} />
                      Save Note
                    </button>
                  </div>
                </div>
              </section>

              <section className="crm-card crm-timeline-card">
                <div className="crm-card-head">
                  <div>
                    <h3>Customer Timeline</h3>
                    <span>Latest CRM notes and reminders for this customer.</span>
                  </div>
                </div>

                <div className="crm-timeline-list">
                  {activeCustomerNotes.length === 0 ? (
                    <div className="crm-empty-card">No CRM notes saved for this customer yet.</div>
                  ) : (
                    activeCustomerNotes.map((note) => (
                      <article className={`crm-note-item type-${note.note_type || 'general'}`} key={note.id}>
                        <div>
                          <span>{formatNoteType(note.note_type)}</span>
                          <strong>{note.note_text}</strong>
                          <small>
                            {formatShortDate(note.created_at)}
                            {note.follow_up_at ? ` • Follow-up ${formatShortDate(note.follow_up_at)}` : ''}
                          </small>
                        </div>

                        <button type="button" onClick={() => handleDeleteNote(note)}>
                          <Trash2 size={15} />
                        </button>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </section>
  )
}

function CRMStatCard({ icon, label, value }) {
  return (
    <div className="crm-stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function normalizeCustomers(rows) {
  return rows.map((row) => {
    const phone = row.phone || row.customer_phone || row.full_phone || ''
    const email = row.email || row.customer_email || ''
    const name =
      row.customer_name || row.name || row.full_name || row.display_name || ''
    const displayName = name || phone || email || 'Customer'

    return {
      ...row,
      customerKey: row.id || phone || email || `customer-${Math.random()}`,
      displayName,
      phone,
      email,
      totalSpend: Number(row.total_spend || row.total_amount || row.spend || 0),
      totalOrders: Number(row.total_orders || row.order_count || row.orders_count || 0),
      lastOrderAt: row.last_order_at || row.last_visit_at || row.updated_at || row.created_at,
    }
  })
}

function buildCustomerPayload(restaurantId, customer, extra = {}) {
  return {
    restaurant_id: restaurantId,
    customer_id: isUUID(customer?.id) ? customer.id : null,
    customer_phone: customer?.phone || null,
    customer_name: customer?.displayName || null,
    ...extra,
  }
}

function isSameCustomerLink(link, customer) {
  if (!link || !customer) return false
  if (link.customer_id && customer.id && link.customer_id === customer.id) return true
  if (link.customer_phone && customer.phone && link.customer_phone === customer.phone) return true

  return getLinkCustomerKey(link) === customer.customerKey
}

function getLinkCustomerKey(link) {
  return link.customer_id || link.customer_phone || link.customer_name || link.id
}

function isUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ''),
  )
}

function formatMoney(currency, value) {
  return `${currency || 'AED'} ${Number(value || 0).toFixed(2)}`
}

function formatShortDate(value) {
  if (!value) return 'Not yet'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Not yet'
  }
}

function formatNoteType(type) {
  if (type === 'preference') return 'Preference'
  if (type === 'complaint') return 'Complaint'
  if (type === 'follow_up') return 'Follow-up'
  if (type === 'catering') return 'Catering lead'
  return 'General note'
}

export default CustomerCRMManagement
