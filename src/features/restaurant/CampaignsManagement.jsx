import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarClock,
  Eye,
  EyeOff,
  ImagePlus,
  UploadCloud,
  Megaphone,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Timer,
  Trash2,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import './CampaignsManagement.css'

const emptyCampaignForm = {
  title: '',
  subtitle: '',
  banner_image_url: '',
  banner_preview_url: '',
  banner_upload_blob: null,
  banner_upload_name: '',
  banner_upload_size: 0,
  button_text: 'View offer',
  button_target: 'coupon',
  coupon_code: '',
  link_url: '',
  start_date: '',
  start_time: '',
  end_date: '',
  end_time: '',
  sort_order: 0,
  is_active: true,
}

const buttonTargetOptions = [
  { value: 'coupon', label: 'Apply / copy coupon' },
  { value: 'cart', label: 'Open cart' },
  { value: 'recipes', label: 'View recipes / menu' },
  { value: 'link', label: 'External link' },
  { value: 'none', label: 'No button' },
]

function CampaignsManagement({ restaurant }) {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState(null)
  const [form, setForm] = useState(emptyCampaignForm)
  const [formError, setFormError] = useState('')

  const loadCampaigns = useCallback(async () => {
    if (!restaurant?.id) return

    setLoading(true)

    const { data } = await supabase
      .from('restaurant_campaigns')
      .select('*')
      .eq('restaurant_id', restaurant.id)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    setCampaigns(data || [])
    setLoading(false)
  }, [restaurant?.id])

  useEffect(() => {
    loadCampaigns()
  }, [loadCampaigns])

  const stats = useMemo(() => {
    const now = Date.now()

    const active = campaigns.filter(
      (campaign) => campaign.is_active && isCampaignLive(campaign, now),
    ).length
    const scheduled = campaigns.filter(
      (campaign) =>
        campaign.is_active &&
        campaign.start_at &&
        new Date(campaign.start_at).getTime() > now,
    ).length
    const expired = campaigns.filter(
      (campaign) =>
        campaign.end_at && new Date(campaign.end_at).getTime() < now,
    ).length

    return {
      total: campaigns.length,
      active,
      scheduled,
      expired,
    }
  }, [campaigns])

  const filteredCampaigns = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    if (!keyword) return campaigns

    return campaigns.filter((campaign) =>
      [
        campaign.title,
        campaign.subtitle,
        campaign.coupon_code,
        campaign.button_text,
        campaign.link_url,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword)),
    )
  }, [campaigns, search])

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }))
    if (formError) setFormError('')
  }

  const handleCampaignImageSelect = async (file) => {
    if (!file) return

    setFormError('')

    try {
      const preparedImage = await prepareCampaignBannerImage(file)

      setForm((current) => ({
        ...current,
        banner_image_url: '',
        banner_preview_url: preparedImage.previewUrl,
        banner_upload_blob: preparedImage.blob,
        banner_upload_name: file.name,
        banner_upload_size: preparedImage.blob.size,
      }))
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Unable to prepare campaign banner image.',
      )
    }
  }

  const openNewCampaign = () => {
    setEditingCampaign(null)
    setForm(emptyCampaignForm)
    setFormError('')
    setShowForm(true)
  }

  const openEditCampaign = (campaign) => {
    setEditingCampaign(campaign)
    setForm({
      title: campaign.title || '',
      subtitle: campaign.subtitle || '',
      banner_image_url: campaign.banner_image_url || '',
      banner_preview_url: campaign.banner_image_url || '',
      banner_upload_blob: null,
      banner_upload_name: '',
      banner_upload_size: 0,
      button_text: campaign.button_text || 'View offer',
      button_target: getSafeButtonTarget(campaign.button_target || 'coupon'),
      coupon_code: campaign.coupon_code || '',
      link_url: campaign.link_url || '',
      start_date: datePart(campaign.start_at),
      start_time: timePart(campaign.start_at),
      end_date: datePart(campaign.end_at),
      end_time: timePart(campaign.end_at),
      sort_order: Number(campaign.sort_order || 0),
      is_active: Boolean(campaign.is_active),
    })
    setFormError('')
    setShowForm(true)
  }

  const saveCampaign = async () => {
    if (!restaurant?.id) return

    if (!form.title.trim()) {
      setFormError('Campaign title is required.')
      return
    }

    setSaving(true)
    setFormError('')

    let finalBannerImageUrl = form.banner_image_url?.trim() || null

    try {
      if (form.banner_upload_blob) {
        finalBannerImageUrl = await uploadCampaignBannerToR2({
          restaurantId: restaurant.id,
          imageBlob: form.banner_upload_blob,
          fileName: form.banner_upload_name || `${form.title}-campaign-banner.jpg`,
        })
      }
    } catch (error) {
      setSaving(false)
      setFormError(
        error instanceof Error
          ? error.message
          : 'Banner image upload failed. Please try again.',
      )
      return
    }

    const payload = {
      restaurant_id: restaurant.id,
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      banner_image_url: finalBannerImageUrl,
      button_text: form.button_text.trim() || null,
      button_target: form.button_target || 'coupon',
      coupon_code: form.coupon_code.trim().toUpperCase() || null,
      link_url: form.link_url.trim() || null,
      start_at: buildDateTime(form.start_date, form.start_time),
      end_at: buildDateTime(form.end_date, form.end_time),
      sort_order: Number(form.sort_order || 0),
      is_active: Boolean(form.is_active),
      updated_at: new Date().toISOString(),
    }

    let error = null

    if (editingCampaign?.id) {
      const result = await supabase
        .from('restaurant_campaigns')
        .update(payload)
        .eq('id', editingCampaign.id)

      error = result.error
    } else {
      const result = await supabase.from('restaurant_campaigns').insert(payload)
      error = result.error
    }

    setSaving(false)

    if (error) {
      setFormError(error.message || 'Unable to save campaign.')
      return
    }

    setShowForm(false)
    setEditingCampaign(null)
    setForm(emptyCampaignForm)
    await loadCampaigns()
  }

  const toggleCampaign = async (campaign) => {
    const { error } = await supabase
      .from('restaurant_campaigns')
      .update({
        is_active: !campaign.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)

    if (error) return

    setCampaigns((current) =>
      current.map((item) =>
        item.id === campaign.id
          ? { ...item, is_active: !campaign.is_active }
          : item,
      ),
    )
  }

  const deleteCampaign = async (campaign) => {
    const { error } = await supabase
      .from('restaurant_campaigns')
      .update({
        is_deleted: true,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)

    if (error) return

    setCampaigns((current) => current.filter((item) => item.id !== campaign.id))
  }

  if (loading) {
    return (
      <section className="management-section campaigns-screen">
        <div className="campaigns-empty-state">
          <Megaphone size={38} />
          <h2>Loading campaigns...</h2>
          <p>Please wait while Spizy prepares campaign banners.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="management-section campaigns-screen">
      <header className="campaigns-header">
        <div>
          <p className="section-kicker">Campaigns</p>
          <h2>Banner and countdown campaigns</h2>
          <span>
            Create promotional banners for QR menu, coupon campaigns and limited
            time offers.
          </span>
        </div>

        <div className="campaigns-header-actions">
          <button type="button" className="campaigns-refresh" onClick={loadCampaigns}>
            <RefreshCcw size={16} />
            Refresh
          </button>

          <button type="button" className="campaigns-add-button" onClick={openNewCampaign}>
            <Plus size={16} />
            Add campaign
          </button>
        </div>
      </header>

      <div className="campaigns-stats-grid">
        <CampaignStat label="Total campaigns" value={stats.total} />
        <CampaignStat label="Live now" value={stats.active} />
        <CampaignStat label="Scheduled" value={stats.scheduled} />
        <CampaignStat label="Expired" value={stats.expired} />
      </div>

      <div className="campaigns-toolbar">
        <div className="campaigns-search">
          <Search size={16} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search campaign title, coupon or link..."
          />
        </div>
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="campaigns-empty-state">
          <Megaphone size={38} />
          <h2>No campaigns yet</h2>
          <p>
            Add a promotional banner to show offers on the public QR menu.
          </p>
        </div>
      ) : (
        <div className="campaigns-list-card">
          <div className="campaigns-table-head">
            <span>Campaign</span>
            <span>Timing</span>
            <span>Action</span>
            <span>Status</span>
          </div>

          <div className="campaigns-table-body">
            {filteredCampaigns.map((campaign) => (
              <CampaignRow
                campaign={campaign}
                key={campaign.id}
                onEdit={openEditCampaign}
                onToggle={toggleCampaign}
                onDelete={deleteCampaign}
              />
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <CampaignFormModal
          form={form}
          editing={Boolean(editingCampaign)}
          saving={saving}
          formError={formError}
          onClose={() => {
            setShowForm(false)
            setEditingCampaign(null)
            setForm(emptyCampaignForm)
            setFormError('')
          }}
          onChange={updateForm}
          onImageSelect={handleCampaignImageSelect}
          onSave={saveCampaign}
        />
      )}
    </section>
  )
}

function CampaignStat({ label, value }) {
  return (
    <div className="campaign-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function CampaignRow({ campaign, onEdit, onToggle, onDelete }) {
  const now = Date.now()
  const live = campaign.is_active && isCampaignLive(campaign, now)

  return (
    <article className={`campaign-row ${live ? 'live' : ''}`}>
      <div className="campaign-cell campaign-main-cell">
        <div className="campaign-thumb">
          {campaign.banner_image_url ? (
            <img src={campaign.banner_image_url} alt={campaign.title} />
          ) : (
            <ImagePlus size={22} />
          )}
        </div>

        <div>
          <strong>{campaign.title}</strong>
          <span>{campaign.subtitle || 'No subtitle'}</span>
          <div className="campaign-row-actions">
            <button type="button" onClick={() => onEdit(campaign)}>
              <Pencil size={14} />
              Edit
            </button>
            <button type="button" className="danger" onClick={() => onDelete(campaign)}>
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      </div>

      <div className="campaign-cell">
        <strong>{formatCampaignWindow(campaign)}</strong>
        <span>{campaign.end_at ? getCampaignCountdown(campaign.end_at) : 'No countdown'}</span>
      </div>

      <div className="campaign-cell">
        <strong>{formatCampaignTarget(campaign)}</strong>
        <span>{campaign.coupon_code || campaign.link_url || campaign.button_text || 'No action'}</span>
      </div>

      <div className="campaign-status-cell">
        <button
          type="button"
          className={`campaign-status-toggle ${campaign.is_active ? 'active' : ''}`}
          onClick={() => onToggle(campaign)}
        >
          {campaign.is_active ? <Eye size={15} /> : <EyeOff size={15} />}
          {campaign.is_active ? 'Active' : 'Hidden'}
        </button>
      </div>
    </article>
  )
}

function CampaignFormModal({
  form,
  editing,
  saving,
  formError,
  onClose,
  onChange,
  onImageSelect,
  onSave,
}) {
  return (
    <div className="campaign-modal-overlay" onClick={onClose}>
      <div className="campaign-modal" onClick={(event) => event.stopPropagation()}>
        <div className="campaign-modal-head">
          <div>
            <p className="section-kicker">{editing ? 'Edit campaign' : 'New campaign'}</p>
            <h2>{editing ? 'Update banner offer' : 'Create banner offer'}</h2>
            <span>Show this campaign on the customer QR menu when active.</span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="campaign-form-grid">
          <label className="full">
            Campaign title
            <input
              type="text"
              value={form.title}
              onChange={(event) => onChange('title', event.target.value)}
              placeholder="Weekend biryani offer"
            />
          </label>

          <label className="full">
            Subtitle
            <textarea
              value={form.subtitle}
              onChange={(event) => onChange('subtitle', event.target.value)}
              placeholder="Limited time offer available today."
              rows="3"
            />
          </label>

          <div className="campaign-image-upload-card full">
            <div className="campaign-image-upload-info">
              <div>
                <strong>Campaign banner image</strong>
                <span>
                  Recommended size: 1600 × 640 px. Wide banner suitable for
                  desktop and mobile. Wrong sizes are auto-cropped to this ratio.
                </span>
                <small>
                  Upload JPG, PNG or WebP up to 6 MB. Spizy optimizes the final
                  image for fast loading and lower storage use.
                </small>
              </div>

              <label className="campaign-upload-button">
                <UploadCloud size={17} />
                Upload banner
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => onImageSelect(event.target.files?.[0])}
                />
              </label>
            </div>

            <div className="campaign-image-preview">
              {form.banner_preview_url || form.banner_image_url ? (
                <img
                  src={form.banner_preview_url || form.banner_image_url}
                  alt="Campaign banner preview"
                />
              ) : (
                <div>
                  <ImagePlus size={28} />
                  <span>1600 × 640 px</span>
                </div>
              )}
            </div>

            {form.banner_upload_name && (
              <div className="campaign-upload-meta">
                Prepared: {form.banner_upload_name} •{' '}
                {formatFileSize(form.banner_upload_size)} final image
              </div>
            )}
          </div>

          <label>
            Button action
            <select
              value={form.button_target}
              onChange={(event) => onChange('button_target', event.target.value)}
            >
              {buttonTargetOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Button text
            <input
              type="text"
              value={form.button_text}
              onChange={(event) => onChange('button_text', event.target.value)}
              placeholder="View offer"
            />
          </label>

          <label>
            Coupon code
            <input
              type="text"
              value={form.coupon_code}
              onChange={(event) => onChange('coupon_code', event.target.value.toUpperCase())}
              placeholder="SAVE10"
            />
          </label>

          <label>
            External link
            <input
              type="url"
              value={form.link_url}
              onChange={(event) => onChange('link_url', event.target.value)}
              placeholder="https://..."
            />
          </label>

          <div className="campaign-date-group">
            <strong>Start date/time</strong>
            <div>
              <PickerInput
                type="date"
                value={form.start_date}
                placeholder="Select start date"
                icon={CalendarClock}
                onChange={(value) => onChange('start_date', value)}
              />
              <PickerInput
                type="time"
                value={form.start_time}
                placeholder="Select time"
                icon={Timer}
                onChange={(value) => onChange('start_time', value)}
              />
            </div>
          </div>

          <div className="campaign-date-group">
            <strong>End date/time</strong>
            <div>
              <PickerInput
                type="date"
                value={form.end_date}
                placeholder="Select end date"
                icon={CalendarClock}
                onChange={(value) => onChange('end_date', value)}
              />
              <PickerInput
                type="time"
                value={form.end_time}
                placeholder="Select time"
                icon={Timer}
                onChange={(value) => onChange('end_time', value)}
              />
            </div>
          </div>

          <label>
            Sort order
            <input
              type="number"
              value={form.sort_order}
              onChange={(event) => onChange('sort_order', event.target.value)}
            />
          </label>
        </div>

        {formError && <div className="campaign-form-error">{formError}</div>}

        <div className="campaign-preview-card">
          <div>
            <span>Preview</span>
            <strong>{form.title || 'Campaign title'}</strong>
            <p>{form.subtitle || 'Campaign subtitle will appear here.'}</p>
          </div>
          {form.button_target !== 'none' && (
            <button type="button">{form.button_text || 'View offer'}</button>
          )}
        </div>

        <div className="campaign-modal-actions">
          <button
            type="button"
            className={`campaign-active-toggle ${form.is_active ? 'active' : ''}`}
            onClick={() => onChange('is_active', !form.is_active)}
          >
            {form.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
            {form.is_active ? 'Campaign active' : 'Campaign hidden'}
          </button>

          <button
            type="button"
            className="campaign-save-button"
            onClick={onSave}
            disabled={saving || !form.title.trim()}
          >
            <Save size={16} />
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Create campaign'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PickerInput({ type, value, placeholder, icon: Icon, onChange }) {
  const inputRef = useRef(null)

  const openPicker = () => {
    const input = inputRef.current

    if (!input) return

    input.focus()

    if (typeof input.showPicker === 'function') {
      input.showPicker()
    }
  }

  return (
    <button
      type="button"
      className={`campaign-picker-field ${value ? 'selected' : ''}`}
      onClick={openPicker}
    >
      <Icon size={16} />
      <span>{value ? formatPickerValue(type, value) : placeholder}</span>
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => event.currentTarget.showPicker?.()}
        onFocus={(event) => event.currentTarget.showPicker?.()}
        tabIndex={-1}
        aria-label={placeholder}
      />
    </button>
  )
}


async function prepareCampaignBannerImage(file) {
  const maxSourceSizeBytes = 6 * 1024 * 1024
  const targetWidth = 1600
  const targetHeight = 640
  const targetAspect = targetWidth / targetHeight

  if (!file.type?.startsWith('image/')) {
    throw new Error('Please upload a valid image file.')
  }

  if (file.size > maxSourceSizeBytes) {
    throw new Error('Banner image should be below 6 MB before optimization.')
  }

  const image = await loadImageFromFile(file)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Image processing is not available in this browser.')
  }

  canvas.width = targetWidth
  canvas.height = targetHeight

  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const sourceAspect = sourceWidth / sourceHeight

  let cropX = 0
  let cropY = 0
  let cropWidth = sourceWidth
  let cropHeight = sourceHeight

  if (sourceAspect > targetAspect) {
    cropWidth = sourceHeight * targetAspect
    cropX = (sourceWidth - cropWidth) / 2
  } else if (sourceAspect < targetAspect) {
    cropHeight = sourceWidth / targetAspect
    cropY = (sourceHeight - cropHeight) / 2
  }

  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  )

  let quality = 0.84
  let blob = await canvasToBlob(canvas, quality)

  while (blob.size > 750 * 1024 && quality > 0.58) {
    quality -= 0.08
    blob = await canvasToBlob(canvas, quality)
  }

  if (blob.size > 1100 * 1024) {
    throw new Error('Optimized banner is still too large. Please upload a simpler image.')
  }

  return {
    blob,
    previewUrl: canvas.toDataURL('image/jpeg', 0.76),
  }
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Unable to read the selected image.'))
    }

    image.src = objectUrl
  })
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Unable to optimize banner image.'))
          return
        }

        resolve(blob)
      },
      'image/jpeg',
      quality,
    )
  })
}

