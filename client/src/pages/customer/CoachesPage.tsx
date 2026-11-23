import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Icon, type IconName } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { COACH_TITLES } from '../../lib/game'
import type { CoachPersona, CoachSession, CoachSessionItem } from '../../lib/types'
import { useCustomer } from './customerContext'

// The AI coaches: a sales simulator (the bot plays a client), a script simulator and a mental coach.

const PERSONAS: Record<CoachPersona, { title: string; tagline: string; description: string; icon: IconName; color: string; scored: boolean }> = {
  sales: {
    title: COACH_TITLES.sales,
    tagline: 'הבוט הוא הלקוח. אתם סוגרים.',
    description: 'לקוח מציאותי עם התנגדויות אמיתיות: מחיר, זמן, אמון. בסוף מקבלים ציון ומשוב ממאמן מכירות.',
    icon: 'trophy',
    color: '#ffd84d',
    scored: true,
  },
  scripts: {
    title: COACH_TITLES.scripts,
    tagline: 'איש השיווק שלכם לסרטונים.',
    description: 'כותבים יחד תסריט לרילס: הוק, גוף וקריאה לפעולה. הבוט מבקר, משכתב ונותן ציון.',
    icon: 'edit',
    color: '#b18cff',
    scored: true,
  },
  mental: {
    title: COACH_TITLES.mental,
    tagline: 'ביטחון, התמדה, פחד ממכירה.',
    description: 'שיחה קצרה ומעשית שמסתיימת בצעד אחד קטן להיום. נקודות מנטליות על כל יום שמגיעים.',
    icon: 'gauge',
    color: '#2fe0b0',
    scored: false,
  },
}

export function CoachesPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<CoachSessionItem[] | null>(null)
  const [busy, setBusy] = useState<CoachPersona | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ sessions: CoachSessionItem[] }>('/me/coach')
      .then((res) => setSessions(res.sessions))
      .catch((err) => setError(errorMessage(err)))
  }, [])

  const start = async (persona: CoachPersona) => {
    setBusy(persona)
    setError(null)
    try {
      const res = await api<{ session: CoachSession }>('/me/coach', { body: { persona } })
      navigate(`/coach/${res.session.id}`)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(null)
    }
  }

  return (
    <div className="coaches-page">
      <header className="page-head">
        <span className="gta-eyebrow">חדר האימונים</span>
        <h1 className="gta-title">המאמנים</h1>
        <p>מתאמנים מול בוטים שמכירים את העסק שלכם, וצוברים נקודות סקיל.</p>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      <ul className="coach-cards">
        {(Object.keys(PERSONAS) as CoachPersona[]).map((key, i) => {
          const p = PERSONAS[key]
          return (
            <li key={key} className="coach-card" style={{ '--c': p.color, animationDelay: `${i * 90}ms` } as CSSProperties}>
              <span className="coach-card__icon">
                <Icon name={p.icon} size={30} />
              </span>
              <h2>{p.title}</h2>
              <strong>{p.tagline}</strong>
              <p>{p.description}</p>
              <button type="button" className="btn btn--game" onClick={() => void start(key)} disabled={busy !== null}>
                {busy === key ? <span className="spinner" /> : <Icon name="play" size={18} />}
                {busy === key ? 'מכינים…' : 'מתחילים'}
              </button>
            </li>
          )
        })}
      </ul>

      <section className="panel">
        <h2 className="panel__title">
          <Icon name="clock" size={18} /> אימונים קודמים
        </h2>
        {sessions === null ? (
          <span className="spinner" />
        ) : sessions.length === 0 ? (
          <p className="empty-note">עוד לא התאמנתם. בחרו מאמן למעלה.</p>
        ) : (
          <ul className="session-list">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link to={`/coach/${s.id}`} style={{ '--c': PERSONAS[s.persona].color } as CSSProperties}>
                  <Icon name={PERSONAS[s.persona].icon} size={18} />
                  <span>
                    <strong>{s.title}</strong>
                    <small>
                      {formatDateTime(s.updatedAt)} · {s.turns} הודעות
                    </small>
                  </span>
                  {s.score !== null && <b className="session-list__score">{s.score}</b>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export function CoachChatPage() {
  const { id } = useParams()
  const { refreshGame } = useCustomer()
  const [session, setSession] = useState<CoachSession | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'send' | 'score' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

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

  const persona = PERSONAS[session.persona]

  const send = async (e: FormEvent) => {
    e.preventDefault()
    const message = text.trim()
    if (!message) return
    setBusy('send')
    setError(null)
    // Show the message right away; the reply follows.
    setSession({ ...session, messages: [...session.messages, { role: 'user', text: message, at: new Date().toISOString() }] })
    setText('')
    try {
      const res = await api<{ session: CoachSession }>(`/me/coach/${session.id}/message`, { body: { text: message } })
      setSession(res.session)
      if (session.persona === 'mental') void refreshGame()
    } catch (err) {
      setError(errorMessage(err))
      setSession(session)
      setText(message)
    } finally {
      setBusy(null)
    }
  }

  const score = async () => {
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
    <div className="coach-chat" style={{ '--c': persona.color } as CSSProperties}>
      <Link to="/coach" className="cx-back">
        <Icon name="arrowLeft" size={18} /> המאמנים
      </Link>
      <header className="coach-chat__head">
        <span className="coach-card__icon">
          <Icon name={persona.icon} size={24} />
        </span>
        <div>
          <h1>{persona.title}</h1>
          <p>{persona.tagline}</p>
        </div>
        {persona.scored && (
          <button type="button" className="btn btn--game" onClick={() => void score()} disabled={busy !== null}>
            {busy === 'score' ? <span className="spinner" /> : <Icon name="trophy" size={18} />}
            {session.evaluation ? 'ציון מחדש' : 'סיום וקבלת ציון'}
          </button>
        )}
      </header>

      <div className="chat chat--coach" aria-live="polite">
        {session.messages.map((m, i) => (
          <div key={i} className={`chat__msg chat__msg--${m.role}`}>
            {m.role === 'assistant' && <span className="chat__who">{session.persona === 'sales' ? 'הלקוח' : persona.title}</span>}
            <p>{m.text}</p>
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

      {session.evaluation && (
        <section className="panel coach-eval">
          <div className="coach-eval__score">
            <b>{session.evaluation.score}</b>
            <span>/100</span>
          </div>
          <div>
            <p>{session.evaluation.summary}</p>
            <div className="review__lists">
              <div>
                <strong>
                  <Icon name="check" size={16} /> חזק
                </strong>
                <ul>
                  {session.evaluation.strengths.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>
                  <Icon name="edit" size={16} /> לשפר
                </strong>
                <ul>
                  {session.evaluation.improvements.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="coach-eval__next">
              <Icon name="flag" size={16} /> התרגיל הבא: {session.evaluation.nextStep}
            </p>
          </div>
        </section>
      )}

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      <form className="chat__form" onSubmit={(e) => void send(e)}>
        <textarea
          className="textarea"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={session.persona === 'sales' ? 'מה עונים ללקוח?' : 'כתבו הודעה…'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(e)
            }
          }}
        />
        <button type="submit" className="btn btn--game" disabled={busy !== null || !text.trim()}>
          <Icon name="arrowLeft" size={18} /> שליחה
        </button>
      </form>
    </div>
  )
}
