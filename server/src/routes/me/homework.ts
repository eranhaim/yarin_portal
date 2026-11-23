import { randomUUID } from 'node:crypto'
import { Router, type Response } from 'express'
import { isValidObjectId, Types } from 'mongoose'
import { z } from 'zod'
import { XP } from '../../game/rules.ts'
import { award } from '../../game/xp.ts'
import { parseBody } from '../../http.ts'
import { setTaskStatus, type CustomerDoc } from '../../models/Customer.ts'
import {
  deleteSubmissions,
  MAX_SUBMISSIONS_PER_TASK,
  Submission,
  toSubmissionView,
} from '../../models/Submission.ts'
import { headObject, signedUploadUrl, storageEnabled } from '../../storage.ts'
import { MAX_UPLOAD_BYTES, safeFileName } from '../../uploads.ts'
import { customerOf, openTask, planOf, planView, skillOf, syncTaskXp } from './shared.ts'

// Homework uploads:
//   1. POST /tasks/:taskId/submissions   -> "pending" submission and a signed upload URL
//   2. The browser PUTs the file straight to the bucket (with progress).
//   3. POST /submissions/:id/complete    -> checks the object exists, marks it "ready" (the admin sees it)
export const homeworkRouter = Router()

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

homeworkRouter.post('/tasks/:taskId/submissions', async (req, res) => {
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

homeworkRouter.post('/submissions/:id/complete', async (req, res) => {
  const customer = customerOf(res)
  const submission = await findOwnSubmission(customer, req.params.id, res)
  if (!submission) return
  if (submission.status !== 'ready') {
    const head = await headObject(submission.key)
    if (!head) {
      res.status(409).json({ error: 'ההעלאה לא הגיעה לאחסון. נסו שוב.' })
      return
    }
    submission.size = head.size
    submission.status = 'ready'
    submission.seenAt = null
    await submission.save()

    // Handing in work means the task is under way, and it pays (once per task).
    const taskId = submission.taskId.toString()
    const plan = await planOf(customer)
    const task = plan?.chapters.flatMap((c) => c.tasks).find((t) => t._id.toString() === taskId)
    const entry = customer.taskProgress.find((p) => p.taskId.toString() === taskId)
    if (!entry?.startedAt) {
      setTaskStatus(customer, taskId, 'started')
      await customer.save()
    }
    if (task) {
      const ref = { id: taskId, title: task.title, skill: task.skill }
      if (!entry?.startedAt) await syncTaskXp(customer._id, ref, 'started')
      await award(customer._id, { skill: skillOf(ref), points: XP.homework, refKey: `homework:${taskId}`, label: `הגשתם קובץ: ${task.title}` })
    }
  }
  const plan = await planOf(customer)
  res.json({ submission: await toSubmissionView(submission), plan: plan ? await planView(customer, plan) : null })
})

homeworkRouter.delete('/submissions/:id', async (req, res) => {
  const customer = customerOf(res)
  const submission = await findOwnSubmission(customer, req.params.id, res)
  if (!submission) return
  await deleteSubmissions([submission])
  const plan = await planOf(customer)
  res.json({ plan: plan ? await planView(customer, plan) : null })
})
