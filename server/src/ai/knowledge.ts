import { isSkill, type SkillKey } from '../game/rules.ts'
import { KnowledgeItem, LessonNote, type CoachPersona } from '../models/Game.ts'
import { Plan } from '../models/Plan.ts'

// Yarin and Oren's method, for the AI: one note per recorded lesson (written from the recording and the slides),
// and the material they add to the brain. Admins can edit both. The notes live in the database only; they are the
// program's content.

type Note = { taskId: string; title: string; skill: SkillKey; method: string }

/** About 70 thousand tokens: the whole program fits. */
const MAX_METHOD = 160_000
const FRESH_MS = 60_000
let cache: { at: number; notes: Note[] } | null = null

type Item = { title: string; personas: string[]; method: string }
let items: { at: number; list: Item[] } | null = null

/** Call after a lesson note or a plan changes. */
export function forgetKnowledge(): void {
  cache = null
  items = null
}

async function allNotes(): Promise<Note[]> {
  if (cache && Date.now() - cache.at < FRESH_MS) return cache.notes
  const [plans, docs] = await Promise.all([Plan.find(), LessonNote.find({ method: { $ne: '' } })])
  const tasks = new Map(plans.flatMap((plan) => plan.chapters.flatMap((c) => c.tasks.map((t) => [t._id.toString(), t] as const))))
  const notes: Note[] = []
  const titles = new Set<string>()
  for (const doc of docs) {
    const task = tasks.get(doc.taskId.toString())
    // Copies of a plan hold the same lessons; one note per lesson is enough.
    if (!task || titles.has(task.title)) continue
    titles.add(task.title)
    notes.push({ taskId: doc.taskId.toString(), title: task.title, skill: isSkill(task.skill) ? task.skill : 'business', method: doc.method })
  }
  notes.sort((a, b) => a.title.localeCompare(b.title, 'he'))
  cache = { at: Date.now(), notes }
  return notes
}

async function brainItems(): Promise<Item[]> {
  if (items && Date.now() - items.at < FRESH_MS) return items.list
  const docs = await KnowledgeItem.find({ enabled: true, status: 'ready', method: { $ne: '' } }, { title: 1, personas: 1, method: 1 }).sort({ createdAt: 1 })
  items = { at: Date.now(), list: docs.map((d) => ({ title: d.title, personas: [...d.personas] as string[], method: d.method })) }
  return items.list
}

/** Everything a coach teaches from: what Yarin and Oren added to the brain, and the lessons. */
export async function methodFor(persona: CoachPersona, skills: readonly SkillKey[]): Promise<string> {
  let text = ''
  for (const item of await brainItems()) {
    if (item.personas.length > 0 && !item.personas.includes(persona)) continue
    const part = `## ${item.title} (from Yarin and Oren)\n${item.method.trim()}\n\n`
    if (text.length + part.length > MAX_METHOD) break
    text += part
  }
  for (const note of await allNotes()) {
    if (!skills.includes(note.skill)) continue
    const part = `## Lesson: ${note.title}\n${note.method.trim()}\n\n`
    if (text.length + part.length > MAX_METHOD) break
    text += part
  }
  return text.trim()
}

/** The method of one lesson, for the examiner and the personal briefing. */
export async function methodOfTask(taskId: string): Promise<string> {
  const note = await LessonNote.findOne({ taskId })
  return note?.method ?? ''
}

/** How much the brain holds now (for the admin page). */
export async function brainSize(): Promise<{ lessons: number; lessonWords: number; items: number; itemWords: number }> {
  const words = (text: string) => text.split(/\s+/).filter(Boolean).length
  const [notes, list] = await Promise.all([allNotes(), brainItems()])
  return {
    lessons: notes.length,
    lessonWords: notes.reduce((n, x) => n + words(x.method), 0),
    items: list.length,
    itemWords: list.reduce((n, x) => n + words(x.method), 0),
  }
}
