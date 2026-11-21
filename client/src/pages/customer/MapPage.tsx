import { useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { Board, type BoardChapter } from '../../components/Board'
import { groupColor } from '../../lib/groups'
import { Icon } from '../../components/Icon'
import { dueInfo } from '../../lib/format'
import { lessonVideos } from '../../lib/types'
import { useCustomer } from './customerContext'
import { NoPlan } from './NoPlan'

/** Remembers the last square the customer saw, so the token can hop to a new position. */
function useLastSeenPosition(key: string, current: number) {
  const read = () => {
    try {
      const value = localStorage.getItem(key)
      return value === null ? current : Number(value)
    } catch {
      return current
    }
  }
  const [lastSeen] = useState(read)
  const save = () => {
    try {
      localStorage.setItem(key, String(current))
    } catch {
      // Storage can be blocked (private mode). The board still works without it.
    }
  }
  return { lastSeen, save }
}

export function MapPage() {
  const { me, plan } = useCustomer()
  if (!plan) return <NoPlan name={me.name} />
  return <PlanBoard key={plan.id} />
}

function PlanBoard() {
  const { me, plan } = useCustomer()
  const navigate = useNavigate()
  const p = plan!
  const { lastSeen, save } = useLastSeenPosition(`yp:board:${me.id}:${p.id}`, p.level.position)

  const chapters: BoardChapter[] = useMemo(
    () =>
      p.chapters.map((c) => ({
        id: c.id,
        title: c.title,
        state: c.state,
        tasks: c.tasks.map((t) => ({ id: t.id, title: t.title, started: t.started, completed: t.completed, submitted: t.submissions.length > 0 })),
      })),
    [p],
  )

  const current = p.chapters[p.level.index]
  const nextTask = current?.tasks.find((t) => !t.completed)
  const percent = p.summary.total ? Math.round((p.summary.completed / p.summary.total) * 100) : 0
  const nextDue = nextTask ? dueInfo(nextTask.dueAt, nextTask.completed) : null

  const upcoming = useMemo(
    () =>
      p.chapters
        .filter((c) => c.state !== 'locked')
        .flatMap((c) => c.tasks.filter((t) => !t.completed && t.dueAt).map((t) => ({ task: t, chapter: c })))
        .sort((a, b) => (a.task.dueAt ?? '').localeCompare(b.task.dueAt ?? ''))
        .slice(0, 3),
    [p],
  )

  return (
    <div className="cx-map">
      <section className="cx-map__board" aria-label="לוח המשחק שלך">
        <Board
          chapters={chapters}
          title={p.title}
          mascot
          player={{ id: me.id, name: me.name, avatarUrl: me.avatarUrl, position: p.level.position }}
          animateFrom={lastSeen}
          onArrive={save}
          onSelectTask={(ci, ti) => navigate(`/level/${p.chapters[ci]!.id}/task/${p.chapters[ci]!.tasks[ti]!.id}`)}
          onSelectChapter={(ci) => navigate(`/level/${p.chapters[ci]!.id}`)}
          center={
            <div className="cx-decks">
              <Link to="/library" className="cx-deck cx-deck--videos">
                <span className="cx-deck__icon">
                  <Icon name="video" size={22} />
                </span>
                <span className="cx-deck__title">ספריית הסרטונים</span>
                <span className="cx-deck__count">{p.videos.length + lessonVideos(p).length} סרטונים</span>
              </Link>
              <Link to="/library" className="cx-deck cx-deck--files">
                <span className="cx-deck__icon">
                  <Icon name="file" size={22} />
                </span>
                <span className="cx-deck__title">קבצי התוכנית</span>
                <span className="cx-deck__count">{p.files.length} קבצים</span>
              </Link>
            </div>
          }
        />
        <p className="cx-map__hint">
          <Icon name="lock" size={14} /> שלב נפתח אחרי שמסיימים את כל המשימות בשלב שלפניו. לחצו על משבצת כדי לפתוח משימה.
        </p>
      </section>

      <aside className="cx-map__panel">
        <section className="cx-card cx-hello">
          <p className="cx-eyebrow">{p.title}</p>
          <h1>היי {me.name.split(' ')[0]}!</h1>
          <div className="cx-hello__progress">
            <ProgressRing percent={percent} />
            <div>
              <strong>
                {p.summary.completed} מתוך {p.summary.total} משימות
              </strong>
              <span>הושלמו עד עכשיו</span>
            </div>
          </div>
        </section>

        {p.level.finished ? (
          <section className="cx-card cx-current" style={{ '--group': 'var(--gold)' } as CSSProperties}>
            <header className="cx-current__band">
              <Icon name="trophy" size={18} /> התוכנית הושלמה
            </header>
            <div className="cx-current__body">
              <h2>עשיתם את זה!</h2>
              <p>סיימתם את כל השלבים בתוכנית. עבודה מדהימה.</p>
            </div>
          </section>
        ) : current ? (
          <section className="cx-card cx-current" style={{ '--group': groupColor(p.level.index) } as CSSProperties}>
            <header className="cx-current__band">
              שלב {p.level.index + 1} מתוך {p.level.total}
            </header>
            <div className="cx-current__body">
              <h2>{current.title}</h2>
              <p className="cx-current__count">
                {current.completedCount} מתוך {current.tasks.length} משימות בוצעו
              </p>
              {nextTask && (
                <div className="cx-current__task">
                  <span className="cx-current__label">המשימה הבאה</span>
                  <strong>{nextTask.title}</strong>
                  {nextDue && <span className={`cx-due cx-due--${nextDue.tone}`}>{nextDue.label}</span>}
                </div>
              )}
              <button
                type="button"
                className="btn btn--game btn--lg btn--block"
                onClick={() => navigate(nextTask ? `/level/${current.id}/task/${nextTask.id}` : `/level/${current.id}`)}
              >
                <Icon name="dice" size={20} /> {nextTask ? 'התור שלי: למשימה הבאה' : 'כניסה לשלב'}
              </button>
              <Link to={`/level/${current.id}`} className="cx-current__all">
                לכל המשימות בשלב
              </Link>
            </div>
          </section>
        ) : (
          <section className="cx-card">
            <p>בתוכנית הזו עדיין אין שלבים.</p>
          </section>
        )}

        {upcoming.length > 0 && (
          <section className="cx-card">
            <h3 className="cx-card__title">
              <Icon name="clock" size={18} /> מועדים קרובים
            </h3>
            <ul className="cx-upcoming">
              {upcoming.map(({ task, chapter }) => {
                const due = dueInfo(task.dueAt, task.completed)
                return (
                  <li key={task.id}>
                    <Link to={`/level/${chapter.id}/task/${task.id}`}>
                      <span className="cx-upcoming__title">{task.title}</span>
                      <span className={`cx-due cx-due--${due?.tone ?? 'muted'}`}>{due?.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </aside>
    </div>
  )
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <svg className="cx-ring" viewBox="0 0 64 64" width="68" height="68" role="img" aria-label={`${percent}% הושלמו`}>
      <circle cx="32" cy="32" r={r} fill="#fff" stroke="var(--ink)" strokeWidth="11" />
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--paper-3)" strokeWidth="7" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="var(--gold)"
        strokeWidth="7"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)}
        transform="translate(64 0) scale(-1 1) rotate(-90 32 32)"
      />
      <text x="32" y="32" dy="0.35em" textAnchor="middle" className="cx-ring__text">
        {percent}%
      </text>
    </svg>
  )
}
