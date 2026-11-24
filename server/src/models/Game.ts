import { model, Schema, type HydratedDocument, type InferSchemaType, type Types } from 'mongoose'

// Collections of the game layer: learning points, worksheets and reviews, quizzes, watch progress,
// the diagnosis, business reports, AI coaches, referrals, prizes, AI usage and site settings.
//
// Two metrics, kept apart:
//   learning  = XpEvent, WorksheetResponse, QuizAttempt, WatchProgress
//   business  = BusinessReport (leads, calls, deals, revenue, expenses)

// ---------- Learning points ----------
// One document per earned item. refKey makes awards idempotent: the same action never pays twice.

const xpEventSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    refKey: { type: String, required: true, maxlength: 200 },
    skill: { type: String, required: true },
    points: { type: Number, required: true },
    label: { type: String, default: '', maxlength: 200 },
    day: { type: String, required: true },
  },
  { timestamps: true },
)
xpEventSchema.index({ customerId: 1, refKey: 1 }, { unique: true })
xpEventSchema.index({ customerId: 1, createdAt: -1 })

export type XpEventDoc = HydratedDocument<InferSchemaType<typeof xpEventSchema>>
export const XpEvent = model('XpEvent', xpEventSchema)

// ---------- Lesson videos: how far the customer watched ----------

const watchProgressSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    assetId: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
    taskId: { type: Schema.Types.ObjectId, default: null },
    /** Where to resume. */
    position: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    /** Ten-second slices the customer really played (indexes), so skipping to the end does not count. */
    slices: { type: [Number], default: [] },
    doneAt: { type: Date, default: null },
  },
  { timestamps: true },
)
watchProgressSchema.index({ customerId: 1, assetId: 1 }, { unique: true })
watchProgressSchema.index({ customerId: 1, taskId: 1 })

export const WatchProgress = model('WatchProgress', watchProgressSchema)

// ---------- Worksheets, attempts and reviews ----------

const chatTurnSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true, maxlength: 8000 },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
)

const reviewSchema = new Schema(
  {
    attempt: { type: Number, default: 1 },
    score: Number,
    verdict: String,
    summary: String,
    strengths: [String],
    improvements: [String],
    questions: [String],
    /** One line per review criterion, with a quote from the work as evidence. */
    criteria: {
      type: [new Schema({ criterion: String, status: String, evidence: String, fix: String }, { _id: false })],
      default: [],
    },
    /** What got better since the previous version. */
    progress: { type: String, default: '' },
    /** Files the examiner opened, and the ones it could not read. */
    filesRead: { type: [String], default: [] },
    filesSkipped: { type: [String], default: [] },
    finalScore: { type: Number, default: null },
    finalNote: { type: String, default: '' },
    reviewedAt: Date,
    finishedAt: { type: Date, default: null },
  },
  { _id: false },
)

const worksheetResponseSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    taskId: { type: Schema.Types.ObjectId, required: true },
    answers: { type: Schema.Types.Mixed, default: {} },
    submittedAt: { type: Date, default: null },
    // The AI reviewer ("הבוחן"): the review of the latest version, then a short defense and a final score.
    review: { type: reviewSchema, default: null },
    // The check runs in the background: when it started (null = not running), and why the last one failed.
    reviewingSince: { type: Date, default: null },
    reviewError: { type: String, default: '' },
    chat: { type: [chatTurnSchema], default: [] },
    // Every version the customer handed in for review, so they see how the work improves.
    attempts: {
      type: [
        new Schema(
          {
            number: Number,
            answers: { type: Schema.Types.Mixed, default: {} },
            files: { type: [String], default: [] },
            submittedAt: Date,
            score: { type: Number, default: null },
            summary: { type: String, default: '' },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    // The customer moved on with an imperfect version (after several tries), to improve it later.
    acceptedAt: { type: Date, default: null },
    // Yarin or Oren's own check. It always wins over the AI.
    human: {
      type: new Schema(
        {
          status: { type: String, enum: ['none', 'requested', 'approved', 'returned'], default: 'none' },
          request: { type: String, default: '', maxlength: 1000 },
          note: { type: String, default: '', maxlength: 4000 },
          by: { type: String, default: '', maxlength: 120 },
          at: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    /** When an admin last opened this work (for the review queue). */
    seenAt: { type: Date, default: null },
  },
  { timestamps: true },
)
worksheetResponseSchema.index({ customerId: 1, taskId: 1 }, { unique: true })
worksheetResponseSchema.index({ submittedAt: -1 })

export type WorksheetResponseDoc = HydratedDocument<InferSchemaType<typeof worksheetResponseSchema>>
export const WorksheetResponse = model('WorksheetResponse', worksheetResponseSchema)

// ---------- Quizzes ----------

const quizAttemptSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    taskId: { type: Schema.Types.ObjectId, required: true },
    answers: { type: [Number], default: [] },
    correct: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { timestamps: true },
)
quizAttemptSchema.index({ customerId: 1, taskId: 1, createdAt: -1 })

export const QuizAttempt = model('QuizAttempt', quizAttemptSchema)

// ---------- The diagnosis (it opens the personal route) ----------

const diagnosisSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    answers: { type: Schema.Types.Mixed, default: {} },
    /** null while the customer is still answering (a draft). */
    submittedAt: { type: Date, default: null },
    result: {
      type: new Schema(
        {
          track: String,
          stage: String,
          bottleneck: String,
          reasons: [String],
          summary: { type: String, default: '' },
          strengths: { type: [String], default: [] },
          risks: { type: [String], default: [] },
          priorities: { type: [new Schema({ title: String, why: String }, { _id: false })], default: [] },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
)

export type DiagnosisDoc = HydratedDocument<InferSchemaType<typeof diagnosisSchema>>
export const Diagnosis = model('Diagnosis', diagnosisSchema)

// ---------- "Why this matters for your business": a short personal briefing per task ----------

const taskBriefSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    taskId: { type: Schema.Types.ObjectId, required: true },
    /** Changes when the task or the diagnosis changes; an old briefing is written again. */
    version: { type: String, required: true },
    why: { type: String, default: '' },
    focus: { type: [String], default: [] },
    example: { type: String, default: '' },
  },
  { timestamps: true },
)
taskBriefSchema.index({ customerId: 1, taskId: 1 }, { unique: true })

export const TaskBrief = model('TaskBrief', taskBriefSchema)

// ---------- What each lesson teaches (from the recording and the slides) ----------

const lessonNoteSchema = new Schema(
  {
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    taskId: { type: Schema.Types.ObjectId, required: true, unique: true },
    /** For the customer: the lesson in short, and moments to jump to. */
    summary: { type: String, default: '', maxlength: 4000 },
    keyPoints: { type: [String], default: [] },
    moments: { type: [new Schema({ at: Number, title: String }, { _id: false })], default: [] },
    /** For the AI coaches and the examiner: Yarin and Oren's method, as they teach it. */
    method: { type: String, default: '', maxlength: 20_000 },
    /** The full transcript with times: [{ start, end, text }]. */
    transcript: {
      type: [new Schema({ start: Number, end: Number, text: String }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true },
)
lessonNoteSchema.index({ planId: 1 })

export type LessonNoteDoc = HydratedDocument<InferSchemaType<typeof lessonNoteSchema>>
export const LessonNote = model('LessonNote', lessonNoteSchema)

// ---------- AI coaches and simulators ----------

export const COACH_PERSONAS = ['sales', 'scripts', 'mental'] as const
export type CoachPersona = (typeof COACH_PERSONAS)[number]

const attachmentSchema = new Schema(
  // text: what is said in a recording, so the coach can come back to it later in the session.
  { id: String, name: String, contentType: String, size: Number, key: String, text: { type: String, default: '', maxlength: 80_000 } },
  { _id: false },
)

const coachMessageSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true, maxlength: 12_000 },
    attachments: { type: [attachmentSchema], default: [] },
    at: { type: Date, default: () => new Date() },
  },
  { _id: false },
)

const coachSessionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    persona: { type: String, enum: COACH_PERSONAS, required: true },
    /** What kind of session: a simulation, a check of real work, writing together, a talk. */
    mode: { type: String, default: '' },
    title: { type: String, default: '', maxlength: 200 },
    /** Simulations: the scenario, the difficulty and the hidden details of the simulated client. */
    scenario: { type: Schema.Types.Mixed, default: null },
    messages: { type: [coachMessageSchema], default: [] },
    /** The coach listens to a recording in the background: since when, how far, and about how long it takes. */
    pending: {
      type: new Schema({ since: Date, progress: { type: Number, default: 0 }, eta: { type: Number, default: 0 } }, { _id: false }),
      default: null,
    },
    /** Why the last answer did not come. */
    failed: { type: String, default: '' },
    evaluation: {
      type: new Schema(
        {
          score: { type: Number, default: null },
          summary: String,
          strengths: [String],
          improvements: [String],
          nextStep: String,
          dimensions: {
            type: [new Schema({ key: String, label: String, score: Number, evidence: String, better: String }, { _id: false })],
            default: [],
          },
          at: Date,
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
)
coachSessionSchema.index({ customerId: 1, updatedAt: -1 })

export type CoachSessionDoc = HydratedDocument<InferSchemaType<typeof coachSessionSchema>>
export const CoachSession = model('CoachSession', coachSessionSchema)

// What a coach remembers about a customer between sessions (the customer sees it and can delete lines).
const coachMemorySchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    persona: { type: String, enum: COACH_PERSONAS, required: true },
    notes: { type: [new Schema({ text: String, at: Date })], default: [] },
    commitments: { type: [new Schema({ text: String, at: Date, doneAt: { type: Date, default: null } })], default: [] },
  },
  { timestamps: true },
)
coachMemorySchema.index({ customerId: 1, persona: 1 }, { unique: true })

export const CoachMemory = model('CoachMemory', coachMemorySchema)

// ---------- The brain: material from Yarin and Oren that the coaches learn ----------

export const KNOWLEDGE_SOURCES = ['text', 'file', 'voice'] as const

const knowledgeItemSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 200 },
    /** The coaches that learn it; empty = all of them. */
    personas: { type: [{ type: String, enum: COACH_PERSONAS }], default: [] },
    source: { type: String, enum: KNOWLEDGE_SOURCES, required: true },
    fileName: { type: String, default: '' },
    contentType: { type: String, default: '' },
    size: { type: Number, default: 0 },
    key: { type: String, default: '' },
    /** The text it came from: what was written, or what is said in a recording. */
    raw: { type: String, default: '', maxlength: 400_000 },
    /** What the coaches learn: short teaching notes. */
    method: { type: String, default: '', maxlength: 30_000 },
    status: { type: String, enum: ['uploading', 'processing', 'ready', 'failed'], default: 'processing' },
    progress: { type: Number, default: 0 },
    error: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    by: { type: String, default: '', maxlength: 120 },
  },
  { timestamps: true },
)
knowledgeItemSchema.index({ createdAt: -1 })

export type KnowledgeItemDoc = HydratedDocument<InferSchemaType<typeof knowledgeItemSchema>>
export const KnowledgeItem = model('KnowledgeItem', knowledgeItemSchema)

// ---------- The coach lab: the fixed tests a bot must pass before customers meet it ----------

export const BOT_KEYS = ['reviewer', ...COACH_PERSONAS] as const
export type BotKey = (typeof BOT_KEYS)[number]

const botTestRunSchema = new Schema(
  {
    bot: { type: String, enum: BOT_KEYS, required: true, index: true },
    /** Identifies the exact prompts, knowledge, model and tests of this run. */
    version: { type: String, required: true },
    status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
    total: { type: Number, default: 0 },
    passed: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    criticalFailed: { type: Number, default: 0 },
    error: { type: String, default: '' },
    cases: {
      type: [
        new Schema(
          {
            id: String,
            title: String,
            critical: Boolean,
            passed: Boolean,
            checks: { type: [new Schema({ text: String, passed: Boolean, why: String }, { _id: false })], default: [] },
            output: { type: String, default: '' },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export type BotTestRunDoc = HydratedDocument<InferSchemaType<typeof botTestRunSchema>>
export const BotTestRun = model('BotTestRun', botTestRunSchema)

// ---------- Referrals ("חבר מביא חבר") ----------

export const LEAD_STATUSES = ['new', 'contacted', 'joined', 'lost'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

const leadSchema = new Schema(
  {
    referrerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    note: { type: String, trim: true, maxlength: 1000, default: '' },
    status: { type: String, enum: LEAD_STATUSES, default: 'new' },
    seenAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export type LeadDoc = HydratedDocument<InferSchemaType<typeof leadSchema>>
export const Lead = model('Lead', leadSchema)

// ---------- Business results: one report per month (the second metric) ----------
// The collection keeps its first name ("revenuereports") and "amount" is the revenue.

const businessReportSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    amount: { type: Number, required: true, min: 0 },
    expenses: { type: Number, default: null, min: 0 },
    leads: { type: Number, default: null, min: 0 },
    calls: { type: Number, default: null, min: 0 },
    deals: { type: Number, default: null, min: 0 },
    note: { type: String, default: '', maxlength: 1000 },
    /** The starting point, from the diagnosis. */
    baseline: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'revenuereports' },
)
businessReportSchema.index({ customerId: 1, month: 1 }, { unique: true })

export type BusinessReportDoc = HydratedDocument<InferSchemaType<typeof businessReportSchema>>
export const BusinessReport = model('BusinessReport', businessReportSchema)

// ---------- Prizes the admin handed over ----------

const rewardDeliverySchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    rewardKey: { type: String, required: true },
    deliveredAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
)
rewardDeliverySchema.index({ customerId: 1, rewardKey: 1 }, { unique: true })

export const RewardDelivery = model('RewardDelivery', rewardDeliverySchema)

// ---------- AI usage per customer per day (cost cap) ----------

const aiUsageSchema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
  day: { type: String, required: true },
  count: { type: Number, default: 0 },
})
aiUsageSchema.index({ customerId: 1, day: 1 }, { unique: true })

export const AiUsage = model('AiUsage', aiUsageSchema)

/**
 * Removes a deleted customer's game data. The friends they invited (leads) stay:
 * they are possible customers for the business.
 */
export async function deleteGameData(customerId: Types.ObjectId): Promise<void> {
  const filter = { customerId }
  await Promise.all([
    XpEvent.deleteMany(filter),
    WatchProgress.deleteMany(filter),
    WorksheetResponse.deleteMany(filter),
    QuizAttempt.deleteMany(filter),
    Diagnosis.deleteMany(filter),
    TaskBrief.deleteMany(filter),
    CoachSession.deleteMany(filter),
    CoachMemory.deleteMany(filter),
    BusinessReport.deleteMany(filter),
    RewardDelivery.deleteMany(filter),
    AiUsage.deleteMany(filter),
  ])
}

// ---------- Site settings (key/value) ----------

const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
)

export const Setting = model('Setting', settingSchema)

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const doc = await Setting.findOne({ key })
  return (doc?.value as T | undefined) ?? fallback
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  await Setting.updateOne({ key }, { $set: { value } }, { upsert: true })
}
