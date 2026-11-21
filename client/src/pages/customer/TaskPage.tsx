import { useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router'
import { groupColor } from '../../lib/groups'
import { FileList } from '../../components/FileList'
import { Icon } from '../../components/Icon'
import { TaskStatusControl } from '../../components/TaskStatusControl'
import { VideoPlaylist } from '../../components/VideoPlaylist'
import { errorMessage } from '../../lib/api'
import { dueInfo } from '../../lib/format'
import { taskStatus, type TaskStatus } from '../../lib/types'
import { useCustomer } from './customerContext'
import { NoPlan } from './NoPlan'

export function TaskPage() {
  const { chapterId, taskId } = useParams()
  const { me, plan, updateTask } = useCustomer()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!plan) return <NoPlan name={me.name} />
  const chapterIndex = plan.chapters.findIndex((c) => c.id === chapterId)
  const chapter = plan.chapters[chapterIndex]
  const taskIndex = chapter?.tasks.findIndex((t) => t.id === taskId) ?? -1
  const task = chapter?.tasks[taskIndex]

  if (!chapter || !task || chapter.state === 'locked') {
    return (
      <div className="cx-empty">
        <h2>{chapter?.state === 'locked' ? 'השלב הזה עדיין נעול' : 'המשימה לא נמצאה'}</h2>
        <Link to="/map" className="btn btn--light">
          חזרה ללוח
        </Link>
      </div>
    )
  }

  const status = taskStatus(task)
  const due = dueInfo(task.dueAt, task.completed)
  const prev = chapter.tasks[taskIndex - 1]
  const next = chapter.tasks[taskIndex + 1]

  const change = async (value: TaskStatus) => {
    setBusy(true)
    setError(null)
    try {
      await updateTask(task.id, value)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="cx-taskpage" style={{ '--group': groupColor(chapterIndex) } as CSSProperties}>
      <Link to={`/level/${chapter.id}`} className="cx-back">
        <Icon name="arrowLeft" size={18} /> שלב {chapterIndex + 1}: {chapter.title}
      </Link>

      <header className="cx-deed cx-taskpage__head">
        <div className="cx-deed__band">
          <span className="cx-deed__eyebrow">
            משימה {taskIndex + 1} מתוך {chapter.tasks.length}
          </span>
          <h1>{task.title}</h1>
        </div>
        <div className="cx-deed__body cx-taskpage__meta">
          {due ? (
            <span className={`cx-due cx-due--${due.tone}`}>
              <Icon name="clock" size={14} /> {due.label}
            </span>
          ) : (
            <span />
          )}
          <TaskStatusControl value={status} onChange={(v) => void change(v)} disabled={busy} />
        </div>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {task.description && (
        <section className="cx-paper cx-taskpage__description">
          <h2 className="cx-paper__title">
            <Icon name="list" size={18} /> מה עושים?
          </h2>
          <p>{task.description}</p>
        </section>
      )}

      {task.videos.length > 0 && (
        <section className="cx-section">
          <h2 className="cx-section__title">
            <Icon name="video" size={20} /> סרטונים
          </h2>
          <VideoPlaylist videos={task.videos} heading="סרטוני המשימה" />
        </section>
      )}

      {task.files.length > 0 && (
        <section className="cx-section">
          <h2 className="cx-section__title">
            <Icon name="file" size={20} /> קבצים להורדה
          </h2>
          <FileList files={task.files} />
        </section>
      )}

      {task.videos.length === 0 && task.files.length === 0 && !task.description && (
        <p className="empty-note">אין סרטונים או קבצים למשימה הזו.</p>
      )}

      {status !== 'completed' && (
        <div className="cx-taskpage__cta">
          <button
            type="button"
            className="btn btn--game btn--lg"
            disabled={busy}
            onClick={() => void change(status === 'not_started' ? 'started' : 'completed')}
          >
            <Icon name={status === 'not_started' ? 'play' : 'check'} size={18} />
            {status === 'not_started' ? 'מתחילים את המשימה' : 'סיימתי! סימון כבוצע'}
          </button>
        </div>
      )}

      <nav className="cx-taskpage__pager" aria-label="משימות נוספות בשלב">
        {prev ? (
          <Link to={`/level/${chapter.id}/task/${prev.id}`} className="cx-pager">
            <Icon name="chevronLeft" size={18} />
            <span>
              <small>המשימה הקודמת</small>
              {prev.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/level/${chapter.id}/task/${next.id}`} className="cx-pager cx-pager--next">
            <span>
              <small>המשימה הבאה</small>
              {next.title}
            </span>
            <Icon name="chevronRight" size={18} />
          </Link>
        ) : (
          <Link to={`/level/${chapter.id}`} className="cx-pager cx-pager--next">
            <span>
              <small>כל המשימות</small>
              חזרה לשלב
            </span>
            <Icon name="chevronRight" size={18} />
          </Link>
        )}
      </nav>
    </div>
  )
}
