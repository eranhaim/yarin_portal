import { createHash } from 'node:crypto'
import { Router } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { businessFile } from '../../ai/businessFile.ts'
import { aiWorks, aiJson } from '../../ai/claude.ts'
import { methodOfTask } from '../../ai/knowledge.ts'
import { BRIEF_SYSTEM, briefSchema } from '../../ai/prompts.ts'
import { dayKey, XP } from '../../game/rules.ts'
import { bottleneckLabel, stageLabel, trackLabel } from '../../game/tracks.ts'
import { award } from '../../game/xp.ts'
import { parseBody } from '../../http.ts'
import { Asset } from '../../models/Asset.ts'
import { setTaskStatus, type CustomerDoc } from '../../models/Customer.ts'
import { LessonNote, TaskBrief, WatchProgress } from '../../models/Game.ts'
import { type TaskView } from '../../models/Plan.ts'
import { customerOf, findTask, flowOf, openTask, planOf, planView, skillOf, syncTask, syncTaskXp } from './shared.ts'

// The customer's plan, task status, lesson videos and the personal briefing of a task.
export const planRouter = Router()

planRouter.get('/plan', async (_req, res) => {
  const customer = customerOf(res)
  const plan = await planOf(customer)
  // Showing up counts: a few points for the first visit of the day (streaks are built from these).
  await award(customer._id, { skill: 'mindset', points: XP.dailyVisit, refKey: `visit:${dayKey()}`, label: 'הגעתם היום' })
  res.json({ plan: plan ? await planView(customer, plan) : null })
})

// A task closes by itself when its steps are done. The customer closes by hand only a task without steps.
planRouter.patch('/tasks/:taskId', async (req, res) => {
  const body = parseBody(z.object({ status: z.enum(['started', 'completed']) }), req, res)
  if (!body) return
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  if (body.status === 'completed' && !found.task.completed) {
    const flow = await flowOf(customer, found.plan, found.task)
    if (!flow.manual && !flow.complete) {
      res.status(409).json({ error: 'נשארו שלבים במשימה. היא תיסגר לבד כשתסיימו אותם.' })
      return
    }
  }
  if (!found.task.completed) {
    setTaskStatus(customer, req.params.taskId, body.status)
    await customer.save()
    await syncTaskXp(customer._id, found.task, body.status)
  }
  res.json({ plan: await planView(customer, found.plan) })
})

// ---------- Lesson videos ----------

const SLICE = 10
const WATCHED_SHARE = 0.85

const watchBody = z.object({
  position: z.number().min(0).max(100_000),
  duration: z.number().min(0).max(100_000),
  /** Ten-second slices that were played since the last report. */
  slices: z.array(z.number().int().min(0).max(10_000)).max(400).default([]),
  /** "I already watched it" (for example, in a meeting). */
  markDone: z.boolean().default(false),
})

/** Saves where the customer is in a video. Returns the new plan when the video was finished just now. */
planRouter.put('/assets/:assetId/watch', async (req, res) => {
  const body = parseBody(watchBody, req, res)
  if (!body) return
  const customer = customerOf(res)
  const asset = isValidObjectId(req.params.assetId) ? await Asset.findOne({ _id: req.params.assetId, kind: 'video', status: 'ready' }) : null
  const plan = await planOf(customer)
  if (!asset || !plan || !asset.planId.equals(plan._id)) {
    res.status(404).json({ error: 'הסרטון לא נמצא' })
    return
  }
  const duration = asset.durationSeconds ?? body.duration
  const total = Math.max(1, Math.ceil(duration / SLICE))
  const doc =
    (await WatchProgress.findOne({ customerId: customer._id, assetId: asset._id })) ??
    new WatchProgress({ customerId: customer._id, assetId: asset._id, taskId: asset.taskId })
  const slices = new Set([...doc.slices, ...body.slices.filter((s) => s < total)])
  doc.slices = [...slices].sort((a, b) => a - b)
  doc.position = body.position
  doc.duration = duration
  const finished = !doc.doneAt && (body.markDone || slices.size / total >= WATCHED_SHARE)
  if (finished) doc.doneAt = new Date()
  try {
    await doc.save()
  } catch (err) {
    // Two tabs created the first report at the same moment; the other one is saved.
    if ((err as { code?: number }).code !== 11000) throw err
  }
  if (!finished || !asset.taskId) {
    res.json({ watched: Boolean(doc.doneAt), plan: null })
    return
  }

  const taskId = asset.taskId.toString()
  // A lesson of a locked level can be watched in the library; its points wait for the task itself.
  const found = await findTask(customer, taskId)
  if (found && !found.locked) {
    await award(customer._id, { skill: skillOf(found.task), points: XP.lessonWatched, refKey: `watch:${taskId}`, label: `צפיתם בשיעור: ${found.task.title}` })
    await syncTask(customer, found.plan, found.task)
  }
  res.json({ watched: true, plan: await planView(customer, plan) })
})

