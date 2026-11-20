import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { api, ApiError, errorMessage } from '../../lib/api'
import { squareImage } from '../../lib/media'
import type { AdminCustomer, PlanListItem } from '../../lib/types'

/** Mount this only while it is open, so every opening starts with a fresh form. */
type Props = {
  open: boolean
  onClose: () => void
  /** Edit this customer; without it the form creates a new customer. */
  customer?: AdminCustomer
  plans: PlanListItem[]
  onSaved: (customer: AdminCustomer) => void
}

type Fields = {
  name: string
  email: string
  phone: string
  company: string
  notes: string
  password: string
  planId: string
  active: boolean
}

function initialFields(c?: AdminCustomer): Fields {
  return {
    name: c?.name ?? '',
    email: c?.email ?? '',
    phone: c?.phone ?? '',
    company: c?.company ?? '',
    notes: c?.notes ?? '',
    password: '',
    planId: c?.plan?.id ?? '',
    active: c?.active ?? true,
  }
}

function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const values = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(values, (v) => chars[v % chars.length]).join('')
}

export function CustomerFormModal({ open, onClose, customer, plans, onSaved }: Props) {
  const isEdit = Boolean(customer)
  const [fields, setFields] = useState<Fields>(() => initialFields(customer))
  const [avatar, setAvatar] = useState<{ blob: Blob; preview: string } | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => () => {
    if (avatar) URL.revokeObjectURL(avatar.preview)
  }, [avatar])

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: '' }))
  }

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return
    try {
      const blob = await squareImage(file)
      setAvatar({ blob, preview: URL.createObjectURL(blob) })
      setRemoveAvatar(false)
    } catch (err) {
      setFormError(errorMessage(err))
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setErrors({})

    const planChanged = fields.planId !== (customer?.plan?.id ?? '')
    if (isEdit && planChanged && customer?.plan) {
      const ok = window.confirm(
        `Change the plan of ${customer.name}? Their progress on “${customer.plan.title}” will be reset.`,
      )
      if (!ok) return
    }

    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        name: fields.name,
        email: fields.email,
        phone: fields.phone,
        company: fields.company,
        notes: fields.notes,
      }
      if (fields.password) body.password = fields.password
      if (isEdit) body.active = fields.active

      let saved = isEdit
        ? (await api<{ customer: AdminCustomer }>(`/admin/customers/${customer!.id}`, { method: 'PATCH', body })).customer
        : (await api<{ customer: AdminCustomer }>('/admin/customers', { body })).customer

      if (avatar) {
        saved = (await api<{ customer: AdminCustomer }>(`/admin/customers/${saved.id}/avatar`, { method: 'PUT', raw: avatar.blob }))
          .customer
      } else if (removeAvatar && customer?.avatarUrl) {
        saved = (await api<{ customer: AdminCustomer }>(`/admin/customers/${saved.id}/avatar`, { method: 'DELETE' })).customer
      }

      if (planChanged) {
        saved = (
          await api<{ customer: AdminCustomer }>(`/admin/customers/${saved.id}/plan`, {
            method: 'PUT',
            body: { planId: fields.planId || null },
          })
        ).customer
      }

      onSaved(saved)
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields)
      setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const avatarUrl = avatar?.preview ?? (removeAvatar ? null : customer?.avatarUrl)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Edit ${customer!.name}` : 'New customer'}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="customer-form" className="btn btn--primary" disabled={busy}>
            {busy && <span className="spinner" />}
            {isEdit ? 'Save changes' : 'Create customer'}
          </button>
        </>
      }
    >
      <form id="customer-form" className="adm-form" onSubmit={submit} noValidate>
        {formError && (
          <div className="alert alert--error" role="alert">
            <Icon name="alert" size={18} /> {formError}
          </div>
        )}

        <div className="adm-avatar-picker">
          <button
            type="button"
            className="adm-avatar-picker__button"
            onClick={() => fileInput.current?.click()}
            aria-label="Choose avatar image"
          >
            <Avatar name={fields.name || '?'} url={avatarUrl} size={96} />
            <span className="adm-avatar-picker__overlay">
              <Icon name="image" size={22} />
            </span>
          </button>
          <div className="adm-avatar-picker__text">
            <strong>Avatar</strong>
            <span>A square crop of the image is used. JPEG, PNG or WebP.</span>
            <div className="adm-avatar-picker__actions">
              <button type="button" className="btn btn--soft btn--sm" onClick={() => fileInput.current?.click()}>
                <Icon name="upload" size={15} /> {avatarUrl ? 'Change' : 'Upload'}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    setAvatar(null)
                    setRemoveAvatar(true)
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            hidden
            onChange={(e) => {
              void pickAvatar(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>

        <div className="adm-form__grid">
          <label className="field">
            <span className="field__label">Full name *</span>
            <input
              className="input"
              value={fields.name}
              onChange={(e) => set('name', e.target.value)}
              aria-invalid={Boolean(errors.name)}
              required
              autoFocus
            />
            {errors.name && <span className="field__error">{errors.name}</span>}
          </label>
          <label className="field">
            <span className="field__label">Business name</span>
            <input className="input" value={fields.company} onChange={(e) => set('company', e.target.value)} />
            {errors.company && <span className="field__error">{errors.company}</span>}
          </label>
          <label className="field">
            <span className="field__label">Email *</span>
            <input
              className="input"
              type="email"
              value={fields.email}
              onChange={(e) => set('email', e.target.value)}
              aria-invalid={Boolean(errors.email)}
              autoComplete="off"
              required
            />
            {errors.email && <span className="field__error">{errors.email}</span>}
          </label>
          <label className="field">
            <span className="field__label">Phone</span>
            <input
              className="input"
              type="tel"
              value={fields.phone}
              onChange={(e) => set('phone', e.target.value)}
              aria-invalid={Boolean(errors.phone)}
              placeholder="+972 50 000 0000"
            />
            {errors.phone && <span className="field__error">{errors.phone}</span>}
          </label>

          <label className="field">
            <span className="field__label">
              {isEdit ? 'New password' : 'Password *'} {isEdit && <small>(leave empty to keep the current one)</small>}
            </span>
            <span className="input-group adm-password">
              <input
                className="input"
                type={showPassword ? 'text' : 'password'}
                value={fields.password}
                onChange={(e) => set('password', e.target.value)}
                aria-invalid={Boolean(errors.password)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required={!isEdit}
              />
              <button
                type="button"
                className="icon-btn input-group__addon"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </span>
            <button
              type="button"
              className="adm-link-btn"
              onClick={() => {
                set('password', generatePassword())
                setShowPassword(true)
              }}
            >
              <Icon name="refresh" size={14} /> Generate a password
            </button>
            {errors.password && <span className="field__error">{errors.password}</span>}
          </label>

          <label className="field">
            <span className="field__label">Plan</span>
            <select className="select" value={fields.planId} onChange={(e) => set('planId', e.target.value)}>
              <option value="">No plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.chapterCount} levels)
                </option>
              ))}
            </select>
            <span className="field__hint">The customer sees this plan as a map of levels.</span>
          </label>
        </div>

        <label className="field">
          <span className="field__label">
            Notes <small>(only you see these)</small>
          </span>
          <textarea className="textarea" value={fields.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
        </label>

        {isEdit && (
          <label className="toggle">
            <input type="checkbox" checked={fields.active} onChange={(e) => set('active', e.target.checked)} />
            Active (the customer can sign in)
          </label>
        )}
      </form>
    </Modal>
  )
}
