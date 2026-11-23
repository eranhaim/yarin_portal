import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { FileList } from '../../components/FileList'
import { Icon, type IconName } from '../../components/Icon'
import { TaskStatusControl } from '../../components/TaskStatusControl'
import { VideoPlaylist } from '../../components/VideoPlaylist'
import { api, errorMessage } from '../../lib/api'
import { dueInfo } from '../../lib/format'
import { DISTRICT_COLORS, SKILL_META, missionLabel } from '../../lib/game'
import { taskStatus, type MyTask, type TaskStatus, type WorksheetView } from '../../lib/types'
import { useCustomer } from './customerContext'
import { HomeworkPanel } from './HomeworkPanel'
import { QuizPanel } from './mission/QuizPanel'
import { ReviewPanel } from './mission/ReviewPanel'
import { WorksheetPanel } from './mission/WorksheetPanel'
import { NoPlan } from './NoPlan'

type Tab = 'brief' | 'worksheet' | 'homework' | 'quiz' | 'review'

export function TaskPage() {
  const { chapterId, taskId } = useParams()
  const { me, plan } = useCustomer()
  if (!plan) return <NoPlan name={me.name} />
  const chapterIndex = plan.chapters.findIndex((c) => c.id === chapterId)
  const chapter = plan.chapters[chapterIndex]
  const task = chapter?.tasks.find((t) => t.id === taskId)
  if (!chapter || !task || chapter.state === 'locked') {
    return (
      <div className="cx-empty">
        <h2>{chapter?.state === 'locked' ? 'השלב הזה עדיין נעול' : 'המשימה לא נמצאה'}</h2>
        <Link to="/map" className="btn btn--game">
          חזרה לעיר
        </Link>
      </div>
    )
  }
  // A new key per task resets the tabs and the worksheet state.
  return <Mission key={task.id} chapterIndex={chapterIndex} task={task} />
}

