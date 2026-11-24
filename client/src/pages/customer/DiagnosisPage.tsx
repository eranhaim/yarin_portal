import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import type { DiagnosisAnswers, DiagnosisQuestion, DiagnosisResult, DiagnosisView, GameSummary, MyPlan } from '../../lib/types'
import { focusPath, useCustomer } from './customerContext'
import './diagnosis.css'

// The opening diagnosis. One question at a time; the answers save by themselves. The result explains the
// personal route (which tasks, and why), and becomes the starting point of the business metric.

type Submitted = DiagnosisView & { taskCount: number; plan: MyPlan | null; game: GameSummary }

const SCALE = ['בכלל לא', 'קצת', 'בסדר', 'נוח', 'מאוד נוח']

export function DiagnosisPage() {
  const { applyPlan, applyGame, plan } = useCustomer()
  const [view, setView] = useState<DiagnosisView | null>(null)
  const [answers, setAnswers] = useState<DiagnosisAnswers>({})
  const [step, setStep] = useState(0)
  const [editing, setEditing] = useState(false)
  const [taskCount, setTaskCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    api<DiagnosisView>('/me/diagnosis')
      .then((res) => {
        setView(res)
        setAnswers(res.answers)
        // Continue a draft at its first open question.
        const open = res.questions.findIndex((q) => !answered(q, res.answers[q.id]))
        setStep(open === -1 ? 0 : open)
      })
      .catch((err) => setError(errorMessage(err)))
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  if (!view) {
    return error ? (
      <div className="cx-empty">
        <h2>{error}</h2>
      </div>
    ) : (
      <div className="page-loader">
        <span className="spinner" />
      </div>
    )
  }

  if (view.submittedAt && view.result && !editing) {
    return <Result result={view.result} taskCount={taskCount ?? plan?.summary.total ?? 0} onEdit={() => (setEditing(true), setStep(0))} />
  }

  const { questions } = view
  const question = questions[step]!
  const value = answers[question.id]
  const ready = answered(question, value)
  const last = step === questions.length - 1

  const set = (next: string | number | string[] | undefined) => {
    const all = { ...answers }
    if (next === undefined) delete all[question.id]
    else all[question.id] = next
    setAnswers(all)
    if (timer.current) window.clearTimeout(timer.current)
    // A draft saves a moment after the last change (an updated diagnosis is sent only at the end).
    if (!view.submittedAt) timer.current = window.setTimeout(() => void api('/me/diagnosis', { method: 'PUT', body: { answers: all } }).catch(() => undefined), 800)
    return all
  }

  const submit = async () => {
    if (timer.current) window.clearTimeout(timer.current)
    setBusy(true)
    setError(null)
    try {
      const res = await api<Submitted>('/me/diagnosis', { body: { answers } })
      setView({ ...res, questions })
      setTaskCount(res.taskCount)
      setEditing(false)
      applyPlan(res.plan)
      applyGame(res.game)
      window.scrollTo({ top: 0 })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const next = () => {
    if (!last) setStep(step + 1)
    else void submit()
  }

  if (busy) {
    return (
      <div className="diag diag--busy" role="status">
        <span className="spinner" />
        <h2>מנתחים את התשובות ובונים את המסלול שלכם</h2>
        <p>עוד כמה שניות.</p>
      </div>
    )
  }

  return (
    <div className="diag">
      <header className="diag__head">
        <span className="gta-eyebrow">אבחון העסק</span>
        <span>
          {step + 1} מתוך {questions.length}
        </span>
      </header>
      <div className="progress diag__progress" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={questions.length} aria-label="התקדמות באבחון">
        <div className="progress__bar" style={{ width: `${((step + 1) / questions.length) * 100}%` }} />
      </div>

      <form
        key={question.id}
        className="diag__card"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) next()
        }}
      >
        <small>{question.group}</small>
        <h1>{question.label}</h1>
        {question.help && <p>{question.help}</p>}
        <Field
          question={question}
          value={value}
          onChange={set}
          onPick={(v) => {
            set(v)
            // A single choice needs no second click.
            if (!last) window.setTimeout(() => setStep((s) => Math.min(s + 1, questions.length - 1)), 180)
          }}
        />
        {error && (
          <div className="alert alert--error" role="alert">
            <Icon name="alert" size={18} /> {error}
          </div>
        )}
        <div className="diag__actions">
          {step > 0 && (
            <button type="button" className="btn btn--ghost-light" onClick={() => setStep(step - 1)}>
              הקודמת
            </button>
          )}
          <button type="submit" className="btn btn--game btn--lg" disabled={!ready}>
            {last ? 'בונים את המסלול שלי' : 'ממשיכים'}
          </button>
        </div>
      </form>
    </div>
  )
}

