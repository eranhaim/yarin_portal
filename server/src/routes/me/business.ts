import { Router } from 'express'
import { z } from 'zod'
import { aiWorks, aiJson } from '../../ai/claude.ts'
import { DIAGNOSIS_SYSTEM, diagnosisSchema } from '../../ai/prompts.ts'
import {
  bottleneckLabel,
  DIAGNOSIS,
  diagnosisAsText,
  missingAnswers,
  routeFrom,
  stageLabel,
  trackLabel,
  TRACKS,
  type DiagnosisAnswers,
  type Route,
} from '../../game/tracks.ts'
import { gameSummary } from '../../game/xp.ts'
import { currentMonth, monthBefore } from '../../game/business.ts'
import { parseBody } from '../../http.ts'
import type { CustomerDoc } from '../../models/Customer.ts'
import { BusinessReport, Diagnosis, type DiagnosisDoc } from '../../models/Game.ts'
import { learnerTasks } from '../../models/Plan.ts'
import { customerOf, planOf, planView, syncTask } from './shared.ts'

// The customer's business: the opening diagnosis (it opens the personal route) and the monthly results.
export const businessRouter = Router()

// ---------- Diagnosis ----------

const answersSchema = z.record(z.string().max(40), z.union([z.string().max(2000), z.number().min(0).max(1_000_000_000), z.array(z.string().max(60)).max(20)]))

const newest = (customer: CustomerDoc) => Diagnosis.findOne({ customerId: customer._id }).sort({ createdAt: -1 })

function diagnosisView(doc: DiagnosisDoc | null) {
  const result = doc?.result
  return {
    answers: (doc?.answers ?? {}) as DiagnosisAnswers,
    submittedAt: doc?.submittedAt ?? null,
    result: result
      ? {
          track: TRACKS.find((t) => t.key === result.track) ?? null,
          stage: stageLabel(result.stage),
          bottleneck: bottleneckLabel(result.bottleneck),
          reasons: result.reasons,
          summary: result.summary,
          strengths: result.strengths,
          risks: result.risks,
          priorities: result.priorities.map((p) => ({ title: p.title ?? '', why: p.why ?? '' })),
        }
      : null,
  }
}

businessRouter.get('/diagnosis', async (_req, res) => {
  res.json({ questions: DIAGNOSIS, ...diagnosisView(await newest(customerOf(res))) })
})

/** Saves a draft while the customer answers. */
businessRouter.put('/diagnosis', async (req, res) => {
  const body = parseBody(z.object({ answers: answersSchema }), req, res)
  if (!body) return
  const customer = customerOf(res)
  const doc = await newest(customer)
  if (doc && !doc.submittedAt) {
    doc.answers = body.answers
    doc.markModified('answers')
    await doc.save()
  } else if (!doc) await Diagnosis.create({ customerId: customer._id, answers: body.answers })
  res.json({ ok: true })
})

/** Without the AI (or when it fails), the explanation comes from the rules. */
function plainExplanation(route: Route) {
  return {
    summary: route.reasons.join(' '),
    strengths: [] as string[],
    risks: [] as string[],
    priorities: [
      { title: `לטפל ב${bottleneckLabel(route.bottleneck)}`, why: route.reasons.at(-1) ?? '' },
      { title: 'לסגור את שלב האבחון', why: 'המספרים שלכם הם נקודת ההתחלה לכל מה שיבוא.' },
      { title: 'לעדכן תוצאות פעם בחודש', why: 'ככה רואים אם העבודה באמת משנה את העסק.' },
    ],
  }
}

