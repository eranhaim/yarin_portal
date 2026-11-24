import type { WorksheetResponseDoc } from '../models/Game.ts'
import { DEFAULT_PASS_SCORE } from '../models/Plan.ts'

// The path of one task: learn -> check understanding -> practice -> hand in -> get feedback -> improve.
// The server decides what is done and which step is next, so every screen shows the same single action.

export type StepKey = 'watch' | 'quiz' | 'practice' | 'files' | 'check'
export type StepState = 'done' | 'current' | 'todo'

/**
 * Where the work stands in the check:
 *   none      nothing handed in, or the newest version is not checked yet
 *   fix       the AI found things to fix
 *   defense   the work is good; the examiner asks a few questions before the final score
 *   passed    the final score is high enough
 *   returned  Yarin or Oren sent it back with notes
 *   approved  Yarin or Oren approved it
 *   accepted  the customer moved on and improves it later
 *   waiting   no AI check is available; Yarin and Oren check it
 */
export type CheckState = 'none' | 'fix' | 'defense' | 'passed' | 'returned' | 'approved' | 'accepted' | 'waiting'

export type Step = { key: StepKey; label: string; state: StepState; note: string; minutes: number }

export type FlowTask = {
  worksheet: unknown
  quiz: { questions: unknown[] } | null
  rubric: string[]
  practice: string
  fileRule: string
  passScore: number
  minutes: number | null
}

export type TaskFacts = {
  /** Ready lesson videos of the task, with their length in seconds. */
  videos: { id: string; seconds: number }[]
  watched: Set<string>
  quizBest: { best: number; total: number } | null
  response: WorksheetResponseDoc | null
  files: number
  diagnosisDone: boolean
  /** Whether the AI examiner is on and released to customers. */
  examinerOn: boolean
}

export const QUIZ_PASS = 0.6
/** After this many checked versions, the customer may move on and improve later. */
export const TRIES_BEFORE_MOVING_ON = 2

const LABELS: Record<StepKey, string> = {
  watch: 'צופים בשיעור',
  quiz: 'בודקים שהבנתם',
  practice: 'מתרגלים על העסק שלכם',
  files: 'מגישים את התוצר',
  check: 'מקבלים פידבק ומשפרים',
}

export const passScoreOf = (task: { passScore?: number | null }) => task.passScore ?? DEFAULT_PASS_SCORE

export function finalScoreOf(response: { review?: { score?: number | null; finalScore?: number | null } | null } | null): number | null {
  const review = response?.review
  if (!review) return null
  return review.finalScore ?? review.score ?? null
}

/** The newest version of the work (1 = the first one the customer handed in). 0 = nothing handed in. */
export const versionOf = (response: WorksheetResponseDoc | null) => response?.attempts.length ?? 0

export function checkStateOf(task: FlowTask, facts: Pick<TaskFacts, 'response' | 'files' | 'examinerOn'>): CheckState {
  const { response } = facts
  const human = response?.human
  const newest = response?.submittedAt?.getTime() ?? 0
  // A decision of Yarin or Oren holds until the customer hands in a newer version.
  const decided = human?.at ? human.at.getTime() >= newest : false
  if (human?.status === 'approved') return 'approved'
  if (human?.status === 'returned' && decided) return 'returned'
  if (response?.acceptedAt) return 'accepted'
  const review = response?.review
  if (review && (review.attempt ?? 1) >= versionOf(response)) {
    const passed = (finalScoreOf(response) ?? 0) >= passScoreOf(task)
    if (review.finishedAt) return passed ? 'passed' : 'fix'
    return passed ? 'defense' : 'fix'
  }
  const handedIn = Boolean(response?.submittedAt) || facts.files > 0
  return handedIn && !facts.examinerOn ? 'waiting' : 'none'
}

const CHECK_DONE: CheckState[] = ['passed', 'approved', 'accepted', 'waiting']

const CHECK_NOTE: Record<CheckState, string> = {
  none: 'הבוחן עוד לא בדק',
  fix: 'יש מה לתקן',
  defense: 'נשארו כמה שאלות',
  passed: 'עבר',
  returned: 'הוחזר לתיקון',
  approved: 'אושר על ידי ירין ואורן',
  accepted: 'ממשיכים ומשפרים אחר כך',
  waiting: 'נשלח לירין ואורן',
}

