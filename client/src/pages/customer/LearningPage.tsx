import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { Mascot } from '../../components/mascot/Mascot'
import { formatDateTime } from '../../lib/format'
import { DISTRICT_COLORS, missionLabel, SKILL_META } from '../../lib/game'
import { useCustomer } from './customerContext'
import './metrics.css'
import { NoPlan } from './NoPlan'

// The first metric: learning. Tasks, the quality of the work, and skills. Nothing here comes from income.

export function LearningPage() {
  const { me, plan, game, look } = useCustomer()
  if (!plan) return <NoPlan name={me.name} />
  if (!game) {
    return (
      <div className="page-loader">
        <span className="spinner" />
      </div>
    )
  }
  const { learning } = game
  const percent = plan.summary.total ? Math.round((plan.summary.completed / plan.summary.total) * 100) : 0
  const levelPercent = Math.round(((game.xp - game.floor) / Math.max(1, game.nextAt - game.floor)) * 100)

  return (
    <div className="metric metric--learn">
      <header className="metric__hero">
        <div className="metric__hero-text">
          <span className="gta-eyebrow">מדד הלמידה</span>
          <h1 className="gta-title">איך אתם מתקדמים</h1>
          <p>משימות, תרגול ואיכות העבודה. המדד הזה לא תלוי בהכנסות: אפשר להתקדם כאן לפני שרואים שינוי בעסק.</p>
          <div className="metric__big">
            <b>{percent}%</b>
            <div>
              <span>
                {plan.summary.completed} מתוך {plan.summary.total} משימות במסלול שלכם
              </span>
              <span className="progress">
                <span className="progress__bar" style={{ width: `${percent}%`, display: 'block', height: '100%' }} />
              </span>
            </div>
          </div>
        </div>
        <Mascot className="metric__mascot" look={look} pose="idle" base={false} />
      </header>

      <ul className="stat-row">
        <li>
          <small>ציון ממוצע של הבוחן</small>
          <b>{learning.averageScore ?? '—'}</b>
          <span>{learning.checked === 0 ? 'עוד לא נבדקה עבודה' : learning.checked === 1 ? 'עבודה אחת נבדקה' : `${learning.checked} עבודות נבדקו`}</span>
        </li>
        <li>
          <small>שיפור בין גרסאות</small>
          <b>{learning.averageImprovement === null ? '—' : `${learning.averageImprovement > 0 ? '+' : ''}${learning.averageImprovement}`}</b>
          <span>נקודות בממוצע, מהגרסה הראשונה לאחרונה</span>
        </li>
        <li>
          <small>רמה</small>
          <b>{game.level}</b>
          <span>
            {game.xp} XP · עוד {game.nextAt - game.xp} לרמה הבאה
          </span>
          <i className="stat-row__bar" style={{ '--p': `${levelPercent}%` } as CSSProperties} />
        </li>
        <li>
          <small>רצף</small>
          <b>{game.streak}</b>
          <span>{game.streak === 1 ? 'יום אחד' : 'ימים ברצף'}</span>
        </li>
      </ul>

      <section className="panel">
        <div className="panel__head">
          <div>
            <h2>המסלול שלי</h2>
            <p>
              {plan.route.track ? (
                <>
                  {plan.route.track.label} · {plan.route.track.focus}
                </>
              ) : (
                'אחרי האבחון תקבלו מסלול שמתאים לסוג העסק שלכם.'
              )}
            </p>
          </div>
          <Link to="/diagnosis" className="btn btn--sm btn--ghost-light">
            {plan.route.diagnosed ? 'האבחון שלי' : 'לאבחון'}
          </Link>
        </div>
        <ol className="road">
          {plan.chapters.map((chapter, i) => (
            <li key={chapter.id} className={`road__level road__level--${chapter.state}`} style={{ '--c': DISTRICT_COLORS[i % DISTRICT_COLORS.length] } as CSSProperties}>
              <div className="road__head">
                <span className="road__num">{chapter.state === 'completed' ? <Icon name="check" size={15} /> : chapter.state === 'locked' ? <Icon name="lock" size={14} /> : i + 1}</span>
                <b>{chapter.title}</b>
                <small>
                  {chapter.completedCount}/{chapter.tasks.length}
                </small>
              </div>
              <ul>
                {chapter.tasks.map((task, k) => {
                  const label = missionLabel(task.title, k + 1)
                  const special = (task.tracks?.length ?? 0) > 0
                  const inner = (
                    <>
                      <span className={`road__dot${task.completed ? ' is-done' : ''}${plan.focus.taskId === task.id ? ' is-now' : ''}`} />
                      <span className="road__title">
                        {label.label}
                        {special && <em>במסלול שלכם</em>}
                      </span>
                      {task.worksheetState?.score != null && <small>{task.worksheetState.score}</small>}
                    </>
                  )
                  return (
                    <li key={task.id}>{chapter.state === 'locked' ? <span className="road__task">{inner}</span> : <Link className="road__task" to={`/level/${chapter.id}/task/${task.id}`}>{inner}</Link>}</li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="section-title">סקילים</h2>
        <ul className="skills-grid">
          {game.skills.map((skill) => {
            const meta = SKILL_META[skill.key]
            const span = skill.nextAt === null ? 1 : Math.max(1, skill.nextAt - skill.floor)
            const pct = skill.nextAt === null ? 100 : Math.round(((skill.points - skill.floor) / span) * 100)
            return (
              <li key={skill.key} className="skill-card" style={{ '--c': meta.color } as CSSProperties}>
                <span className="skill-card__icon">
                  <Icon name={meta.icon} size={19} />
                </span>
                <div>
                  <strong>{skill.label}</strong>
                  <i className="skill-card__bar" style={{ '--p': `${pct}%` } as CSSProperties} />
                  <small>
                    {skill.points} נק׳{skill.nextAt !== null ? ` · עוד ${skill.nextAt - skill.points}` : ''}
                  </small>
                </div>
                <b>{skill.level}</b>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel">
        <h2 className="panel__title">
          <Icon name="clock" size={18} /> מה עשיתם לאחרונה
        </h2>
        {game.recent.length === 0 ? (
          <p className="empty-note">עוד אין פעילות. התחילו מהמשימה הנוכחית.</p>
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
  )
}
