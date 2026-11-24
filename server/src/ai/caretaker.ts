import { BotTestRun, KnowledgeItem, LessonNote, type BotKey } from '../models/Game.ts'
import { Plan } from '../models/Plan.ts'
import { aiEnabled, aiWorks, probeAi } from './claude.ts'
import { isRunning, startRun } from './lab/run.ts'
import { learn } from './learn.ts'
import { writeLessonNote } from './lessonNotes.ts'
import { botStatuses } from './release.ts'

// Looks after the AI without a person: sees when an outage ends, writes lesson notes from new transcripts, learns
// material that waited, and runs the fixed tests of a coach whose prompts or knowledge changed. A version that fails
// is tested twice at most; then it waits for a person.

const TICK_MS = 5 * 60_000
/** Knowledge rests this long before a test, so a series of edits is tested once. */
const QUIET_MS = 10 * 60_000
const MAX_RUNS = 2

async function refreshLessons(): Promise<void> {
  const stale = await LessonNote.find({ stale: true }, { planId: 1, taskId: 1 }).limit(40)
  for (const note of stale) {
    const plan = await Plan.findById(note.planId)
    const task = plan?.chapters.flatMap((c) => c.tasks).find((t) => t._id.equals(note.taskId))
    if (!plan || !task) {
      await LessonNote.updateOne({ _id: note._id }, { $set: { stale: false } })
      continue
    }
    try {
      await writeLessonNote(plan._id, task)
      console.log(`Lesson note written: ${task.title}`)
    } catch (err) {
      if (!aiWorks()) return
      console.warn(`Could not write the note of ${task.title}`, err)
    }
  }
}

async function learnWaiting(): Promise<void> {
  // Only material that an outage stopped; other failures wait for a person.
  const waiting = await KnowledgeItem.find({ status: 'failed', error: { $regex: 'בהפסקה' } }, { _id: 1 }).limit(20)
  for (const item of waiting) {
    await KnowledgeItem.updateOne({ _id: item._id }, { $set: { status: 'processing', error: '' } })
    await learn(item.id as string)
    if (!aiWorks()) return
  }
}

async function knowledgeRests(): Promise<boolean> {
  const [processing, lesson, item] = await Promise.all([
    KnowledgeItem.exists({ status: 'processing' }),
    LessonNote.findOne({}, { updatedAt: 1 }).sort({ updatedAt: -1 }),
    KnowledgeItem.findOne({}, { updatedAt: 1 }).sort({ updatedAt: -1 }),
  ])
  const last = Math.max(lesson?.updatedAt.getTime() ?? 0, item?.updatedAt.getTime() ?? 0)
  return !processing && Date.now() - last > QUIET_MS
}

async function testBots(): Promise<void> {
  for (const status of await botStatuses()) {
    const bot = status.bot as BotKey
    if (status.closedByHand || (status.released && !status.waiting) || isRunning(bot)) continue
    if ((await BotTestRun.countDocuments({ bot, version: status.version, status: 'done' })) >= MAX_RUNS) continue
    const id = await startRun(bot, 'בדיקה אוטומטית')
    console.log(`Testing ${bot}`)
    while (isRunning(bot)) await new Promise((resolve) => setTimeout(resolve, 5000))
    const run = await BotTestRun.findById(id)
    console.log(`Tested ${bot}: ${run?.passed}/${run?.total}, critical failures ${run?.criticalFailed}`)
    if (!aiWorks()) return
  }
}

let busy = false
let asked = false
async function tick(): Promise<void> {
  if (busy || !aiEnabled) return
  busy = true
  try {
    if ((!asked || !aiWorks()) && !(await probeAi())) return
    asked = true
    await refreshLessons()
    if (aiWorks()) await learnWaiting()
    if (aiWorks() && (await knowledgeRests())) await testBots()
  } catch (err) {
    console.error('The caretaker stopped early', err)
  } finally {
    busy = false
  }
}

export function startCaretaker(): void {
  setTimeout(() => void tick(), 60_000).unref()
  setInterval(() => void tick(), TICK_MS).unref()
}
