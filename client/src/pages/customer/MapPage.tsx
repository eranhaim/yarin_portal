import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { CityMap } from '../../components/city/CityMap'
import { Icon } from '../../components/Icon'
import { DISTRICT_COLORS, formatShekels, missionLabel } from '../../lib/game'
import { useCustomer } from './customerContext'
import { NoPlan } from './NoPlan'

/** Remembers the last mission the customer saw, so their character can walk to a new one. */
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
      // Storage can be blocked (private mode). The map still works without it.
    }
  }
  return { lastSeen, save }
}

export function MapPage() {
  const { me, plan } = useCustomer()
  if (!plan) return <NoPlan name={me.name} />
  return <PlanCity key={plan.id} />
}

function PlanCity() {
  const { me, plan, game, look, hosts } = useCustomer()
  const navigate = useNavigate()
  const p = plan!
  const position = p.level.position
  const { lastSeen, save } = useLastSeenPosition(`yp:city:${me.id}:${p.id}`, position)
  const [passed, setPassed] = useState(false)

  const current = p.chapters[p.level.index]
  const nextTask = current?.tasks.find((t) => !t.completed)
  const flatIndex = p.chapters.slice(0, p.level.index).reduce((n, c) => n + c.tasks.length, 0) + (current?.tasks.findIndex((t) => !t.completed) ?? 0)
  const label = nextTask ? missionLabel(nextTask.title, flatIndex + 1) : null
  const percent = p.summary.total ? Math.round((p.summary.completed / p.summary.total) * 100) : 0
  const color = DISTRICT_COLORS[p.level.index % DISTRICT_COLORS.length]

  const arrive = () => {
    // A walk that covered new missions earns the big banner.
    if (lastSeen < position) setPassed(true)
    save()
  }

  return (
    <div className="city-page">
      <CityMap
        plan={p}
        look={look}
        hosts={hosts}
        walkFrom={lastSeen}
        onArrive={arrive}
        onSelectMission={(chapterId, taskId) => navigate(`/level/${chapterId}/task/${taskId}`)}
      />

      {/* HUD */}
      <div className="hud hud--player">
        <div className="hud__level">
          <b>{game?.level ?? 1}</b>
          <span>רמה</span>
        </div>
        <div className="hud__who">
          <strong>{me.name.split(' ')[0]}</strong>
          <span className="hud__bar" aria-label={`${percent}% מהתוכנית`}>
            <i style={{ width: `${percent}%` }} />
          </span>
          <small>
            {p.summary.completed}/{p.summary.total} משימות · {game?.xp ?? 0} XP
          </small>
        </div>
        {game && game.streak > 0 && (
          <span className="hud__streak" title="ימים ברצף">
            <Icon name="sparkles" size={14} /> {game.streak}
          </span>
        )}
      </div>

      <Link to="/rewards" className="hud hud--money" title="הדרך לבוס">
        <span className="hud__money">{formatShekels(game?.revenue.latest ?? 0)}</span>
        <span className="hud__rank">
          {game?.revenue.rank.label ?? 'טירון'}
          {game?.revenue.next && <small> · הבא: {game.revenue.next.label}</small>}
        </span>
      </Link>

      {p.level.finished ? (
        <div className="hud hud--mission" style={{ '--c': '#ffd84d' } as CSSProperties}>
          <span className="hud__tag">התוכנית הושלמה</span>
          <h2>אתם הבוס!</h2>
          <p>סיימתם את כל המשימות בעיר. עכשיו מגדילים את ההכנסות.</p>
          <Link to="/rewards" className="btn btn--game">
            <Icon name="trophy" size={18} /> לדרך לבוס
          </Link>
        </div>
      ) : current && nextTask && label ? (
        <div className="hud hud--mission" style={{ '--c': color } as CSSProperties}>
          <span className="hud__tag">
            שלב {p.level.index + 1}: {current.title}
          </span>
          <h2>
            <b>{label.badge}</b> {label.label}
          </h2>
          <div className="hud__actions">
            <button type="button" className="btn btn--game" onClick={() => navigate(`/level/${current.id}/task/${nextTask.id}`)}>
              <Icon name="play" size={18} /> יאללה, למשימה
            </button>
            <Link to={`/level/${current.id}`} className="btn btn--ghost-light">
              כל המשימות בשלב
            </Link>
          </div>
        </div>
      ) : null}

      {passed && (
        <div className="mission-passed" onAnimationEnd={(e) => e.animationName === 'mission-passed-out' && setPassed(false)}>
          <span>משימה הושלמה!</span>
          <small>הדמות שלכם התקדמה בעיר</small>
        </div>
      )}
    </div>
  )
}
