import { randomUUID } from 'node:crypto'
import express, { Router, type Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { hashPassword } from '../../auth/password.ts'
import { parseBody } from '../../http.ts'
import { Customer, setTaskStatus, toAdminView, type CustomerDoc } from '../../models/Customer.ts'
import { Plan, planTaskIds, toPlanProgressView, type PlanDoc } from '../../models/Plan.ts'
import { deleteObject, putObject, storageEnabled } from '../../storage.ts'

export const customersRouter = Router()

// ---------- Validation ----------

const phone = z
  .string()
  .trim()
  .max(40, 'Phone number is too long')
  .regex(/^[+\d\s().-]*$/, 'Phone number can contain only digits, spaces and + - ( )')

const password = z.string().min(8, 'Password must be at least 8 characters').max(200)

const customerFields = {
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  phone: phone.optional(),
  company: z.string().trim().max(120, 'Business name is too long').optional(),
  notes: z.string().trim().max(2000, 'Notes are too long').optional(),
  active: z.boolean().optional(),
}

const createCustomerSchema = z.object({ ...customerFields, password })
const updateCustomerSchema = z.object({ ...customerFields, password: password.optional() }).partial()

const objectId = z.string().refine(isValidObjectId, 'Invalid id')

// ---------- Helpers ----------

async function findCustomer(id: string, res: Response): Promise<CustomerDoc | null> {
  const customer = isValidObjectId(id) ? await Customer.findById(id) : null
  if (!customer) res.status(404).json({ error: 'Customer not found' })
  return customer
}

async function planOf(customer: CustomerDoc): Promise<PlanDoc | null> {
  return customer.planId ? Plan.findById(customer.planId) : null
}

async function adminView(customer: CustomerDoc) {
  return toAdminView(customer, await planOf(customer))
}

// ---------- Customers ----------

customersRouter.get('/', async (_req, res) => {
  const customers = await Customer.find().sort({ createdAt: -1 }).limit(2000)
  const planIds = [...new Set(customers.flatMap((c) => (c.planId ? [c.planId.toString()] : [])))]
  const plans = new Map((await Plan.find({ _id: { $in: planIds } })).map((p) => [p.id as string, p]))
  const views = await Promise.all(
    customers.map((c) => toAdminView(c, c.planId ? (plans.get(c.planId.toString()) ?? null) : null)),
  )
  res.json({ customers: views })
})

customersRouter.get('/:id', async (req, res) => {
  const customer = await findCustomer(req.params.id, res)
  if (!customer) return
  res.json({ customer: await adminView(customer) })
})

customersRouter.post('/', async (req, res) => {
  const body = parseBody(createCustomerSchema, req, res)
  if (!body) return
  const { password: plain, ...fields } = body
  const customer = await Customer.create({ ...fields, passwordHash: await hashPassword(plain) })
  res.status(201).json({ customer: await adminView(customer) })
})

customersRouter.patch('/:id', async (req, res) => {
  const body = parseBody(updateCustomerSchema, req, res)
  if (!body) return
  const customer = await findCustomer(req.params.id, res)
  if (!customer) return
  const { password: plain, ...fields } = body
  customer.set(fields)
  if (plain) customer.passwordHash = await hashPassword(plain)
  await customer.save()
  res.json({ customer: await adminView(customer) })
})

customersRouter.delete('/:id', async (req, res) => {
  const customer = await findCustomer(req.params.id, res)
  if (!customer) return
  const { avatarKey } = customer
  await customer.deleteOne()
  if (avatarKey) await deleteObject(avatarKey).catch((err) => console.warn('Could not delete avatar', err))
  res.json({ ok: true })
})

// ---------- Avatar ----------
// The browser crops and resizes the image, then sends the bytes as the request body.

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Finds the real image type from the first bytes. The Content-Type header is not trusted. */
function detectImageType(data: Buffer): { mime: string; ext: string } | null {
  if (data.length < 12) return null
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' }
  }
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' }
  }
  return null
}

customersRouter.put('/:id/avatar', express.raw({ type: IMAGE_TYPES, limit: '5mb' }), async (req, res) => {
  if (!storageEnabled) {
    res.status(503).json({ error: 'File storage is not configured' })
    return
  }
  const data: unknown = req.body
  const type = Buffer.isBuffer(data) ? detectImageType(data) : null
  if (!Buffer.isBuffer(data) || !type) {
    res.status(415).json({ error: 'Upload a JPEG, PNG or WebP image' })
    return
  }
  const customer = await findCustomer(req.params.id, res)
  if (!customer) return

  const key = `avatars/${customer.id}/${randomUUID()}.${type.ext}`
  await putObject(key, data, type.mime)

  const previousKey = customer.avatarKey
  customer.avatarKey = key
  await customer.save()
  if (previousKey) await deleteObject(previousKey).catch((err) => console.warn('Could not delete old avatar', err))

  res.json({ customer: await adminView(customer) })
})

customersRouter.delete('/:id/avatar', async (req, res) => {
  const customer = await findCustomer(req.params.id, res)
  if (!customer) return
  const previousKey = customer.avatarKey
  customer.avatarKey = null
  await customer.save()
  if (previousKey) await deleteObject(previousKey).catch((err) => console.warn('Could not delete avatar', err))
  res.json({ customer: await adminView(customer) })
})

// ---------- Assigned plan and task progress ----------

customersRouter.get('/:id/plan', async (req, res) => {
  const customer = await findCustomer(req.params.id, res)
  if (!customer) return
  const plan = await planOf(customer)
  res.json({ plan: plan ? toPlanProgressView(plan, customer.planAssignedAt, customer.taskProgress) : null })
})

// Assign a plan (or null to remove it). A different plan starts with fresh progress.
customersRouter.put('/:id/plan', async (req, res) => {
  const body = parseBody(z.object({ planId: objectId.nullable() }), req, res)
  if (!body) return
  const customer = await findCustomer(req.params.id, res)
  if (!customer) return

  const plan = body.planId ? await Plan.findById(body.planId) : null
  if (body.planId && !plan) {
    res.status(404).json({ error: 'Plan not found' })
    return
  }

  if (customer.planId?.toString() !== plan?.id) {
    customer.planId = plan?._id ?? null
    customer.planAssignedAt = plan ? new Date() : null
    customer.set('taskProgress', [])
    await customer.save()
  }

  res.json({
    customer: await toAdminView(customer, plan),
    plan: plan ? toPlanProgressView(plan, customer.planAssignedAt, customer.taskProgress) : null,
  })
})

const taskStatusSchema = z.object({ status: z.enum(['not_started', 'started', 'completed']) })

customersRouter.patch('/:id/plan/tasks/:taskId', async (req, res) => {
  const body = parseBody(taskStatusSchema, req, res)
  if (!body) return
  const customer = await findCustomer(req.params.id, res)
  if (!customer) return
  const plan = await planOf(customer)
  if (!plan || !planTaskIds(plan).has(req.params.taskId)) {
    res.status(404).json({ error: 'Task not found in this customer’s plan' })
    return
  }

  setTaskStatus(customer, req.params.taskId, body.status)
  await customer.save()

  res.json({ plan: toPlanProgressView(plan, customer.planAssignedAt, customer.taskProgress) })
})
