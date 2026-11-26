import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { signedUrl } from '../storage.ts'
import { levelState, progressSummary, type PlanDoc } from './Plan.ts'

// Status of one task of the assigned plan, for this customer.
// "Started" and "completed" are timestamps; null means "not yet".
const taskProgressSchema = new Schema(
  {
    taskId: { type: Schema.Types.ObjectId, required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { _id: false },
)

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    /** WhatsApp messages from the program (reminders, Yarin and Oren's answers). The customer can turn them off. */
    whatsapp: { type: Boolean, default: true },
    company: { type: String, trim: true, maxlength: 120, default: '' },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    // Object key of the avatar image in the storage bucket.
    avatarKey: { type: String, default: null },
    passwordHash: { type: String, required: true, select: false },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },

    // The customer's game character (see game/content.ts, lookSchema). null = the default look.
    look: { type: Schema.Types.Mixed, default: null },
    // Code in the customer's "bring a friend" link.
    // No default: a sparse unique index skips only missing values, and two nulls would collide.
    referralCode: { type: String, index: { unique: true, sparse: true } },

    // The personal route (see game/tracks.ts). The first diagnosis sets it; an admin can change it.
    track: { type: String, default: null },
    stage: { type: String, default: null },
    bottleneck: { type: String, default: null },
    routeBy: { type: String, enum: ['diagnosis', 'admin', null], default: null },

    planId: { type: Schema.Types.ObjectId, ref: 'Plan', default: null, index: true },
    planAssignedAt: { type: Date, default: null },
    taskProgress: { type: [taskProgressSchema], default: [] },
  },
  { timestamps: true },
)

export type CustomerDoc = HydratedDocument<InferSchemaType<typeof customerSchema>>

export const Customer = model('Customer', customerSchema)

async function avatarUrl(key: string | null | undefined): Promise<string | null> {
  if (!key) return null
  try {
    return await signedUrl(key)
  } catch {
    return null
  }
}

/** The customer as the customer sees it. */
export async function toCustomerView(c: CustomerDoc) {
  return {
    id: c.id as string,
    name: c.name,
    email: c.email,
    phone: c.phone,
    whatsapp: c.whatsapp !== false,
    company: c.company,
    avatarUrl: await avatarUrl(c.avatarKey),
  }
}

/** The customer as the admin sees it (adds private fields and a plan summary). */
export async function toAdminView(c: CustomerDoc, plan: PlanDoc | null) {
  return {
    ...(await toCustomerView(c)),
    notes: c.notes,
    active: c.active,
    lastLoginAt: c.lastLoginAt,
    createdAt: c.createdAt,
    route: { track: c.track ?? null, stage: c.stage ?? null, bottleneck: c.bottleneck ?? null, by: c.routeBy ?? null },
    plan: plan ? planSummary(c, plan) : null,
  }
}

function planSummary(c: CustomerDoc, plan: PlanDoc) {
  const level = levelState(plan, c)
  return {
    id: plan.id as string,
    title: plan.title,
    assignedAt: c.planAssignedAt,
    ...progressSummary(plan, c),
    level: { index: level.index, position: level.position, total: level.total, finished: level.finished, title: level.title },
  }
}

export type TaskStatus = 'not_started' | 'started' | 'completed'

/** Sets one task's status for this customer. A completed task is always also started. */
export function setTaskStatus(c: CustomerDoc, taskId: string, status: TaskStatus): void {
  let entry = c.taskProgress.find((p) => p.taskId.toString() === taskId)
  if (!entry) {
    c.taskProgress.push({ taskId, startedAt: null, completedAt: null })
    entry = c.taskProgress[c.taskProgress.length - 1]!
  }
  const now = new Date()
  if (status === 'not_started') {
    entry.startedAt = null
    entry.completedAt = null
  } else if (status === 'started') {
    entry.startedAt ??= now
    entry.completedAt = null
  } else {
    entry.startedAt ??= now
    entry.completedAt ??= now
  }
}
