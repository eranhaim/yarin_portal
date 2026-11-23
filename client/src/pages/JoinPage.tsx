import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { Icon } from '../components/Icon'
import { Mascot } from '../components/mascot/Mascot'
import { api, ApiError, errorMessage } from '../lib/api'
import type { Host, Look } from '../lib/types'
import './JoinPage.css'

// The "bring a friend" landing page: a friend's link opens it, and the visitor leaves their details.

type Invite = { referrer: { firstName: string; look: Look }; hosts: Host[] }

export function JoinPage() {
  const { code } = useParams()
  const [invite, setInvite] = useState<Invite | null>(null)
  const [missing, setMissing] = useState(false)
  const [fields, setFields] = useState({ name: '', phone: '', email: '', note: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    api<Invite>(`/public/join/${code}`)
      .then(setInvite)
      .catch(() => setMissing(true))
  }, [code])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setErrors({})
    try {
      await api(`/public/join/${code}`, { body: fields })
      setSent(true)
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields)
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (missing) {
    return (
      <div className="join join--center">
        <h1 className="join__title">הקישור לא תקין</h1>
        <p>בקשו מהחבר/ה קישור חדש.</p>
      </div>
    )
  }

  return (
    <div className="join">
      <section className="join__hero">
        <div className="join__sky" aria-hidden="true" />
        {invite && (
          <Mascot
            className="join__cast"
            cast={[
              { look: invite.hosts[0]?.look ?? invite.referrer.look, pose: 'boss', base: false },
              { look: invite.referrer.look, pose: 'wave', base: false },
              { look: invite.hosts[1]?.look ?? invite.referrer.look, pose: 'boss', base: false },
            ]}
          />
        )}
        <div className="join__pitch">
          <span className="join__eyebrow">הזמנה אישית</span>
          <h1 className="join__title">{invite ? `${invite.referrer.firstName} מזמין/ה אותך למשחק` : '…'}</h1>
          <p>הליווי העסקי של ירין ואורן: 6 חודשים שהופכים עסק קטן למכונה. משימות, סרטונים, מאמנים חכמים, והדרך ל-₪100,000 בחודש.</p>
        </div>
      </section>

      <main className="join__form-wrap">
        {sent ? (
          <div className="join__card join__done">
            <Icon name="check" size={36} />
            <h2>קיבלנו!</h2>
            <p>ירין או אורן יחזרו אליך בקרוב. בינתיים, {invite?.referrer.firstName} כבר קיבל/ה נקודות על ההזמנה.</p>
          </div>
        ) : (
          <form className="join__card" onSubmit={(e) => void submit(e)} noValidate>
            <h2>רוצים לשמוע עוד?</h2>
            <p>השאירו פרטים ונחזור אליכם לשיחת היכרות קצרה.</p>
            {error && (
              <div className="alert alert--error" role="alert">
                <Icon name="alert" size={18} /> {error}
              </div>
            )}
            <label className="field">
              <span className="field__label">שם מלא</span>
              <input className="input" value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} required autoComplete="name" />
              {errors.name && <span className="field__error">{errors.name}</span>}
            </label>
            <label className="field">
              <span className="field__label">טלפון</span>
              <input className="input" type="tel" value={fields.phone} onChange={(e) => setFields({ ...fields, phone: e.target.value })} required autoComplete="tel" />
              {errors.phone && <span className="field__error">{errors.phone}</span>}
            </label>
            <label className="field">
              <span className="field__label">
                אימייל <small>(לא חובה)</small>
              </span>
              <input className="input" type="email" value={fields.email} onChange={(e) => setFields({ ...fields, email: e.target.value })} autoComplete="email" />
              {errors.email && <span className="field__error">{errors.email}</span>}
            </label>
            <label className="field">
              <span className="field__label">
                ספרו על העסק <small>(לא חובה)</small>
              </span>
              <textarea className="textarea" rows={3} value={fields.note} onChange={(e) => setFields({ ...fields, note: e.target.value })} />
            </label>
            <button type="submit" className="btn btn--game btn--lg btn--block" disabled={busy || !invite}>
              {busy ? <span className="spinner" /> : <Icon name="play" size={20} />} אני בפנים
            </button>
          </form>
        )}
      </main>
    </div>
  )
}