businessRouter.post('/diagnosis', async (req, res) => {
  const body = parseBody(z.object({ answers: answersSchema }), req, res)
  if (!body) return
  const customer = customerOf(res)
  const missing = missingAnswers(body.answers)
  if (missing.length > 0) {
    res.status(400).json({ error: `חסרה תשובה: ${missing[0]!.label}`, fields: Object.fromEntries(missing.map((q) => [q.id, 'חסרה תשובה'])) })
    return
  }
  const answers = body.answers as DiagnosisAnswers
  const route = routeFrom(answers)
  let words = plainExplanation(route)
  if (aiWorks()) {
    try {
      const out = await aiJson({
        schema: diagnosisSchema,
        system: DIAGNOSIS_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Participant: ${customer.name.split(' ')[0]}\nRoute (decided): ${trackLabel(route.track)}, stage ${stageLabel(route.stage)}, bottleneck ${bottleneckLabel(route.bottleneck)}\nReasons from the rules: ${route.reasons.join(' ')}\n\n<answers>\n${diagnosisAsText(answers)}\n</answers>`,
          },
        ],
        effort: 'medium',
        maxTokens: 5000,
      })
      words = { summary: out.summary, strengths: out.strengths.slice(0, 3), risks: out.risks.slice(0, 3), priorities: out.priorities.slice(0, 3) }
    } catch (err) {
      console.warn('The diagnosis explanation failed; using the plain one', err)
    }
  }

  const draft = await newest(customer)
  const doc = draft && !draft.submittedAt ? draft : new Diagnosis({ customerId: customer._id })
  doc.answers = answers
  doc.markModified('answers')
  doc.submittedAt = new Date()
  doc.set('result', { ...route, ...words })
  await doc.save()

  // An admin's choice of route stays; a new diagnosis only replaces an earlier diagnosis.
  if (customer.routeBy !== 'admin') {
    customer.track = route.track
    customer.routeBy = 'diagnosis'
  }
  customer.stage = route.stage
  customer.bottleneck = route.bottleneck
  await customer.save()

  await saveBaseline(customer, answers)

  // The task that holds the diagnosis may be done now.
  const plan = await planOf(customer)
  if (plan) {
    const view = (await planView(customer, plan)).chapters.flatMap((c) => (c.state === 'locked' ? [] : c.tasks))
    const task = view.find((t) => t.practice === 'diagnosis')
    if (task) await syncTask(customer, plan, task as Parameters<typeof syncTask>[2])
  }
  res.json({
    ...diagnosisView(doc),
    taskCount: plan ? learnerTasks(plan, customer).length : 0,
    plan: plan ? await planView(customer, plan) : null,
    game: await gameSummary(customer, plan),
  })
})


/** The numbers of the first diagnosis are the starting point of the business metric. */
async function saveBaseline(customer: CustomerDoc, answers: DiagnosisAnswers): Promise<void> {
  if (await BusinessReport.exists({ customerId: customer._id })) return
  const number = (id: string) => (typeof answers[id] === 'number' ? Math.round(answers[id] as number) : null)
  await BusinessReport.create({
    customerId: customer._id,
    // The questions ask about the last full month.
    month: monthBefore(currentMonth()),
    amount: number('revenue') ?? 0,
    expenses: number('expenses'),
    leads: number('leads'),
    calls: number('calls'),
    deals: number('deals'),
    baseline: true,
    note: 'נקודת ההתחלה, מהאבחון',
  })
}

// ---------- Monthly results ----------

const amount = z.number().min(0, 'הסכום לא יכול להיות שלילי').max(100_000_000, 'הסכום גבוה מדי')
const count = z.number().int('מספר שלם בבקשה').min(0, 'המספר לא יכול להיות שלילי').max(1_000_000, 'המספר גבוה מדי')

businessRouter.post('/business/reports', async (req, res) => {
  const body = parseBody(
    z
      .object({
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'חודש לא תקין'),
        revenue: amount,
        expenses: amount.nullable().default(null),
        leads: count.nullable().default(null),
        calls: count.nullable().default(null),
        deals: count.nullable().default(null),
        note: z.string().trim().max(1000, 'ההערה ארוכה מדי').default(''),
      })
      .refine((b) => b.month <= currentMonth(), { message: 'אי אפשר לדווח על חודש שעוד לא הגיע', path: ['month'] }),
    req,
    res,
  )
  if (!body) return
  const customer = customerOf(res)
  const { month, revenue, ...rest } = body
  await BusinessReport.updateOne({ customerId: customer._id, month }, { $set: { amount: Math.round(revenue), ...rest } }, { upsert: true, setDefaultsOnInsert: true })
  res.json({ game: await gameSummary(customer, await planOf(customer)) })
})

businessRouter.delete('/business/reports/:month', async (req, res) => {
  const customer = customerOf(res)
  await BusinessReport.deleteOne({ customerId: customer._id, month: req.params.month })
  res.json({ game: await gameSummary(customer, await planOf(customer)) })
})
