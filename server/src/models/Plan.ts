import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import type { Quiz, Worksheet } from '../game/content.ts'
import type { SkillKey } from '../game/rules.ts'

// A plan is a template: chapters that hold tasks.
// Each customer who gets the plan has their own task progress (see Customer.taskProgress), and sees
// the tasks that fit their track and stage (see game/tracks.ts).

export const PRACTICE_KINDS = ['worksheet', 'diagnosis'] as const
export const FILE_RULES = ['none', 'optional', 'required'] as const
export const DEFAULT_PASS_SCORE = 70

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
  // How the task is done.
  practice: { type: String, enum: PRACTICE_KINDS, default: 'worksheet' },
  fileRule: { type: String, enum: FILE_RULES, default: 'optional' },
  passScore: { type: Number, min: 0, max: 100, default: DEFAULT_PASS_SCORE },
  minutes: { type: Number, default: null },
  // Who the task is for. Empty = everyone.
  tracks: { type: [String], default: [] },
  stages: { type: [String], default: [] },
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
    // true: the library shows every recorded lesson. false: only the lessons of open levels.
    libraryOpen: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export type PlanDoc = HydratedDocument<InferSchemaType<typeof planSchema>>
export type TaskDoc = PlanDoc['chapters'][number]['tasks'][number]

export const Plan = model('Plan', planSchema)

export type TaskProgress = {
  taskId: { toString(): string }
  startedAt?: Date | null
  completedAt?: Date | null
}

/** What decides which tasks a customer sees, and their status. A Customer document fits. */
export type Learner = { taskProgress: TaskProgress[]; track?: string | null; stage?: string | null }

const fits = (list: string[] | null | undefined, value: string | null | undefined) =>
  !list || list.length === 0 || (typeof value === 'string' && list.includes(value))

/** The tasks that fit the customer. Before the diagnosis, only the shared base shows. */
export function visibleTasks<T extends { tracks?: string[] | null; stages?: string[] | null }>(tasks: Iterable<T>, learner: Learner): T[] {
  return [...tasks].filter((task) => fits(task.tracks, learner.track) && fits(task.stages, learner.stage))
}

/** Every task of the plan, for all tracks. */
export function planTaskIds(plan: PlanDoc): Set<string> {
  return new Set(plan.chapters.flatMap((chapter) => chapter.tasks.map((task) => task._id.toString())))
}

/** The customer's own tasks, in order. */
export function learnerTasks(plan: PlanDoc, learner: Learner): TaskDoc[] {
  return plan.chapters.flatMap((chapter) => visibleTasks(chapter.tasks, learner))
}

export function progressSummary(plan: PlanDoc, learner: Learner) {
  const ids = new Set(learnerTasks(plan, learner).map((task) => task._id.toString()))
  let started = 0
  let completed = 0
  for (const entry of learner.taskProgress) {
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
export function levelState(plan: PlanDoc, learner: Learner) {
  const done = new Set(learner.taskProgress.filter((p) => p.completedAt).map((p) => p.taskId.toString()))
  const own = plan.chapters.map((chapter) => visibleTasks(chapter.tasks, learner))
  const chapters = plan.chapters.map((chapter, i) => {
    const total = own[i]!.length
    const completed = own[i]!.filter((task) => done.has(task._id.toString())).length
    return { id: chapter._id.toString(), title: chapter.title, total, completed }
  })
  const firstOpen = chapters.findIndex((c) => c.completed < c.total)
  const index = firstOpen === -1 ? chapters.length : firstOpen
  const states: ChapterState[] = chapters.map((_, i) => (i < index ? 'completed' : i === index ? 'current' : 'locked'))
  // position = the customer's place on the map: the index (in plan order, over their tasks) of the
  // first open task of the current chapter. It equals the number of tasks when the plan is finished.
  let position = 0
  own.forEach((tasks, i) => {
    if (i < index) position += tasks.length
    else if (i === index) {
      const open = tasks.findIndex((task) => !done.has(task._id.toString()))
      position += open === -1 ? tasks.length : open
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

export function toTaskView(task: TaskDoc) {
  return {
    id: task._id.toString(),
    title: task.title,
    description: task.description,
    dueAt: task.dueAt,
    skill: (task.skill as SkillKey | null) ?? null,
    worksheet: (task.worksheet as Worksheet | null) ?? null,
    quiz: (task.quiz as Quiz | null) ?? null,
    rubric: task.rubric ?? [],
    practice: task.practice,
    fileRule: task.fileRule,
    passScore: task.passScore,
    minutes: task.minutes ?? null,
    tracks: task.tracks ?? [],
    stages: task.stages ?? [],
  }
}

export type TaskView = ReturnType<typeof toTaskView>

export function toPlanView(plan: PlanDoc) {
  return {
    id: plan.id as string,
    title: plan.title,
    description: plan.description,
    libraryOpen: plan.libraryOpen,
    chapters: plan.chapters.map((chapter) => ({
      id: chapter._id.toString(),
      title: chapter.title,
      description: chapter.description,
      tasks: chapter.tasks.map(toTaskView),
    })),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  }
}

/** The customer's own plan, with their status on every task. */
export function toPlanProgressView(plan: PlanDoc, assignedAt: Date | null | undefined, learner: Learner) {
  const byTask = new Map(learner.taskProgress.map((entry) => [entry.taskId.toString(), entry]))
  const level = levelState(plan, learner)
  return {
    ...toPlanView(plan),
    assignedAt: assignedAt ?? null,
    summary: progressSummary(plan, learner),
    level: { index: level.index, position: level.position, total: level.total, finished: level.finished, title: level.title },
    chapters: plan.chapters.map((chapter, i) => ({
      id: chapter._id.toString(),
      title: chapter.title,
      description: chapter.description,
      state: level.chapters[i]!.state,
      completedCount: level.chapters[i]!.completed,
      tasks: visibleTasks(chapter.tasks, learner).map((task) => {
        const entry = byTask.get(task._id.toString())
        return {
          ...toTaskView(task),
          started: Boolean(entry?.startedAt),
          startedAt: entry?.startedAt ?? null,
          completed: Boolean(entry?.completedAt),
          completedAt: entry?.completedAt ?? null,
        }
      }),
    })),
  }
}
