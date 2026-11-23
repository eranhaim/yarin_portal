import { useRef, useState } from 'react'
import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { LookEditor } from '../../components/mascot/LookEditor'
import { Mascot } from '../../components/mascot/Mascot'
import { api, errorMessage } from '../../lib/api'
import { DEFAULT_LOOK } from '../../lib/game'
import { squareImage } from '../../lib/media'
import type { CustomerSelf, Look } from '../../lib/types'
import { useCustomer } from './customerContext'

// The character creator: every customer designs a character that looks like them,
// by hand or from their profile photo (Claude reads the photo and picks the features).

export function CharacterPage() {
  const { me, look: saved, setLook, setMe } = useCustomer()
  const [look, setDraft] = useState<Look>(saved ?? DEFAULT_LOOK)
  const [busy, setBusy] = useState<'save' | 'photo' | 'detect' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hop, setHop] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const dirty = JSON.stringify(look) !== JSON.stringify(saved)

  const set = <K extends keyof Look>(key: K, value: Look[K]) => {
    setDraft((l) => ({ ...l, [key]: value }))
    setHop((n) => n + 1)
  }

  const save = async () => {
    setBusy('save')
    setError(null)
    try {
      const res = await api<{ look: Look }>('/me/look', { method: 'PUT', body: { look } })
      setLook(res.look)
      setMessage('הדמות נשמרה! היא כבר מסתובבת בעיר.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const detect = async () => {
    setBusy('detect')
    setError(null)
    setMessage(null)
    try {
      const res = await api<{ look: Look }>('/me/look/detect', { method: 'POST' })
      setDraft(res.look)
      setHop((n) => n + 1)
      setMessage('הבוט יצר דמות לפי התמונה. אהבתם? לחצו על שמירה.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return
    setBusy('photo')
    setError(null)
    try {
      const blob = await squareImage(file)
      const res = await api<{ customer: CustomerSelf }>('/me/photo', { method: 'PUT', raw: blob })
      setMe(res.customer)
      setBusy(null)
      await detect()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(null)
    }
  }

  return (
    <div className="character-page">
      <header className="page-head">
        <span className="gta-eyebrow">הדמות שלכם בעיר</span>
        <h1 className="gta-title">עיצוב הדמות</h1>
        <p>העלו תמונה והבוט ייצור דמות שדומה לכם, או עצבו בעצמכם.</p>
      </header>

      <div className="character-studio">
        <div className="character-studio__stage">
          <Mascot className="character-studio__mascot" look={look} pose="idle" hopKey={hop} />
          <div className="character-studio__photo">
            <Avatar name={me.name} url={me.avatarUrl} size={72} />
            <div>
              <strong>תמונת פרופיל</strong>
              <div className="character-studio__photo-actions">
                <button type="button" className="btn btn--sm" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
                  {busy === 'photo' ? <span className="spinner" /> : <Icon name="upload" size={15} />}
                  {me.avatarUrl ? 'החלפת תמונה' : 'העלאת תמונה'}
                </button>
                {me.avatarUrl && (
                  <button type="button" className="btn btn--sm btn--game" onClick={() => void detect()} disabled={busy !== null}>
                    {busy === 'detect' ? <span className="spinner" /> : <Icon name="sparkles" size={15} />}
                    {busy === 'detect' ? 'הבוט מעצב…' : 'דמות מהתמונה'}
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
                void uploadPhoto(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
        </div>

        <div className="character-studio__controls panel">
          <LookEditor look={look} onChange={set} />

          {message && <div className="alert alert--info">{message}</div>}
          {error && (
            <div className="alert alert--error" role="alert">
              <Icon name="alert" size={18} /> {error}
            </div>
          )}

          <button type="button" className="btn btn--game btn--lg btn--block" onClick={() => void save()} disabled={busy !== null || !dirty}>
            {busy === 'save' ? <span className="spinner" /> : <Icon name="check" size={20} />}
            {dirty ? 'שמירת הדמות' : 'הדמות שמורה'}
          </button>
        </div>
      </div>
    </div>
  )
}
