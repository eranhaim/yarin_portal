import { model, Schema, type HydratedDocument, type InferSchemaType, type Types } from 'mongoose'

// Collections of the game layer: points, worksheets, quizzes, AI coach chats, referrals,
// revenue reports, prize deliveries, AI usage and site settings.

// ---------- Points ----------
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

// ---------- Worksheets and the AI review ----------

const chatTurnSchema = new Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true, maxlength: 8000 },
    at: { type: Date, default: () => new Date() },
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
    // The AI reviewer ("הבוחן"): first review, then a short follow-up conversation and a final score.
    review: {
      type: new Schema(
        {
          score: Number,
          verdict: String,
          summary: String,
          strengths: [String],
          improvements: [String],
          questions: [String],
          finalScore: { type: Number, default: null },
          finalNote: { type: String, default: '' },
          reviewedAt: Date,
          finishedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    chat: { type: [chatTurnSchema], default: [] },
  },
  { timestamps: true },
)
worksheetResponseSchema.index({ customerId: 1, taskId: 1 }, { unique: true })

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

// ---------- AI coaches and simulators ----------

export const COACH_PERSONAS = ['sales', 'scripts', 'mental'] as const
export type CoachPersona = (typeof COACH_PERSONAS)[number]

const coachSessionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    persona: { type: String, enum: COACH_PERSONAS, required: true },
    title: { type: String, default: '', maxlength: 200 },
    messages: { type: [chatTurnSchema], default: [] },
    evaluation: {
      type: new Schema(
        { score: Number, summary: String, strengths: [String], improvements: [String], nextStep: String, at: Date },
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

// ---------- The road to "the boss": monthly revenue the customer reports ----------

const revenueReportSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    amount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
)
revenueReportSchema.index({ customerId: 1, month: 1 }, { unique: true })

export const RevenueReport = model('RevenueReport', revenueReportSchema)

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
    WorksheetResponse.deleteMany(filter),
    QuizAttempt.deleteMany(filter),
    CoachSession.deleteMany(filter),
    RevenueReport.deleteMany(filter),
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
