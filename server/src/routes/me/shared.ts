import type { NextFunction, Request, Response } from 'express'
import type { Types } from 'mongoose'
import { endSession, readSession } from '../../auth/session.ts'
import { answersAsText, type Quiz, type Worksheet, type WorksheetAnswers } from '../../game/content.ts'
import { isSkill, XP, type SkillKey } from '../../game/rules.ts'
import { award, revoke } from '../../game/xp.ts'
import { Asset, toAssetView, type AssetView } from '../../models/Asset.ts'
import { Customer, type CustomerDoc } from '../../models/Customer.ts'
import { QuizAttempt, WorksheetResponse } from '../../models/Game.ts'
import { levelState, Plan, toPlanProgressView, type PlanDoc } from '../../models/Plan.ts'
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

/** The customer's plan: progress, media, homework and game state for every task. */
export async function planView(customer: CustomerDoc, plan: PlanDoc) {
  const [assets, submissions, responses, quizBest] = await Promise.all([
    Asset.find({ planId: plan._id, status: 'ready' }).sort({ order: 1, createdAt: 1 }),
    Submission.find({ customerId: customer._id, planId: plan._id, status: 'ready' }).sort({ createdAt: 1 }),
    WorksheetResponse.find({ customerId: customer._id, planId: plan._id }),
    QuizAttempt.aggregate<{ _id: Types.ObjectId; best: number; total: number; tries: number }>([
      { $match: { customerId: customer._id } },
      { $group: { _id: '$taskId', best: { $max: '$correct' }, total: { $max: '$total' }, tries: { $sum: 1 } } },
    ]),
  ])
  const [assetViews, submissionViews] = await Promise.all([
    Promise.all(assets.map(toAssetView)),
    Promise.all(submissions.map(toSubmissionView)),
  ])

  const mediaByTask = groupBy(
    assetViews.filter((a) => a.taskId),
    (a) => a.taskId!,
  )
  const submissionsByTask = groupBy<SubmissionView>(submissionViews, (s) => s.taskId)
  const responseByTask = new Map(responses.map((r) => [r.taskId.toString(), r]))
  const quizByTask = new Map(quizBest.map((q) => [q._id.toString(), q]))

  const progress = toPlanProgressView(plan, customer.planAssignedAt, customer.taskProgress)
  return {
    ...progress,
    videos: assetViews.filter((a) => !a.taskId && a.kind === 'video'),
    files: assetViews.filter((a) => !a.taskId && a.kind === 'file'),
    chapters: progress.chapters.map((chapter) => ({
      ...chapter,
      tasks: chapter.tasks.map((task) => {
        const media: AssetView[] = mediaByTask.get(task.id) ?? []
        const videos = media.filter((a) => a.kind === 'video')
        const files = media.filter((a) => a.kind === 'file')
        // Locked levels show their tasks, but not their content yet.
        const locked = chapter.state === 'locked'
        const response = responseByTask.get(task.id)
        const review = response?.review
        const quiz = quizByTask.get(task.id)
        return {
          ...task,
          videoCount: videos.length,
          fileCount: files.length,
          videos: locked ? [] : videos,
          files: locked ? [] : files,
          submissions: submissionsByTask.get(task.id) ?? [],
          hasWorksheet: Boolean(task.worksheet),
          hasQuiz: Boolean(task.quiz),
          worksheet: locked ? null : task.worksheet,
          quiz: locked ? null : publicQuiz(task.quiz),
          worksheetState: response
            ? {
                submitted: Boolean(response.submittedAt),
                reviewed: Boolean(review),
                finished: Boolean(review?.finishedAt),
                score: review ? (review.finalScore ?? review.score ?? null) : null,
              }
            : null,
          quizBest: quiz ? { correct: quiz.best, total: quiz.total, tries: quiz.tries } : null,
        }
      }),
    })),
  }
}

/** The task and its level in the customer's plan; sends 404/403 and returns null when it cannot be used. */
export async function openTask(customer: CustomerDoc, taskId: string, res: Response) {
  const plan = await planOf(customer)
  const view = plan ? toPlanProgressView(plan, customer.planAssignedAt, customer.taskProgress) : null
  const chapter = view?.chapters.find((c) => c.tasks.some((t) => t.id === taskId))
  const task = chapter?.tasks.find((t) => t.id === taskId)
  if (!plan || !chapter || !task) {
    res.status(404).json({ error: 'המשימה לא נמצאה' })
    return null
  }
  if (chapter.state === 'locked') {
    res.status(403).json({ error: 'סיימו קודם את השלבים הקודמים' })
    return null
  }
  return { plan, chapter, task }
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

/** A short description of the participant and their business, for the AI coaches. */
export async function customerContextText(customer: CustomerDoc): Promise<string> {
  const plan = await planOf(customer)
  const lines = [`Name: ${customer.name}`, `Business: ${customer.company || 'not given'}`]
  if (plan) {
    const level = levelState(plan, customer.taskProgress)
    lines.push(`Program progress: level ${Math.min(level.index + 1, level.total)} of ${level.total}.`)
    // Their own worksheet answers about customers, offer and brand are the best context.
    const tasks = plan.chapters.flatMap((c) => c.tasks)
    const wanted = tasks.filter((t) => ['customer', 'offer', 'brand', 'business'].includes(String(t.skill)) && t.worksheet)
    const responses = await WorksheetResponse.find({ customerId: customer._id, taskId: { $in: wanted.map((t) => t._id) } })
    for (const response of responses) {
      const task = wanted.find((t) => t._id.equals(response.taskId))
      if (!task) continue
      const text = answersAsText(task.worksheet as Worksheet, (response.answers ?? {}) as WorksheetAnswers)
      lines.push(`\nFrom their worksheet "${task.title}":\n${text.slice(0, 1500)}`)
    }
  }
  return lines.join('\n').slice(0, 6000)
}