function answered(q: DiagnosisQuestion, value: string | number | string[] | undefined): boolean {
  if (q.optional) return true
  if (q.type === 'number' || q.type === 'scale') return typeof value === 'number' && Number.isFinite(value)
  if (q.type === 'multi') return Array.isArray(value) && value.length > 0
  return typeof value === 'string' && value.trim() !== ''
}

type FieldProps = {
  question: DiagnosisQuestion
  value: string | number | string[] | undefined
  onChange: (value: string | number | string[] | undefined) => void
  onPick: (value: string | number) => void
}

function Field({ question, value, onChange, onPick }: FieldProps) {
  switch (question.type) {
    case 'choice':
      return (
        <div className="diag__choices" role="radiogroup" aria-label={question.label}>
          {question.options!.map((o) => (
            <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className="diag__choice" onClick={() => onPick(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      )
    case 'multi': {
      const selected = Array.isArray(value) ? value : []
      return (
        <div className="diag__choices diag__choices--multi">
          {question.options!.map((o) => {
            const on = selected.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                className="diag__choice"
                onClick={() => onChange(on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
              >
                {on && <Icon name="check" size={15} />} {o.label}
              </button>
            )
          })}
        </div>
      )
    }
    case 'scale':
      return (
        <div className="diag__scale" role="radiogroup" aria-label={question.label}>
          {SCALE.map((label, i) => (
            <button key={label} type="button" role="radio" aria-checked={value === i + 1} className="diag__choice" onClick={() => onPick(i + 1)}>
              <b>{i + 1}</b> {label}
            </button>
          ))}
        </div>
      )
    case 'number':
      return (
        <label className="diag__number">
          {question.unit && <span>{question.unit}</span>}
          <input
            className="input"
            inputMode="numeric"
            autoFocus
            aria-label={question.label}
            value={typeof value === 'number' ? value.toLocaleString('he-IL') : ''}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 9)
              onChange(digits === '' ? undefined : Number(digits))
            }}
            placeholder="0"
          />
        </label>
      )
    default:
      return (
        <textarea
          className="textarea"
          rows={4}
          autoFocus
          maxLength={2000}
          aria-label={question.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

function Result({ result, taskCount, onEdit }: { result: DiagnosisResult; taskCount: number; onEdit: () => void }) {
  const navigate = useNavigate()
  const { plan } = useCustomer()
  const reasons = useMemo(() => result.reasons.filter((r) => !result.summary.includes(r)), [result])
  return (
    <div className="diag diag--result">
      <header className="route-hero">
        <span className="gta-eyebrow">המסלול האישי שלכם</span>
        <h1 className="gta-title">{result.track?.label}</h1>
        <p>{result.summary}</p>
        <ul className="route-hero__facts">
          <li>
            <small>הדגש במסלול</small>
            <b>{result.track?.focus}</b>
          </li>
          <li>
            <small>איפה העסק היום</small>
            <b>{result.stage}</b>
          </li>
          <li>
            <small>צוואר הבקבוק</small>
            <b>{result.bottleneck}</b>
          </li>
          <li>
            <small>במסלול</small>
            <b>{taskCount} משימות</b>
          </li>
        </ul>
      </header>

      {result.priorities.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">
            <Icon name="target" size={18} /> שלוש עדיפויות ל-90 הימים הקרובים
          </h2>
          <ol className="priorities">
            {result.priorities.map((p) => (
              <li key={p.title}>
                <b>{p.title}</b>
                <span>{p.why}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="diag__cols">
        {result.strengths.length > 0 && (
          <section className="panel">
            <h2 className="panel__title">
              <Icon name="check" size={18} /> מה כבר עובד
            </h2>
            <ul>
              {result.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        )}
        {result.risks.length > 0 && (
          <section className="panel">
            <h2 className="panel__title">
              <Icon name="alert" size={18} /> על מה לשים לב
            </h2>
            <ul>
              {result.risks.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        )}
        {reasons.length > 0 && (
          <section className="panel">
            <h2 className="panel__title">
              <Icon name="route" size={18} /> למה המסלול הזה
            </h2>
            <ul>
              {reasons.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="diag__actions">
        <button type="button" className="btn btn--game btn--lg" onClick={() => navigate(plan ? focusPath(plan) : '/map')}>
          למשימה הבאה שלי
        </button>
        <button type="button" className="btn btn--ghost-light" onClick={onEdit}>
          עדכון האבחון
        </button>
      </div>
    </div>
  )
}
