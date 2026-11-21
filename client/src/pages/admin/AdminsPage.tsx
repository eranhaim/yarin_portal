import { useEffect, useState, type FormEvent } from 'react'
import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { api, ApiError, errorMessage } from '../../lib/api'
import { formatDate, formatDateTime } from '../../lib/format'
import type { AdminAccount, AdminIdentity } from '../../lib/types'

/** Admin accounts: add, change password, remove. Every admin sees the same panel and inbox. */
export function AdminsPage({ me }: { me: AdminIdentity }) {
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminAccount | 'new' | null>(null)

  useEffect(() => {
    api<{ admins: AdminAccount[] }>('/admin/admins')
      .then((res) => setAdmins(res.admins))
      .catch((err) => setError(errorMessage(err)))
  }, [])

  const remove = async (admin: AdminAccount) => {
    if (!window.confirm(`למחוק את המנהל ${admin.name}? הוא לא יוכל להיכנס יותר לפאנל הניהול.`)) return
    try {
      await api(`/admin/admins/${admin.id}`, { method: 'DELETE' })
      setAdmins((list) => (list ?? []).filter((a) => a.id !== admin.id))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>מנהלים</h1>
          <p>מי יכול להיכנס לפאנל הניהול. כל מנהל נכנס עם האימייל והסיסמה שלו, ורואה את כל הלקוחות, התוכניות וההגשות.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={18} /> מנהל חדש
        </button>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {admins === null && !error ? (
        <div className="page-loader">
          <span className="spinner" />
        </div>
      ) : (
        <ul className="adm-admins">
          {me.owner && (
            <li className="adm-admin adm-stagger">
              <span className="adm-admin__crown" aria-hidden="true">
                <Icon name="star" size={22} />
              </span>
              <div className="adm-admin__who">
                <strong>הסיסמה הראשית</strong>
                <small>כניסה בלי אימייל, עם הסיסמה מקובץ ההגדרות של השרת. אתם מחוברים איתה עכשיו.</small>
              </div>
            </li>
          )}
          {admins?.map((admin, i) => (
            <li key={admin.id} className="adm-admin adm-stagger" style={{ animationDelay: `${(i + 1) * 50}ms` }}>
              <Avatar name={admin.name} url={null} size={48} />
              <div className="adm-admin__who">
                <strong>
                  {admin.name} {admin.id === me.id && <span className="chip chip--brand">את/ה</span>}
                </strong>
                <small className="ltr">{admin.email}</small>
                <small>
                  נוסף ב-{formatDate(admin.createdAt)} · {admin.lastLoginAt ? `כניסה אחרונה ${formatDateTime(admin.lastLoginAt)}` : 'עדיין לא נכנס/ה'}
                </small>
              </div>
              <div className="adm-admin__actions">
                <button type="button" className="btn btn--sm" onClick={() => setEditing(admin)}>
                  <Icon name="edit" size={15} /> עריכה
                </button>
                {admin.id !== me.id && (
                  <button type="button" className="icon-btn icon-btn--danger" onClick={() => void remove(admin)} aria-label={`מחיקת ${admin.name}`} title="מחיקה">
                    <Icon name="trash" size={17} />
                  </button>
                )}
              </div>
            </li>
          ))}
          {admins?.length === 0 && <li className="empty-note">עדיין אין חשבונות מנהל. הוסיפו את הראשון.</li>}
        </ul>
      )}

      {editing && (
        <AdminFormModal
          admin={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setAdmins((list) => {
              const current = list ?? []
              return current.some((a) => a.id === saved.id)
                ? current.map((a) => (a.id === saved.id ? saved : a))
                : [...current, saved]
            })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

type FormProps = { admin?: AdminAccount; onClose: () => void; onSaved: (admin: AdminAccount) => void }

/** Mount only while open, so each opening starts with a fresh form. */
function AdminFormModal({ admin, onClose, onSaved }: FormProps) {
  const isEdit = Boolean(admin)
  const [name, setName] = useState(admin?.name ?? '')
  const [email, setEmail] = useState(admin?.email ?? '')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    setFormError(null)
    try {
      const body: Record<string, string> = { name, email }
      if (password) body.password = password
      const res = isEdit
        ? await api<{ admin: AdminAccount }>(`/admin/admins/${admin!.id}`, { method: 'PATCH', body })
        : await api<{ admin: AdminAccount }>('/admin/admins', { body })
      onSaved(res.admin)
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields)
      setFormError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `עריכת ${admin!.name}` : 'מנהל חדש'}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            ביטול
          </button>
          <button type="submit" form="admin-form" className="btn btn--primary" disabled={busy}>
            {busy && <span className="spinner" />}
            {isEdit ? 'שמירה' : 'הוספת מנהל'}
          </button>
        </>
      }
    >
      <form id="admin-form" className="adm-form" onSubmit={submit} noValidate>
        {formError && (
          <div className="alert alert--error" role="alert">
            <Icon name="alert" size={18} /> {formError}
          </div>
        )}
        <label className="field">
          <span className="field__label">שם *</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} autoFocus required />
          {errors.name && <span className="field__error">{errors.name}</span>}
        </label>
        <label className="field">
          <span className="field__label">אימייל *</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(errors.email)}
            autoComplete="off"
            required
          />
          {errors.email && <span className="field__error">{errors.email}</span>}
        </label>
        <label className="field">
          <span className="field__label">
            {isEdit ? 'סיסמה חדשה' : 'סיסמה *'} {isEdit && <small>(השאירו ריק כדי לא לשנות)</small>}
          </span>
          <span className="input-group">
            <input
              className="input"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errors.password)}
              autoComplete="new-password"
              placeholder="לפחות 6 תווים"
              required={!isEdit}
            />
            <button type="button" className="icon-btn input-group__addon" onClick={() => setShow((v) => !v)} aria-label={show ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'}>
              <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
            </button>
          </span>
          {errors.password && <span className="field__error">{errors.password}</span>}
          {isEdit && <span className="field__hint">סיסמה חדשה מנתקת את המנהל מכל המכשירים שבהם הוא מחובר.</span>}
        </label>
      </form>
    </Modal>
  )
}
