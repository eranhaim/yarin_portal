import type { CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { Mascot } from '../../components/mascot/Mascot'
import { formatDateTime } from '../../lib/format'
import { SKILL_META } from '../../lib/game'
import { useCustomer } from './customerContext'

/** How to earn points (mirrors the server's XP table). */
const EARN = [
  { points: 10, label: 'מתחילים משימה' },
  { points: 60, label: 'מסיימים משימה' },
  { points: 40, label: 'מגישים מסך עבודה' },
  { points: 30, label: 'מגישים קובץ' },
  { points: 120, label: 'ציון מלא מהבוחן' },
  { points: 50, label: 'חידון בלי טעויות' },
  { points: 80, label: 'סימולטור מכירות או תסריטים' },
  { points: 200, label: 'חבר שהצטרף בזכותכם' },
]

export function SkillsPage() {
  const { me, game, look } = useCustomer()
  if (!game) {
    return (
      <div className="page-loader">
        <span className="spinner" />
      </div>
    )
  }
  const progress = Math.round(((game.xp - game.floor) / Math.max(1, game.nextAt - game.floor)) * 100)
  const top = [...game.skills].sort((a, b) => b.points - a.points)[0]

  return (
    <div className="skills-page">
      <header className="panel skills-hero">
        <Mascot className="skills-hero__mascot" look={look} pose="idle" />
        <div className="skills-hero__text">
          <span className="gta-eyebrow">כרטיס השחקן</span>
          <h1 className="gta-title">{me.name}</h1>
          <div className="skills-hero__level">
            <b>{game.level}</b>
            <div>
              <span>רמה {game.level}</span>
              <span className="xp-bar">
                <i style={{ width: `${progress}%` }} />
              </span>
              <small>
                {game.xp} XP · עוד {game.nextAt - game.xp} לרמה {game.level + 1}
              </small>
            </div>
          </div>
          <div className="skills-hero__facts">
            <span>
              <Icon name="sparkles" size={16} /> {game.streak} ימים ברצף
            </span>
            {top && top.points > 0 && (
              <span>
                <Icon name={SKILL_META[top.key].icon} size={16} /> הכי חזק ב{top.label}
              </span>
            )}
            <span>
              <Icon name="trophy" size={16} /> דרגה: {game.revenue.rank.label}
            </span>
          </div>
        </div>
      </header>

      <section>
        <h2 className="section-title">הסקילים</h2>
        <ul className="skills-grid">
          {game.skills.map((skill, i) => {
            const meta = SKILL_META[skill.key]
            const span = skill.nextAt === null ? 1 : Math.max(1, skill.nextAt - skill.floor)
            const pct = skill.nextAt === null ? 100 : Math.round(((skill.points - skill.floor) / span) * 100)
            return (
              <li key={skill.key} className="skill-card" style={{ '--c': meta.color, animationDelay: `${i * 50}ms` } as CSSProperties}>
                <span className="skill-card__icon">
                  <Icon name={meta.icon} size={22} />
                </span>
                <div className="skill-card__body">
                  <strong>{skill.label}</strong>
                  <span className="skill-card__bar">
                    <i style={{ width: `${pct}%` }} />
                  </span>
                  <small>
                    {skill.points} נק׳{skill.nextAt !== null ? ` · עוד ${skill.nextAt - skill.points} לרמה הבאה` : ' · רמה מקסימלית'}
                  </small>
                </div>
                <span className="skill-card__level">
                  <small>רמה</small>
                  {skill.level}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="skills-split">
        <section className="panel">
          <h2 className="panel__title">
            <Icon name="star" size={18} /> איך מרוויחים XP
          </h2>
          <ul className="earn-list">
            {EARN.map((e) => (
              <li key={e.label}>
                <b>+{e.points}</b> {e.label}
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2 className="panel__title">
            <Icon name="clock" size={18} /> נקודות אחרונות
          </h2>
          {game.recent.length === 0 ? (
            <p className="empty-note">עוד אין נקודות. התחילו משימה בעיר!</p>
          ) : (
            <ul className="xp-feed">
              {game.recent.map((e) => (
                <li key={e.id} style={{ '--c': SKILL_META[e.skill]?.color } as CSSProperties}>
                  <b>+{e.points}</b>
                  <span>{e.label}</span>
                  <small>{formatDateTime(e.at)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
