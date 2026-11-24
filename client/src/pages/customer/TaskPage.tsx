import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { dueInfo } from '../../lib/format'
import { DISTRICT_COLORS, minutesLabel, missionLabel, SKILL_META, STEP_ICON } from '../../lib/game'
import type { MyPlan, MyTask, StepKey, TaskBrief, WorkResult, WorksheetView } from '../../lib/types'
import { useCustomer } from './customerContext'
import { HomeworkPanel } from './HomeworkPanel'
import { PracticeStep } from './mission/PracticeStep'
import { QuizPanel } from './mission/QuizPanel'
import { ReviewPanel } from './mission/ReviewPanel'
import { WatchStep } from './mission/WatchStep'
import './mission/mission.css'
import { NoPlan } from './NoPlan'

// One task as a guided path: watch, check that it is clear, practice on your own business, get feedback, improve.
// The page opens on the current step, and moves on when the step is done.

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
          חזרה
        </Link>
      </div>
    )
  }
  // A new key per task resets the steps and the worksheet state.
  return <Mission key={task.id} chapterIndex={chapterIndex} task={task} />
}

function Mission({ chapterIndex, task }: { chapterIndex: number; task: MyTask }) {
  const { plan, updateTask, applyPlan, celebrateTask } = useCustomer()
  const chapter = plan!.chapters[chapterIndex]!
  const { flow } = task
  const [step, setStep] = useState<StepKey | null>(flow.current ?? flow.steps[0]?.key ?? null)
  const [view, setView] = useState<WorksheetView | null>(null)
  const [brief, setBrief] = useState<TaskBrief | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsView = flow.steps.some((s) => s.key === 'practice' || s.key === 'check')

  useEffect(() => {
    let cancelled = false
    if (needsView) {
      api<{ view: WorksheetView }>(`/me/tasks/${task.id}/worksheet`)
        .then((res) => !cancelled && setView(res.view))
        .catch((err) => !cancelled && setError(errorMessage(err)))
    }
    api<{ brief: TaskBrief | null }>(`/me/tasks/${task.id}/brief`)
      .then((res) => !cancelled && setBrief(res.brief))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [task.id, needsView])

  /** The plan after something was done here. Moves to the next step when the open one is finished. */
  const onPlan = useCallback(
    (next: MyPlan | null, completed?: boolean) => {
      applyPlan(next)
      const updated = next?.chapters.flatMap((c) => c.tasks).find((t) => t.id === task.id)
      if (!updated) return
      if (completed ?? (updated.completed && !task.completed)) celebrateTask(task.id)
      setStep((open) => {
        const state = updated.flow.steps.find((s) => s.key === open)?.state
        return state === 'done' && updated.flow.current ? updated.flow.current : open
      })
    },
    [applyPlan, celebrateTask, task.completed, task.id],
  )

  /** Quizzes and reviews show their result first; the customer moves on with a button. */
  const onResult = useCallback(
    (next: MyPlan, completed: boolean) => {
      applyPlan(next)
      if (completed) celebrateTask(task.id)
    },
    [applyPlan, celebrateTask, task.id],
  )

  const onWork = useCallback(
    (result: WorkResult) => {
      setView(result.view)
      onPlan(result.plan, result.completed)
    },
    [onPlan],
  )

  const goNext = () => {
    const index = flow.steps.findIndex((s) => s.key === step)
    const next = flow.current ?? flow.steps[index + 1]?.key ?? null
    if (next) setStep(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const finishManually = async () => {
    setBusy(true)
    setError(null)
    try {
      await updateTask(task.id, 'completed')
      celebrateTask(task.id)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const due = dueInfo(task.dueAt, task.completed)
  const taskIndex = chapter.tasks.findIndex((t) => t.id === task.id)
  const flatIndex = plan!.chapters.slice(0, chapterIndex).reduce((n, c) => n + c.tasks.length, 0) + taskIndex
  const label = missionLabel(task.title, flatIndex + 1)
  const color = DISTRICT_COLORS[chapterIndex % DISTRICT_COLORS.length]
  const skill = task.skill ? SKILL_META[task.skill] : null

  return (
    <div className="mission" style={{ '--c': color } as CSSProperties}>
      <Link to={`/level/${chapter.id}`} className="cx-back">
        <Icon name="arrowLeft" size={16} /> שלב {chapterIndex + 1}: {chapter.title}
      </Link>

      <header className="mission__head">
        <span className="mission__badge">{label.badge}</span>
        <div className="mission__titles">
          <h1>{label.label}</h1>
          <p className="mission__meta">
            <span>
              משימה {taskIndex + 1} מתוך {chapter.tasks.length}
            </span>
            {skill && (
              <span className="mission__skill" style={{ '--s': skill.color } as CSSProperties}>
                <Icon name={skill.icon} size={13} /> {skill.label}
              </span>
            )}
            {!task.completed && flow.minutesLeft > 0 && (
              <span>
                <Icon name="clock" size={13} /> נשארו בערך {minutesLabel(flow.minutesLeft)}
              </span>
            )}
            {due && <span className={`cx-due cx-due--${due.tone}`}>{due.label}</span>}
          </p>
        </div>
        {task.completed && (
          <span className="mission__done">
            <Icon name="check" size={16} /> הושלמה
          </span>
        )}
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {flow.steps.length > 0 && (
        <ol className="path" aria-label="שלבי המשימה">
          {flow.steps.map((s, i) => (
            <li key={s.key} className={`path__step path__step--${s.state}${step === s.key ? ' is-open' : ''}`}>
              <button type="button" onClick={() => setStep(s.key)} aria-current={step === s.key ? 'step' : undefined}>
                <span className="path__icon">{s.state === 'done' ? <Icon name="check" size={16} /> : <Icon name={STEP_ICON[s.key]} size={16} />}</span>
                <span className="path__text">
                  <b>{s.label}</b>
                  <small>{s.note || minutesLabel(s.minutes)}</small>
                </span>
                <span className="visually-hidden">
                  שלב {i + 1}, {s.state === 'done' ? 'הושלם' : s.state === 'current' ? 'עכשיו' : 'בהמשך'}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="mission__layout">
        <div key={step} className="mission__body">
          {step === 'watch' && <WatchStep task={task} onPlan={onPlan} />}

          {step === 'quiz' && task.quiz && <QuizPanel taskId={task.id} quiz={task.quiz} best={task.quizBest} onResult={onResult} onNext={goNext} />}

          {step === 'practice' &&
            (task.practice === 'diagnosis' ? (
              <section className="panel diagnosis-cta">
                <Icon name="route" size={34} />
                <h2>{plan!.route.diagnosed ? 'האבחון הושלם' : 'אבחון העסק'}</h2>
                <p>
                  {plan!.route.diagnosed
                    ? `המסלול שלכם: ${plan!.route.track?.label ?? ''}. אפשר לעדכן את האבחון כשמשהו משתנה בעסק.`
                    : 'בערך 8 דקות. לפי התשובות נבנה המסלול האישי שלכם, ונקודת ההתחלה של העסק.'}
                </p>
                <Link to="/diagnosis" className="btn btn--game btn--lg">
                  {plan!.route.diagnosed ? 'לתוצאות האבחון' : 'מתחילים'}
                </Link>
              </section>
            ) : (
              task.worksheet && (view ? <PracticeStep task={task} worksheet={task.worksheet} view={view} onView={setView} onWork={onWork} onPlan={onPlan} /> : <Loading />)
            ))}

          {step === 'files' && <HomeworkPanel task={task} onPlan={onPlan} />}

          {step === 'check' && (view ? <ReviewPanel task={task} view={view} onWork={(r) => (setView(r.view), onResult(r.plan, r.completed))} onFix={() => setStep(task.worksheet ? 'practice' : 'files')} /> : <Loading />)}

          {flow.manual && (
            <section className="panel mission__manual">
              <p className="mission__text">{task.description || 'משימה קצרה בלי שלבים.'}</p>
              <HomeworkPanel task={task} onPlan={onPlan} />
              {!task.completed && (
                <button type="button" className="btn btn--game btn--lg" disabled={busy} onClick={() => void finishManually()}>
                  {busy ? <span className="spinner" /> : <Icon name="check" size={20} />} סיימתי את המשימה
                </button>
              )}
            </section>
          )}
        </div>

        <aside className="mission__side">
          {brief && <BriefCard brief={brief} />}
          {task.description && !flow.manual && (
            <details className="side-card" open={!brief}>
              <summary>מה עושים במשימה</summary>
              <p className="mission__text">{task.description}</p>
            </details>
          )}
          {task.completed && <NextTask plan={plan!} />}
        </aside>
      </div>
    </div>
  )
}

const Loading = () => (
  <div className="page-loader">
    <span className="spinner" />
  </div>
)

/** Why this task matters for this business, and what to emphasize (written for each customer). */
function BriefCard({ brief }: { brief: TaskBrief }) {
  return (
    <section className="side-card side-card--brief">
      <h2>
        <Icon name="target" size={16} /> מותאם לעסק שלכם
      </h2>
      <p>{brief.why}</p>
      {brief.focus.length > 0 && (
        <ul>
          {brief.focus.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {brief.example && (
        <details>
          <summary>דוגמה לתשובה טובה</summary>
          <p>{brief.example}</p>
        </details>
      )}
    </section>
  )
}

function NextTask({ plan }: { plan: MyPlan }) {
  const { focus } = plan
  if (focus.kind !== 'task') return null
  return (
    <section className="side-card side-card--next">
      <small>הדבר הבא</small>
      <strong>{missionLabel(focus.title, 1).label}</strong>
      <Link to={`/level/${focus.chapterId}/task/${focus.taskId}`} className="btn btn--game btn--sm">
        ממשיכים
      </Link>
    </section>
  )
}
