import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { api, errorMessage } from '../../lib/api'
import { formatDate, formatDateTime } from '../../lib/format'
import { COACH_TITLES, formatShekels, LEAD_STATUS_LABEL, SKILL_META } from '../../lib/game'
import type { AdminCustomerGame, CoachPersona, CoachSession, Review } from '../../lib/types'

// The game side of one customer, for Yarin: points and skills, prizes to hand out,
// the worksheets with the AI bot's review, quiz scores, coach sessions and referred friends.

const VERDICT: Record<Review['verdict'], { label: string; tone: string }> = {
  excellent: { label: 'מצוין', tone: 'success' },
  good: { label: 'טוב', tone: 'brand' },
  needs_work: { label: 'צריך עוד עבודה', tone: 'warn' },
}

/** A session's default title is the coach's name; show it once. */
const sessionName = (persona: CoachPersona, title: string) =>
  title && title !== COACH_TITLES[persona] ? `${COACH_TITLES[persona]} · ${title}` : COACH_TITLES[persona]

type Props = { customerId: string; taskTitles: Map<string, string> }

export function CustomerGamePanel({ customerId, taskTitles }: Props) {
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
        <h2>המשחק</h2>
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
    <section className="adm-card adm-game">
      <div className="adm-card__head">
        <div>
          <h2>המשחק</h2>
          <p>נקודות, סקילים ופרסים, ומה הבוט אמר על העבודות של הלקוח.</p>
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

      <div className="adm-stats">
        <div>
          <span>רמה</span>
          <strong>{game.level}</strong>
          <small>{game.xp.toLocaleString('he-IL')} XP</small>
        </div>
        <div>
          <span>ימים ברצף</span>
          <strong>{game.streak}</strong>
        </div>
        <div>
          <span>הכנסה אחרונה</span>
          <strong className="ltr">{formatShekels(game.revenue.latest)}</strong>
          <small>{game.revenue.rank.label}</small>
        </div>
        <div>
          <span>חבר מביא חבר</span>
          <strong>
            {game.referrals.joined}/{game.referrals.total}
          </strong>
          <small>הצטרפו / נרשמו</small>
        </div>
      </div>

      <h3 className="adm-game__title">
        <Icon name="chart" size={18} /> סקילים
      </h3>
      <ul className="adm-skills">
        {game.skills.map((s) => {
          const span = s.nextAt === null ? 1 : s.nextAt - s.floor
          const percent = s.nextAt === null ? 100 : Math.round(((s.points - s.floor) / span) * 100)
          return (
            <li key={s.key} style={{ '--c': SKILL_META[s.key].color } as CSSProperties}>
              <span className="adm-skills__icon">
                <Icon name={SKILL_META[s.key].icon} size={15} />
              </span>
              <span className="adm-skills__name">{s.label}</span>
              <b>רמה {s.level}</b>
              <span className="adm-skills__bar">
                <i style={{ width: `${percent}%` }} />
              </span>
              <small>{s.points} נק׳</small>
            </li>
          )
        })}
      </ul>

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

      <h3 className="adm-game__title">
        <Icon name="sparkles" size={18} /> מסכי עבודה ובדיקת הבוט
      </h3>
      {worksheets.length === 0 ? (
        <p className="empty-note">הלקוח עוד לא מילא מסכי עבודה.</p>
      ) : (
        <ul className="adm-worksheets">
          {worksheets.map((w) => {
            const review = w.review
            const score = review ? (review.finalScore ?? review.score) : null
            return (
              <li key={w.taskId}>
                <details>
                  <summary>
                    <span className="adm-worksheets__title">{w.taskTitle}</span>
                    {review ? (
                      <span className={`chip chip--${VERDICT[review.verdict].tone}`}>
                        {score} · {review.finishedAt ? 'סופי' : VERDICT[review.verdict].label}
                      </span>
                    ) : w.submittedAt ? (
                      <span className="chip">הוגש, בלי בדיקה</span>
                    ) : (
                      <span className="chip">טיוטה</span>
                    )}
                    <small>{w.submittedAt ? formatDateTime(w.submittedAt) : ''}</small>
                  </summary>
                  <div className="adm-worksheets__body">
                    <div>
                      <h4>התשובות</h4>
                      <pre className="adm-worksheets__answers">{w.text || 'אין תשובות.'}</pre>
                    </div>
                    {review && (
                      <div className="adm-review">
                        <h4>הבוט</h4>
                        <p>{review.summary}</p>
                        {review.strengths.length > 0 && (
                          <>
                            <h5>מה טוב</h5>
                            <ul>
                              {review.strengths.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        {review.improvements.length > 0 && (
                          <>
                            <h5>מה לשפר</h5>
                            <ul>
                              {review.improvements.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        {review.finalNote && (
                          <p className="adm-review__final">
                            <b>ציון סופי {review.finalScore}:</b> {review.finalNote}
                          </p>
                        )}
                      </div>
                    )}
                    {w.chat.length > 0 && (
                      <div className="adm-transcript">
                        <h4>השיחה עם הבוט</h4>
                        {w.chat.map((t, i) => (
                          <p key={i} className={`adm-transcript__turn adm-transcript__turn--${t.role}`}>
                            <b>{t.role === 'user' ? 'הלקוח' : 'הבוט'}</b> {t.text}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}

      <div className="adm-game__split">
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
            <Icon name="users" size={18} /> מאמנים וסימולטורים
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
  )
}

function CoachTranscript({ id, onClose }: { id: string; onClose: () => void }) {
  const [session, setSession] = useState<Omit<CoachSession, 'updatedAt'> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ session: Omit<CoachSession, 'updatedAt'> }>(`/admin/coach/${id}`)
      .then((res) => setSession(res.session))
      .catch((err) => setError(errorMessage(err)))
  }, [id])

  const who = (role: 'user' | 'assistant') =>
    role === 'user' ? 'הלקוח' : session?.persona === 'sales' ? 'הבוט (בתפקיד הלקוח)' : 'הבוט'

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
              <b>{who(m.role)}</b> {m.text}
            </p>
          ))}
          {session.evaluation && (
            <div className="adm-review">
              <h4>ציון: {session.evaluation.score}</h4>
              <p>{session.evaluation.summary}</p>
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
