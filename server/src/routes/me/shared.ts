import type { NextFunction, Request, Response } from 'express'
import type { Types } from 'mongoose'
import { botReleased } from '../../ai/release.ts'
import { endSession, readSession } from '../../auth/session.ts'
import type { Quiz } from '../../game/content.ts'
import { finalScoreOf, focusFor, taskFlow, versionOf, type Focus, type TaskFacts } from '../../game/flow.ts'
import { isSkill, XP, type SkillKey } from '../../game/rules.ts'
import { bottleneckLabel, stageLabel, TRACKS } from '../../game/tracks.ts'
import { award, revoke } from '../../game/xp.ts'
import { Asset, toAssetView, type AssetView } from '../../models/Asset.ts'
import { Customer, setTaskStatus, type CustomerDoc } from '../../models/Customer.ts'
import { Diagnosis, LessonNote, QuizAttempt, WatchProgress, WorksheetResponse } from '../../models/Game.ts'
import { Plan, toPlanProgressView, type PlanDoc, type TaskView } from '../../models/Plan.ts'
import { Submission, toSubmissionView, type SubmissionView } from '../../models/Submission.ts'

// Helpers shared by the customer routes ("/api/me/...").

export async function requireCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = await readSession(req, 'customer')
  const customer = id ? await Customer.findById(id) : null
  if (!customer || !customer.active) {
    endSession(res, 'customer')
    res.status(401).json({ error: 'לא מחוברים' })
    return
  }
  res.locals.customer = customer
  next()
}

export const customerOf = (res: Response) => res.locals.customer as CustomerDoc

export async function planOf(customer: CustomerDoc): Promise<PlanDoc | null> {
  return customer.planId ? Plan.findById(customer.planId) : null
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item])
  return groups
}

/** The quiz without the answers (the server grades it). */
function publicQuiz(quiz: Quiz | null) {
  return quiz ? { questions: quiz.questions.map((q) => ({ question: q.question, options: q.options })) } : null
}

/** What is known about the customer's work on every task (the input of the task flow). */
async function loadFacts(customer: CustomerDoc, plan: PlanDoc, only?: string) {
  const taskFilter = only ? { taskId: only } : {}
  const [assets, submissions, responses, quizBest, watches, diagnosisDone, examinerOn] = await Promise.all([
    Asset.find({ planId: plan._id, status: 'ready', ...taskFilter }).sort({ order: 1, createdAt: 1 }),
    Submission.find({ customerId: customer._id, planId: plan._id, status: 'ready', ...taskFilter }).sort({ createdAt: 1 }),
    WorksheetResponse.find({ customerId: customer._id, planId: plan._id, ...taskFilter }),
    QuizAttempt.aggregate<{ _id: Types.ObjectId; best: number; total: number; tries: number }>([
      { $match: { customerId: customer._id } },
      { $group: { _id: '$taskId', best: { $max: '$correct' }, total: { $max: '$total' }, tries: { $sum: 1 } } },
    ]),
    WatchProgress.find({ customerId: customer._id }),
    Diagnosis.exists({ customerId: customer._id, submittedAt: { $ne: null } }),
    botReleased('reviewer'),
  ])
  const responseByTask = new Map(responses.map((r) => [r.taskId.toString(), r]))
  const quizByTask = new Map(quizBest.map((q) => [q._id.toString(), q]))
  const watchByAsset = new Map(watches.map((w) => [w.assetId.toString(), w]))
  const watched = new Set(watches.filter((w) => w.doneAt).map((w) => w.assetId.toString()))
  const factsOf = (taskId: string): TaskFacts => ({
    videos: assets.filter((a) => a.kind === 'video' && a.taskId?.toString() === taskId).map((a) => ({ id: a.id as string, seconds: a.durationSeconds ?? 0 })),
    watched,
    quizBest: quizByTask.get(taskId) ?? null,
    response: responseByTask.get(taskId) ?? null,
    files: submissions.filter((s) => s.taskId.toString() === taskId).length,
    diagnosisDone: Boolean(diagnosisDone),
    examinerOn,
  })
  return { assets, submissions, responseByTask, quizByTask, watchByAsset, examinerOn, diagnosisDone: Boolean(diagnosisDone), factsOf }
}

