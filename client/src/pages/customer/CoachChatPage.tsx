import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { COACH_META, COACH_TITLES, missionLabel } from '../../lib/game'
import type { CoachAttachment, CoachEvaluation, CoachSession, CoachWork } from '../../lib/types'
import './coach.css'
import { useCustomer } from './customerContext'
import './mission/mission.css'

// One session with a coach: a role play, a check of real work (files, screenshots, recordings or worksheets),
// or a talk. It ends with scores by skill area and one next step.

const ACCEPT = 'image/*,application/pdf,.docx,.pptx,.xlsx,.txt,.csv,video/*,audio/*'
const MAX_FILE = 60 * 1024 * 1024

export function CoachChatPage() {
  const { id } = useParams()
  return <CoachChat key={id} id={id!} />
}

function CoachChat({ id }: { id: string }) {
  const { refreshGame } = useCustomer()
  const [session, setSession] = useState<CoachSession | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<CoachAttachment[]>([])
  const [work, setWork] = useState<CoachWork[]>([])
  const [picking, setPicking] = useState<CoachWork[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState<'send' | 'score' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api<{ session: CoachSession }>(`/me/coach/${id}`)
      .then((res) => setSession(res.session))
      .catch((err) => setError(errorMessage(err)))
  }, [id])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [session?.messages.length, busy])

  if (!session) {
    return error ? (
      <div className="cx-empty">
        <h2>{error}</h2>
        <Link to="/coach" className="btn btn--game">
          למאמנים
        </Link>
      </div>
    ) : (
      <div className="page-loader">
        <span className="spinner" />
      </div>
    )
  }

  const meta = COACH_META[session.persona]
  const roleplay = session.scenario !== null
  const userTurns = session.messages.filter((m) => m.role === 'user').length
  const canWork = !roleplay && session.persona !== 'mental'
  const empty = !text.trim() && files.length === 0 && work.length === 0

  const upload = async (list: File[]) => {
    setUploading(true)
    setError(null)
    try {
      for (const file of list.slice(0, 4 - files.length)) {
        if (file.size > MAX_FILE) throw new Error('אפשר לצרף קובץ עד 60MB. סרטון גדול יותר אפשר להגיש במשימה ולצרף משם.')
        const res = await fetch(`/api/me/coach/${session.id}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': file.type && file.type !== 'application/json' ? file.type : 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
          body: file,
        })
        const data = (await res.json().catch(() => ({}))) as { attachment?: CoachAttachment; error?: string }
        if (!res.ok || !data.attachment) throw new Error(data.error ?? 'ההעלאה נכשלה')
        setFiles((all) => [...all, data.attachment!])
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const openPicker = async () => {
    setError(null)
    try {
      const res = await api<{ work: CoachWork[] }>('/me/coach-work')
      setPicking(res.work)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (empty || busy) return
    const before = session
    const message = text.trim()
    setBusy('send')
    setError(null)
    setNotice(null)
    // Show the message right away; the reply follows.
    setSession({
      ...session,
      messages: [
        ...session.messages,
        { role: 'user', text: message || 'צירפתי את העבודה.', at: new Date().toISOString(), attachments: [...files, ...work.map((w) => ({ id: w.id, name: w.title }))] },
      ],
    })
    setText('')
    try {
      const res = await api<{ session: CoachSession; skipped: string[] }>(`/me/coach/${session.id}/message`, {
        body: { text: message, attachments: files, work: work.map(({ kind, id: workId }) => ({ kind, id: workId })) },
      })
      setSession(res.session)
      setFiles([])
      setWork([])
      if (res.skipped.length) setNotice(`לא הצלחנו לפתוח: ${res.skipped.join(', ')}`)
      if (session.persona === 'mental') void refreshGame()
    } catch (err) {
      setError(errorMessage(err))
      setSession(before)
      setText(message)
    } finally {
      setBusy(null)
    }
  }

  const finish = async () => {
    setBusy('score')
    setError(null)
    try {
      const res = await api<{ session: CoachSession }>(`/me/coach/${session.id}/evaluate`, { method: 'POST' })
      setSession(res.session)
      void refreshGame()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="coach-chat" style={{ '--c': meta.color } as CSSProperties}>
      <Link to="/coach" className="cx-back">
        <Icon name="arrowLeft" size={16} /> המאמנים
      </Link>
      <header className="coach-chat__head">
        <span className="coach-card__icon">
          <Icon name={meta.icon} size={22} />
        </span>
        <div>
          <h1>{session.title}</h1>
          <p>
            {COACH_TITLES[session.persona]}
            {session.scenario && ` · ${session.scenario.clientName} · ${session.scenario.difficulty}`}
          </p>
        </div>
        <button type="button" className="btn btn--game" onClick={() => void finish()} disabled={busy !== null || userTurns < 2} title={userTurns < 2 ? 'כתבו לפחות שתי הודעות' : undefined}>
          {busy === 'score' ? <span className="spinner" /> : <Icon name="flag" size={17} />}
          {session.evaluation ? 'סיכום מחדש' : session.persona === 'mental' ? 'סיום וסיכום' : 'סיום וקבלת ציון'}
        </button>
      </header>

      {roleplay && session.messages.length <= 1 && <p className="coach-chat__hint">אתם מדברים עם לקוח. נהלו את השיחה כמו באמת: שאלו, הקשיבו, והציעו צעד הבא. בסוף מקבלים ניתוח.</p>}

      <div className="chat chat--coach" aria-live="polite">
        {session.messages.map((m, i) => (
          <div key={i} className={`chat__msg chat__msg--${m.role}`}>
            {m.role === 'assistant' && <span className="chat__who">{session.scenario?.clientName ?? COACH_TITLES[session.persona]}</span>}
            <Rich text={m.text} />
            {m.attachments.length > 0 && (
              <div className="chat__files">
                {m.attachments.map((a) => (
                  <span key={a.id}>
                    <Icon name="clip" size={13} /> <bdi>{a.name}</bdi>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy === 'send' && (
          <div className="chat__msg chat__msg--assistant chat__typing" aria-label="כותבים">
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={end} />
      </div>

      {session.evaluation && <Evaluation session={session} evaluation={session.evaluation} />}

      {notice && <div className="alert alert--info">{notice}</div>}
      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      <form className="composer" onSubmit={(e) => void send(e)}>
        {(files.length > 0 || work.length > 0 || uploading) && (
          <div className="composer__files">
            {files.map((f) => (
              <span key={f.id}>
                <Icon name="clip" size={14} /> <bdi>{f.name}</bdi>
                <button type="button" aria-label={`הסרת ${f.name}`} onClick={() => setFiles((all) => all.filter((x) => x.id !== f.id))}>
                  <Icon name="x" size={13} />
                </button>
              </span>
            ))}
            {work.map((w) => (
              <span key={w.id}>
                <Icon name="edit" size={14} /> {missionLabel(w.title, 1).label}
                <button type="button" aria-label={`הסרת ${w.title}`} onClick={() => setWork((all) => all.filter((x) => x.id !== w.id))}>
                  <Icon name="x" size={13} />
                </button>
              </span>
            ))}
            {uploading && (
              <span>
                <span className="spinner" /> מעלים…
              </span>
            )}
          </div>
        )}
        <textarea
          className="textarea"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={roleplay ? `מה עונים ל${session.scenario!.clientName}?` : 'כתבו הודעה…'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(e)
            }
          }}
        />
        <div className="composer__bar">
          {!roleplay && (
            <>
              <button type="button" className="btn btn--sm btn--ghost-light" onClick={() => input.current?.click()} disabled={uploading || files.length >= 4}>
                <Icon name="clip" size={15} /> קובץ
              </button>
              {canWork && (
                <button type="button" className="btn btn--sm btn--ghost-light" onClick={() => void openPicker()}>
                  <Icon name="list" size={15} /> מהעבודות שלי
                </button>
              )}
              <input
                ref={input}
                type="file"
                hidden
                multiple
                accept={ACCEPT}
                onChange={(e) => {
                  const list = [...(e.target.files ?? [])]
                  e.target.value = ''
                  if (list.length) void upload(list)
                }}
              />
            </>
          )}
          <button type="submit" className="btn btn--game" disabled={busy !== null || uploading || empty}>
            <Icon name="send" size={17} /> שליחה
          </button>
        </div>
      </form>

      {picking && (
        <WorkPicker
          items={picking}
          selected={work}
          onClose={() => setPicking(null)}
          onToggle={(w) => setWork((all) => (all.some((x) => x.id === w.id) ? all.filter((x) => x.id !== w.id) : [...all, w].slice(-3)))}
        />
      )}
    </div>
  )
}

/** Plain text with **bold** (the coaches use it for short titles). */
function Rich({ text }: { text: string }) {
  return (
    <p>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part))}
    </p>
  )
}

function Evaluation({ session, evaluation }: { session: CoachSession; evaluation: CoachEvaluation }) {
  const shown = evaluation.dimensions.filter((d) => d.score >= 0)
  const card = session.scenario?.card
  return (
    <section className="panel evaluation">
      <header>
        {evaluation.score !== null && (
          <span className="evaluation__score">
            <b>{evaluation.score}</b>
            <small>מתוך 100</small>
          </span>
        )}
        <div>
          <h2>{evaluation.score !== null ? 'הניתוח שלכם' : 'סיכום השיחה'}</h2>
          <p>{evaluation.summary}</p>
        </div>
      </header>

      {shown.length > 0 && (
        <ul className="evaluation__areas">
          {shown.map((d) => (
            <li key={d.key}>
              <div className="evaluation__area-head">
                <strong>{d.label}</strong>
                <i style={{ '--p': `${d.score}%` } as CSSProperties} />
                <b>{d.score}</b>
              </div>
              {d.evidence && <q>{d.evidence.replace(/^["'״„”]+|["'״„”]+$/g, '')}</q>}
              {d.better && (
                <p>
                  <small>עדיף:</small> {d.better}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {card && (
        <details className="evaluation__card">
          <summary>מה {card.name} באמת חשב/ה</summary>
          <dl>
            <dt>המטרה</dt>
            <dd>{card.goal}</dd>
            <dt>הספק האמיתי</dt>
            <dd>{card.hidden}</dd>
            <dt>מה היה משכנע</dt>
            <dd>{card.trigger}</dd>
          </dl>
        </details>
      )}

      <p className="evaluation__next">
        <Icon name="flag" size={17} />
        <span>
          <small>עד הפעם הבאה</small>
          {evaluation.nextStep}
        </span>
      </p>
    </section>
  )
}

function WorkPicker({ items, selected, onToggle, onClose }: { items: CoachWork[]; selected: CoachWork[]; onToggle: (work: CoachWork) => void; onClose: () => void }) {
  return (
    <div className="setup" role="dialog" aria-modal="true" aria-label="בחירת עבודה" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="setup__card">
        <h2>איזו עבודה לבדוק?</h2>
        {items.length === 0 ? (
          <p className="empty-note">עוד לא הגשתם עבודות.</p>
        ) : (
          <ul className="work-picker">
            {items.map((w) => {
              const on = selected.some((x) => x.id === w.id)
              return (
                <li key={`${w.kind}-${w.id}`}>
                  <button type="button" aria-pressed={on} onClick={() => onToggle(w)}>
                    <Icon name={on ? 'check' : w.kind === 'file' ? 'file' : 'edit'} size={17} />
                    <span>{w.kind === 'file' ? <bdi>{w.title}</bdi> : missionLabel(w.title, 1).label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="setup__actions">
          <button type="button" className="btn btn--game" onClick={onClose}>
            סיום
          </button>
        </div>
      </div>
    </div>
  )
}
