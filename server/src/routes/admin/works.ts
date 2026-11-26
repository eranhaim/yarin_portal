import { Router } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { answersAsText, type Worksheet, type WorksheetAnswers } from '../../game/content.ts'
import { checkStateOf, finalScoreOf, versionOf } from '../../game/flow.ts'
import { adminOf } from '../../auth/admin.ts'
import { parseBody } from '../../http.ts'
import { Customer, toCustomerView } from '../../models/Customer.ts'
import { WorksheetResponse, type WorksheetResponseDoc } from '../../models/Game.ts'
import { Plan, toPlanProgressView, toTaskView, type PlanDoc } from '../../models/Plan.ts'
import { Submission, toSubmissionView } from '../../models/Submission.ts'
import { tellDecision } from '../../whatsapp/notify.ts'
import { syncTask } from '../me/shared.ts'

// The review queue: work that customers handed in, with the AI's check, for Yarin and Oren's own decision.
// A human decision always wins over the AI.
export const worksRouter = Router()

/** Waiting for a person: asked for, or handed in and not opened yet. */
export const OPEN_WORKS: Record<string, object> = { submittedAt: { $ne: null }, $or: [{ 'human.status': 'requested' }, { seenAt: null, 'human.status': { $in: ['none', null] } }] }

worksRouter.get('/works/summary', async (_req, res) => {
  const [open, requested] = await Promise.all([WorksheetResponse.countDocuments(OPEN_WORKS), WorksheetResponse.countDocuments({ 'human.status': 'requested' })])
  res.json({ open, requested })
})

async function worksOf(responses: WorksheetResponseDoc[]) {
  const [customers, plans] = await Promise.all([
    Customer.find({ _id: { $in: responses.map((r) => r.customerId) } }),
    Plan.find({ _id: { $in: responses.map((r) => r.planId) } }),
  ])
  const views = new Map(await Promise.all(customers.map(async (c) => [c.id as string, await toCustomerView(c)] as const)))
  const tasks = new Map(plans.flatMap((p) => p.chapters.flatMap((c) => c.tasks.map((t) => [t._id.toString(), { task: t, chapter: c.title }] as const))))
  return responses.flatMap((r) => {
    const customer = views.get(r.customerId.toString())
    const found = tasks.get(r.taskId.toString())
    if (!customer || !found) return []
    return [
      {
        id: r.id as string,
        customer: { id: customer.id, name: customer.name, company: customer.company, avatarUrl: customer.avatarUrl },
        taskId: r.taskId.toString(),
        taskTitle: found.task.title,
        chapterTitle: found.chapter,
        submittedAt: r.submittedAt,
        version: versionOf(r),
        score: finalScoreOf(r),
        check: checkStateOf(toTaskView(found.task), { response: r, files: 1, examinerOn: true }),
        human: r.human ?? null,
        seen: Boolean(r.seenAt),
      },
    ]
  })
}

worksRouter.get('/works', async (req, res) => {
  const filter: Record<string, object> = req.query.filter === 'all' ? { submittedAt: { $ne: null } } : OPEN_WORKS
  const responses: WorksheetResponseDoc[] = await WorksheetResponse.find(filter).sort({ submittedAt: -1 }).limit(200)
  const works = await worksOf(responses)
  // Requests of customers come first.
  works.sort((a, b) => Number(b.human?.status === 'requested') - Number(a.human?.status === 'requested'))
  res.json({ works })
})

worksRouter.get('/works/:id', async (req, res) => {
  const response = isValidObjectId(req.params.id) ? await WorksheetResponse.findById(req.params.id) : null
  const [item] = response ? await worksOf([response]) : []
  if (!response || !item) {
    res.status(404).json({ error: 'העבודה לא נמצאה' })
    return
  }
  const plan = await Plan.findById(response.planId)
  const task = plan?.chapters.flatMap((c) => c.tasks).find((t) => t._id.equals(response.taskId))
  const files = await Submission.find({ customerId: response.customerId, taskId: response.taskId, status: 'ready' }).sort({ createdAt: 1 })
  response.seenAt = new Date()
  await response.save()
  const text = (answers: unknown) => (task?.worksheet ? answersAsText(task.worksheet as Worksheet, (answers ?? {}) as WorksheetAnswers) : '')
  res.json({
    work: {
      ...item,
      description: task?.description ?? '',
      rubric: task?.rubric ?? [],
      text: text(response.answers),
      review: response.review ?? null,
      chat: response.chat.map((t) => ({ role: t.role, text: t.text, at: t.at })),
      attempts: response.attempts.map((a) => ({ number: a.number ?? 1, files: a.files, submittedAt: a.submittedAt, score: a.score ?? null, summary: a.summary, text: text(a.answers) })),
      files: await Promise.all(files.map(toSubmissionView)),
    },
  })
})

const decisionBody = z
  .object({ action: z.enum(['approve', 'return', 'note']), note: z.string().trim().max(4000, 'ההערה ארוכה מדי').default('') })
  .refine((b) => b.action === 'approve' || b.note.length > 0, { message: 'כתבו ללקוח מה לשפר', path: ['note'] })

worksRouter.post('/works/:id/decision', async (req, res) => {
  const body = parseBody(decisionBody, req, res)
  if (!body) return
  const response = isValidObjectId(req.params.id) ? await WorksheetResponse.findById(req.params.id) : null
  const customer = response ? await Customer.findById(response.customerId) : null
  const plan: PlanDoc | null = response ? await Plan.findById(response.planId) : null
  if (!response || !customer || !plan) {
    res.status(404).json({ error: 'העבודה לא נמצאה' })
    return
  }
  const admin = adminOf(res)
  const before = response.human?.status ?? 'none'
  response.human = {
    // A note alone does not change a decision that was already made.
    status: body.action === 'approve' ? 'approved' : body.action === 'return' ? 'returned' : before === 'requested' ? 'none' : before,
    request: '',
    note: body.note,
    by: admin.owner ? 'ירין ואורן' : admin.name,
    at: new Date(),
  }
  if (body.action === 'return') response.acceptedAt = null
  response.seenAt = new Date()
  await response.save()

  // An approval closes the check, and maybe the task.
  if (body.action === 'approve' && customer.planId?.equals(plan._id)) {
    const view = toPlanProgressView(plan, customer.planAssignedAt, customer)
    const task = view.chapters.flatMap((c) => c.tasks).find((t) => t.id === response.taskId.toString())
    if (task) await syncTask(customer, plan, task)
  }
  // The customer hears about it on WhatsApp (a note alone too).
  const taskTitle = plan.chapters.flatMap((c) => c.tasks).find((t) => t._id.equals(response.taskId))?.title ?? 'המשימה'
  tellDecision(customer, response.id as string, response.human.at!, body.action, taskTitle, body.note, response.human.by ?? 'ירין ואורן')
  const [work] = await worksOf([response])
  res.json({ work })
})
