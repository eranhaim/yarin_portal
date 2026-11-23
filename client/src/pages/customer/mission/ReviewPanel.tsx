import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon } from '../../../components/Icon'
import { api, errorMessage } from '../../../lib/api'
import type { WorksheetView } from '../../../lib/types'

// The AI reviewer ("הבוחן"): reads the worksheet and files, scores the work, asks probing questions,
// and gives a final score after the follow-up conversation.

type Props = {
  taskId: string
  view: WorksheetView
  onView: (view: WorksheetView) => void
  /** Whether there is something to review (a submitted worksheet or a file). */
  ready: boolean
  rubric: string[]
}

const VERDICT = { excellent: 'מצוין', good: 'טוב', needs_work: 'צריך עוד עבודה' } as const

export function ReviewPanel({ taskId, view, onView, ready, rubric }: Props) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const review = view.review
  const score = review ? (review.finalScore ?? review.score) : null

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [view.chat.length])

  const requestReview = async () => {
    setBusy(true)
    setError(null)
    try {
      onView(await api<WorksheetView>(`/me/tasks/${taskId}/review`, { method: 'POST' }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const reply = async (e: FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    setBusy(true)
    setError(null)
    try {
      onView(await api<WorksheetView>(`/me/tasks/${taskId}/review/reply`, { body: { message } }))
      setMessage('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel review">
      <header className="panel__head">
        <div>
          <h2>הבוחן</h2>
          <p>בוט שבודק את העבודה שלכם לעומק: נותן ציון, שואל שאלות, ומחליט על ציון סופי. עד 120 XP.</p>
        </div>
        {score !== null && (
          <div className={`review__score review__score--${review!.verdict}`} aria-label={`ציון ${score}`}>
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15.9" className="review__track" />
              <circle cx="18" cy="18" r="15.9" className="review__fill" strokeDasharray={`${score} 100`} />
            </svg>
            <b>{score}</b>
          </div>
        )}
      </header>

      {!review ? (
        <div className="review__start">
          {rubric.length > 0 && (
            <div className="review__rubric">
              <strong>מה הבוחן בודק:</strong>
              <ul>
                {rubric.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" className="btn btn--game" onClick={() => void requestReview()} disabled={busy || !ready}>
            {busy ? <span className="spinner" /> : <Icon name="sparkles" size={18} />}
            {busy ? 'הבוחן קורא…' : 'בקשו בדיקה'}
          </button>
          {!ready && <p className="review__hint">קודם הגישו את מסך העבודה או קובץ.</p>}
        </div>
      ) : (
        <>
          <div className="review__result">
            <span className={`review__verdict review__verdict--${review.verdict}`}>{VERDICT[review.verdict]}</span>
            <p>{review.summary}</p>
            <div className="review__lists">
              <div>
                <strong>
                  <Icon name="check" size={16} /> מה טוב
                </strong>
                <ul>
                  {review.strengths.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>
                  <Icon name="edit" size={16} /> מה לשפר
                </strong>
                <ul>
                  {review.improvements.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="chat" aria-live="polite">
            {view.chat.map((turn, i) => (
              <div key={i} className={`chat__msg chat__msg--${turn.role}`}>
                {turn.role === 'assistant' && <span className="chat__who">הבוחן</span>}
                <p>{turn.text}</p>
              </div>
            ))}
            {busy && (
              <div className="chat__msg chat__msg--assistant chat__typing" aria-label="הבוחן כותב">
                <i />
                <i />
                <i />
              </div>
            )}
            <div ref={end} />
          </div>

          {review.finishedAt ? (
            <div className="review__final">
              <Icon name="trophy" size={22} />
              <div>
                <strong>ציון סופי: {review.finalScore}</strong>
                {review.finalNote && <p>{review.finalNote}</p>}
              </div>
              <button type="button" className="btn btn--sm" onClick={() => void requestReview()} disabled={busy || !ready}>
                <Icon name="refresh" size={15} /> בדיקה חדשה
              </button>
            </div>
          ) : (
            <form className="chat__form" onSubmit={(e) => void reply(e)}>
              <textarea
                className="textarea"
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="ענו לבוחן…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void reply(e)
                  }
                }}
              />
              <button type="submit" className="btn btn--game" disabled={busy || !message.trim()}>
                <Icon name="arrowLeft" size={18} /> שליחה
              </button>
            </form>
          )}
        </>
      )}

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}
    </section>
  )
}
