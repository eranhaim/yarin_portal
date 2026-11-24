import { isSkill, type SkillKey } from '../game/rules.ts'
import { LessonNote } from '../models/Game.ts'
import { Plan } from '../models/Plan.ts'

// Yarin and Oren's method, for the AI: one note per recorded lesson (written from the recording and the
// slides, edited by the admins). The notes live in the database only; they are the program's content.

type Note = { taskId: string; title: string; skill: SkillKey; method: string }

const MAX_METHOD = 60_000
const FRESH_MS = 60_000
let cache: { at: number; notes: Note[] } | null = null

/** Call after a lesson note or a plan changes. */
export function forgetKnowledge(): void {
  cache = null
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

/** The lessons that a coach teaches from. */
export async function methodFor(skills: readonly SkillKey[]): Promise<string> {
  let text = ''
  for (const note of await allNotes()) {
    if (!skills.includes(note.skill)) continue
    const part = `## ${note.title}\n${note.method.trim()}\n\n`
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