/** The customer's plan: progress, media, homework and game state for every task, and the one thing to do now. */
export async function planView(customer: CustomerDoc, plan: PlanDoc) {
  const [facts, notes] = await Promise.all([
    loadFacts(customer, plan),
    LessonNote.find({ planId: plan._id }, { transcript: { $slice: 1 }, method: 0 }),
  ])
  const [assetViews, submissionViews] = await Promise.all([
    Promise.all(facts.assets.map(toAssetView)),
    Promise.all(facts.submissions.map(toSubmissionView)),
  ])
  const withWatch = (asset: AssetView) => {
    const watch = facts.watchByAsset.get(asset.id)
    return { ...asset, position: watch?.position ?? 0, watched: Boolean(watch?.doneAt) }
  }

  const mediaByTask = groupBy(
    assetViews.filter((a) => a.taskId),
    (a) => a.taskId!,
  )
  const submissionsByTask = groupBy<SubmissionView>(submissionViews, (s) => s.taskId)
  const noteByTask = new Map(notes.map((n) => [n.taskId.toString(), n]))

  const progress = toPlanProgressView(plan, customer.planAssignedAt, customer)
  const chapters = progress.chapters.map((chapter) => ({
    ...chapter,
    tasks: chapter.tasks.map((task) => {
      const media = mediaByTask.get(task.id) ?? []
      const videos = media.filter((a) => a.kind === 'video')
      const files = media.filter((a) => a.kind === 'file')
      // Locked levels show their tasks, but not their content yet.
      const locked = chapter.state === 'locked'
      const taskFacts = facts.factsOf(task.id)
      const flow = taskFlow(task, taskFacts)
      const response = taskFacts.response
      const review = response?.review
      const quiz = facts.quizByTask.get(task.id)
      const note = noteByTask.get(task.id)
      return {
        ...task,
        videoCount: videos.length,
        fileCount: files.length,
        videos: locked ? [] : videos.map(withWatch),
        files: locked ? [] : files,
        submissions: submissionsByTask.get(task.id) ?? [],
        hasWorksheet: Boolean(task.worksheet),
        hasQuiz: Boolean(task.quiz),
        worksheet: locked ? null : task.worksheet,
        quiz: locked ? null : publicQuiz(task.quiz),
        rubric: locked ? [] : task.rubric,
        lesson: !locked && note ? { summary: note.summary, keyPoints: note.keyPoints, moments: note.moments.map((m) => ({ at: m.at ?? 0, title: m.title ?? '' })), captions: note.transcript.length > 0 } : null,
        flow,
        worksheetState: response
          ? {
              submitted: Boolean(response.submittedAt),
              versions: versionOf(response),
              reviewed: Boolean(review),
              finished: Boolean(review?.finishedAt),
              score: finalScoreOf(response),
            }
          : null,
        quizBest: quiz ? { correct: quiz.best, total: quiz.total, tries: quiz.tries } : null,
      }
    }),
  }))

  // The one thing to do now: work that Yarin or Oren sent back (also of a closed task), and then the first
  // open task of the current level.
  const returned = chapters.find((c) => c.state !== 'locked' && c.tasks.some((t) => t.flow.check === 'returned'))
  const current = returned ?? chapters[progress.level.index]
  const open = returned ? returned.tasks.find((t) => t.flow.check === 'returned') : current?.tasks.find((t) => !t.completed)
  // The route opens with the diagnosis. Usually it is the practice of a task; without such a task it stands alone.
  const diagnosisTask = chapters.some((c) => c.state !== 'locked' && c.tasks.some((t) => t.practice === 'diagnosis' && !t.completed))
  const focus: Focus = !returned && !facts.diagnosisDone && !diagnosisTask && open
    ? { kind: 'diagnosis', chapterId: null, taskId: null, step: null, title: 'אבחון העסק', cta: 'מתחילים באבחון', why: 'התשובות שלכם קובעות את המסלול האישי ואת נקודת ההתחלה של העסק.', minutes: 8, done: 0, total: 1 }
    : open
    ? focusFor(open, current!.id)
    : { kind: 'finished', chapterId: null, taskId: null, step: null, title: 'סיימתם את כל המסלול', cta: 'לתוצאות העסק', why: 'עכשיו ממשיכים להגדיל את העסק.', minutes: 0, done: 0, total: 0 }

  // Every recorded lesson of the program, in order. Lessons of locked levels open with the plan's setting.
  const stateById = new Map(chapters.map((c) => [c.id, c.state]))
  const library = plan.chapters.map((chapter) => {
    const id = chapter._id.toString()
    const isOpen = plan.libraryOpen || stateById.get(id) !== 'locked'
    return {
      id,
      title: chapter.title,
      open: isOpen,
      lessons: chapter.tasks.flatMap((task) => {
        const videos = (mediaByTask.get(task._id.toString()) ?? []).filter((a) => a.kind === 'video')
        if (videos.length === 0) return []
        return [
          {
            taskId: task._id.toString(),
            title: task.title,
            seconds: videos.reduce((sum, v) => sum + (v.durationSeconds ?? 0), 0),
            watched: videos.every((v) => facts.watchByAsset.get(v.id)?.doneAt),
            posterUrl: videos[0]!.posterUrl,
            summary: noteByTask.get(task._id.toString())?.summary ?? '',
            captions: (noteByTask.get(task._id.toString())?.transcript.length ?? 0) > 0,
            videos: isOpen ? videos.map(withWatch) : [],
          },
        ]
      }),
    }
  })

  const track = TRACKS.find((t) => t.key === customer.track) ?? null
  return {
    ...progress,
    videos: assetViews.filter((a) => !a.taskId && a.kind === 'video').map(withWatch),
    files: assetViews.filter((a) => !a.taskId && a.kind === 'file'),
    chapters,
    library,
    focus,
    examinerOn: facts.examinerOn,
    route: {
      diagnosed: facts.diagnosisDone,
      track: track ? { key: track.key, label: track.label, focus: track.focus } : null,
      stage: stageLabel(customer.stage),
      bottleneck: bottleneckLabel(customer.bottleneck),
    },
  }
}

