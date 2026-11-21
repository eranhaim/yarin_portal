// Shapes of the data the API returns.

export type TaskStatus = 'not_started' | 'started' | 'completed'
export type ChapterState = 'completed' | 'current' | 'locked'

export type Asset = {
  id: string
  kind: 'video' | 'file'
  title: string
  fileName: string
  contentType: string
  size: number
  durationSeconds: number | null
  taskId: string | null
  order: number
  url: string | null
  downloadUrl: string | null
  posterUrl: string | null
}

/** position = the customer's square on the board (index over all tasks; the task count when finished). */
export type LevelInfo = { index: number; position: number; total: number; finished: boolean; title: string | null }

export type CustomerSelf = {
  id: string
  name: string
  email: string
  phone: string
  company: string
  avatarUrl: string | null
}

export type CustomerPlanSummary = {
  id: string
  title: string
  assignedAt: string | null
  total: number
  started: number
  completed: number
  level: LevelInfo
}

export type AdminCustomer = CustomerSelf & {
  notes: string
  active: boolean
  lastLoginAt: string | null
  createdAt: string
  plan: CustomerPlanSummary | null
}

export type PlanTask = { id: string; title: string; description: string; dueAt: string | null }
export type PlanChapter = { id: string; title: string; description: string; tasks: PlanTask[] }

export type Plan = {
  id: string
  title: string
  description: string
  chapters: PlanChapter[]
  createdAt: string
  updatedAt: string
  customerCount: number
}

export type PlanListItem = {
  id: string
  title: string
  description: string
  chapterCount: number
  taskCount: number
  customerCount: number
  updatedAt: string
}

export type ProgressTask = PlanTask & {
  started: boolean
  startedAt: string | null
  completed: boolean
  completedAt: string | null
}

export type ProgressChapter = Omit<PlanChapter, 'tasks'> & {
  state: ChapterState
  completedCount: number
  tasks: ProgressTask[]
}

export type PlanProgress = Omit<Plan, 'chapters' | 'customerCount'> & {
  assignedAt: string | null
  summary: { total: number; started: number; completed: number }
  level: LevelInfo
  chapters: ProgressChapter[]
}

export type MyTask = ProgressTask & { videoCount: number; fileCount: number; videos: Asset[]; files: Asset[] }
export type MyChapter = Omit<ProgressChapter, 'tasks'> & { tasks: MyTask[] }
export type MyPlan = Omit<PlanProgress, 'chapters'> & { chapters: MyChapter[]; videos: Asset[]; files: Asset[] }

export type AdminStatus = {
  db: string
  storage: { status: 'connected' | 'not_configured' | 'error'; bucket?: string }
  customers: number
  plans: number
}

/** The recorded lessons of all open levels, in plan order (locked levels send no media). */
export function lessonVideos(plan: MyPlan): Asset[] {
  return plan.chapters.filter((c) => c.state !== 'locked').flatMap((c) => c.tasks.flatMap((t) => t.videos))
}

export function taskStatus(task: { started: boolean; completed: boolean }): TaskStatus {
  return task.completed ? 'completed' : task.started ? 'started' : 'not_started'
}
