import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from '../../components/Icon'
import { Mascot } from '../../components/mascot/Mascot'
import { minutesLabel, missionLabel, SKILL_META } from '../../lib/game'
import type { Look, MyPlan, XpItem } from '../../lib/types'
import { focusPath } from './customerContext'

// Feedback for progress: "+XP" toasts, a level-up, a new business rank, and the end of a mission,
// which always leads to the next single thing to do.

export type Celebration = { kind: 'level'; level: number } | { kind: 'rank'; label: string } | { kind: 'task'; taskId: string }

type Props = {
  toasts: XpItem[]
  onToastDone: (id: string) => void
  celebration: Celebration | null
  onCelebrationDone: () => void
  look: Look | null
  plan: MyPlan | null
}

export function GameFeed({ toasts, onToastDone, celebration, onCelebrationDone, look, plan }: Props) {
  return (
    <>
      <div className="xp-toasts" aria-live="polite">
        {toasts.map((toast, i) => (
          <XpToast key={toast.id} item={toast} delay={i * 350} onDone={() => onToastDone(toast.id)} />
        ))}
      </div>
      {celebration?.kind === 'task' && plan ? (
        <MissionDone taskId={celebration.taskId} plan={plan} look={look} onDone={onCelebrationDone} />
      ) : celebration && celebration.kind !== 'task' ? (
        <LevelUp celebration={celebration} look={look} onDone={onCelebrationDone} />
      ) : null}
    </>
  )
}

function XpToast({ item, delay, onDone }: { item: XpItem; delay: number; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 4200 + delay)
    return () => window.clearTimeout(timer)
  }, [delay, onDone])
  const meta = SKILL_META[item.skill]
  return (
    <div className="xp-toast" style={{ animationDelay: `${delay}ms`, '--c': meta.color } as CSSProperties}>
      <span className="xp-toast__icon">
        <Icon name={meta.icon} size={18} />
      </span>
      <strong>+{item.points} XP</strong>
      <span className="xp-toast__label">{item.label}</span>
    </div>
  )
}

function Confetti() {
  return (
    <span className="level-up__confetti" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: ['#f0b84a', '#58c7e8', '#56d48a', '#e0796b', '#ffffff'][i % 5],
            animationDelay: `${(i % 8) * 0.12}s`,
          }}
        />
      ))}
    </span>
  )
}

function LevelUp({ celebration, look, onDone }: { celebration: Exclude<Celebration, { kind: 'task' }>; look: Look | null; onDone: () => void }) {
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setClosing(true), 4500)
    return () => window.clearTimeout(timer)
  }, [])
  const isLevel = celebration.kind === 'level'
  return (
    <div
      className={`level-up${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-label={isLevel ? `עליתם לרמה ${celebration.level}` : `דרגה חדשה: ${celebration.label}`}
      onClick={() => setClosing(true)}
      onAnimationEnd={(e) => closing && e.target === e.currentTarget && onDone()}
    >
      <div className="level-up__rays" aria-hidden="true" />
      <div className="level-up__card">
        <Mascot className="level-up__mascot" look={look} pose="cheer" />
        <p className="level-up__eyebrow">{isLevel ? 'רמה חדשה בלמידה' : 'דרגה חדשה בעסק'}</p>
        <h2 className="level-up__title">{isLevel ? `רמה ${celebration.level}` : celebration.label}</h2>
        <p className="level-up__sub">{isLevel ? 'הידע והתרגול שלכם עלו מדרגה.' : 'ההכנסות שלכם עלו מדרגה. כל הכבוד!'}</p>
      </div>
      <Confetti />
    </div>
  )
}

/** The end of a mission: what was achieved, and the one next thing. */
function MissionDone({ taskId, plan, look, onDone }: { taskId: string; plan: MyPlan; look: Look | null; onDone: () => void }) {
  const navigate = useNavigate()
  const task = plan.chapters.flatMap((c) => c.tasks).find((t) => t.id === taskId)
  const chapter = plan.chapters.find((c) => c.tasks.some((t) => t.id === taskId))
  const { focus } = plan
  if (!task) return null
  const levelDone = chapter?.state === 'completed'
  const go = (path: string) => {
    onDone()
    navigate(path)
  }
  return (
    <div className="level-up mission-done" role="dialog" aria-modal="true" aria-label="המשימה הושלמה">
      <div className="mission-done__card">
        <Mascot className="mission-done__mascot" look={look} pose="cheer" />
        <p className="level-up__eyebrow">{levelDone ? 'שלב שלם הושלם' : 'המשימה הושלמה'}</p>
        <h2 className="mission-done__title">{levelDone ? chapter!.title : missionLabel(task.title, 1).label}</h2>
        <ul className="mission-done__facts">
          {task.worksheetState?.score != null && (
            <li>
              <b>{task.worksheetState.score}</b> ציון הבוחן
            </li>
          )}
          {(task.worksheetState?.versions ?? 0) > 1 && (
            <li>
              <b>{task.worksheetState!.versions}</b> גרסאות שיפרתם
            </li>
          )}
          {task.quizBest && (
            <li>
              <b>
                {task.quizBest.correct}/{task.quizBest.total}
              </b>{' '}
              בחידון
            </li>
          )}
          <li>
            <b>
              {plan.summary.completed}/{plan.summary.total}
            </b>{' '}
            משימות במסלול
          </li>
        </ul>
        {focus.kind === 'task' ? (
          <div className="mission-done__next">
            <small>הדבר הבא</small>
            <strong>{missionLabel(focus.title, 1).label}</strong>
            <span>
              {focus.cta} · {minutesLabel(focus.minutes)}
            </span>
          </div>
        ) : null}
        <div className="mission-done__actions">
          <button type="button" className="btn btn--game btn--lg" onClick={() => go(focusPath(plan))} autoFocus>
            {focus.kind === 'finished' ? 'לתוצאות העסק' : 'למשימה הבאה'}
          </button>
          <button type="button" className="btn btn--ghost-light" onClick={() => go('/map')}>
            למפה
          </button>
        </div>
      </div>
      <Confetti />
    </div>
  )
}
