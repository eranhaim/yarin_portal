import { useEffect, useState, type CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { Mascot } from '../../components/mascot/Mascot'
import { SKILL_META } from '../../lib/game'
import type { Look, XpItem } from '../../lib/types'

// The dopamine layer: "+XP" toasts for every new point, and a full-screen celebration on level-up.

export type Celebration = { kind: 'level'; level: number } | { kind: 'rank'; label: string }

type Props = {
  toasts: XpItem[]
  onToastDone: (id: string) => void
  celebration: Celebration | null
  onCelebrationDone: () => void
  look: Look | null
}

export function GameFeed({ toasts, onToastDone, celebration, onCelebrationDone, look }: Props) {
  return (
    <>
      <div className="xp-toasts" aria-live="polite">
        {toasts.map((toast, i) => (
          <XpToast key={toast.id} item={toast} delay={i * 350} onDone={() => onToastDone(toast.id)} />
        ))}
      </div>
      {celebration && <LevelUp celebration={celebration} look={look} onDone={onCelebrationDone} />}
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

function LevelUp({ celebration, look, onDone }: { celebration: Celebration; look: Look | null; onDone: () => void }) {
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setClosing(true), 4500)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <div
      className={`level-up${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-label={celebration.kind === 'level' ? `עליתם לרמה ${celebration.level}` : `דרגה חדשה: ${celebration.label}`}
      onClick={() => setClosing(true)}
      onAnimationEnd={(e) => closing && e.target === e.currentTarget && onDone()}
    >
      <div className="level-up__rays" aria-hidden="true" />
      <div className="level-up__card">
        <Mascot className="level-up__mascot" look={look} pose="cheer" />
        <p className="level-up__eyebrow">{celebration.kind === 'level' ? 'LEVEL UP' : 'דרגה חדשה'}</p>
        <h2 className="level-up__title">{celebration.kind === 'level' ? `רמה ${celebration.level}!` : celebration.label}</h2>
        <p className="level-up__sub">{celebration.kind === 'level' ? 'אתם בדרך להיות הבוס. ממשיכים!' : 'ההכנסות שלכם קפצו דרגה. כל הכבוד!'}</p>
      </div>
      <span className="level-up__confetti" aria-hidden="true">
        {Array.from({ length: 40 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 37) % 100}%`,
              background: ['#ff4fa3', '#2fe0b0', '#ffd84d', '#b18cff', '#4fb3ff'][i % 5],
              animationDelay: `${(i % 8) * 0.12}s`,
            }}
          />
        ))}
      </span>
    </div>
  )
}
