import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon } from '../../../components/Icon'
import { api, errorMessage } from '../../../lib/api'
import { formatDateTime } from '../../../lib/format'
import type { Attempt, MyTask, Review, WorkResult, WorksheetView } from '../../../lib/types'

// The check: the AI examiner reads the work criterion by criterion with quotes, says what to fix, and compares
// versions. Good work gets a short defense. Yarin and Oren can be asked, and their decision always wins.

type Props = {
  task: MyTask
  view: WorksheetView
  onWork: (result: WorkResult) => void
  /** Opens the work for a fix. */
  onFix: () => void
}

const READING = ['קורא את העבודה…', 'פותח את הקבצים שצירפתם…', 'משווה למה שנלמד בשיעור…', 'בודק מול הנתונים של העסק…', 'מנסח הערות ברורות…']
const CRITERION = { met: 'יש', partial: 'חלקי', missing: 'חסר' } as const

export function ReviewPanel({ task, view, onWork, onFix }: Props) {
  const [busy, setBusy] = useState<'review' | 'reply' | 'other' | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const { review } = view
  const { check } = task.flow
  const pass = task.passScore ?? 70
  const newest = view.attempts.at(-1)?.number ?? 0
  const current = review && review.attempt >= newest ? review : null
  const tries = view.attempts.filter((a) => a.score !== null).length
  const ready = Boolean(view.submittedAt) || task.submissions.length > 0

  useEffect(() => {
    if (view.chat.length > 1) end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [view.chat.length])

  const act = async (kind: 'review' | 'reply' | 'other', path: string, body?: unknown) => {
    setBusy(kind)
    setError(null)
    try {
      onWork(await api<WorkResult>(`/me/tasks/${task.id}/${path}`, { method: 'POST', body }))
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  // The check runs on the server; this screen asks for the answer, also after the customer left and came back.
  const following = view.reviewing
  const latest = useRef({ onWork, completed: task.completed })
  useEffect(() => {
    latest.current = { onWork, completed: task.completed }
  })
  useEffect(() => {
    if (!following) return
    let stopped = false
    const timer = window.setInterval(() => {
      api<WorkResult>(`/me/tasks/${task.id}/review`)
        .then((res) => {
          if (stopped || res.view.reviewing) return
          const done = res.plan.chapters.some((c) => c.tasks.some((t) => t.id === task.id && t.completed))
          latest.current.onWork({ ...res, completed: done && !latest.current.completed })
        })
        // A lost connection is not a failed check; the next try asks again.
        .catch(() => undefined)
    }, 4000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [following, task.id])
  const reading = following || busy === 'review'

  const reply = async (e: FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    if (await act('reply', 'review/reply', { message })) setMessage('')
  }

  const askHuman = async (e: FormEvent) => {
    e.preventDefault()
    if (await act('other', 'human-check', { message: question })) {
      setAsking(false)
      setQuestion('')
    }
  }

  return (
    <div className="check">
      <HumanNote view={view} />

      {reading ? (
        <Reading />
      ) : check === 'waiting' ? (
        <section className="panel check__start">
          <Icon name="users" size={34} />
          <h2>העבודה אצל ירין ואורן</h2>
          <p>הבוחן לא פתוח כרגע, אז הם יעברו על העבודה בעצמם. אפשר להמשיך למשימה הבאה, וההערות יופיעו כאן.</p>
        </section>
      ) : !current ? (
        <section className="panel check__start">
          <Icon name="sparkles" size={34} />
          <h2>{newest > 1 ? `בדיקה של גרסה ${newest}` : 'בדיקה של הבוחן'}</h2>
          <p>הבוחן קורא את העבודה ואת הקבצים, משווה למה שנלמד בשיעור, ואומר בדיוק מה חזק ומה לשפר. ציון {pass} ומעלה סוגר את המשימה.</p>
          {(task.rubric ?? []).length > 0 && (
            <ul className="check__rubric">
              {task.rubric!.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn--game btn--lg" onClick={() => void act('review', 'review')} disabled={!ready}>
            <Icon name="sparkles" size={18} /> מתחילים בדיקה
          </button>
          {!ready && <small>קודם הגישו את העבודה.</small>}
        </section>
      ) : (
        <Result review={current} pass={pass} attempts={view.attempts} />
      )}

      {current && check === 'fix' && !reading && (
        <section className="panel check__fix">
          <h2 className="panel__title">
            <Icon name="edit" size={18} /> מה לשפר, לפי הסדר
          </h2>
          <ol>
            {current.improvements.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ol>
          <div className="check__actions">
            <button type="button" className="btn btn--game btn--lg" onClick={onFix}>
              <Icon name="edit" size={18} /> לתיקון והגשה מחדש
            </button>
            {tries >= 2 && (
              <button type="button" className="btn btn--ghost-light" disabled={busy !== null} onClick={() => void act('other', 'move-on')}>
                ממשיכים, ומשפרים אחר כך
              </button>
            )}
          </div>
        </section>
      )}

      {current && view.chat.length > 0 && !reading && (
        <section className="panel check__defense">
          <h2 className="panel__title">
            <Icon name="bulb" size={18} /> כמה שאלות על העבודה
          </h2>
          <div className="chat" aria-live="polite">
            {view.chat.map((turn, i) => (
              <div key={i} className={`chat__msg chat__msg--${turn.role}`}>
                {turn.role === 'assistant' && <span className="chat__who">הבוחן</span>}
                <p>{turn.text}</p>
              </div>
            ))}
            {busy === 'reply' && (
              <div className="chat__msg chat__msg--assistant chat__typing" aria-label="הבוחן כותב">
                <i />
                <i />
                <i />
              </div>
            )}
            <div ref={end} />
          </div>
          {!current.finishedAt && (
            <form className="chat__form" onSubmit={(e) => void reply(e)}>
              <textarea
                className="textarea"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="דוגמה אמיתית, מספר או משפט של לקוח…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void reply(e)
                  }
                }}
              />
              <button type="submit" className="btn btn--game" disabled={busy !== null || !message.trim()}>
                <Icon name="send" size={18} /> שליחה
              </button>
            </form>
          )}
          {current.finishedAt && current.finalScore !== null && (
            <p className="check__final">
              <Icon name="trophy" size={18} /> <b>ציון סופי {current.finalScore}.</b> {current.finalNote}
            </p>
          )}
        </section>
      )}

      {(error ?? (!reading && view.reviewError)) && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error ?? view.reviewError}
        </div>
      )}

      {ready && view.human?.status !== 'requested' && check !== 'waiting' && (
        <div className="check__human">
          {asking ? (
            <form onSubmit={(e) => void askHuman(e)}>
              <textarea className="textarea" rows={2} maxLength={1000} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="על מה תרצו שירין ואורן יסתכלו? (לא חובה)" />
              <button type="submit" className="btn btn--sm" disabled={busy !== null}>
                {busy === 'other' && <span className="spinner" />} שליחה
              </button>
              <button type="button" className="btn btn--sm btn--ghost-light" onClick={() => setAsking(false)}>
                ביטול
              </button>
            </form>
          ) : (
            <button type="button" className="check__ask" onClick={() => setAsking(true)}>
              <Icon name="users" size={15} /> לבקש מירין ואורן להסתכל על העבודה
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function HumanNote({ view }: { view: WorksheetView }) {
  const human = view.human
  if (!human) return null
  if (human.status === 'requested') {
    return (
      <div className="check__note check__note--wait">
        <Icon name="clock" size={17} /> ביקשתם מירין ואורן להסתכל. התשובה תופיע כאן.
      </div>
    )
  }
  return (
    <div className={`check__note check__note--${human.status}`}>
      <Icon name={human.status === 'approved' ? 'shield' : 'edit'} size={18} />
      <div>
        <b>
          {human.status === 'approved' ? 'אושר' : 'הערות'} של {human.by || 'ירין ואורן'}
        </b>
        {human.note && <p>{human.note}</p>}
        {human.at && <small>{formatDateTime(human.at)}</small>}
      </div>
    </div>
  )
}

/** The check takes up to a minute, so the screen says what is happening. */
function Reading() {
  const [line, setLine] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setLine((n) => Math.min(n + 1, READING.length - 1)), 6000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <section className="panel check__reading" role="status">
      <span className="spinner" />
      <strong>{READING[line]}</strong>
      <small>בדרך כלל עד דקה. אם צירפתם סרטון, זה יכול לקחת כמה דקות. אפשר לצאת מהמסך ולחזור, הבדיקה ממשיכה.</small>
    </section>
  )
}

function Result({ review, pass, attempts }: { review: Review; pass: number; attempts: Attempt[] }) {
  const score = review.finalScore ?? review.score
  const passed = score >= pass
  return (
    <section className="panel check__result">
      <div className="check__top">
        <div className={`check__score${passed ? ' is-passed' : ''}`} aria-label={`ציון ${score} מתוך 100`}>
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15.9" className="check__track" />
            <circle cx="18" cy="18" r="15.9" className="check__fill" strokeDasharray={`${score} 100`} />
          </svg>
          <b>{score}</b>
        </div>
        <div>
          <span className={`check__verdict${passed ? ' is-passed' : ''}`}>{score >= 90 ? 'מצוין' : passed ? 'עבר' : `עוד קצת. צריך ${pass}`}</span>
          <p>{review.summary}</p>
          {review.progress && (
            <p className="check__progress">
              <Icon name="trendUp" size={16} /> {review.progress}
            </p>
          )}
        </div>
      </div>

      <Versions attempts={attempts} pass={pass} />

      {review.criteria.length > 0 && (
        <ul className="check__criteria">
          {review.criteria.map((c, i) => (
            <li key={i} className={`check__criterion check__criterion--${c.status}`}>
              <span className="check__mark">{c.status === 'met' ? <Icon name="check" size={14} /> : c.status === 'partial' ? '½' : <Icon name="x" size={14} />}</span>
              <div>
                <strong>
                  {c.criterion} <em>{CRITERION[c.status]}</em>
                </strong>
                {c.evidence && <q>{c.evidence.replace(/^["'״„”]+|["'״„”]+$/g, '')}</q>}
                {c.fix && c.status !== 'met' && <p>{c.fix}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {review.strengths.length > 0 && (
        <p className="check__strengths">
          <Icon name="star" size={15} /> {review.strengths.join(' · ')}
        </p>
      )}
      {review.filesRead.length > 0 && <small className="check__files">נבדקו גם: {review.filesRead.join(', ')}</small>}
      {review.filesSkipped.length > 0 && <small className="check__files check__files--warn">לא נפתחו: {review.filesSkipped.join(', ')}. אפשר להעלות PDF, Word, תמונה או MP4.</small>}
    </section>
  )
}

/** How the work improved from version to version. */
function Versions({ attempts, pass }: { attempts: Attempt[]; pass: number }) {
  const scored = attempts.filter((a) => a.score !== null)
  if (scored.length < 2) return null
  const change = scored.at(-1)!.score! - scored[0]!.score!
  return (
    <div className="versions">
      <div className="versions__bars" role="img" aria-label={`הציון לפי גרסה: ${scored.map((a) => a.score).join(', ')}`}>
        {scored.map((a) => (
          <span key={a.number} className={a.score! >= pass ? 'is-passed' : ''} style={{ height: `${Math.max(8, a.score!)}%` }}>
            <b>{a.score}</b>
            <small>גרסה {a.number}</small>
          </span>
        ))}
        <i style={{ bottom: `${pass}%` }} aria-hidden="true" />
      </div>
      <p>{change > 0 ? `שיפרתם ב-${change} נקודות מהגרסה הראשונה.` : 'עוד לא ראינו שיפור מהגרסה הראשונה. התמקדו בהערה הראשונה.'}</p>
    </div>
  )
}
