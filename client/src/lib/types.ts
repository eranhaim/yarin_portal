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

export type PlanTask = {
  id: string
  title: string
  description: string
  dueAt: string | null
  /** Game content (admin view has everything; customers get the quiz without answers). */
  skill?: SkillKey | null
  worksheet?: Worksheet | null
  quiz?: Quiz | PublicQuiz | null
  rubric?: string[]
}
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

/** A homework file a customer handed in for a task. */
export type Submission = {
  id: string
  customerId: string
  planId: string
  taskId: string
  planTitle: string
  chapterTitle: string
  taskTitle: string
  fileName: string
  contentType: string
  size: number
  note: string
  createdAt: string
  seenAt: string | null
  url: string | null
  downloadUrl: string | null
}

/** A submission in the admin inbox, with who sent it. */
export type InboxSubmission = Submission & { customer: { id: string; name: string; avatarUrl: string | null } | null }

export type SubmissionSummary = { unread: number; byCustomer: Record<string, number>; latestAt: string | null }

export type MyTask = Omit<ProgressTask, 'quiz' | 'worksheet'> & {
  videoCount: number
  fileCount: number
  videos: Asset[]
  files: Asset[]
  submissions: Submission[]
  hasWorksheet: boolean
  hasQuiz: boolean
  worksheet: Worksheet | null
  quiz: PublicQuiz | null
  worksheetState: { submitted: boolean; reviewed: boolean; finished: boolean; score: number | null } | null
  quizBest: { correct: number; total: number; tries: number } | null
}
export type MyChapter = Omit<ProgressChapter, 'tasks'> & { tasks: MyTask[] }
export type MyPlan = Omit<PlanProgress, 'chapters'> & { chapters: MyChapter[]; videos: Asset[]; files: Asset[] }

/** Who is signed in to the admin panel ("owner" = the main password from the server settings). */
export type AdminIdentity = { id: string; name: string; email: string | null; owner: boolean }

export type AdminAccount = { id: string; name: string; email: string; createdAt: string; lastLoginAt: string | null }

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

// ---------- Game ----------

export type SkillKey = 'business' | 'customer' | 'offer' | 'brand' | 'ideas' | 'writing' | 'hooks' | 'camera' | 'sales' | 'mindset'

export type WorksheetField = {
  id: string
  label: string
  help: string
  type: 'short' | 'long' | 'number' | 'choice' | 'checklist' | 'list' | 'table'
  options: string[]
  columns: string[]
  rows: number
}
export type Worksheet = { intro: string; sections: { id: string; title: string; description: string; fields: WorksheetField[] }[] }
export type WorksheetValue = string | number | string[] | string[][]
export type WorksheetAnswers = Record<string, WorksheetValue>

export type Quiz = { questions: { question: string; options: string[]; answer: number; explanation: string }[] }
export type PublicQuiz = { questions: { question: string; options: string[] }[] }
export type QuizResult = { correct: number; total: number; gained: number; results: { correct: boolean; answer: number; explanation: string }[] }

export type ChatTurn = { role: 'user' | 'assistant'; text: string; at: string }

export type Review = {
  score: number
  verdict: 'excellent' | 'good' | 'needs_work'
  summary: string
  strengths: string[]
  improvements: string[]
  questions: string[]
  finalScore: number | null
  finalNote: string
  reviewedAt: string
  finishedAt: string | null
}
export type WorksheetView = { answers: WorksheetAnswers; submittedAt: string | null; review: Review | null; chat: ChatTurn[] }

export type SkillState = { key: SkillKey; label: string; points: number; level: number; floor: number; nextAt: number | null; max: number }
export type Rank = { key: string; label: string; min: number }
export type RewardState = { key: string; title: string; tier: 1 | 2 | 3 | 4; conditions: string[]; progress: number; unlocked: boolean; delivered: boolean }
export type XpItem = { id: string; skill: SkillKey; points: number; label: string; at: string }

export type GameSummary = {
  xp: number
  level: number
  floor: number
  nextAt: number
  streak: number
  skills: SkillState[]
  revenue: {
    latestMonth: string | null
    latest: number
    best: number
    rank: Rank & { index: number }
    next: Rank | null
    history: { month: string; amount: number }[]
  }
  referrals: { joined: number; total: number; code: string | null }
  rewards: RewardState[]
  recent: XpItem[]
}

export type CoachPersona = 'sales' | 'scripts' | 'mental'
export type CoachEvaluation = { score: number; summary: string; strengths: string[]; improvements: string[]; nextStep: string; at: string }
export type CoachSession = { id: string; persona: CoachPersona; title: string; messages: ChatTurn[]; evaluation: CoachEvaluation | null; updatedAt: string }
export type CoachSessionItem = { id: string; persona: CoachPersona; title: string; turns: number; score: number | null; updatedAt: string }

export type Look = {
  skin: 'porcelain' | 'light' | 'tan' | 'olive' | 'brown' | 'dark'
  hair: 'short' | 'quiff' | 'slick' | 'buzz' | 'curly' | 'long' | 'bun' | 'bald'
  hairColor: 'black' | 'darkBrown' | 'brown' | 'blond' | 'red' | 'gray' | 'white'
  beard: 'none' | 'stubble' | 'short' | 'full'
  mustache: boolean
  glasses: 'none' | 'round' | 'square' | 'sun'
  outfit: 'suit' | 'blazer' | 'hoodie' | 'tee'
  outfitColor: 'black' | 'navy' | 'red' | 'gold' | 'teal' | 'purple' | 'white' | 'green' | 'gray'
  accessory: 'none' | 'briefcase' | 'phone' | 'coffee'
  chain: boolean
}
export type Host = { key: 'yarin' | 'oren'; name: string; look: Look }

export type LeadStatus = 'new' | 'contacted' | 'joined' | 'lost'
export type MyLead = { id: string; name: string; status: LeadStatus; createdAt: string }
export type AdminLead = MyLead & { phone: string; email: string; note: string; referrer: { id: string; name: string } }

/** A task's game content, as the admin edits it. */
export type TaskContent = { skill: SkillKey | null; worksheet: Worksheet | null; quiz: Quiz | null; rubric: string[] }

/** Everything the admin sees about one customer's game. */
export type AdminCustomerGame = {
  game: GameSummary
  worksheets: { taskId: string; taskTitle: string; text: string; submittedAt: string | null; review: Review | null; chat: ChatTurn[] }[]
  quizzes: { taskId: string; best: number; total: number; tries: number }[]
  coach: CoachSessionItem[]
  leads: { id: string; name: string; phone: string; status: LeadStatus; createdAt: string }[]
}
