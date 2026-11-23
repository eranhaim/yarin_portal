import { Router, type Response } from 'express'
import { isValidObjectId, Types } from 'mongoose'
import { z } from 'zod'
import { parseBody } from '../../http.ts'
import { Asset, deleteAssets } from '../../models/Asset.ts'
import { Customer } from '../../models/Customer.ts'
import { Plan, planTaskIds, toPlanView, type PlanDoc } from '../../models/Plan.ts'

export const plansRouter = Router()

// The editor sends the whole plan on every save.
// Existing chapters and tasks keep their id, so customer progress stays linked to them.

const optionalId = z.string().refine(isValidObjectId, 'מזהה לא תקין').optional()

const taskInput = z.object({
  id: optionalId,
  title: z.string().trim().min(1, 'לכל משימה צריכה להיות כותרת').max(200, 'כותרת המשימה ארוכה מדי'),
  description: z.string().trim().max(2000, 'תיאור המשימה ארוך מדי').default(''),
  dueAt: z.iso.datetime({ offset: true, message: 'מועד היעד לא תקין' }).nullable().default(null),
})

const chapterInput = z.object({
  id: optionalId,
  title: z.string().trim().min(1, 'לכל שלב צריכה להיות כותרת').max(200, 'כותרת השלב ארוכה מדי'),
  description: z.string().trim().max(2000, 'תיאור השלב ארוך מדי').default(''),
  tasks: z.array(taskInput).max(500, 'יותר מדי משימות בשלב אחד').default([]),
})

const planInput = z.object({
  title: z.string().trim().min(1, 'חובה למלא שם לתוכנית').max(200, 'שם התוכנית ארוך מדי'),
  description: z.string().trim().max(4000, 'התיאור ארוך מדי').default(''),
  chapters: z.array(chapterInput).max(200, 'יותר מדי שלבים').default([]),
})

type TaskContent = { skill: unknown; worksheet: unknown; quiz: unknown; rubric: unknown }

/** Game content of the plan's tasks, by task id. The editor does not send it, so a save keeps it. */
function contentById(plan: PlanDoc | null): Map<string, TaskContent> {
  const map = new Map<string, TaskContent>()
  for (const chapter of plan?.chapters ?? []) {
    for (const task of chapter.tasks) {
      map.set(task._id.toString(), { skill: task.skill, worksheet: task.worksheet, quiz: task.quiz, rubric: task.rubric })
    }
  }
  return map
}

function toDocument(input: z.infer<typeof planInput>, content = new Map<string, TaskContent>()) {
  return {
    title: input.title,
    description: input.description,
    chapters: input.chapters.map((chapter) => ({
      _id: chapter.id ? new Types.ObjectId(chapter.id) : new Types.ObjectId(),
      title: chapter.title,
      description: chapter.description,
      tasks: chapter.tasks.map((task) => ({
        _id: task.id ? new Types.ObjectId(task.id) : new Types.ObjectId(),
        title: task.title,
        description: task.description,
        dueAt: task.dueAt ? new Date(task.dueAt) : null,
        ...(task.id ? content.get(task.id) : undefined),
      })),
    })),
  }
}

async function findPlan(id: string, res: Response): Promise<PlanDoc | null> {
  const plan = isValidObjectId(id) ? await Plan.findById(id) : null
  if (!plan) res.status(404).json({ error: 'התוכנית לא נמצאה' })
  return plan
}

plansRouter.get('/', async (_req, res) => {
  const [plans, usage] = await Promise.all([
    Plan.find().sort({ updatedAt: -1 }),
    Customer.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { planId: { $ne: null } } },
      { $group: { _id: '$planId', count: { $sum: 1 } } },
    ]),
  ])
  const customersByPlan = new Map(usage.map((u) => [u._id.toString(), u.count]))
  res.json({
    plans: plans.map((plan) => ({
      id: plan.id as string,
      title: plan.title,
      description: plan.description,
      chapterCount: plan.chapters.length,
      taskCount: plan.chapters.reduce((sum, chapter) => sum + chapter.tasks.length, 0),
      customerCount: customersByPlan.get(plan.id as string) ?? 0,
      updatedAt: plan.updatedAt,
    })),
  })
})

plansRouter.get('/:id', async (req, res) => {
  const plan = await findPlan(req.params.id, res)
  if (!plan) return
  const customerCount = await Customer.countDocuments({ planId: plan._id })
  res.json({ plan: { ...toPlanView(plan), customerCount } })
})

plansRouter.post('/', async (req, res) => {
  const body = parseBody(planInput, req, res)
  if (!body) return
  const plan = await Plan.create(toDocument(body))
  res.status(201).json({ plan: { ...toPlanView(plan), customerCount: 0 } })
})

plansRouter.put('/:id', async (req, res) => {
  const body = parseBody(planInput, req, res)
  if (!body) return
  const plan = await findPlan(req.params.id, res)
  if (!plan) return
  plan.set(toDocument(body, contentById(plan)))
  await plan.save()

  // Remove videos and files of tasks that are no longer in the plan.
  const taskIds = [...planTaskIds(plan)].map((id) => new Types.ObjectId(id))
  await deleteAssets(await Asset.find({ planId: plan._id, taskId: { $ne: null, $nin: taskIds } }))

  const customerCount = await Customer.countDocuments({ planId: plan._id })
  res.json({ plan: { ...toPlanView(plan), customerCount } })
})

plansRouter.delete('/:id', async (req, res) => {
  const plan = await findPlan(req.params.id, res)
  if (!plan) return
  const customerCount = await Customer.countDocuments({ planId: plan._id })
  if (customerCount > 0) {
    res.status(409).json({
      error:
        customerCount === 1
          ? 'התוכנית משויכת ללקוח אחד. שייכו לו תוכנית אחרת קודם.'
          : `התוכנית משויכת ל-${customerCount} לקוחות. שייכו להם תוכנית אחרת קודם.`,
    })
    return
  }
  await deleteAssets(await Asset.find({ planId: plan._id }))
  await plan.deleteOne()
  res.json({ ok: true })
})
