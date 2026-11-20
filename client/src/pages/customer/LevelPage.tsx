import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { StatusPill } from '../../components/TaskStatusControl'
import { errorMessage } from '../../lib/api'
import { dueInfo } from '../../lib/format'
import { taskStatus, type MyTask } from '../../lib/types'
import { useCustomer } from './customerContext'
import { NoPlan } from './NoPlan'

export function LevelPage() {
  const { chapterId } = useParams()
  const { me, plan, updateTask } = useCustomer()
  const navigate = useNavigate()
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!plan) return <NoPlan name={me.name} />
  const index = plan.chapters.findIndex((c) => c.id === chapterId)
  const chapter = plan.chapters[index]

  if (!chapter) {
    return (
      <div className="cx-empty">
        <h2>Level not found</h2>
        <Link to="/map" className="btn btn--light">
          Back to the map
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
        <h2>Level {index + 1} is locked</h2>
        <p>Complete the tasks of the level before it to open this level.</p>
        <Link to="/map" className="btn btn--light">
          Back to the map
        </Link>
      </div>
    )
  }

  const percent = chapter.tasks.length ? Math.round((chapter.completedCount / chapter.tasks.length) * 100) : 100
  const next = plan.chapters[index + 1]

  const quickAction = async (task: MyTask) => {
    setBusyTask(task.id)
    setError(null)
    try {
      await updateTask(task.id, task.started ? 'completed' : 'started')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyTask(null)
    }
  }

  return (
    <div className="cx-level">
      <Link to="/map" className="cx-back">
        <Icon name="arrowLeft" size={18} /> Map
      </Link>

      <header className={`cx-level__hero cx-level__hero--${chapter.state}`}>
        <span className="cx-level__badge">{index + 1}</span>
        <div className="cx-level__heading">
          <p className="cx-eyebrow">
            Level {index + 1} of {plan.chapters.length}
          </p>
          <h1>{chapter.title}</h1>
          {chapter.description && <p className="cx-level__description">{chapter.description}</p>}
          <div className="cx-level__progress">
            <div className="progress">
              <div className="progress__bar" style={{ width: `${percent}%` }} />
            </div>
            <span>
              {chapter.completedCount}/{chapter.tasks.length} tasks
            </span>
          </div>
        </div>
      </header>

      {chapter.state === 'completed' && (
        <div className="cx-celebrate" role="status">
          <Confetti />
          <Icon name="trophy" size={28} />
          <div>
            <strong>Level complete!</strong>
            <span>{next ? `Level ${index + 2} is open now.` : 'You finished the whole plan.'}</span>
          </div>
          <button type="button" className="btn btn--game" onClick={() => navigate('/map')}>
            {next ? 'Continue on the map' : 'See the map'}
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {chapter.tasks.length === 0 ? (
        <p className="empty-note">This level has no tasks.</p>
      ) : (
        <ol className="cx-tasks">
          {chapter.tasks.map((task, i) => {
            const status = taskStatus(task)
            const due = dueInfo(task.dueAt, task.completed)
            return (
              <li key={task.id} className={`cx-task cx-task--${status}`}>
                <Link to={`/level/${chapter.id}/task/${task.id}`} className="cx-task__link">
                  <span className="cx-task__number">{task.completed ? <Icon name="check" size={18} /> : i + 1}</span>
                  <span className="cx-task__body">
                    <span className="cx-task__title">{task.title}</span>
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
                    </span>
                  </span>
                  <StatusPill status={status} />
                  <Icon name="chevronRight" size={18} className="cx-task__chevron" />
                </Link>
                {!task.completed && (
                  <button
                    type="button"
                    className="btn btn--sm btn--light cx-task__action"
                    disabled={busyTask === task.id}
                    onClick={() => void quickAction(task)}
                  >
                    {busyTask === task.id ? <span className="spinner" /> : <Icon name={task.started ? 'check' : 'play'} size={14} />}
                    {task.started ? 'Mark complete' : 'Start'}
                  </button>
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
  const colors = ['#ffd56b', '#ff6b4a', '#8c78ff', '#4ade80', '#60a5fa']
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
