import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { COACH_META } from '../../lib/game'
import type { CoachInfo, CoachModeInfo, CoachPersona, CoachSession, CoachSessionItem } from '../../lib/types'
import './coach.css'

// The training room: three coaches. Each one shows the progress by skill area, what it remembers, the open
// commitments, and the ways to train. A coach that did not pass its quality tests is closed.

type Option = { key: string; label: string }
type CoachData = { coaches: CoachInfo[]; scenarios: Option[]; difficulties: Option[]; sessions: CoachSessionItem[] }

export function CoachesPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<CoachData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [setup, setSetup] = useState<{ persona: CoachPersona; mode: CoachModeInfo } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api<CoachData>('/me/coach')
      .then(setData)
      .catch((err) => setError(errorMessage(err)))
  }, [])

  useEffect(load, [load])

  const start = async (persona: CoachPersona, mode: CoachModeInfo, scenario?: string, difficulty?: string) => {
    if (mode.roleplay && !scenario) {
      setSetup({ persona, mode })
      return
    }
    setBusy(`${persona}:${mode.key}`)
    setError(null)
    try {
      const res = await api<{ session: CoachSession }>('/me/coach', { body: { persona, mode: mode.key, scenario, difficulty } })
      navigate(`/coach/${res.session.id}`)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(null)
    }
  }

  if (!data) {
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

  return (
    <div className="coaches">
      <header className="page-head">
        <span className="gta-eyebrow">חדר האימונים</span>
        <h1 className="gta-title">המאמנים</h1>
        <p>הם מכירים את העסק שלכם, מלמדים את השיטה של ירין ואורן, ובודקים עבודה אמיתית.</p>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      <div className="coaches__grid">
        {data.coaches.map((coach) => (
          <CoachCard key={coach.persona} coach={coach} busy={busy} onStart={(mode) => void start(coach.persona, mode)} onChanged={load} />
        ))}
      </div>

      {setup && (
        <SimulationSetup
          data={data}
          busy={busy !== null}
          onClose={() => setSetup(null)}
          onStart={(scenario, difficulty) => void start(setup.persona, setup.mode, scenario, difficulty)}
        />
      )}

      {data.sessions.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">
            <Icon name="clock" size={18} /> אימונים קודמים
          </h2>
          <ul className="session-list">
            {data.sessions.map((s) => (
              <li key={s.id}>
                <Link to={`/coach/${s.id}`} style={{ '--c': COACH_META[s.persona].color } as CSSProperties}>
                  <Icon name={COACH_META[s.persona].icon} size={18} />
                  <span>
                    <strong>{s.title}</strong>
                    <small>
                      {formatDateTime(s.updatedAt)} · {s.turns} הודעות
                    </small>
                  </span>
                  {s.score !== null && <b>{s.score}</b>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function CoachCard({ coach, busy, onStart, onChanged }: { coach: CoachInfo; busy: string | null; onStart: (mode: CoachModeInfo) => void; onChanged: () => void }) {
  const meta = COACH_META[coach.persona]
  const open = coach.commitments.filter((c) => !c.done).at(-1)
  const trained = coach.dimensions.some((d) => d.score !== null)

  const finish = async (id: string) => {
    await api(`/me/coach-memory/${coach.persona}/commitments/${id}`, { method: 'PATCH', body: { done: true } }).catch(() => undefined)
    onChanged()
  }
  const forget = async (id: string) => {
    await api(`/me/coach-memory/${coach.persona}/notes/${id}`, { method: 'DELETE' }).catch(() => undefined)
    onChanged()
  }

  return (
    <article className={`coach-card${coach.available ? '' : ' is-closed'}`} style={{ '--c': meta.color } as CSSProperties}>
      <header>
        <span className="coach-card__icon">
          <Icon name={meta.icon} size={24} />
        </span>
        <div>
          <h2>{coach.title}</h2>
          <p>{meta.tagline}</p>
        </div>
      </header>

      {open && (
        <div className="coach-card__commit">
          <Icon name="flag" size={16} />
          <span>
            <small>סיכמתם:</small> {open.text}
          </span>
          <button type="button" className="btn btn--sm btn--ghost-light" onClick={() => void finish(open.id)}>
            עשיתי
          </button>
        </div>
      )}

      {trained && (
        <div className="coach-card__progress">
          <ul>
            {coach.dimensions.map((d) => (
              <li key={d.key}>
                <span>{d.label}</span>
                <i style={{ '--p': `${d.score ?? 0}%` } as CSSProperties} />
                <b>{d.score ?? '—'}</b>
              </li>
            ))}
          </ul>
          {coach.scores.length > 1 && <Trend scores={coach.scores.map((s) => s.score)} />}
        </div>
      )}

      {coach.available ? (
        <div className="coach-card__modes">
          {coach.modes.map((mode) => (
            <button key={mode.key} type="button" onClick={() => onStart(mode)} disabled={busy !== null}>
              <strong>
                {busy === `${coach.persona}:${mode.key}` && <span className="spinner" />} {mode.label}
              </strong>
              <small>{mode.description}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="coach-card__closed">
          <Icon name={coach.paused ? 'clock' : 'shield'} size={18} /> {coach.paused ? 'המאמנים בהפסקה קצרה. חזרו מאוחר יותר.' : 'המאמן בבדיקות איכות. הוא ייפתח כשיעבור את כולן.'}
        </p>
      )}

      {coach.notes.length > 0 && (
        <details className="coach-card__memory">
          <summary>מה המאמן זוכר עליכם ({coach.notes.length})</summary>
          <ul>
            {coach.notes.map((n) => (
              <li key={n.id}>
                <span>{n.text}</span>
                <button type="button" className="icon-btn" onClick={() => void forget(n.id)} aria-label="מחיקת השורה" title="מחיקה">
                  <Icon name="x" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  )
}

/** Scores of the last sessions, oldest first (drawn right to left, like the text). */
function Trend({ scores }: { scores: number[] }) {
  const width = 120
  const height = 34
  const x = (i: number) => width - (i / (scores.length - 1)) * (width - 8) - 4
  const y = (score: number) => height - 5 - (score / 100) * (height - 10)
  const last = scores.at(-1)!
  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`ציונים באימונים האחרונים: ${scores.join(', ')}`}>
        <polyline points={scores.map((s, i) => `${x(i)},${y(s)}`).join(' ')} />
        <circle cx={x(scores.length - 1)} cy={y(last)} r={4} />
      </svg>
      <figcaption>
        {scores[0]} ← {last}
      </figcaption>
    </figure>
  )
}

function SimulationSetup({ data, busy, onClose, onStart }: { data: CoachData; busy: boolean; onClose: () => void; onStart: (scenario: string, difficulty: string) => void }) {
  const [scenario, setScenario] = useState(data.scenarios[0]!.key)
  const [difficulty, setDifficulty] = useState(data.difficulties[1]?.key ?? data.difficulties[0]!.key)
  return (
    <div className="setup" role="dialog" aria-modal="true" aria-label="הגדרת הסימולציה" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="setup__card">
        <h2>באיזה מצב מתאמנים?</h2>
        <div className="setup__options" role="radiogroup" aria-label="המצב">
          {data.scenarios.map((s) => (
            <button key={s.key} type="button" role="radio" aria-checked={scenario === s.key} onClick={() => setScenario(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <h3>כמה קשה?</h3>
        <div className="setup__options" role="radiogroup" aria-label="רמת הקושי">
          {data.difficulties.map((d) => (
            <button key={d.key} type="button" role="radio" aria-checked={difficulty === d.key} onClick={() => setDifficulty(d.key)}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="setup__actions">
          <button type="button" className="btn btn--game btn--lg" disabled={busy} onClick={() => onStart(scenario, difficulty)}>
            {busy ? <span className="spinner" /> : <Icon name="play" size={18} />} {busy ? 'הלקוח מתכונן…' : 'מתחילים'}
          </button>
          <button type="button" className="btn btn--ghost-light" disabled={busy} onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
