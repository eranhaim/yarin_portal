import express, { Router } from 'express'
import { isValidObjectId, Types } from 'mongoose'
import { z } from 'zod'
import { aiJson, sendAiError } from '../../ai/claude.ts'
import { CONTENT_SYSTEM } from '../../ai/prompts.ts'
import {
  answersAsText,
  cleanQuiz,
  cleanWorksheet,
  lookSchema,
  quizSchema,
  taskContentSchema,
  worksheetSchema,
  type Worksheet,
  type WorksheetAnswers,
} from '../../game/content.ts'
import { REWARDS, SKILL_KEYS, XP } from '../../game/rules.ts'
import { award, gameSummary, revoke } from '../../game/xp.ts'
import { parseBody } from '../../http.ts'
import { detectImageType, IMAGE_TYPES } from '../../images.ts'
import { Customer } from '../../models/Customer.ts'
import {
  CoachSession,
  Lead,
  LEAD_STATUSES,
  putSetting,
  QuizAttempt,
  RewardDelivery,
  WorksheetResponse,
} from '../../models/Game.ts'
import { Plan } from '../../models/Plan.ts'
import { hostLooks } from '../public.ts'
import { lookFromPhoto } from '../me/profile.ts'

// The admin's view of the game: a customer's game data, referrals, prizes, settings, and AI task content.
export const adminGameRouter = Router()

// ---------- One customer's game ----------

adminGameRouter.get('/customers/:id/game', async (req, res) => {
  const customer = isValidObjectId(req.params.id) ? await Customer.findById(req.params.id) : null
  if (!customer) {
    res.status(404).json({ error: 'הלקוח לא נמצא' })
    return
  }
  const plan = customer.planId ? await Plan.findById(customer.planId) : null
  const tasks = plan?.chapters.flatMap((c) => c.tasks) ?? []
  const [summary, responses, quizzes, sessions, leads] = await Promise.all([
    gameSummary(customer, plan),
    WorksheetResponse.find({ customerId: customer._id }),
    QuizAttempt.aggregate<{ _id: Types.ObjectId; best: number; total: number; tries: number }>([
      { $match: { customerId: customer._id } },
      { $group: { _id: '$taskId', best: { $max: '$correct' }, total: { $max: '$total' }, tries: { $sum: 1 } } },
    ]),
    CoachSession.find({ customerId: customer._id }).sort({ updatedAt: -1 }).limit(30),
    Lead.find({ referrerId: customer._id }).sort({ createdAt: -1 }),
  ])
  res.json({
    game: summary,
    worksheets: responses.map((r) => {
      const task = tasks.find((t) => t._id.equals(r.taskId))
      return {
        taskId: r.taskId.toString(),
        taskTitle: task?.title ?? 'משימה שנמחקה',
        text: task?.worksheet ? answersAsText(task.worksheet as Worksheet, (r.answers ?? {}) as WorksheetAnswers) : '',
        submittedAt: r.submittedAt,
        review: r.review ?? null,
        chat: r.chat.map((t) => ({ role: t.role, text: t.text, at: t.at })),
      }
    }),
    quizzes: quizzes.map((q) => ({ taskId: q._id.toString(), best: q.best, total: q.total, tries: q.tries })),
    coach: sessions.map((s) => ({
      id: s.id as string,
      persona: s.persona,
      title: s.title,
      turns: s.messages.length,
      score: s.evaluation?.score ?? null,
      updatedAt: s.updatedAt,
    })),
    leads: leads.map((l) => ({ id: l.id as string, name: l.name, phone: l.phone, status: l.status, createdAt: l.createdAt })),
  })
})

adminGameRouter.get('/coach/:id', async (req, res) => {
  const session = isValidObjectId(req.params.id) ? await CoachSession.findById(req.params.id) : null
  if (!session) {
    res.status(404).json({ error: 'השיחה לא נמצאה' })
    return
  }
  res.json({
    session: {
      id: session.id as string,
      persona: session.persona,
      title: session.title,
      messages: session.messages.map((m) => ({ role: m.role, text: m.text, at: m.at })),
      evaluation: session.evaluation ?? null,
    },
  })
})

// ---------- Prizes ----------

adminGameRouter.put('/customers/:id/rewards/:key', async (req, res) => {
  const body = parseBody(z.object({ delivered: z.boolean() }), req, res)
  if (!body) return
  if (!isValidObjectId(req.params.id) || !REWARDS.some((r) => r.key === req.params.key)) {
    res.status(404).json({ error: 'הפרס לא נמצא' })
    return
  }
  const filter = { customerId: new Types.ObjectId(req.params.id), rewardKey: req.params.key }
  if (body.delivered) await RewardDelivery.updateOne(filter, { $setOnInsert: { deliveredAt: new Date() } }, { upsert: true })
  else await RewardDelivery.deleteOne(filter)
  res.json({ ok: true })
})

// ---------- Referral leads ----------

adminGameRouter.get('/leads/summary', async (_req, res) => {
  res.json({ new: await Lead.countDocuments({ status: 'new' }) })
})

adminGameRouter.get('/leads', async (_req, res) => {
  const leads = await Lead.find().sort({ createdAt: -1 }).limit(500)
  const referrers = await Customer.find({ _id: { $in: [...new Set(leads.map((l) => l.referrerId.toString()))] } })
  const names = new Map(referrers.map((c) => [c.id as string, c.name]))
  res.json({
    leads: leads.map((l) => ({
      id: l.id as string,
      name: l.name,
      phone: l.phone,
      email: l.email,
      note: l.note,
      status: l.status,
      createdAt: l.createdAt,
      referrer: { id: l.referrerId.toString(), name: names.get(l.referrerId.toString()) ?? 'לקוח שנמחק' },
    })),
  })
})

