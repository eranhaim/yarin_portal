import { randomUUID } from 'node:crypto'
import express, { Router, type Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { businessFile } from '../../ai/businessFile.ts'
import { sendAiError, useAiQuota, type AiContent } from '../../ai/claude.ts'
import { COACHES, DIFFICULTIES, modeOf, SCENARIOS, sessionScore } from '../../ai/coaches.ts'
import { kindOf, readFiles, type WorkFile } from '../../ai/files.ts'
import { methodFor } from '../../ai/knowledge.ts'
import { botReleased } from '../../ai/release.ts'
import { castClient, coachReply, evaluateSession, transcriptOf, type CoachTurn, type Scenario } from '../../ai/sessions.ts'
import { answersAsText, type Worksheet, type WorksheetAnswers } from '../../game/content.ts'
import { dayKey, XP } from '../../game/rules.ts'
import { award } from '../../game/xp.ts'
import { parseBody } from '../../http.ts'
import type { CustomerDoc } from '../../models/Customer.ts'
import { COACH_PERSONAS, CoachMemory, CoachSession, WorksheetResponse, type CoachPersona, type CoachSessionDoc } from '../../models/Game.ts'
import { learnerTasks } from '../../models/Plan.ts'
import { Submission } from '../../models/Submission.ts'
import { putObject, storageEnabled } from '../../storage.ts'
import { safeFileName } from '../../uploads.ts'
import { customerOf, planOf } from './shared.ts'

// The AI coaches: modes, role plays with a hidden client, checks of real work, scores by skill area,
// and a memory that the customer can see and edit.
export const coachRouter = Router()

const MAX_MESSAGES = 60
const MAX_ATTACHMENT = 60 * 1024 * 1024

type StoredScenario = Scenario & { label: string; difficultyLabel: string }

function sessionView(session: CoachSessionDoc) {
  const scenario = session.scenario as StoredScenario | null
  return {
    id: session.id as string,
    persona: session.persona,
    mode: session.mode || COACHES[session.persona].modes[0]!.key,
    title: session.title,
    // The client's hidden details show only after the session is scored.
    scenario: scenario ? { label: scenario.label, difficulty: scenario.difficultyLabel, clientName: scenario.card.name, card: session.evaluation ? scenario.card : null } : null,
    messages: session.messages.map((m) => ({ role: m.role, text: m.text, at: m.at, attachments: m.attachments.map((a) => ({ id: a.id ?? '', name: a.name ?? '' })) })),
    evaluation: session.evaluation ?? null,
    updatedAt: session.updatedAt,
  }
}

async function findSession(customer: CustomerDoc, id: string, res: Response): Promise<CoachSessionDoc | null> {
  const session = isValidObjectId(id) ? await CoachSession.findOne({ _id: id, customerId: customer._id }) : null
  if (!session) res.status(404).json({ error: 'השיחה לא נמצאה' })
  return session
}

async function requireReleased(persona: CoachPersona, res: Response): Promise<boolean> {
  if (await botReleased(persona)) return true
  res.status(503).json({ error: 'המאמן הזה בבדיקות איכות וייפתח בקרוב.' })
  return false
}

async function memoryOf(customer: CustomerDoc, persona: CoachPersona) {
  return CoachMemory.findOneAndUpdate({ customerId: customer._id, persona }, {}, { upsert: true, new: true, setDefaultsOnInsert: true })
}

// ---------- The coaches and the customer's progress with each ----------

coachRouter.get('/coach', async (_req, res) => {
  const customer = customerOf(res)
  const [sessions, memories] = await Promise.all([
    CoachSession.find({ customerId: customer._id }).sort({ updatedAt: -1 }).limit(120),
    CoachMemory.find({ customerId: customer._id }),
  ])
  const coaches = await Promise.all(
    COACH_PERSONAS.map(async (persona) => {
      const coach = COACHES[persona]
      const own = sessions.filter((s) => s.persona === persona)
      const scored = own.filter((s) => typeof s.evaluation?.score === 'number').reverse()
      const recent = scored.slice(-5)
      const memory = memories.find((m) => m.persona === persona)
      return {
        persona,
        title: coach.title,
        available: await botReleased(persona),
        modes: coach.modes.map((m) => ({ key: m.key, label: m.label, description: m.description, roleplay: Boolean(m.roleplay), needsWork: Boolean(m.needsWork) })),
        sessions: own.length,
        scores: scored.slice(-12).map((s) => ({ id: s.id as string, score: s.evaluation!.score!, at: s.evaluation!.at ?? s.updatedAt })),
        dimensions: coach.dimensions.map((d) => {
          const values = recent.flatMap((s) => s.evaluation!.dimensions.filter((x) => x.key === d.key && (x.score ?? -1) >= 0).map((x) => x.score!))
          return { key: d.key, label: d.label, score: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null }
        }),
        notes: (memory?.notes ?? []).map((n) => ({ id: n._id.toString(), text: n.text ?? '', at: n.at })),
        commitments: (memory?.commitments ?? []).slice(-10).map((c) => ({ id: c._id.toString(), text: c.text ?? '', at: c.at, done: Boolean(c.doneAt) })),
      }
    }),
  )
  res.json({
    coaches,
    scenarios: SCENARIOS.map((s) => ({ key: s.key, label: s.label })),
    difficulties: DIFFICULTIES.map((d) => ({ key: d.key, label: d.label })),
    sessions: sessions.slice(0, 40).map((s) => ({
      id: s.id as string,
      persona: s.persona,
      title: s.title,
      turns: s.messages.length,
      score: s.evaluation?.score ?? null,
      updatedAt: s.updatedAt,
    })),
  })
})

// ---------- Memory: the customer sees what a coach knows, and can correct it ----------

const personaParam = z.enum(COACH_PERSONAS)

coachRouter.delete('/coach-memory/:persona/notes/:id', async (req, res) => {
  const persona = personaParam.safeParse(req.params.persona)
  if (!persona.success || !isValidObjectId(req.params.id)) {
    res.status(404).json({ error: 'השורה לא נמצאה' })
    return
  }
  await CoachMemory.updateOne({ customerId: customerOf(res)._id, persona: persona.data }, { $pull: { notes: { _id: req.params.id } } })
  res.json({ ok: true })
})

coachRouter.patch('/coach-memory/:persona/commitments/:id', async (req, res) => {
  const body = parseBody(z.object({ done: z.boolean() }), req, res)
  if (!body) return
  const persona = personaParam.safeParse(req.params.persona)
  if (!persona.success || !isValidObjectId(req.params.id)) {
    res.status(404).json({ error: 'השורה לא נמצאה' })
    return
  }
  await CoachMemory.updateOne(
    { customerId: customerOf(res)._id, persona: persona.data, 'commitments._id': req.params.id },
    { $set: { 'commitments.$.doneAt': body.done ? new Date() : null } },
  )
  res.json({ ok: true })
})

// ---------- Sessions ----------

const startBody = z.object({
  persona: personaParam,
  mode: z.string().max(40).default(''),
  scenario: z.string().max(40).default('dm'),
  difficulty: z.string().max(40).default('medium'),
})

coachRouter.post('/coach', async (req, res) => {
  const body = parseBody(startBody, req, res)
  if (!body) return
  const customer = customerOf(res)
  if (!(await requireReleased(body.persona, res))) return
  const coach = COACHES[body.persona]
  const mode = modeOf(body.persona, body.mode)
  try {
    let opener = mode.opener ?? ''
    let scenario: StoredScenario | null = null
    let title = mode.label
    if (mode.roleplay) {
      // The simulated client gets a full, hidden identity and opens the conversation.
      await useAiQuota(customer._id)
      const s = SCENARIOS.find((x) => x.key === body.scenario) ?? SCENARIOS[0]
      const d = DIFFICULTIES.find((x) => x.key === body.difficulty) ?? DIFFICULTIES[1]
      const card = await castClient({ scenario: s.key, difficulty: d.key, business: await businessFile(customer, { persona: body.persona }) })
      scenario = { key: s.key, difficulty: d.key, card, label: s.label, difficultyLabel: d.label }
      opener = card.first
      title = `${mode.label}: ${s.label}`
    } else {
      const memory = await memoryOf(customer, body.persona)
      const open = memory.commitments.filter((c) => !c.doneAt).at(-1)
      if (open?.text) opener = `${opener}\n\nבפעם הקודמת סיכמנו: ${open.text}. איך הלך?`
    }
    const session = await CoachSession.create({
      customerId: customer._id,
      persona: body.persona,
      mode: mode.key,
      title: title || coach.title,
      scenario,
      messages: [{ role: 'assistant', text: opener }],
    })
    res.status(201).json({ session: sessionView(session) })
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})

coachRouter.get('/coach/:id', async (req, res) => {
  const session = await findSession(customerOf(res), req.params.id, res)
  if (session) res.json({ session: sessionView(session) })
})

// ---------- Real work: a file, a screenshot, or a worksheet from the plan ----------

/** Files wait here (by id) until a message uses them. They belong to the session's customer. */
coachRouter.post('/coach/:id/attachments', express.raw({ type: () => true, limit: MAX_ATTACHMENT }), async (req, res) => {
  const customer = customerOf(res)
  const session = await findSession(customer, req.params.id, res)
  if (!session) return
  if (!storageEnabled) {
    res.status(503).json({ error: 'אחסון הקבצים לא מוגדר' })
    return
  }
  const data: unknown = req.body
  const name = decodeURIComponent(String(req.headers['x-file-name'] ?? '')).trim().slice(0, 200)
  const contentType = String(req.headers['content-type'] ?? 'application/octet-stream').slice(0, 200)
  if (!Buffer.isBuffer(data) || data.length === 0 || !name) {
    res.status(400).json({ error: 'הקובץ ריק' })
    return
  }
  if (kindOf({ name, contentType }) === 'other') {
    res.status(415).json({ error: 'אפשר לצרף תמונה, PDF, Word, מצגת, טבלה, טקסט, סרטון או הקלטה.' })
    return
  }
  const id = randomUUID()
  // The key holds the customer and the session, so an id from another session finds nothing.
  const key = `coach/${customer.id as string}/${session.id as string}/${id}-${safeFileName(name)}`
  await putObject(key, data, contentType)
  res.status(201).json({ attachment: { id, name, contentType, size: data.length, key } })
})

/** The customer's own work that a coach can open: handed-in worksheets and files. */
coachRouter.get('/coach-work', async (_req, res) => {
  const customer = customerOf(res)
  const plan = await planOf(customer)
  if (!plan) {
    res.json({ work: [] })
    return
  }
  const tasks = new Map(learnerTasks(plan, customer).map((t) => [t._id.toString(), t]))
  const [responses, files] = await Promise.all([
    WorksheetResponse.find({ customerId: customer._id, planId: plan._id, submittedAt: { $ne: null } }, { attempts: 0, chat: 0 }).sort({ submittedAt: -1 }),
    Submission.find({ customerId: customer._id, planId: plan._id, status: 'ready' }).sort({ createdAt: -1 }).limit(30),
  ])
  res.json({
    work: [
      ...responses.flatMap((r) => {
        const task = tasks.get(r.taskId.toString())
        return task ? [{ kind: 'worksheet' as const, id: task._id.toString(), title: task.title, at: r.submittedAt }] : []
      }),
      ...files.map((f) => ({ kind: 'file' as const, id: f.id as string, title: f.fileName, at: f.createdAt })),
    ],
  })
})

const messageBody = z.object({
  text: z.string().trim().max(8000, 'ההודעה ארוכה מדי').default(''),
  attachments: z
    .array(z.object({ id: z.uuid(), name: z.string().max(200), contentType: z.string().max(200), size: z.number().int().positive().max(MAX_ATTACHMENT), key: z.string().max(500) }))
    .max(4, 'עד ארבעה קבצים בהודעה')
    .default([]),
  work: z
    .array(z.object({ kind: z.enum(['worksheet', 'file']), id: z.string().refine(isValidObjectId) }))
    .max(3, 'עד שלוש עבודות בהודעה')
    .default([]),
})

/** Opens the attached work. The text of worksheets goes into the message, so it stays in the conversation. */
async function collectWork(customer: CustomerDoc, session: CoachSessionDoc, body: z.infer<typeof messageBody>) {
  const prefix = `coach/${customer.id as string}/${session.id as string}/`
  const files: (WorkFile & { id: string })[] = body.attachments
    .filter((a) => a.key.startsWith(prefix) && a.key.includes(a.id))
    .map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, size: a.size, key: a.key }))
  let text = ''
  const plan = body.work.length ? await planOf(customer) : null
  for (const item of body.work) {
    if (item.kind === 'file') {
      const file = await Submission.findOne({ _id: item.id, customerId: customer._id, status: 'ready' })
      if (file) files.push({ id: file.id as string, name: file.fileName, contentType: file.contentType, size: file.size, key: file.key, note: file.note })
    } else {
      const response = await WorksheetResponse.findOne({ customerId: customer._id, taskId: item.id })
      const task = plan ? learnerTasks(plan, customer).find((t) => t._id.toString() === item.id) : null
      if (response && task?.worksheet) {
        text += `\n\n[מסך העבודה: ${task.title}]\n${answersAsText(task.worksheet as Worksheet, (response.answers ?? {}) as WorksheetAnswers).slice(0, 6000)}`
      }
    }
  }
  return { files, text }
}

