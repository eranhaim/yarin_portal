import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { api, errorMessage } from '../../lib/api'
import { formatDate, formatDateTime } from '../../lib/format'
import { COACH_TITLES, formatShekels, LEAD_STATUS_LABEL, monthLabel, percent, SKILL_META } from '../../lib/game'
import type { AdminCustomerGame, BottleneckKey, CoachPersona, CoachSession, GameSummary, RouteOptions, StageKey, TrackKey } from '../../lib/types'
import { ReviewView } from './ReviewView'

// One customer, for Yarin and Oren: the personal route, the two metrics side by side (learning and business),
// the work with the AI's check, the coaches, prizes and referrals.

/** A session's default title is the coach's name; show it once. */
const sessionName = (persona: CoachPersona, title: string) =>
  title && title !== COACH_TITLES[persona] ? `${COACH_TITLES[persona]} · ${title}` : COACH_TITLES[persona]

type Props = { customerId: string; taskTitles: Map<string, string>; onRouteChange: () => void }

export function CustomerGamePanel({ customerId, taskTitles, onRouteChange }: Props) {
  const [data, setData] = useState<AdminCustomerGame | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyReward, setBusyReward] = useState<string | null>(null)
  const [openSession, setOpenSession] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await api<AdminCustomerGame>(`/admin/customers/${customerId}/game`))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [customerId])

  useEffect(() => {
    void load()
  }, [load])

  const setDelivered = async (key: string, delivered: boolean) => {
    setBusyReward(key)
    try {
      await api(`/admin/customers/${customerId}/rewards/${key}`, { method: 'PUT', body: { delivered } })
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyReward(null)
    }
  }

  if (!data) {
    return (
      <section className="adm-card">
        <h2>התקדמות</h2>
        {error ? (
          <div className="alert alert--error" role="alert">
            <Icon name="alert" size={18} /> {error}
          </div>
        ) : (
          <div className="page-loader">
            <span className="spinner" />
          </div>
        )}
      </section>
    )
  }

  const { game, worksheets, quizzes, coach, leads } = data
  const waiting = game.rewards.filter((r) => r.unlocked && !r.delivered).length

  return (
    <>
      <RoutePanel
        customerId={customerId}
        data={data}
        onChanged={() => {
          void load()
          onRouteChange()
        }}
      />

      <div className="adm-metrics">
        <LearningPanel game={game} />
        <BusinessPanel game={game} />
      </div>

      <section className="adm-card adm-game">
        <div className="adm-card__head">
          <div>
            <h2>עבודה, אימונים ופרסים</h2>
            <p>מה הבוחן אמר על העבודות, ומה קרה באימונים עם המאמנים.</p>
          </div>
          {waiting > 0 && (
            <span className="chip chip--warn">
              <Icon name="trophy" size={14} /> {waiting === 1 ? 'פרס אחד מחכה למסירה' : `${waiting} פרסים מחכים למסירה`}
            </span>
          )}
        </div>

        {error && (
          <div className="alert alert--error" role="alert">
            <Icon name="alert" size={18} /> {error}
          </div>
        )}

        <h3 className="adm-game__title">
          <Icon name="sparkles" size={18} /> עבודות ובדיקת הבוחן
        </h3>
        {worksheets.length === 0 ? (
          <p className="empty-note">הלקוח עוד לא מילא מסכי עבודה.</p>
        ) : (
          <ul className="adm-worksheets">
            {worksheets.map((w) => {
              const score = w.review ? (w.review.finalScore ?? w.review.score) : null
              const scores = w.attempts.filter((a) => a.score !== null).map((a) => a.score)
              return (
                <li key={w.taskId}>
                  <details>
                    <summary>
                      <span className="adm-worksheets__title">{w.taskTitle}</span>
                      {scores.length > 1 && <small className="ltr">{scores.join(' → ')}</small>}
                      {w.human && w.human.status !== 'none' && (
                        <span className={`chip chip--${w.human.status === 'approved' ? 'success' : 'warn'}`}>
                          {w.human.status === 'approved' ? 'אושר' : w.human.status === 'returned' ? 'הוחזר' : 'מבקש בדיקה'}
                        </span>
                      )}
                      {score !== null ? <span className={`chip chip--${score >= 70 ? 'success' : 'warn'}`}>{score}</span> : <span className="chip">{w.submittedAt ? 'הוגש' : 'טיוטה'}</span>}
                      <small>{w.submittedAt ? formatDateTime(w.submittedAt) : ''}</small>
                    </summary>
                    <div className="adm-worksheets__body">
                      <div>
                        <h4>התשובות</h4>
                        <pre className="adm-worksheets__answers">{w.text || 'אין תשובות.'}</pre>
                      </div>
                      {w.review && <ReviewView review={w.review} chat={w.chat} />}
                    </div>
                  </details>
                </li>
              )
            })}
          </ul>
        )}

        <h3 className="adm-game__title">
          <Icon name="trophy" size={18} /> פרסים
        </h3>
        <ul className="adm-rewards">
          {game.rewards.map((r) => (
            <li key={r.key} className={r.delivered ? 'is-delivered' : r.unlocked ? 'is-unlocked' : ''}>
              <div>
                <strong>{r.title}</strong>
                <small>{r.conditions.join(' או ')}</small>
              </div>
              {r.delivered ? (
                <span className="chip chip--success">
                  <Icon name="check" size={13} /> נמסר
                </span>
              ) : r.unlocked ? (
                <span className="chip chip--warn">נפתח!</span>
              ) : (
                <span className="adm-rewards__progress">{Math.round(r.progress * 100)}%</span>
              )}
              {(r.unlocked || r.delivered) && (
                <button
                  type="button"
                  className={`btn btn--sm ${r.delivered ? 'btn--ghost' : 'btn--primary'}`}
                  disabled={busyReward === r.key}
                  onClick={() => void setDelivered(r.key, !r.delivered)}
                >
                  {busyReward === r.key && <span className="spinner" />}
                  {r.delivered ? 'ביטול המסירה' : 'סימון כנמסר'}
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="adm-game__split">
          <div>
            <h3 className="adm-game__title">
              <Icon name="users" size={18} /> אימונים
            </h3>
            {coach.length === 0 ? (
              <p className="empty-note">עוד אין שיחות.</p>
            ) : (
              <ul className="adm-game__list">
                {coach.map((s) => (
                  <li key={s.id}>
                    <button type="button" className="adm-game__link" onClick={() => setOpenSession(s.id)}>
                      {sessionName(s.persona, s.title)}
                    </button>
                    {s.score !== null && <b>{s.score}</b>}
                    <small>{formatDate(s.updatedAt)}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="adm-game__title">
              <Icon name="bulb" size={18} /> חידונים
            </h3>
            {quizzes.length === 0 ? (
              <p className="empty-note">עוד לא נפתרו חידונים.</p>
            ) : (
              <ul className="adm-game__list">
                {quizzes.map((q) => (
                  <li key={q.taskId}>
                    <span>{taskTitles.get(q.taskId) ?? 'משימה שנמחקה'}</span>
                    <b className={q.best === q.total ? 'is-perfect' : ''}>
                      {q.best}/{q.total}
                    </b>
                    <small>{q.tries === 1 ? 'ניסיון אחד' : `${q.tries} ניסיונות`}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="adm-game__title">
              <Icon name="star" size={18} /> חברים שהביא/ה
            </h3>
            {leads.length === 0 ? (
              <p className="empty-note">עוד לא נרשמו חברים.</p>
            ) : (
              <ul className="adm-game__list">
                {leads.map((l) => (
                  <li key={l.id}>
                    <span>{l.name}</span>
                    <b>{LEAD_STATUS_LABEL[l.status]}</b>
                    <small>{formatDate(l.createdAt)}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {openSession && <CoachTranscript id={openSession} onClose={() => setOpenSession(null)} />}
      </section>
    </>
  )
}

// ---------- The personal route ----------

function RoutePanel({ customerId, data, onChanged }: { customerId: string; data: AdminCustomerGame; onChanged: () => void }) {
  const { route, diagnosis } = data
  const [options, setOptions] = useState<RouteOptions | null>(null)
  const [editing, setEditing] = useState(false)
  const [track, setTrack] = useState<TrackKey | ''>(route.track ?? '')
  const [stage, setStage] = useState<StageKey | ''>(route.stage ?? '')
  const [bottleneck, setBottleneck] = useState<BottleneckKey | ''>(route.bottleneck ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<RouteOptions>('/admin/tracks')
      .then(setOptions)
      .catch(() => undefined)
  }, [])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api(`/admin/customers/${customerId}/route`, { method: 'PUT', body: { track: track || null, stage: stage || null, bottleneck: bottleneck || null } })
      setEditing(false)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="adm-card">
      <div className="adm-card__head">
        <div>
          <h2>המסלול האישי</h2>
          <p>{route.by === 'admin' ? 'נקבע על ידי מנהל.' : route.by === 'diagnosis' ? 'נקבע לפי האבחון.' : 'עוד לא מילאו אבחון. הלקוח רואה רק את הבסיס המשותף.'}</p>
        </div>
        {!editing && options && (
          <button type="button" className="btn btn--sm btn--outline" onClick={() => setEditing(true)}>
            <Icon name="edit" size={15} /> שינוי
          </button>
        )}
      </div>
      {editing && options ? (
        <div className="adm-route">
          <label className="field">
            <span className="field__label">מסלול</span>
            <select className="select" value={track} onChange={(e) => setTrack(e.target.value as TrackKey | '')}>
              <option value="">לפי האבחון</option>
              {options.tracks.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">שלב העסק</span>
            <select className="select" value={stage} onChange={(e) => setStage(e.target.value as StageKey | '')}>
              <option value="">—</option>
              {options.stages.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">צוואר הבקבוק</span>
            <select className="select" value={bottleneck} onChange={(e) => setBottleneck(e.target.value as BottleneckKey | '')}>
              <option value="">—</option>
              {options.bottlenecks.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="adm-route__actions">
            <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => void save()}>
              {busy && <span className="spinner" />} שמירה
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(false)}>
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <div className="adm-stats">
          <div>
            <span>מסלול</span>
            <strong>{route.labels.track ?? '—'}</strong>
          </div>
          <div>
            <span>שלב העסק</span>
            <strong>{route.labels.stage ?? '—'}</strong>
          </div>
          <div>
            <span>צוואר הבקבוק</span>
            <strong>{route.labels.bottleneck ?? '—'}</strong>
          </div>
        </div>
      )}
      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}
      {diagnosis && (
        <details className="adm-diagnosis">
          <summary>האבחון ({formatDate(diagnosis.at)})</summary>
          {diagnosis.result?.summary && <p>{diagnosis.result.summary}</p>}
          <pre className="adm-worksheets__answers">{diagnosis.answers}</pre>
        </details>
      )}
    </section>
  )
}

// ---------- The two metrics ----------

function LearningPanel({ game }: { game: GameSummary }) {
  const { learning } = game
  return (
    <section className="adm-card adm-metric adm-metric--learn">
      <h2>
        <Icon name="star" size={18} /> למידה
      </h2>
      <div className="adm-stats">
        <div>
          <span>משימות</span>
          <strong>
            {learning.tasks.completed}/{learning.tasks.total}
          </strong>
          <small>
            שלבים: {learning.levelsDone}/{learning.levels}
          </small>
        </div>
        <div>
          <span>ציון ממוצע</span>
          <strong>{learning.averageScore ?? '—'}</strong>
          <small>{learning.checked} עבודות</small>
        </div>
        <div>
          <span>שיפור בין גרסאות</span>
          <strong className="ltr">{learning.averageImprovement === null ? '—' : `${learning.averageImprovement > 0 ? '+' : ''}${learning.averageImprovement}`}</strong>
        </div>
        <div>
          <span>רמה ורצף</span>
          <strong>{game.level}</strong>
          <small>
            {game.xp} XP · {game.streak} ימים
          </small>
        </div>
      </div>
      <ul className="adm-skills">
        {game.skills
          .filter((s) => s.points > 0)
          .map((s) => {
            const span = s.nextAt === null ? 1 : s.nextAt - s.floor
            const pct = s.nextAt === null ? 100 : Math.round(((s.points - s.floor) / span) * 100)
            return (
              <li key={s.key} style={{ '--c': SKILL_META[s.key].color } as CSSProperties}>
                <span className="adm-skills__icon">
                  <Icon name={SKILL_META[s.key].icon} size={15} />
                </span>
                <span className="adm-skills__name">{s.label}</span>
                <b>רמה {s.level}</b>
                <span className="adm-skills__bar">
                  <i style={{ width: `${pct}%` }} />
                </span>
                <small>{s.points} נק׳</small>
              </li>
            )
          })}
      </ul>
    </section>
  )
}

function BusinessPanel({ game }: { game: GameSummary }) {
  const { business } = game
  const { latest, baseline } = business
  return (
    <section className="adm-card adm-metric adm-metric--biz">
      <h2>
        <Icon name="chart" size={18} /> העסק
      </h2>
      {!latest ? (
        <p className="empty-note">עוד אין נתונים עסקיים.</p>
      ) : (
        <>
          <div className="adm-stats">
            <div>
              <span>הכנסה ({monthLabel(latest.month)})</span>
              <strong className="ltr">{formatShekels(latest.revenue)}</strong>
              <small>{baseline && baseline.month !== latest.month ? `התחלה: ${formatShekels(baseline.revenue)}` : business.rank.label}</small>
            </div>
            <div>
              <span>רווח</span>
              <strong className="ltr">{latest.profit === null ? '—' : formatShekels(latest.profit)}</strong>
              <small>{percent(latest.margin)}</small>
            </div>
            <div>
              <span>פניות ← שיחות</span>
              <strong>{percent(latest.leadToCall)}</strong>
              <small>
                {latest.leads ?? '—'} ← {latest.calls ?? '—'}
              </small>
            </div>
            <div>
              <span>שיחות ← לקוחות</span>
              <strong>{percent(latest.callToDeal)}</strong>
              <small>
                {latest.calls ?? '—'} ← {latest.deals ?? '—'}
              </small>
            </div>
          </div>
          {business.due && (
            <p className="adm-muted">
              <Icon name="clock" size={14} /> {monthLabel(business.due)} עוד לא עודכן.
            </p>
          )}
          {business.insights.length > 0 && (
            <ul className="adm-metric__notes">
              {business.insights.map((i) => (
                <li key={i.text}>{i.text}</li>
              ))}
            </ul>
          )}
          <div className="adm-metric__table">
            <table>
              <thead>
                <tr>
                  <th>חודש</th>
                  <th>הכנסה</th>
                  <th>רווח</th>
                  <th>פניות</th>
                  <th>שיחות</th>
                  <th>לקוחות</th>
                </tr>
              </thead>
              <tbody>
                {[...business.history].reverse().map((h) => (
                  <tr key={h.month}>
                    <td>{monthLabel(h.month)}</td>
                    <td className="ltr">{formatShekels(h.revenue)}</td>
                    <td className="ltr">{h.profit === null ? '—' : formatShekels(h.profit)}</td>
                    <td>{h.leads ?? '—'}</td>
                    <td>{h.calls ?? '—'}</td>
                    <td>{h.deals ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function CoachTranscript({ id, onClose }: { id: string; onClose: () => void }) {
  type Transcript = Pick<CoachSession, 'id' | 'persona' | 'title' | 'messages' | 'evaluation'>
  const [session, setSession] = useState<Transcript | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ session: Transcript }>(`/admin/coach/${id}`)
      .then((res) => setSession(res.session))
      .catch((err) => setError(errorMessage(err)))
  }, [id])

  return (
    <Modal open onClose={onClose} title={session ? sessionName(session.persona, session.title) : 'שיחה'} size="lg">
      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}
      {!session && !error && (
        <div className="page-loader">
          <span className="spinner" />
        </div>
      )}
      {session && (
        <div className="adm-transcript">
          {session.messages.map((m, i) => (
            <p key={i} className={`adm-transcript__turn adm-transcript__turn--${m.role}`}>
              <b>{m.role === 'user' ? 'הלקוח' : 'הבוט'}</b> {m.text}
              {(m.attachments ?? []).length > 0 && <small> [{m.attachments.map((a) => a.name).join(', ')}]</small>}
            </p>
          ))}
          {session.evaluation && (
            <div className="adm-review">
              {session.evaluation.score !== null && <h4>ציון: {session.evaluation.score}</h4>}
              <p>{session.evaluation.summary}</p>
              {(session.evaluation.dimensions ?? []).length > 0 && (
                <ul className="adm-review__criteria">
                  {session.evaluation.dimensions
                    .filter((d) => d.score >= 0)
                    .map((d) => (
                      <li key={d.key} className={d.score >= 70 ? 'is-met' : d.score >= 40 ? 'is-partial' : 'is-missing'}>
                        <strong>
                          {d.label}: {d.score}
                        </strong>
                        {d.evidence && <q>{d.evidence}</q>}
                      </li>
                    ))}
                </ul>
              )}
              {session.evaluation.nextStep && (
                <p>
                  <b>הצעד הבא:</b> {session.evaluation.nextStep}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
