// Shapes of the data the API returns.

import type { PersonId } from '../components/person/people'

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
  route: { track: TrackKey | null; stage: StageKey | null; bottleneck: BottleneckKey | null; by: 'diagnosis' | 'admin' | null }
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
  practice?: 'worksheet' | 'diagnosis'
  fileRule?: 'none' | 'optional' | 'required'
  passScore?: number
  minutes?: number | null
  /** Who the task is for; empty = everyone. */
  tracks?: TrackKey[]
  stages?: StageKey[]
}
export type PlanChapter = { id: string; title: string; description: string; tasks: PlanTask[] }

export type Plan = {
  id: string
  title: string
  description: string
  libraryOpen: boolean
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

// ---------- The learning path of a task ----------

export type StepKey = 'watch' | 'quiz' | 'practice' | 'files' | 'check'
export type Step = { key: StepKey; label: string; state: 'done' | 'current' | 'todo'; note: string; minutes: number }
export type CheckState = 'none' | 'fix' | 'defense' | 'passed' | 'returned' | 'approved' | 'accepted' | 'waiting'
export type TaskFlow = {
  steps: Step[]
  current: StepKey | null
  doneCount: number
  complete: boolean
  /** A task without steps: the customer marks it as done. */
  manual: boolean
  check: CheckState
  minutesLeft: number
}

/** The one thing to do now. */
export type Focus = {
  kind: 'diagnosis' | 'task' | 'finished'
  chapterId: string | null
  taskId: string | null
  step: StepKey | null
  title: string
  cta: string
  why: string
  minutes: number
  done: number
  total: number
}

export type LessonVideo = Asset & { position: number; watched: boolean }
export type LessonInfo = { summary: string; keyPoints: string[]; moments: { at: number; title: string }[]; captions: boolean }

export type MyTask = Omit<ProgressTask, 'quiz' | 'worksheet'> & {
  videoCount: number
  fileCount: number
  videos: LessonVideo[]
  files: Asset[]
  submissions: Submission[]
  hasWorksheet: boolean
  hasQuiz: boolean
  worksheet: Worksheet | null
  quiz: PublicQuiz | null
  lesson: LessonInfo | null
  flow: TaskFlow
  worksheetState: { submitted: boolean; versions: number; reviewed: boolean; finished: boolean; score: number | null } | null
  quizBest: { correct: number; total: number; tries: number } | null
}

export type LibraryLesson = {
  taskId: string
  title: string
  seconds: number
  watched: boolean
  posterUrl: string | null
  summary: string
  captions: boolean
  videos: LessonVideo[]
}

export type MyChapter = Omit<ProgressChapter, 'tasks'> & { tasks: MyTask[] }
export type MyPlan = Omit<PlanProgress, 'chapters'> & {
  chapters: MyChapter[]
  videos: LessonVideo[]
  files: Asset[]
  library: { id: string; title: string; open: boolean; lessons: LibraryLesson[] }[]
  focus: Focus
  examinerOn: boolean
  route: { diagnosed: boolean; track: { key: TrackKey; label: string; focus: string } | null; stage: string | null; bottleneck: string | null }
}

// ---------- Personal routes ----------

export type TrackKey = 'solo' | 'local' | 'products' | 'team'
export type StageKey = 'start' | 'grow' | 'scale'
export type BottleneckKey = 'leads' | 'sales' | 'offer' | 'content' | 'profit' | 'time'
export type RouteOptions = {
  tracks: { key: TrackKey; label: string; who: string; focus: string }[]
  stages: { key: StageKey; label: string }[]
  bottlenecks: { key: BottleneckKey; label: string }[]
}

export type DiagnosisQuestion = {
  id: string
  group: string
  label: string
  help?: string
  type: 'text' | 'long' | 'number' | 'choice' | 'multi' | 'scale'
  options?: { value: string; label: string }[]
  unit?: string
  optional?: boolean
}
export type DiagnosisAnswers = Record<string, string | number | string[]>
export type DiagnosisResult = {
  track: { key: TrackKey; label: string; who: string; focus: string } | null
  stage: string | null
  bottleneck: string | null
  reasons: string[]
  summary: string
  strengths: string[]
  risks: string[]
  priorities: { title: string; why: string }[]
}
export type DiagnosisView = { questions: DiagnosisQuestion[]; answers: DiagnosisAnswers; submittedAt: string | null; result: DiagnosisResult | null }

// ---------- Admin ----------

export type AdminIdentity = { id: string; name: string; email: string | null; owner: boolean }

export type AdminAccount = { id: string; name: string; email: string; createdAt: string; lastLoginAt: string | null }

export type AdminStatus = {
  db: string
  storage: { status: 'connected' | 'not_configured' | 'error'; bucket?: string }
  customers: number
  plans: number
  ai: { enabled: boolean; ok: boolean; reason: 'credit' | 'key' | null; since: string | null }
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
export type QuizResult = { correct: number; total: number; gained: number; plan: MyPlan; completed: boolean; results: { correct: boolean; answer: number; explanation: string }[] }

export type ChatTurn = { role: 'user' | 'assistant'; text: string; at: string }

export type ReviewCriterion = { criterion: string; status: 'met' | 'partial' | 'missing'; evidence: string; fix: string }

export type Review = {
  attempt: number
  criteria: ReviewCriterion[]
  progress: string
  filesRead: string[]
  filesSkipped: string[]
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
/** One version of the work that was handed in. */
export type Attempt = { number: number; files: string[]; submittedAt: string; score: number | null; summary: string }
export type HumanCheck = { status: 'none' | 'requested' | 'approved' | 'returned'; request: string; note: string; by: string; at: string | null }
export type WorksheetView = {
  answers: WorksheetAnswers
  submittedAt: string | null
  review: Review | null
  /** A check runs now, in the background. */
  reviewing: boolean
  /** Why the last check stopped. */
  reviewError: string | null
  chat: ChatTurn[]
  attempts: Attempt[]
  accepted: boolean
  human: HumanCheck | null
}
/** The answer of every action on a task: the work, the plan, and whether the task was completed just now. */
export type WorkResult = { view: WorksheetView; plan: MyPlan; completed: boolean }
export type TaskBrief = { why: string; focus: string[]; example: string }

export type SkillState = { key: SkillKey; label: string; points: number; level: number; floor: number; nextAt: number | null; max: number }
export type Rank = { key: string; label: string; min: number }
export type RewardState = { key: string; title: string; tier: 1 | 2 | 3 | 4; conditions: string[]; progress: number; unlocked: boolean; delivered: boolean }
export type XpItem = { id: string; skill: SkillKey; points: number; label: string; at: string }

/** One month of the business metric. Derived numbers are null when there is not enough data. */
export type BusinessNumbers = {
  month: string
  revenue: number
  expenses: number | null
  leads: number | null
  calls: number | null
  deals: number | null
  baseline: boolean
  note: string
  profit: number | null
  margin: number | null
  leadToCall: number | null
  callToDeal: number | null
  averageDeal: number | null
}

export type BusinessSummary = {
  latest: BusinessNumbers | null
  baseline: BusinessNumbers | null
  best: number
  rank: Rank & { index: number }
  next: Rank | null
  history: BusinessNumbers[]
  /** The month that waits for a report. */
  due: string | null
  insights: { tone: 'good' | 'warn' | 'info'; text: string }[]
}

/** Both metrics, side by side and never mixed. The points belong to learning only. */
export type GameSummary = {
  xp: number
  level: number
  floor: number
  nextAt: number
  streak: number
  skills: SkillState[]
  learning: {
    tasks: { total: number; started: number; completed: number }
    levelsDone: number
    levels: number
    checked: number
    averageScore: number | null
    averageImprovement: number | null
  }
  business: BusinessSummary
  referrals: { joined: number; total: number; code: string | null }
  rewards: RewardState[]
  recent: XpItem[]
}

// ---------- Coaches ----------

export type CoachPersona = 'sales' | 'scripts' | 'mental'
export type CoachModeInfo = { key: string; label: string; description: string; roleplay: boolean; needsWork: boolean; scored: boolean }
export type CoachDimension = { key: string; label: string; score: number; evidence: string; better: string }
export type CoachEvaluation = {
  score: number | null
  summary: string
  strengths: string[]
  improvements: string[]
  nextStep: string
  dimensions: CoachDimension[]
  at: string
}
export type CoachMessage = ChatTurn & { attachments: { id: string; name: string }[] }
export type ClientCard = { name: string; situation: string; goal: string; hidden: string; budget: string; trigger: string }
export type CoachSession = {
  id: string
  persona: CoachPersona
  mode: string
  title: string
  scenario: { label: string; difficulty: string; clientName: string; card: ClientCard | null } | null
  messages: CoachMessage[]
  /** Whether the session ends with a score. */
  scored: boolean
  /** The coach listens to a recording: how far (0-1), and about how many seconds it takes. */
  pending: { since: string; progress: number; eta: number } | null
  failed: string | null
  evaluation: CoachEvaluation | null
  updatedAt: string
}
export type CoachSessionItem = { id: string; persona: CoachPersona; title: string; turns: number; score: number | null; updatedAt: string }
export type CoachInfo = {
  persona: CoachPersona
  title: string
  available: boolean
  /** The AI itself is down for now. */
  paused: boolean
  modes: CoachModeInfo[]
  sessions: number
  scores: { id: string; score: number; at: string }[]
  dimensions: { key: string; label: string; score: number | null }[]
  notes: { id: string; text: string; at: string }[]
  commitments: { id: string; text: string; at: string; done: boolean }[]
}
export type CoachAttachment = { id: string; name: string; contentType: string; size: number; key: string }
export type CoachWork = { kind: 'worksheet' | 'file'; id: string; title: string; at: string }

export type Look = {
  /** The realistic person they play (see components/person/people.ts). Older looks have none: the closest one is used. */
  person?: PersonId
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

/** A task's game content and rules, as the admin edits them. */
export type TaskContent = {
  skill: SkillKey | null
  worksheet: Worksheet | null
  quiz: Quiz | null
  rubric: string[]
  practice: 'worksheet' | 'diagnosis'
  fileRule: 'none' | 'optional' | 'required'
  passScore: number
  minutes: number | null
  tracks: TrackKey[]
  stages: StageKey[]
}

/** What a recorded lesson teaches. */
export type LessonNote = { summary: string; keyPoints: string[]; moments: { at: number; title: string }[]; method: string; captionLines: number }

/** Everything the admin sees about one customer's game. */
export type AdminCustomerGame = {
  game: GameSummary
  route: {
    track: TrackKey | null
    stage: StageKey | null
    bottleneck: BottleneckKey | null
    by: 'diagnosis' | 'admin' | null
    labels: { track: string | null; stage: string | null; bottleneck: string | null }
  }
  diagnosis: { at: string; answers: string; result: Omit<DiagnosisResult, 'track'> | null } | null
  worksheets: {
    taskId: string
    taskTitle: string
    text: string
    submittedAt: string | null
    review: Review | null
    chat: ChatTurn[]
    attempts: Attempt[]
    human: HumanCheck | null
    accepted: boolean
  }[]
  quizzes: { taskId: string; best: number; total: number; tries: number }[]
  coach: CoachSessionItem[]
  leads: { id: string; name: string; phone: string; status: LeadStatus; createdAt: string }[]
}

/** Work in the review queue. */
export type WorkItem = {
  id: string
  customer: { id: string; name: string; company: string; avatarUrl: string | null }
  taskId: string
  taskTitle: string
  chapterTitle: string
  submittedAt: string
  version: number
  score: number | null
  check: CheckState
  human: HumanCheck | null
  seen: boolean
}
export type WorkDetail = WorkItem & {
  description: string
  rubric: string[]
  text: string
  review: Review | null
  chat: ChatTurn[]
  attempts: (Attempt & { text: string })[]
  files: Submission[]
}

// ---------- The coach lab ----------

export type BotKey = 'reviewer' | CoachPersona
export type LabRun = {
  id: string
  version: string
  status: 'running' | 'done' | 'failed'
  total: number
  passed: number
  criticalFailed: number
  ok: boolean
  error: string
  startedAt: string
  finishedAt: string | null
  cases: { id: string; title: string; critical: boolean; passed: boolean; checks: { text: string; passed: boolean; why: string }[]; output: string }[]
}
export type LabBot = {
  bot: BotKey
  title: string
  version: string
  tests: number
  released: boolean
  /** Open with tested lessons, while newer lessons wait for their tests. */
  waiting: boolean
  releasedBefore: boolean
  releasedAt: string | null
  releasedBy: string | null
  canRelease: boolean
  running: boolean
  latest: LabRun | null
  list: { id: string; title: string; critical: boolean; checks: number }[]
}

// ---------- The brain (material from Yarin and Oren) ----------

export type BrainItem = {
  id: string
  title: string
  /** Empty = all coaches. */
  personas: CoachPersona[]
  source: 'text' | 'file' | 'voice'
  fileName: string
  status: 'uploading' | 'processing' | 'ready' | 'failed'
  progress: number
  error: string
  enabled: boolean
  method: string
  raw: string
  by: string
  createdAt: string
}
export type BrainCoach = { key: CoachPersona; title: string; released: boolean; waiting: boolean; running: boolean }
export type Brain = {
  enabled: boolean
  speech: 'api' | 'local' | 'off'
  size: { lessons: number; lessonWords: number; items: number; itemWords: number }
  items: BrainItem[]
  coaches: BrainCoach[]
}
