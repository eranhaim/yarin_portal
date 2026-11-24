import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { CityMap } from '../../components/city/CityMap'
import { Icon } from '../../components/Icon'
import { DISTRICT_COLORS, formatShekels, minutesLabel, missionLabel, monthLabel, STEP_ICON } from '../../lib/game'
import type { GameSummary, MyPlan } from '../../lib/types'
import { focusPath, useCustomer } from './customerContext'
import './map.css'
import { NoPlan } from './NoPlan'

// The home screen. The city is the background; the one thing to do now is in front, and the two metrics
// (learning and business) sit side by side, apart.

/** Remembers the last mission the customer saw, so the car drives from there to a new one. */
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
  return <PlanCity key={plan.id} plan={plan} />
}

function PlanCity({ plan }: { plan: MyPlan }) {
  const { me, game, look, hosts } = useCustomer()
  const navigate = useNavigate()
  const { position } = plan.level
  const { lastSeen, save } = useLastSeenPosition(`yp:city:${me.id}:${plan.id}`, position)
  const [leaving, setLeaving] = useState(false)

  /** The car drives up to the mission, and the page opens when it arrives. */
  const go = () => {
    if (plan.focus.kind === 'task') setLeaving(true)
    else navigate(focusPath(plan))
  }

  return (
    <div className="city-page">
      <CityMap
        plan={plan}
        look={look}
        hosts={hosts}
        walkFrom={lastSeen}
        leaving={leaving}
        onLeft={() => navigate(focusPath(plan))}
        onArrive={save}
        onSelectMission={(chapterId, taskId) => navigate(`/level/${chapterId}/task/${taskId}`)}
      />
      <FocusCard plan={plan} onGo={go} leaving={leaving} />
      {game && <Meters plan={plan} game={game} />}
    </div>
  )
}

function FocusCard({ plan, onGo, leaving }: { plan: MyPlan; onGo: () => void; leaving: boolean }) {
  const { focus } = plan
  const chapterIndex = plan.chapters.findIndex((c) => c.id === focus.chapterId)
  const chapter = plan.chapters[chapterIndex]
  const task = chapter?.tasks.find((t) => t.id === focus.taskId)
  const color = chapterIndex >= 0 ? DISTRICT_COLORS[chapterIndex % DISTRICT_COLORS.length] : undefined
  return (
    <section className="focus-card" style={{ '--c': color } as CSSProperties} aria-label="המשימה שלכם עכשיו">
      <p className="focus-card__eyebrow">
        <span className="focus-bar__dot" aria-hidden="true" />
        {focus.kind === 'finished' ? 'סוף המסלול' : focus.kind === 'diagnosis' ? 'מתחילים כאן' : `המשימה שלכם עכשיו · שלב ${chapterIndex + 1}`}
      </p>
      <h1>{missionLabel(focus.title, 1).label}</h1>
      <p className="focus-card__why">{focus.why}</p>
      {task && task.flow.steps.length > 0 && (
        <ol className="focus-card__steps" aria-label={`${focus.done} מתוך ${focus.total} צעדים`}>
          {task.flow.steps.map((s) => (
            <li key={s.key} className={`is-${s.state}`} title={s.label}>
              <Icon name={s.state === 'done' ? 'check' : STEP_ICON[s.key]} size={15} />
              {s.state === 'current' && <span>{s.label}</span>}
            </li>
          ))}
        </ol>
      )}
      <div className="focus-card__actions">
        <button type="button" className="btn btn--game btn--lg" onClick={onGo} disabled={leaving}>
          {focus.cta}
          {focus.minutes > 0 && <small>{minutesLabel(focus.minutes)}</small>}
        </button>
        {chapter && (
          <Link to={`/level/${chapter.id}`} className="focus-card__more">
            כל השלב
          </Link>
        )}
      </div>
    </section>
  )
}

function Meters({ plan, game }: { plan: MyPlan; game: GameSummary }) {
  const { business } = game
  const percent = plan.summary.total ? Math.round((plan.summary.completed / plan.summary.total) * 100) : 0
  return (
    <div className="meters">
      <Link to="/learning" className="meters__item meters__item--learn">
        <small>
          <Icon name="star" size={14} /> למידה
        </small>
        <b>{percent}%</b>
        <span className="meters__bar">
          <i style={{ width: `${percent}%` }} />
        </span>
        <span>
          {plan.summary.completed}/{plan.summary.total} משימות · רמה {game.level}
        </span>
      </Link>
      <Link to="/business" className="meters__item meters__item--biz">
        <small>
          <Icon name="chart" size={14} /> העסק
        </small>
        <b>{business.latest ? formatShekels(business.latest.revenue) : '—'}</b>
        <span className="meters__bar">
          <i style={{ width: `${Math.min(100, ((business.latest?.revenue ?? 0) / 100_000) * 100)}%` }} />
        </span>
        <span>{business.due ? `${monthLabel(business.due)} מחכה לעדכון` : business.latest ? business.rank.label : 'מתחילים באבחון'}</span>
      </Link>
    </div>
  )
}
