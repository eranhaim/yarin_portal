import { randomUUID } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { isValidObjectId, Types } from 'mongoose'
import { z } from 'zod'
import { endSession, readSession } from '../auth/session.ts'
import { parseBody } from '../http.ts'
import { Asset, toAssetView, type AssetView } from '../models/Asset.ts'
import { Customer, setTaskStatus, type CustomerDoc } from '../models/Customer.ts'
import { Plan, toPlanProgressView, type PlanDoc } from '../models/Plan.ts'
import {
  deleteSubmissions,
  MAX_SUBMISSIONS_PER_TASK,
  Submission,
  toSubmissionView,
  type SubmissionView,
} from '../models/Submission.ts'
import { headObject, signedUploadUrl, storageEnabled } from '../storage.ts'
import { MAX_UPLOAD_BYTES, safeFileName } from '../uploads.ts'

// The customer's own area: their plan, levels, tasks, videos, files and homework uploads.
export const meRouter = Router()

async function requireCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
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

meRouter.use(requireCustomer)

const customerOf = (res: Response) => res.locals.customer as CustomerDoc

async function planOf(customer: CustomerDoc): Promise<PlanDoc | null> {
  return customer.planId ? Plan.findById(customer.planId) : null
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item])
  return groups
}

async function planView(customer: CustomerDoc, plan: PlanDoc) {
  const [assets, submissions] = await Promise.all([
    Asset.find({ planId: plan._id, status: 'ready' }).sort({ order: 1, createdAt: 1 }),
    Submission.find({ customerId: customer._id, planId: plan._id, status: 'ready' }).sort({ createdAt: 1 }),
  ])
  const [assetViews, submissionViews] = await Promise.all([
    Promise.all(assets.map(toAssetView)),
    Promise.all(submissions.map(toSubmissionView)),
  ])

  const planVideos = assetViews.filter((a) => !a.taskId && a.kind === 'video')
  const planFiles = assetViews.filter((a) => !a.taskId && a.kind === 'file')
  const mediaByTask = groupBy(
    assetViews.filter((a) => a.taskId),
    (a) => a.taskId!,
  )
  const submissionsByTask = groupBy<SubmissionView>(submissionViews, (s) => s.taskId)

  const progress = toPlanProgressView(plan, customer.planAssignedAt, customer.taskProgress)
  return {
    ...progress,
    videos: planVideos,
    files: planFiles,
    chapters: progress.chapters.map((chapter) => ({
      ...chapter,
      tasks: chapter.tasks.map((task) => {
        const media: AssetView[] = mediaByTask.get(task.id) ?? []
        const videos = media.filter((a) => a.kind === 'video')
        const files = media.filter((a) => a.kind === 'file')
        // Locked levels show their tasks, but not the videos and files yet.
        const locked = chapter.state === 'locked'
        return {
          ...task,
          videoCount: videos.length,
          fileCount: files.length,
          videos: locked ? [] : videos,
          files: locked ? [] : files,
          submissions: submissionsByTask.get(task.id) ?? [],
        }
      }),
    })),
  }
}

/** The task and its level in the customer's plan; sends 404/403 and returns null when it cannot be used. */
async function openTask(customer: CustomerDoc, taskId: string, res: Response) {
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

meRouter.get('/plan', async (_req, res) => {
  const customer = customerOf(res)
  const plan = await planOf(customer)
  res.json({ plan: plan ? await planView(customer, plan) : null })
})

meRouter.patch('/tasks/:taskId', async (req, res) => {
  const body = parseBody(z.object({ status: z.enum(['not_started', 'started', 'completed']) }), req, res)
  if (!body) return
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  setTaskStatus(customer, req.params.taskId, body.status)
  await customer.save()
  res.json({ plan: await planView(customer, found.plan) })
})

// ---------- Homework uploads ----------
//   1. POST /tasks/:taskId/submissions   -> "pending" submission and a signed upload URL
//   2. The browser PUTs the file straight to the bucket (with progress).
//   3. POST /submissions/:id/complete    -> checks the object exists, marks it "ready" (the admin sees it)

const createSubmissionSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().max(200).default('application/octet-stream'),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, 'גודל קובץ מקסימלי: 5GB'),
  note: z.string().trim().max(1000, 'ההערה ארוכה מדי').default(''),
})