coachRouter.post('/coach/:id/message', async (req, res) => {
  const body = parseBody(messageBody, req, res)
  if (!body) return
  const customer = customerOf(res)
  const session = await findSession(customer, req.params.id, res)
  if (!session) return
  const persona = session.persona
  if (!(await requireReleased(persona, res))) return
  if (!body.text && body.attachments.length === 0 && body.work.length === 0) {
    res.status(400).json({ error: 'כתבו הודעה או צרפו עבודה' })
    return
  }
  if (session.messages.length >= MAX_MESSAGES) {
    res.status(409).json({ error: 'השיחה הזו ארוכה מדי. פתחו שיחה חדשה.' })
    return
  }
  const scenario = session.scenario as StoredScenario | null
  try {
    await useAiQuota(customer._id)
    const { files, text } = await collectWork(customer, session, body)
    const opened = files.length ? await readFiles(files) : null
    const said = `${body.text}${text}`.trim() || 'צירפתי את העבודה.'
    const content: string | AiContent = opened ? [{ type: 'text', text: said }, ...opened.content] : said
    const history: CoachTurn[] = session.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      // Files of earlier messages are not sent again; their names stay, and the coach already described them.
      content: m.attachments.length ? `${m.text}\n[צורפו: ${m.attachments.map((a) => a.name).join(', ')}]` : m.text,
    }))
    const [method, business] = await Promise.all([scenario ? '' : methodFor(COACHES[persona].knowledge), businessFile(customer, { persona })])
    const reply = await coachReply({ persona, mode: session.mode, scenario, method, business, history: [...history, { role: 'user', content }] })
    session.messages.push(
      { role: 'user', text: said.slice(0, 12_000), attachments: files.map(({ id, name, contentType, size, key }) => ({ id, name, contentType, size, key })), at: new Date() },
      { role: 'assistant', text: reply, attachments: [], at: new Date() },
    )
    await session.save()
    if (persona === 'mental') {
      await award(customer._id, { skill: 'mindset', points: XP.mentalSession, refKey: `mental:${dayKey()}`, label: 'שיחה עם המאמן המנטלי' })
    }
    res.json({ session: sessionView(session), skipped: opened?.skipped ?? [] })
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})