export function taskFlow(task: FlowTask, facts: TaskFacts) {
  const steps: Omit<Step, 'state'>[] = []
  const done = new Map<StepKey, boolean>()
  const add = (key: StepKey, isDone: boolean, note: string, minutes: number) => {
    steps.push({ key, label: LABELS[key], note, minutes })
    done.set(key, isDone)
  }

  const hasPractice = task.practice === 'diagnosis' || Boolean(task.worksheet)
  const check = checkStateOf(task, facts)

  if (facts.videos.length > 0) {
    const left = facts.videos.filter((v) => !facts.watched.has(v.id))
    const seconds = facts.videos.reduce((sum, v) => sum + v.seconds, 0)
    add('watch', left.length === 0, left.length === 0 ? 'נצפה' : '', Math.max(1, Math.round(seconds / 60)))
  }
  if (task.quiz && task.quiz.questions.length > 0) {
    const best = facts.quizBest
    const passed = Boolean(best && best.total > 0 && best.best / best.total >= QUIZ_PASS)
    add('quiz', passed, best ? `${best.best}/${best.total}` : '', Math.max(2, task.quiz.questions.length))
  }
  if (hasPractice) {
    const isDone = task.practice === 'diagnosis' ? facts.diagnosisDone : Boolean(facts.response?.submittedAt)
    add('practice', isDone, isDone ? 'הוגש' : '', task.minutes ?? 20)
  }
  if (task.fileRule === 'required') add('files', facts.files > 0, facts.files > 0 ? `${facts.files} קבצים` : '', 10)
  // The check needs something to read: the worksheet, or files judged by the criteria.
  if (task.practice !== 'diagnosis' && (task.worksheet || (task.rubric.length > 0 && task.fileRule === 'required'))) {
    add('check', CHECK_DONE.includes(check), check === 'none' ? '' : CHECK_NOTE[check], 6)
  }

  const currentIndex = steps.findIndex((s) => !done.get(s.key))
  const view: Step[] = steps.map((s, i) => ({
    ...s,
    state: done.get(s.key) ? 'done' : i === currentIndex ? 'current' : 'todo',
  }))
  return {
    steps: view,
    current: view[currentIndex]?.key ?? null,
    doneCount: view.filter((s) => s.state === 'done').length,
    /** Every step is done (and there is at least one). */
    complete: view.length > 0 && currentIndex === -1,
    /** A task without steps (no video, worksheet or quiz): the customer marks it as done. */
    manual: view.length === 0,
    check,
    minutesLeft: view.filter((s) => s.state !== 'done').reduce((sum, s) => sum + s.minutes, 0),
  }
}

export type TaskFlow = ReturnType<typeof taskFlow>

// ---------- The one thing to do now ----------

export type Focus = {
  kind: 'diagnosis' | 'task' | 'finished'
  chapterId: string | null
  taskId: string | null
  step: StepKey | null
  title: string
  /** The action, as a button label. */
  cta: string
  /** One line: why this, now. */
  why: string
  minutes: number
  done: number
  total: number
}

const CTA: Record<StepKey, string> = {
  watch: 'צופים בשיעור',
  quiz: 'לחידון הקצר',
  practice: 'למסך העבודה',
  files: 'להגשת התוצר',
  check: 'לבדיקה של הבוחן',
}

const WHY: Record<StepKey, string> = {
  watch: 'קודם מבינים את הרעיון.',
  quiz: 'כמה שאלות קצרות, כדי לוודא שהרעיון יושב.',
  practice: 'עכשיו מפעילים את זה על העסק שלכם.',
  files: 'מעלים את מה שהכנתם, כדי שאפשר יהיה לבדוק עבודה אמיתית.',
  check: 'הבוחן קורא את העבודה ואומר בדיוק מה חזק ומה לשפר.',
}

const CHECK_CTA: Partial<Record<CheckState, { cta: string; why: string }>> = {
  fix: { cta: 'לתיקון העבודה', why: 'הבוחן סימן מה לשפר. תיקון אחד טוב, והמשימה עוברת.' },
  defense: { cta: 'לענות לבוחן', why: 'העבודה טובה. נשארו כמה שאלות קצרות לפני הציון הסופי.' },
  returned: { cta: 'לתיקון העבודה', why: 'ירין ואורן החזירו את העבודה עם הערות.' },
}

export function focusFor(task: { title: string; id: string; flow: TaskFlow; practice: string }, chapterId: string): Focus {
  const { flow } = task
  const step = flow.current
  const special = step === 'check' ? CHECK_CTA[flow.check] : undefined
  const isDiagnosis = step === 'practice' && task.practice === 'diagnosis'
  return {
    kind: 'task',
    chapterId,
    taskId: task.id,
    step,
    title: task.title,
    cta: special?.cta ?? (isDiagnosis ? 'לאבחון העסק' : step ? CTA[step] : 'לסימון שסיימתם'),
    why: special?.why ?? (isDiagnosis ? 'התשובות שלכם קובעות את המסלול האישי שלכם.' : step ? WHY[step] : 'משימה קצרה בלי שלבים. סמנו כשסיימתם.'),
    minutes: flow.steps.find((s) => s.key === step)?.minutes ?? 10,
    done: flow.doneCount,
    total: flow.steps.length,
  }
}
