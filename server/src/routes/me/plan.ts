import { Router } from 'express'
import { z } from 'zod'
import { dayKey, XP } from '../../game/rules.ts'
import { award } from '../../game/xp.ts'
import { parseBody } from '../../http.ts'
import { setTaskStatus } from '../../models/Customer.ts'
import { customerOf, openTask, planOf, planView, syncTaskXp } from './shared.ts'

// The customer's plan and task status.
export const planRouter = Router()

planRouter.get('/plan', async (_req, res) => {
  const customer = customerOf(res)
  const plan = await planOf(customer)
  // Showing up counts: a few points for the first visit of the day (streaks are built from these).
  await award(customer._id, { skill: 'mindset', points: XP.dailyVisit, refKey: `visit:${dayKey()}`, label: 'הגעתם היום' })
  res.json({ plan: plan ? await planView(customer, plan) : null })
})

planRouter.patch('/tasks/:taskId', async (req, res) => {
  const body = parseBody(z.object({ status: z.enum(['not_started', 'started', 'completed']) }), req, res)
  if (!body) return
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  setTaskStatus(customer, req.params.taskId, body.status)
  await customer.save()
  await syncTaskXp(customer._id, found.task, body.status)
  res.json({ plan: await planView(customer, found.plan) })
})