adminGameRouter.patch('/leads/:id', async (req, res) => {
  const body = parseBody(z.object({ status: z.enum(LEAD_STATUSES) }), req, res)
  if (!body) return
  const lead = isValidObjectId(req.params.id) ? await Lead.findById(req.params.id) : null
  if (!lead) {
    res.status(404).json({ error: 'הליד לא נמצא' })
    return
  }
  lead.status = body.status
  await lead.save()
  // A friend who joined pays the referrer; changing it back takes the points back.
  const refKey = `referral:${lead.id as string}`
  if (body.status === 'joined') {
    await award(lead.referrerId, { skill: 'sales', points: XP.referralJoined, refKey, label: `${lead.name} הצטרף/ה בזכותכם!` })
  } else {
    await revoke(lead.referrerId, refKey)
  }
  res.json({ ok: true })
})

// ---------- Settings: the hosts' characters ----------

adminGameRouter.get('/settings', async (_req, res) => {
  res.json({ hosts: await hostLooks() })
})

adminGameRouter.put('/settings/hosts', async (req, res) => {
  const body = parseBody(z.object({ yarin: lookSchema, oren: lookSchema }), req, res)
  if (!body) return
  await putSetting('hosts', body)
  res.json({ hosts: await hostLooks() })
})

/** Any photo -> character look (for the hosts, or to try a look). Nothing is stored. */
adminGameRouter.post('/looks/detect', express.raw({ type: IMAGE_TYPES, limit: '5mb' }), async (req, res) => {
  const data: unknown = req.body
  const type = Buffer.isBuffer(data) ? detectImageType(data) : null
  if (!Buffer.isBuffer(data) || !type) {
    res.status(415).json({ error: 'העלו תמונה מסוג JPEG, PNG או WebP' })
    return
  }
  try {
    res.json({ look: await lookFromPhoto(data, type) })
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})

// ---------- Task game content (skill, worksheet, quiz, rubric) ----------

async function findTask(planId: string, taskId: string) {
  const plan = isValidObjectId(planId) ? await Plan.findById(planId) : null
  const task = plan?.chapters.flatMap((c) => c.tasks).find((t) => t._id.toString() === taskId)
  return plan && task ? { plan, task } : null
}

type ContentPatch = { skill?: string | null; worksheet?: unknown; quiz?: unknown; rubric?: string[] }

/**
 * Writes one task's content with a single atomic update, so several tasks of the same plan
 * can be generated in parallel (a load-and-save of the whole plan would conflict).
 */
async function saveTaskContent(planId: Types.ObjectId, taskId: string, patch: ContentPatch) {
  const set: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) set[`chapters.$[].tasks.$[task].${key}`] = value
  await Plan.updateOne({ _id: planId }, { $set: set }, { arrayFilters: [{ 'task._id': new Types.ObjectId(taskId) }] })
  const found = await findTask(planId.toString(), taskId)
  const task = found?.task
  return { skill: task?.skill ?? null, worksheet: task?.worksheet ?? null, quiz: task?.quiz ?? null, rubric: task?.rubric ?? [] }
}

adminGameRouter.post('/plans/:planId/tasks/:taskId/generate', async (req, res) => {
  const body = parseBody(z.object({ sourceText: z.string().max(200_000).default('') }), req, res)
  if (!body) return
  const found = await findTask(req.params.planId, req.params.taskId)
  if (!found) {
    res.status(404).json({ error: 'המשימה לא נמצאה' })
    return
  }
  const { plan, task } = found
  const prompt = [
    `Task title: ${task.title}`,
    `Task instructions:\n${task.description || '(none)'}`,
    body.sourceText ? `Lesson material (slides and the original worksheet):\n${body.sourceText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
  try {
    const content = await aiJson({ schema: taskContentSchema, system: CONTENT_SYSTEM, messages: [{ role: 'user', content: prompt }], effort: 'medium', maxTokens: 16000 })
    const saved = await saveTaskContent(plan._id, task._id.toString(), {
      skill: content.skill,
      worksheet: cleanWorksheet(content.worksheet),
      quiz: cleanQuiz(content.quiz),
      rubric: content.rubric.slice(0, 8).map((r) => r.slice(0, 300)),
    })
    res.json({ content: saved })
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})

adminGameRouter.patch('/plans/:planId/tasks/:taskId/content', async (req, res) => {
  const body = parseBody(
    z.object({
      skill: z.enum(SKILL_KEYS).nullable().optional(),
      worksheet: worksheetSchema.nullable().optional(),
      quiz: quizSchema.nullable().optional(),
      rubric: z.array(z.string().max(300)).max(10).optional(),
    }),
    req,
    res,
  )
  if (!body) return
  const found = await findTask(req.params.planId, req.params.taskId)
  if (!found) {
    res.status(404).json({ error: 'המשימה לא נמצאה' })
    return
  }
  const saved = await saveTaskContent(found.plan._id, req.params.taskId, {
    skill: body.skill,
    worksheet: body.worksheet === undefined ? undefined : cleanWorksheet(body.worksheet),
    quiz: body.quiz === undefined ? undefined : cleanQuiz(body.quiz),
    rubric: body.rubric,
  })
  res.json({ content: saved })
})