async function findOwnSubmission(customer: CustomerDoc, id: string, res: Response) {
  const submission = isValidObjectId(id) ? await Submission.findOne({ _id: id, customerId: customer._id }) : null
  if (!submission) res.status(404).json({ error: 'הקובץ לא נמצא' })
  return submission
}

meRouter.post('/tasks/:taskId/submissions', async (req, res) => {
  if (!storageEnabled) {
    res.status(503).json({ error: 'אחסון הקבצים לא מוגדר' })
    return
  }
  const body = parseBody(createSubmissionSchema, req, res)
  if (!body) return
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return

  // Uploads that never finished (closed tab, lost connection) are removed after a day.
  const stale = await Submission.find({ customerId: customer._id, status: 'pending', createdAt: { $lt: new Date(Date.now() - 86_400_000) } })
  await deleteSubmissions(stale)

  const existing = await Submission.countDocuments({ customerId: customer._id, taskId: req.params.taskId, status: 'ready' })
  if (existing >= MAX_SUBMISSIONS_PER_TASK) {
    res.status(409).json({ error: `אפשר להגיש עד ${MAX_SUBMISSIONS_PER_TASK} קבצים למשימה. מחקו קובץ ישן ונסו שוב.` })
    return
  }

  const key = `submissions/${customer.id}/${req.params.taskId}/${randomUUID()}-${safeFileName(body.fileName)}`
  const submission = await Submission.create({
    customerId: customer._id,
    planId: found.plan._id,
    taskId: new Types.ObjectId(req.params.taskId),
    planTitle: found.plan.title,
    chapterTitle: found.chapter.title,
    taskTitle: found.task.title,
    fileName: body.fileName,
    contentType: body.contentType,
    size: body.size,
    note: body.note,
    key,
  })
  res.status(201).json({
    submission: await toSubmissionView(submission),
    upload: { url: await signedUploadUrl(key, body.contentType), method: 'PUT', headers: { 'Content-Type': body.contentType } },
  })
})

meRouter.post('/submissions/:id/complete', async (req, res) => {
  const customer = customerOf(res)
  const submission = await findOwnSubmission(customer, req.params.id, res)
  if (!submission) return
  if (submission.status === 'ready') {
    // Already done (for example, a retried request): do not mark it unread again.
    const plan = await planOf(customer)
    res.json({ submission: await toSubmissionView(submission), plan: plan ? await planView(customer, plan) : null })
    return
  }
  const head = await headObject(submission.key)
  if (!head) {
    res.status(409).json({ error: 'ההעלאה לא הגיעה לאחסון. נסו שוב.' })
    return
  }
  submission.size = head.size
  submission.status = 'ready'
  submission.seenAt = null
  await submission.save()

  // Handing in work means the task is under way.
  const taskId = submission.taskId.toString()
  const entry = customer.taskProgress.find((p) => p.taskId.toString() === taskId)
  if (!entry?.startedAt) {
    setTaskStatus(customer, taskId, 'started')
    await customer.save()
  }

  const plan = await planOf(customer)
  res.json({ submission: await toSubmissionView(submission), plan: plan ? await planView(customer, plan) : null })
})

meRouter.delete('/submissions/:id', async (req, res) => {
  const customer = customerOf(res)
  const submission = await findOwnSubmission(customer, req.params.id, res)
  if (!submission) return
  await deleteSubmissions([submission])
  const plan = await planOf(customer)
  res.json({ plan: plan ? await planView(customer, plan) : null })
})