const vttTime = (seconds: number) => {
  const ms = Math.round(seconds * 1000)
  const pad = (n: number, size = 2) => String(n).padStart(size, '0')
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`
}

/** Hebrew captions of a recorded lesson. */
planRouter.get('/tasks/:taskId/captions.vtt', async (req, res) => {
  const customer = customerOf(res)
  const note = isValidObjectId(req.params.taskId) && customer.planId ? await LessonNote.findOne({ taskId: req.params.taskId, planId: customer.planId }) : null
  if (!note || note.transcript.length === 0) {
    res.status(404).end()
    return
  }
  const cues = note.transcript.map((t) => `${vttTime(t.start ?? 0)} --> ${vttTime(t.end ?? 0)}\n${(t.text ?? '').replace(/-->/g, '→')}`)
  res.type('text/vtt').set('Cache-Control', 'private, max-age=3600').send(`WEBVTT\n\n${cues.join('\n\n')}\n`)
})

// ---------- The personal briefing ----------

const briefVersion = (task: TaskView, customer: CustomerDoc, method: string) =>
  createHash('sha256').update([task.title, task.description, customer.track, customer.stage, customer.bottleneck, method.length, 1].join('|')).digest('hex').slice(0, 16)

// One request at a time per customer and task, so opening a page twice does not write it twice.
const writing = new Map<string, Promise<unknown>>()

planRouter.get('/tasks/:taskId/brief', async (req, res) => {
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const { task } = found
  // Before the diagnosis there is nothing personal to say.
  if (!customer.track || !aiWorks() || task.practice === 'diagnosis') {
    res.json({ brief: null })
    return
  }
  const method = await methodOfTask(task.id)
  const version = briefVersion(task, customer, method)
  const stored = await TaskBrief.findOne({ customerId: customer._id, taskId: task.id })
  if (stored && stored.version === version) {
    res.json({ brief: { why: stored.why, focus: stored.focus, example: stored.example } })
    return
  }
  const key = `${customer.id as string}:${task.id}`
  const job = (writing.get(key) as Promise<z.infer<typeof briefSchema>> | undefined) ?? writeBrief()
  writing.set(key, job)
  try {
    const brief = await job
    res.json({ brief: { why: brief.why, focus: brief.focus.slice(0, 3), example: brief.example } })
  } catch (err) {
    // The briefing is extra; the task works without it.
    console.warn('Could not write a task briefing', err)
    res.json({ brief: null })
  } finally {
    writing.delete(key)
  }

  async function writeBrief() {
    const business = await businessFile(customer, { plan: found!.plan, skipTaskId: task.id })
    const brief = await aiJson({
      schema: briefSchema,
      system: BRIEF_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `# The participant\nRoute: ${trackLabel(customer.track)}, stage: ${stageLabel(customer.stage)}, bottleneck: ${bottleneckLabel(customer.bottleneck)}\n${business}\n\n# The task\n${task.title}\n${task.description}\n\nWhat the lesson teaches:\n${method.slice(0, 5000) || '(not documented)'}`,
        },
      ],
      effort: 'low',
      maxTokens: 2500,
    })
    await TaskBrief.updateOne(
      { customerId: customer._id, taskId: task.id },
      { $set: { version, why: brief.why, focus: brief.focus.slice(0, 3), example: brief.example } },
      { upsert: true },
    )
    return brief
  }
})
