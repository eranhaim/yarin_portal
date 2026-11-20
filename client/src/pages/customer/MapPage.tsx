import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { GameMap, type MapLevel } from '../../components/GameMap'
import { Icon } from '../../components/Icon'
import { dueInfo } from '../../lib/format'
import { useCustomer } from './customerContext'
import { NoPlan } from './NoPlan'

/** Remembers the last level the customer saw, so the character can walk to a new level. */
function useLastSeenLevel(key: string, current: number) {
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
      // Storage can be blocked (private mode). The map still works without it.
    }
  }
  return { lastSeen, save }
}

export function MapPage() {
  const { me, plan } = useCustomer()
  if (!plan) return <NoPlan name={me.name} />
  return <PlanMap key={plan.id} />
}

function PlanMap() {
  const { me, plan } = useCustomer()
  const navigate = useNavigate()
  const p = plan!
  const { lastSeen, save } = useLastSeenLevel(`yp:map:${me.id}:${p.id}`, p.level.index)

  const levels: MapLevel[] = p.chapters.map((c) => ({
    id: c.id,
    title: c.title,
    state: c.state,
    total: c.tasks.length,
    completed: c.completedCount,
  }))

  const current = p.chapters[p.level.index]
  const percent = p.summary.total ? Math.round((p.summary.completed / p.summary.total) * 100) : 0

  const upcoming = useMemo(
    () =>
      p.chapters
        .filter((c) => c.state !== 'locked')
        .flatMap((c) => c.tasks.filter((t) => !t.completed).map((t) => ({ task: t, chapter: c })))
        .sort((a, b) => (a.task.dueAt ?? '9999').localeCompare(b.task.dueAt ?? '9999'))
        .slice(0, 3),
    [p],
  )

  return (
    <div className="cx-map">
      <aside className="cx-map__panel">
        <section className="cx-card cx-hello">
          <p className="cx-eyebrow">{p.title}</p>
          <h1>Hi {me.name.split(' ')[0]}!</h1>
          <div className="cx-hello__progress">
            <ProgressRing percent={percent} />
            <div>
              <strong>
                {p.summary.completed} of {p.summary.total} tasks
              </strong>
              <span>completed so far</span>
            </div>
          </div>
        </section>

        <section className="cx-card cx-current">
          {p.level.finished ? (
            <>
              <span className="cx-current__badge cx-current__badge--gold">
                <Icon name="trophy" size={16} /> Plan complete
              </span>
              <h2>You did it!</h2>
              <p>You finished every level of the plan. Amazing work.</p>
            </>
          ) : current ? (
            <>
              <span className="cx-current__badge">
                Level {p.level.index + 1} of {p.level.total}
              </span>
              <h2>{current.title}</h2>
              <p>
                {current.completedCount} of {current.tasks.length} tasks completed
              </p>
              <button type="button" className="btn btn--game btn--lg btn--block" onClick={() => navigate(`/level/${current.id}`)}>
                <Icon name="play" size={18} /> Enter level
              </button>
            </>
          ) : (
            <p>This plan has no levels yet.</p>
          )}
        </section>

        {upcoming.length > 0 && (
          <section className="cx-card">
            <h3 className="cx-card__title">Coming up</h3>
            <ul className="cx-upcoming">
              {upcoming.map(({ task, chapter }) => {
                const due = dueInfo(task.dueAt, task.completed)
                return (
                  <li key={task.id}>
                    <Link to={`/level/${chapter.id}/task/${task.id}`}>
                      <span className="cx-upcoming__title">{task.title}</span>
                      <span className={`cx-due cx-due--${due?.tone ?? 'muted'}`}>{due?.label ?? 'No due time'}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {(p.videos.length > 0 || p.files.length > 0) && (
          <Link to="/library" className="cx-card cx-library-link">
            <span className="cx-library-link__icon">
              <Icon name="video" size={22} />
            </span>
            <span>
              <strong>Guidance library</strong>
              <span>
                {p.videos.length} video{p.videos.length === 1 ? '' : 's'} · {p.files.length} file
                {p.files.length === 1 ? '' : 's'}
              </span>
            </span>
            <Icon name="chevronRight" size={18} />
          </Link>
        )}
      </aside>

      <section className="cx-map__board" aria-label="Your map">
        <GameMap
          levels={levels}
          player={{ id: me.id, name: me.name, avatarUrl: me.avatarUrl, levelIndex: p.level.index }}
          animateFrom={lastSeen}
          onArrive={save}
          autoScroll
          onSelectLevel={(i) => navigate(`/level/${p.chapters[i]!.id}`)}
        />
        <p className="cx-map__hint">
          Locked levels open when you complete the tasks of the level before them.
        </p>
      </section>
    </div>
  )
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <svg className="cx-ring" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label={`${percent}% complete`}>
      <defs>
        <linearGradient id="cx-ring-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd56b" />
          <stop offset="100%" stopColor="#ff6b4a" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="7" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="url(#cx-ring-gradient)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="32" dy="0.35em" textAnchor="middle" className="cx-ring__text">
        {percent}%
      </text>
    </svg>
  )
}
