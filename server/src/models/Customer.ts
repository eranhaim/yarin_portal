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
    company: { type: String, trim: true, maxlength: 120, default: '' },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    // Object key of the avatar image in the storage bucket.
    avatarKey: { type: String, default: null },
    passwordHash: { type: String, required: true, select: false },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },

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
    plan: plan ? planSummary(c, plan) : null,
  }
}

function planSummary(c: CustomerDoc, plan: PlanDoc) {
  const level = levelState(plan, c.taskProgress)
  return {
    id: plan.id as string,
    title: plan.title,
    assignedAt: c.planAssignedAt,
    ...progressSummary(plan, c.taskProgress),
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
