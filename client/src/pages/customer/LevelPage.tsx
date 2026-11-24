import type { CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { Mascot } from '../../components/mascot/Mascot'
import { StatusPill } from '../../components/TaskStatusControl'
import { dueInfo } from '../../lib/format'
import { DISTRICT_COLORS, missionLabel } from '../../lib/game'
import { taskStatus } from '../../lib/types'
import { useCustomer } from './customerContext'
import { NoPlan } from './NoPlan'

export function LevelPage() {
  const { chapterId } = useParams()
  const { me, plan, look } = useCustomer()
  const navigate = useNavigate()

  if (!plan) return <NoPlan name={me.name} />
  const index = plan.chapters.findIndex((c) => c.id === chapterId)
  const chapter = plan.chapters[index]

  if (!chapter) {
    return (
      <div className="cx-empty">
        <h2>השלב לא נמצא</h2>
        <Link to="/map" className="btn btn--light">
          חזרה לעיר
        </Link>
      </div>
    )
  }

  if (chapter.state === 'locked') {
    return (
      <div className="cx-empty">
        <span className="cx-empty__icon">
          <Icon name="lock" size={32} />
        </span>
        <h2>שלב {index + 1} עדיין נעול</h2>
        <p>סיימו את המשימות בשלב שלפניו כדי לפתוח אותו.</p>
        <Link to="/map" className="btn btn--light">
          חזרה לעיר
        </Link>
      </div>
    )
  }

  const percent = chapter.tasks.length ? Math.round((chapter.completedCount / chapter.tasks.length) * 100) : 100
  const next = plan.chapters[index + 1]

  return (
    <div className="cx-level" style={{ '--group': DISTRICT_COLORS[index % DISTRICT_COLORS.length], '--c': DISTRICT_COLORS[index % DISTRICT_COLORS.length] } as CSSProperties}>
      <Link to="/map" className="cx-back">
        <Icon name="arrowLeft" size={18} /> חזרה לעיר
      </Link>

      <header className="cx-deed cx-level__hero">
        <Mascot className="cx-level__mascot" look={look} pose={chapter.state === 'completed' ? 'cheer' : 'wave'} base={false} />
        <div className="cx-deed__band">
          <span className="cx-deed__eyebrow">
            שלב {index + 1} מתוך {plan.chapters.length}
          </span>
          <h1>{chapter.title}</h1>
        </div>
        <div className="cx-deed__body">
          {chapter.description && <p className="cx-level__description">{chapter.description}</p>}
          <div className="cx-level__progress">
            <div className="progress">
              <div className="progress__bar" style={{ width: `${percent}%` }} />
            </div>
            <span>
              {chapter.completedCount}/{chapter.tasks.length} משימות
            </span>
          </div>
        </div>
      </header>

      {chapter.state === 'completed' && (
        <div className="cx-celebrate" role="status">
          <Confetti />
          <Icon name="trophy" size={28} />
          <div>
            <strong>השלב הושלם!</strong>
            <span>{next ? `שלב ${index + 2} נפתח עכשיו.` : 'סיימתם את כל התוכנית.'}</span>
          </div>
          <button type="button" className="btn btn--game" onClick={() => navigate('/map')}>
            <Icon name="map" size={18} /> {next ? 'ממשיכים' : 'למפה'}
          </button>
        </div>
      )}

      {chapter.tasks.length === 0 ? (
        <p className="empty-note">בשלב הזה אין משימות.</p>
      ) : (
        <ol className="cx-tasks">
          {chapter.tasks.map((task, i) => {
            const status = taskStatus(task)
            const due = dueInfo(task.dueAt, task.completed)
            return (
              <li key={task.id} className={`cx-task cx-task--${status}`} style={{ '--i': i } as CSSProperties}>
                <Link to={`/level/${chapter.id}/task/${task.id}`} className="cx-task__link">
                  <span className="cx-task__number">{task.completed ? <Icon name="check" size={18} /> : missionLabel(task.title, i + 1).badge}</span>
                  <span className="cx-task__body">
                    <span className="cx-task__title">{missionLabel(task.title, i + 1).label}</span>
                    <span className="cx-task__meta">
                      {due && <span className={`cx-due cx-due--${due.tone}`}>{due.label}</span>}
                      {task.videoCount > 0 && (
                        <span className="cx-task__media">
                          <Icon name="video" size={14} /> {task.videoCount}
                        </span>
                      )}
                      {task.fileCount > 0 && (
                        <span className="cx-task__media">
                          <Icon name="file" size={14} /> {task.fileCount}
                        </span>
                      )}
                      {task.worksheetState?.score != null && (
                        <span className="cx-task__media cx-task__media--score">
                          <Icon name="sparkles" size={14} /> הבוחן: {task.worksheetState.score}
                        </span>
                      )}
                      {task.quizBest && (
                        <span className="cx-task__media">
                          <Icon name="bulb" size={14} /> חידון {task.quizBest.correct}/{task.quizBest.total}
                        </span>
                      )}
                      {task.submissions.length > 0 && (
                        <span className="cx-task__media cx-task__media--sent">
                          <Icon name="clip" size={14} /> {task.submissions.length === 1 ? 'הוגש קובץ' : `הוגשו ${task.submissions.length} קבצים`}
                        </span>
                      )}
                    </span>
                  </span>
                  <StatusPill status={status} />
                  <Icon name="chevronRight" size={18} className="cx-task__chevron" />
                </Link>
                {!task.completed && task.flow.steps.length > 0 && (
                  <span className="cx-task__steps" aria-label={`${task.flow.doneCount} מתוך ${task.flow.steps.length} צעדים`}>
                    {task.flow.steps.map((s) => (
                      <i key={s.key} className={`is-${s.state}`} title={s.label} />
                    ))}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function Confetti() {
  const colors = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--g4)', 'var(--g5)', 'var(--g6)']
  return (
    <span className="cx-confetti" aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 6) * 0.12}s`,
            transform: `rotate(${i * 29}deg)`,
          }}
        />
      ))}
    </span>
  )
}
