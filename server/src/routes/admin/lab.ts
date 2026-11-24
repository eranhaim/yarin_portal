import { Router } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { AiError, aiEnabled, sendAiError } from '../../ai/claude.ts'
import { COACHES } from '../../ai/coaches.ts'
import { casesOf } from '../../ai/lab/cases.ts'
import { isRunning, startRun } from '../../ai/lab/run.ts'
import { botStatuses, botVersion, PASS_RATE, releaseBot, runPassed } from '../../ai/release.ts'
import { adminOf } from '../../auth/admin.ts'
import { parseBody } from '../../http.ts'
import { BOT_KEYS, BotTestRun, type BotKey, type BotTestRunDoc } from '../../models/Game.ts'

// The coach lab: the fixed tests of each bot, their results, and the release to customers.
export const labRouter = Router()

const TITLES: Record<BotKey, string> = {
  reviewer: 'הבוחן',
  sales: COACHES.sales.title,
  scripts: COACHES.scripts.title,
  mental: COACHES.mental.title,
}

const runView = (run: BotTestRunDoc) => ({
  id: run.id as string,
  version: run.version,
  status: run.status,
  total: run.total,
  passed: run.passed,
  criticalFailed: run.criticalFailed,
  ok: runPassed(run),
  error: run.error,
  startedAt: run.createdAt,
  finishedAt: run.finishedAt,
  cases: run.cases.map((c) => ({
    id: c.id ?? '',
    title: c.title ?? '',
    critical: Boolean(c.critical),
    passed: Boolean(c.passed),
    checks: c.checks.map((k) => ({ text: k.text ?? '', passed: Boolean(k.passed), why: k.why ?? '' })),
    output: c.output,
  })),
})

labRouter.get('/lab', async (_req, res) => {
  const statuses = await botStatuses()
  res.json({
    enabled: aiEnabled,
    passRate: PASS_RATE,
    bots: statuses.map((s) => ({
      ...s,
      title: TITLES[s.bot],
      running: isRunning(s.bot),
      latest: s.latest ? runView(s.latest) : null,
      list: casesOf(s.bot).map((c) => ({ id: c.id, title: c.title, critical: c.critical, checks: c.checks.length })),
    })),
  })
})

const botParam = z.enum(BOT_KEYS)

labRouter.post('/lab/:bot/run', async (req, res) => {
  const bot = botParam.safeParse(req.params.bot)
  if (!bot.success) {
    res.status(404).json({ error: 'הבוט לא נמצא' })
    return
  }
  try {
    if (!aiEnabled) throw new AiError(503, 'הבינה המלאכותית עוד לא מחוברת.')
    res.status(202).json({ runId: await startRun(bot.data, adminOf(res).name) })
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})

labRouter.get('/lab/runs/:id', async (req, res) => {
  const run = isValidObjectId(req.params.id) ? await BotTestRun.findById(req.params.id) : null
  if (!run) {
    res.status(404).json({ error: 'ההרצה לא נמצאה' })
    return
  }
  res.json({ run: runView(run) })
})

/** Opens or closes a bot for customers. Opening needs a passing run of the exact version. */
labRouter.post('/lab/:bot/release', async (req, res) => {
  const body = parseBody(z.object({ released: z.boolean() }), req, res)
  if (!body) return
  const bot = botParam.safeParse(req.params.bot)
  if (!bot.success) {
    res.status(404).json({ error: 'הבוט לא נמצא' })
    return
  }
  if (!body.released) {
    await releaseBot(bot.data, null, '')
    res.json({ ok: true })
    return
  }
  const version = await botVersion(bot.data)
  const run = await BotTestRun.findOne({ bot: bot.data, version, status: 'done' }).sort({ createdAt: -1 })
  if (!run || !runPassed(run)) {
    res.status(409).json({ error: 'הגרסה הזו עוד לא עברה את הבדיקות. הריצו אותן קודם.' })
    return
  }
  await releaseBot(bot.data, version, adminOf(res).name)
  res.json({ ok: true })
})