/** Ends a session: scores by area (or a summary), and what the coach keeps for the next time. */
coachRouter.post('/coach/:id/evaluate', async (req, res) => {
  const customer = customerOf(res)
  const session = await findSession(customer, req.params.id, res)
  if (!session) return
  const persona = session.persona
  if (!(await requireReleased(persona, res))) return
  if (session.messages.filter((m) => m.role === 'user').length < 2) {
    res.status(409).json({ error: 'כתבו לפחות שתי הודעות לפני שמסיימים.' })
    return
  }
  const coach = COACHES[persona]
  const scenario = session.scenario as StoredScenario | null
  try {
    await useAiQuota(customer._id)
    const out = await evaluateSession({
      persona,
      mode: session.mode,
      scenario,
      business: await businessFile(customer, { persona }),
      transcript: transcriptOf(persona, Boolean(scenario), session.messages.map((m) => ({ role: m.role, text: m.text }))),
    })
    const dimensions = coach.dimensions.flatMap((d) => {
      const found = out.dimensions.find((x) => x.key === d.key)
      return found ? [{ key: d.key, label: d.label, score: Math.max(-1, Math.min(100, Math.round(found.score))), evidence: found.evidence, better: found.better }] : []
    })
    const score = coach.dimensions.length ? sessionScore(dimensions) : null
    const first = !session.evaluation
    session.set('evaluation', {
      score,
      summary: out.summary,
      strengths: out.strengths.slice(0, 3),
      improvements: out.improvements.slice(0, 3),
      nextStep: out.nextStep,
      dimensions,
      at: new Date(),
    })
    await session.save()

    // Remember for next time (once per session).
    if (first) {
      const memory = await memoryOf(customer, persona)
      const known = new Set(memory.notes.map((n) => n.text))
      for (const text of out.memory.slice(0, 4)) if (!known.has(text)) memory.notes.push({ text: text.slice(0, 300), at: new Date() })
      while (memory.notes.length > 30) memory.notes.shift()
      if (out.nextStep) memory.commitments.push({ text: out.nextStep.slice(0, 400), at: new Date(), doneAt: null })
      while (memory.commitments.length > 20) memory.commitments.shift()
      await memory.save()
    }
    if (score !== null) {
      await award(customer._id, {
        skill: coach.skill,
        points: Math.round((score / 100) * XP.simulatorMax),
        refKey: `coach:${session.id as string}`,
        label: `${session.title}: ציון ${score}`,
        mode: 'best',
      })
    }
    res.json({ session: sessionView(session) })
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})