function Mission({ chapterIndex, task }: { chapterIndex: number; task: MyTask }) {
  const { plan, updateTask, applyPlan, refreshGame } = useCustomer()
  const chapter = plan!.chapters[chapterIndex]!
  const taskIndex = chapter.tasks.findIndex((t) => t.id === task.id)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'brief'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<WorksheetView | null>(null)

  useEffect(() => {
    if (!task.hasWorksheet) return
    let cancelled = false
    api<WorksheetView>(`/me/tasks/${task.id}/worksheet`)
      .then((v) => !cancelled && setView(v))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [task.id, task.hasWorksheet])

  const status = taskStatus(task)
  const due = dueInfo(task.dueAt, task.completed)
  const flatIndex = plan!.chapters.slice(0, chapterIndex).reduce((n, c) => n + c.tasks.length, 0) + taskIndex
  const label = missionLabel(task.title, flatIndex + 1)
  const color = DISTRICT_COLORS[chapterIndex % DISTRICT_COLORS.length]
  const skill = task.skill ? SKILL_META[task.skill] : null
  const prev = chapter.tasks[taskIndex - 1]
  const next = chapter.tasks[taskIndex + 1]
  const reviewReady = Boolean(view?.submittedAt) || task.submissions.length > 0

  const setTab = (next: Tab) => setParams(next === 'brief' ? {} : { tab: next }, { replace: true })

  const tabs: { key: Tab; label: string; icon: IconName; done?: boolean; show: boolean }[] = [
    { key: 'brief', label: 'תדריך', icon: 'video', show: true },
    { key: 'worksheet', label: 'מסך עבודה', icon: 'edit', done: Boolean(view?.submittedAt), show: task.hasWorksheet },
    { key: 'homework', label: 'הגשת קבצים', icon: 'upload', done: task.submissions.length > 0, show: true },
    { key: 'quiz', label: 'חידון', icon: 'bulb', done: Boolean(task.quizBest), show: task.hasQuiz },
    { key: 'review', label: 'הבוחן', icon: 'sparkles', done: Boolean(view?.review?.finishedAt), show: task.hasWorksheet },
  ]

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

  const onView = (next: WorksheetView) => {
    setView(next)
    void refreshGame()
  }

  return (
    <div className="mission" style={{ '--c': color } as CSSProperties}>
      <Link to={`/level/${chapter.id}`} className="cx-back">
        <Icon name="arrowLeft" size={18} /> שלב {chapterIndex + 1}: {chapter.title}
      </Link>

      <header className="mission__head">
        <div className="mission__badge">{label.badge}</div>
        <div className="mission__titles">
          <span className="mission__eyebrow">
            משימה {taskIndex + 1}/{chapter.tasks.length}
            {skill && (
              <span className="mission__skill" style={{ '--s': skill.color } as CSSProperties}>
                <Icon name={skill.icon} size={13} /> {skill.label}
              </span>
            )}
          </span>
          <h1>{label.label}</h1>
          {due && (
            <span className={`cx-due cx-due--${due.tone}`}>
              <Icon name="clock" size={14} /> {due.label}
            </span>
          )}
        </div>
        <div className="mission__status">
          <TaskStatusControl value={status} onChange={(v) => void change(v)} disabled={busy} />
        </div>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      <nav className="mission__tabs" role="tablist" aria-label="חלקי המשימה">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className="mission__tab" onClick={() => setTab(t.key)}>
              <Icon name={t.icon} size={17} />
              <span>{t.label}</span>
              {t.done && <i className="mission__tab-done" aria-label="בוצע" />}
            </button>
          ))}
      </nav>

      <div key={tab} className="mission__body" role="tabpanel">
        {tab === 'brief' && (
          <>
            {task.description && (
              <section className="panel">
                <h2 className="panel__title">
                  <Icon name="list" size={18} /> מה עושים?
                </h2>
                <p className="mission__text">{task.description}</p>
              </section>
            )}
            {task.videos.length > 0 && <VideoPlaylist videos={task.videos} heading="השיעור המוקלט" />}
            {task.files.length > 0 && (
              <section className="panel">
                <h2 className="panel__title">
                  <Icon name="file" size={18} /> קבצים להורדה
                </h2>
                <FileList files={task.files} />
              </section>
            )}
            <div className="mission__next-steps">
              {task.hasWorksheet && (
                <button type="button" className="btn btn--game" onClick={() => setTab('worksheet')}>
                  <Icon name="edit" size={18} /> למסך העבודה
                </button>
              )}
              {task.hasQuiz && (
                <button type="button" className="btn btn--ghost-light" onClick={() => setTab('quiz')}>
                  <Icon name="bulb" size={18} /> לחידון
                </button>
              )}
            </div>
          </>
        )}

        {tab === 'worksheet' && task.worksheet && (
          view ? (
            <WorksheetPanel taskId={task.id} worksheet={task.worksheet} view={view} onView={onView} onSubmitted={() => setTab('review')} />
          ) : (
            <div className="page-loader">
              <span className="spinner" />
            </div>
          )
        )}

        {tab === 'homework' && <HomeworkPanel task={task} onPlan={applyPlan} />}

        {tab === 'quiz' && task.quiz && <QuizPanel taskId={task.id} quiz={task.quiz} best={task.quizBest} onDone={() => void refreshGame()} />}

        {tab === 'review' && view && <ReviewPanel taskId={task.id} view={view} onView={onView} ready={reviewReady} rubric={task.rubric ?? []} />}
      </div>

      {status !== 'completed' && (
        <div className="mission__cta">
          <button type="button" className="btn btn--game btn--lg" disabled={busy} onClick={() => void change(status === 'not_started' ? 'started' : 'completed')}>
            <Icon name={status === 'not_started' ? 'play' : 'check'} size={20} />
            {status === 'not_started' ? 'מתחילים את המשימה' : 'סיימתי! המשימה הושלמה'}
          </button>
        </div>
      )}

      <nav className="cx-taskpage__pager" aria-label="משימות נוספות בשלב">
        {prev ? (
          <Link to={`/level/${chapter.id}/task/${prev.id}`} className="cx-pager">
            <Icon name="chevronLeft" size={18} />
            <span>
              <small>המשימה הקודמת</small>
              {missionLabel(prev.title, flatIndex).label}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link to={`/level/${chapter.id}/task/${next.id}`} className="cx-pager cx-pager--next">
            <span>
              <small>המשימה הבאה</small>
              {missionLabel(next.title, flatIndex + 2).label}
            </span>
            <Icon name="chevronRight" size={18} />
          </Link>
        ) : (
          <Link to="/map" className="cx-pager cx-pager--next">
            <span>
              <small>סוף השלב</small>
              חזרה לעיר
            </span>
            <Icon name="chevronRight" size={18} />
          </Link>
        )}
      </nav>
    </div>
  )
}