async function uploadCampaignBannerToR2({ restaurantId, imageBlob, fileName }) {
  const cleanFileName = String(fileName || 'campaign-banner.jpg')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const { data, error } = await supabase.functions.invoke('create-r2-upload-url', {
    body: {
      restaurantId,
      fileType: imageBlob.type || 'image/jpeg',
      fileName: cleanFileName || 'campaign-banner.jpg',
    },
  })

  if (error) {
    throw new Error(error.message || 'Image upload URL failed.')
  }

  if (!data?.uploadUrl || !data?.publicUrl) {
    throw new Error('Storage did not return a valid upload URL.')
  }

  const uploadResponse = await fetch(data.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': imageBlob.type || 'image/jpeg',
    },
    body: imageBlob,
  })

  if (!uploadResponse.ok) {
    throw new Error('Banner image upload failed. Please try again.')
  }

  return data.publicUrl
}

function formatFileSize(size) {
  const bytes = Number(size || 0)

  if (bytes <= 0) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getSafeButtonTarget(value) {
  return buttonTargetOptions.some((option) => option.value === value)
    ? value
    : 'coupon'
}

function formatPickerValue(type, value) {
  if (!value) return ''

  if (type === 'time') return value

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${value}T00:00:00`))
  } catch {
    return value
  }
}

function isCampaignLive(campaign, now = Date.now()) {
  const startOk = !campaign.start_at || new Date(campaign.start_at).getTime() <= now
  const endOk = !campaign.end_at || new Date(campaign.end_at).getTime() >= now

  return startOk && endOk
}

function formatCampaignWindow(campaign) {
  if (!campaign.start_at && !campaign.end_at) return 'Always available'
  if (campaign.start_at && !campaign.end_at) return `Starts ${formatShortDate(campaign.start_at)}`
  if (!campaign.start_at && campaign.end_at) return `Ends ${formatShortDate(campaign.end_at)}`

  return `${formatShortDate(campaign.start_at)} → ${formatShortDate(campaign.end_at)}`
}

function getCampaignCountdown(endAt) {
  if (!endAt) return 'No end date'

  const diff = new Date(endAt).getTime() - Date.now()

  if (diff <= 0) return 'Expired'

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days} day${days === 1 ? '' : 's'} left`
  if (hours > 0) return `${hours} hour${hours === 1 ? '' : 's'} left`
  return `${Math.max(minutes, 1)} minute${minutes === 1 ? '' : 's'} left`
}

function formatCampaignTarget(campaign) {
  if (campaign.button_target === 'coupon') return 'Coupon offer'
  if (campaign.button_target === 'cart') return 'Open cart'
  if (campaign.button_target === 'recipes') return 'View recipes'
  if (campaign.button_target === 'link') return 'External link'
  return 'Banner only'
}

function formatShortDate(value) {
  if (!value) return 'Not set'

  try {
    return new Intl.DateTimeFormat('en-AE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return 'Not set'
  }
}

function datePart(value) {
  if (!value) return ''
  return new Date(value).toISOString().slice(0, 10)
}

function timePart(value) {
  if (!value) return ''
  return new Date(value).toISOString().slice(11, 16)
}

function buildDateTime(dateValue, timeValue) {
  if (!dateValue) return null

  const safeTime = timeValue || '00:00'
  const date = new Date(`${dateValue}T${safeTime}:00`)

  if (Number.isNaN(date.getTime())) return null

  return date.toISOString()
}

export default CampaignsManagement
