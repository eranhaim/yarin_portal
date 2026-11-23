import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import type { Quiz, Worksheet } from '../game/content.ts'
import type { SkillKey } from '../game/rules.ts'

// A plan is a template: chapters that hold tasks.
// Each customer who gets the plan has their own task progress (see Customer.taskProgress).

const taskSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  dueAt: { type: Date, default: null },
  // Game content (see game/content.ts): the skill the task trains, its in-app worksheet,
  // the lesson quiz and the criteria the AI reviewer checks.
  skill: { type: String, default: null },
  worksheet: { type: Schema.Types.Mixed, default: null },
  quiz: { type: Schema.Types.Mixed, default: null },
  rubric: { type: [String], default: [] },
})

const chapterSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  tasks: { type: [taskSchema], default: [] },
})

const planSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 4000, default: '' },
    chapters: { type: [chapterSchema], default: [] },
  },
  { timestamps: true },
)

export type PlanDoc = HydratedDocument<InferSchemaType<typeof planSchema>>

export const Plan = model('Plan', planSchema)

export type TaskProgress = {
  taskId: { toString(): string }
  startedAt?: Date | null
  completedAt?: Date | null
}

export function planTaskIds(plan: PlanDoc): Set<string> {
  return new Set(plan.chapters.flatMap((chapter) => chapter.tasks.map((task) => task._id.toString())))
}

export function progressSummary(plan: PlanDoc, progress: TaskProgress[]) {
  const ids = planTaskIds(plan)
  let started = 0
  let completed = 0
  for (const entry of progress) {
    if (!ids.has(entry.taskId.toString())) continue
    if (entry.completedAt) completed++
    else if (entry.startedAt) started++
  }
  return { total: ids.size, started, completed }
}

export type ChapterState = 'completed' | 'current' | 'locked'

/**
 * Where the customer is on the map.
 * The current level is the first chapter with an open task. Chapters before it are completed,
 * chapters after it are locked. A chapter without tasks counts as completed.
 */
export function levelState(plan: PlanDoc, progress: TaskProgress[]) {
  const done = new Set(progress.filter((p) => p.completedAt).map((p) => p.taskId.toString()))
  const chapters = plan.chapters.map((chapter) => {
    const total = chapter.tasks.length
    const completed = chapter.tasks.filter((task) => done.has(task._id.toString())).length
    return { id: chapter._id.toString(), title: chapter.title, total, completed }
  })
  const firstOpen = chapters.findIndex((c) => c.completed < c.total)
  const index = firstOpen === -1 ? chapters.length : firstOpen
  const states: ChapterState[] = chapters.map((_, i) => (i < index ? 'completed' : i === index ? 'current' : 'locked'))
  // position = the customer's square on the board: the index (in plan order, over all tasks) of the
  // first open task of the current chapter. It equals the number of tasks when the plan is finished.
  let position = 0
  plan.chapters.forEach((chapter, i) => {
    if (i < index) position += chapter.tasks.length
    else if (i === index) {
      const open = chapter.tasks.findIndex((task) => !done.has(task._id.toString()))
      position += open === -1 ? chapter.tasks.length : open
    }
  })
  return {
    index,
    position,
    total: chapters.length,
    finished: chapters.length > 0 && index >= chapters.length,
    title: chapters[index]?.title ?? null,
    chapters: chapters.map((c, i) => ({ ...c, state: states[i]! })),
  }
}

export function toPlanView(plan: PlanDoc) {
  return {
    id: plan.id as string,
    title: plan.title,
    description: plan.description,
    chapters: plan.chapters.map((chapter) => ({
      id: chapter._id.toString(),
      title: chapter.title,
      description: chapter.description,
      tasks: chapter.tasks.map((task) => ({
        id: task._id.toString(),
        title: task.title,
        description: task.description,
        dueAt: task.dueAt,
        skill: (task.skill as SkillKey | null) ?? null,
        worksheet: (task.worksheet as Worksheet | null) ?? null,
        quiz: (task.quiz as Quiz | null) ?? null,
        rubric: task.rubric ?? [],
      })),
    })),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  }
}

/** The plan with one customer's status on every task. */
export function toPlanProgressView(plan: PlanDoc, assignedAt: Date | null | undefined, progress: TaskProgress[]) {
  const byTask = new Map(progress.map((entry) => [entry.taskId.toString(), entry]))
  const view = toPlanView(plan)
  const level = levelState(plan, progress)
  return {
    ...view,
    assignedAt: assignedAt ?? null,
    summary: progressSummary(plan, progress),
    level: { index: level.index, position: level.position, total: level.total, finished: level.finished, title: level.title },
    chapters: view.chapters.map((chapter, i) => ({
      ...chapter,
      state: level.chapters[i]!.state,
      completedCount: level.chapters[i]!.completed,
      tasks: chapter.tasks.map((task) => {
        const entry = byTask.get(task.id)
        return {
          ...task,
          started: Boolean(entry?.startedAt),
          startedAt: entry?.startedAt ?? null,
          completed: Boolean(entry?.completedAt),
          completedAt: entry?.completedAt ?? null,
        }
      }),
    })),
  }
}