/** The task and its level in the customer's own plan (also when the level is still locked). */
export async function findTask(customer: CustomerDoc, taskId: string) {
  const plan = await planOf(customer)
  const view = plan ? toPlanProgressView(plan, customer.planAssignedAt, customer) : null
  const chapter = view?.chapters.find((c) => c.tasks.some((t) => t.id === taskId))
  const task = chapter?.tasks.find((t) => t.id === taskId)
  return plan && chapter && task ? { plan, chapter, task, locked: chapter.state === 'locked' } : null
}

/** An open task; sends 404/403 and returns null when it cannot be used. */
export async function openTask(customer: CustomerDoc, taskId: string, res: Response) {
  const found = await findTask(customer, taskId)
  if (!found) {
    res.status(404).json({ error: 'המשימה לא נמצאה' })
    return null
  }
  if (found.locked) {
    res.status(403).json({ error: 'סיימו קודם את השלבים הקודמים' })
    return null
  }
  return found
}

/** Where the customer stands on one task. */
export async function flowOf(customer: CustomerDoc, plan: PlanDoc, task: TaskView) {
  const facts = await loadFacts(customer, plan, task.id)
  return taskFlow(task, facts.factsOf(task.id))
}

export const skillOf = (task: { skill?: unknown }): SkillKey => (isSkill(task.skill) ? task.skill : 'business')

/** Points for starting and finishing a task; finishing is taken back when the task is reopened. */
export async function syncTaskXp(
  customerId: Types.ObjectId,
  task: { id: string; title: string; skill?: unknown },
  status: 'not_started' | 'started' | 'completed',
): Promise<void> {
  const skill = skillOf(task)
  if (status !== 'not_started') {
    await award(customerId, { skill, points: XP.taskStarted, refKey: `task-start:${task.id}`, label: `התחלתם משימה: ${task.title}` })
  }
  if (status === 'completed') {
    await award(customerId, { skill, points: XP.taskCompleted, refKey: `task-complete:${task.id}`, label: `משימה הושלמה: ${task.title}` })
  } else {
    await revoke(customerId, `task-complete:${task.id}`)
  }
}

/**
 * Call after the customer did something on a task: marks it as started, and as completed when every step is done.
 * A completed task stays completed, so going back to improve old work never closes a level again.
 * Returns true when the task was completed just now.
 */
export async function syncTask(customer: CustomerDoc, plan: PlanDoc, task: TaskView): Promise<boolean> {
  const entry = customer.taskProgress.find((p) => p.taskId.toString() === task.id)
  if (entry?.completedAt) return false
  const flow = await flowOf(customer, plan, task)
  const status = flow.complete ? 'completed' : 'started'
  if (status === 'started' && entry?.startedAt) return false
  setTaskStatus(customer, task.id, status)
  await customer.save()
  await syncTaskXp(customer._id, task, status)
  return status === 'completed'
}
