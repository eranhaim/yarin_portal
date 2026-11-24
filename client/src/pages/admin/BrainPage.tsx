import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import type { Brain, BrainCoach, BrainItem, CoachPersona } from '../../lib/types'
import { contentTypeOf, putFile } from '../../lib/upload'
import { canRecord, clock, useRecorder } from '../../lib/voice'

// The brain: everything the coaches know. Yarin and Oren add text, documents and recordings; the AI turns them into
// teaching notes that can be edited. New knowledge reaches customers after the coaches pass their tests with it.

const ACCEPT = 'application/pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,image/*,audio/*,video/*'

export function BrainPage() {
  const [brain, setBrain] = useState<Brain | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const load = useCallback(async () => {
    try {
      setBrain(await api<Brain>('/admin/brain'))
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // While the AI learns or a coach is tested, the page follows.
  const busy = brain ? brain.items.some((i) => i.status === 'processing') || brain.coaches.some((c) => c.running) : false
  useEffect(() => {
    if (!busy) return
    const timer = window.setInterval(() => void load(), 4000)
    return () => window.clearInterval(timer)
  }, [busy, load])

  const waiting = brain?.coaches.filter((c) => (c.waiting || !c.released) && !c.running) ?? []

  const test = async () => {
    setTesting(true)
    setError(null)
    try {
      for (const c of waiting) await api(`/admin/lab/${c.key}/run`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>המוח</h1>
          <p>כל מה שהמאמנים יודעים. הוסיפו טקסט, מסמכים, מצגות או הקלטות שבהן אתם מסבירים, והם ילמדו את השיטה שלכם, במילים שלכם.</p>
        </div>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {!brain ? (
        !error && (
          <div className="page-loader">
            <span className="spinner" />
          </div>
        )
      ) : (
        <>
          <section className="adm-brain__sum">
            <div>
              <b>{brain.size.lessons}</b>
              <span>שיעורים</span>
              <small>{brain.size.lessonWords.toLocaleString('he-IL')} מילים של שיטה</small>
            </div>
            <div>
              <b>{brain.size.items}</b>
              <span>פריטים שהוספתם</span>
              <small>{brain.size.itemWords.toLocaleString('he-IL')} מילים</small>
            </div>
            {brain.coaches.map((c) => (
              <div key={c.key} className={`is-${c.running ? 'run' : c.waiting ? 'wait' : c.released ? 'open' : 'closed'}`}>
                <b className="adm-brain__state">
                  {c.running ? <span className="spinner" /> : <Icon name={c.waiting ? 'clock' : c.released ? 'check' : 'lock'} size={20} />}
                </b>
                <span>{c.title}</span>
                <small>{c.running ? 'בבדיקה עכשיו' : c.waiting ? 'ידע חדש מחכה לבדיקה' : c.released ? 'עובד עם כל הידע' : 'סגור עד שיעבור בדיקה'}</small>
              </div>
            ))}
          </section>

          {waiting.length > 0 && !busy && (
            <div className="adm-brain__release">
              <span>
                <strong>הידע השתנה.</strong> הלקוחות ממשיכים עם הידע הקודם, עד שהמאמנים יעברו את הבדיקות הקבועות עם החדש.
              </span>
              <button type="button" className="btn btn--primary" onClick={() => void test()} disabled={testing}>
                {testing ? <span className="spinner" /> : <Icon name="shield" size={17} />} בדיקה ופתיחה ללקוחות
              </button>
              <Link to="/admin/lab">למעבדה</Link>
            </div>
          )}

          <AddKnowledge brain={brain} onAdded={load} />

          {brain.items.length === 0 ? (
            <div className="adm-empty">
              <Icon name="brain" size={40} />
              <h2>עוד לא הוספתם ידע</h2>
              <p>המאמנים כבר יודעים את מה שנלמד בשיעורים. כאן מוסיפים את כל השאר: התסריטים, ההוקים, הסיפורים והכללים שלכם.</p>
            </div>
          ) : (
            <div className="adm-brain__list">
              {brain.items.map((item) => (
                <ItemCard key={item.id} item={item} coaches={brain.coaches} onChanged={load} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CoachPicker({ coaches, value, onChange, disabled }: { coaches: BrainCoach[]; value: CoachPersona[]; onChange: (value: CoachPersona[]) => void; disabled?: boolean }) {
  return (
    <div className="adm-content__audience">
      <span>מי לומד?</span>
      {coaches.map((c) => (
        <button key={c.key} type="button" aria-pressed={value.includes(c.key)} disabled={disabled} onClick={() => onChange(value.includes(c.key) ? value.filter((v) => v !== c.key) : [...value, c.key])}>
          {c.title}
        </button>
      ))}
      <small>{value.length === 0 ? 'כל המאמנים' : 'רק מי שמסומן'}</small>
    </div>
  )
}

type Way = 'text' | 'file' | 'voice'
const WAYS: { key: Way; label: string; icon: 'edit' | 'upload' | 'mic' }[] = [
  { key: 'text', label: 'טקסט', icon: 'edit' },
  { key: 'file', label: 'קבצים והקלטות', icon: 'upload' },
  { key: 'voice', label: 'מקליטים הסבר', icon: 'mic' },
]

function AddKnowledge({ brain, onAdded }: { brain: Brain; onAdded: () => Promise<void> }) {
  const [way, setWay] = useState<Way>('text')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [personas, setPersonas] = useState<CoachPersona[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRecorder()
  const input = useRef<HTMLInputElement>(null)

  const addText = async (e: FormEvent) => {
    e.preventDefault()
    setBusy('שומרים…')
    setError(null)
    try {
      await api('/admin/brain/text', { body: { title, text, personas } })
      setTitle('')
      setText('')
      await onAdded()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const addFiles = async (files: File[], voice: boolean) => {
    setError(null)
    try {
      for (const file of files) {
        setBusy(`מעלים את ${file.name}…`)
        const place = await api<{ item: BrainItem; upload: { url: string; headers: Record<string, string> } }>('/admin/brain/files', {
          body: { title: files.length === 1 ? title : '', name: file.name, contentType: contentTypeOf(file), size: file.size, voice, personas },
        })
        await putFile(place.upload.url, file, place.upload.headers, (p) => setBusy(`מעלים את ${file.name}: ${Math.round(p * 100)}%`))
        await api(`/admin/brain/${place.item.id}/learn`, { method: 'POST' })
      }
      setTitle('')
      await onAdded()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const keep = async () => {
    const recording = await recorder.stop(`הסבר ${new Date().toLocaleDateString('he-IL')}`)
    if (recording) await addFiles([recording.file], true)
  }

  return (
    <section className="adm-card adm-brain__add">
      <div className="adm-brain__ways" role="tablist" aria-label="איך מוסיפים ידע">
        {WAYS.map((w) => (
          <button key={w.key} type="button" role="tab" aria-selected={way === w.key} disabled={recorder.state !== 'idle'} onClick={() => setWay(w.key)}>
            <Icon name={w.icon} size={17} /> {w.label}
          </button>
        ))}
      </div>

      <label className="field">
        <span className="field__label">כותרת (לא חובה)</span>
        <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: 30 ההוקים שהכי עבדו לנו" />
      </label>
      <CoachPicker coaches={brain.coaches} value={personas} onChange={setPersonas} disabled={busy !== null} />

      {way === 'text' && (
        <form onSubmit={(e) => void addText(e)}>
          <textarea
            className="textarea"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="הדביקו כאן הכול: השיטה, שלבים, כללים, דוגמאות של הוקים ומסרים, תסריטי שיחה, סיפורים, מה לא לעשות…"
          />
          <button type="submit" className="btn btn--primary" disabled={busy !== null || text.trim().length < 30}>
            {busy ? <span className="spinner" /> : <Icon name="brain" size={17} />} {busy ?? 'להכניס למוח'}
          </button>
        </form>
      )}

      {way === 'file' && (
        <div
          className="adm-brain__drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const files = [...e.dataTransfer.files]
            if (files.length && !busy) void addFiles(files, false)
          }}
        >
          <Icon name="upload" size={30} />
          <p>PDF, Word, מצגות, טבלאות, תמונות, הקלטות של הרצאות ושיחות, וסרטונים.</p>
          <button type="button" className="btn btn--primary" onClick={() => input.current?.click()} disabled={busy !== null}>
            {busy ? <span className="spinner" /> : <Icon name="plus" size={17} />} {busy ?? 'בחירת קבצים'}
          </button>
          <input
            ref={input}
            type="file"
            hidden
            multiple
            accept={ACCEPT}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (files.length) void addFiles(files, false)
            }}
          />
        </div>
      )}

      {way === 'voice' && (
        <div className="adm-brain__voice">
          {!canRecord() ? (
            <p>הדפדפן הזה לא תומך בהקלטה. אפשר להקליט בטלפון ולהעלות את הקובץ.</p>
          ) : recorder.state === 'idle' ? (
            <>
              <p>מסבירים בקול, כמו לתלמיד: איך אתם בונים הוק, איך עונים ל„יקר לי”, מה הסדר הנכון. המוח מקשיב וכותב מזה חומר לימוד.</p>
              <button type="button" className="btn btn--primary" onClick={() => void recorder.start()} disabled={busy !== null}>
                {busy ? <span className="spinner" /> : <Icon name="mic" size={18} />} {busy ?? 'מתחילים להקליט'}
              </button>
            </>
          ) : (
            <>
              <i className="adm-brain__level" style={{ '--l': recorder.level } as CSSProperties} aria-hidden="true" />
              <b>{clock(recorder.seconds)}</b>
              <button type="button" className="btn btn--ghost" onClick={recorder.pause}>
                <Icon name={recorder.state === 'paused' ? 'play' : 'pause'} size={16} /> {recorder.state === 'paused' ? 'המשך' : 'השהיה'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={recorder.cancel}>
                ביטול
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void keep()}>
                <Icon name="brain" size={17} /> סיום ולימוד
              </button>
            </>
          )}
        </div>
      )}

      {way !== 'text' && brain.speech === 'local' && <small className="adm-brain__note">הקלטות מפוענחות בשרת, וזה לוקח בערך פי ארבעה מאורך ההקלטה. אפשר לסגור את הדף, הלמידה ממשיכה.</small>}
      {way !== 'text' && brain.speech === 'off' && <small className="adm-brain__note">זיהוי הדיבור לא פעיל בשרת, לכן הקלטות לא יילמדו. מסמכים ותמונות כן.</small>}
      {(error ?? recorder.error) && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error ?? recorder.error}
        </div>
      )}
    </section>
  )
}

function ItemCard({ item, coaches, onChanged }: { item: BrainItem; coaches: BrainCoach[]; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
      await onChanged()
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }
  const patch = (body: Partial<Pick<BrainItem, 'title' | 'personas' | 'method' | 'enabled'>>) => act(() => api(`/admin/brain/${item.id}`, { method: 'PATCH', body }))
  const words = item.method.split(/\s+/).filter(Boolean).length

  return (
    <article className={`adm-card adm-brain__item${item.enabled ? '' : ' is-off'}`}>
      <div className="adm-card__head">
        <div>
          <h2>{item.title}</h2>
          <p>
            <Icon name={item.source === 'text' ? 'edit' : item.source === 'voice' ? 'mic' : 'file'} size={14} /> {item.fileName || 'טקסט'} · {item.by} · {formatDateTime(item.createdAt)}
            {item.status === 'ready' && ` · ${words.toLocaleString('he-IL')} מילים`}
          </p>
        </div>
        <span className={`chip chip--${item.status === 'ready' ? (item.enabled ? 'success' : 'warn') : item.status === 'failed' ? 'danger' : 'brand'}`}>
          {item.status === 'ready' ? (item.enabled ? 'במוח' : 'כבוי') : item.status === 'failed' ? 'נכשל' : `לומד… ${item.progress > 0 ? `${Math.round(item.progress * 100)}%` : ''}`}
        </span>
      </div>

      {item.status === 'failed' && <div className="alert alert--error">{item.error}</div>}
      {item.status === 'ready' && (
        <>
          <CoachPicker coaches={coaches} value={item.personas} onChange={(personas) => void patch({ personas })} disabled={busy} />
          {draft === null ? (
            <details className="adm-brain__notes">
              <summary>מה המאמנים למדו מזה</summary>
              <pre>{item.method}</pre>
              {item.raw && (
                <details>
                  <summary>המקור</summary>
                  <pre>{item.raw}</pre>
                </details>
              )}
            </details>
          ) : (
            <textarea className="textarea" rows={14} value={draft} onChange={(e) => setDraft(e.target.value)} />
          )}
        </>
      )}
      {error && <div className="alert alert--error">{error}</div>}

      <div className="adm-brain__actions">
        {draft !== null ? (
          <>
            <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => void patch({ method: draft }).then((ok) => ok && setDraft(null))}>
              {busy ? <span className="spinner" /> : <Icon name="check" size={15} />} שמירה
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDraft(null)}>
              ביטול
            </button>
          </>
        ) : (
          <>
            {item.status === 'ready' && (
              <>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDraft(item.method)} disabled={busy}>
                  <Icon name="edit" size={15} /> עריכה
                </button>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => void patch({ enabled: !item.enabled })} disabled={busy}>
                  {item.enabled ? 'כיבוי' : 'הפעלה'}
                </button>
              </>
            )}
            {item.status !== 'processing' && (
              <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => void act(() => api(`/admin/brain/${item.id}/learn`, { method: 'POST' }))}>
                <Icon name="refresh" size={15} /> לימוד מחדש
              </button>
            )}
            <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => window.confirm('למחוק את הפריט מהמוח?') && void act(() => api(`/admin/brain/${item.id}`, { method: 'DELETE' }))}>
              <Icon name="trash" size={15} /> מחיקה
            </button>
          </>
        )}
      </div>
    </article>
  )
}
