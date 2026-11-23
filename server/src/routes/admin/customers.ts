import { randomUUID } from 'node:crypto'
import express, { Router, type Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { hashPassword } from '../../auth/password.ts'
import { parseBody } from '../../http.ts'
import { Customer, setTaskStatus, toAdminView, type CustomerDoc } from '../../models/Customer.ts'
import { deleteGameData } from '../../models/Game.ts'
import { Plan, planTaskIds, toPlanProgressView, type PlanDoc } from '../../models/Plan.ts'
import { deleteSubmissions, Submission } from '../../models/Submission.ts'
import { detectImageType, IMAGE_TYPES } from '../../images.ts'
import { deleteObject, putObject, storageEnabled } from '../../storage.ts'

export const customersRouter = Router()

// ---------- Validation ----------

const phone = z
  .string()
  .trim()
  .max(40, 'מספר הטלפון ארוך מדי')
  .regex(/^[+\d\s().-]*$/, 'מספר טלפון יכול לכלול רק ספרות, רווחים ו- + - ( )')

const password = z.string().min(8, 'הסיסמה צריכה לכלול לפחות 8 תווים').max(200)

const customerFields = {
  name: z.string().trim().min(1, 'חובה למלא שם').max(120, 'השם ארוך מדי'),
  email: z.string().trim().toLowerCase().pipe(z.email('הזינו כתובת אימייל תקינה')),
  phone: phone.optional(),
  company: z.string().trim().max(120, 'שם העסק ארוך מדי').optional(),
  notes: z.string().trim().max(2000, 'ההערות ארוכות מדי').optional(),
  active: z.boolean().optional(),
}

const createCustomerSchema = z.object({ ...customerFields, password })
const updateCustomerSchema = z.object({ ...customerFields, password: password.optional() }).partial()

const objectId = z.string().refine(isValidObjectId, 'מזהה לא תקין')

// ---------- Helpers ----------

async function findCustomer(id: string, res: Response): Promise<CustomerDoc | null> {
  const customer = isValidObjectId(id) ? await Customer.findById(id) : null
  if (!customer) res.status(404).json({ error: 'הלקוח לא נמצא' })
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
  // The customer's homework and game data go with them.
  await deleteSubmissions(await Submission.find({ customerId: customer._id }))
  await deleteGameData(customer._id)
  res.json({ ok: true })
})

// ---------- Avatar ----------
// The browser crops and resizes the image, then sends the bytes as the request body.

customersRouter.put('/:id/avatar', express.raw({ type: IMAGE_TYPES, limit: '5mb' }), async (req, res) => {
  if (!storageEnabled) {
    res.status(503).json({ error: 'אחסון הקבצים לא מוגדר' })
    return
  }
  const data: unknown = req.body
  const type = Buffer.isBuffer(data) ? detectImageType(data) : null
  if (!Buffer.isBuffer(data) || !type) {
    res.status(415).json({ error: 'העלו תמונה מסוג JPEG, PNG או WebP' })
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
    res.status(404).json({ error: 'התוכנית לא נמצאה' })
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
    res.status(404).json({ error: 'המשימה לא נמצאה בתוכנית של הלקוח' })
    return
  }

  setTaskStatus(customer, req.params.taskId, body.status)
  await customer.save()

  res.json({ plan: toPlanProgressView(plan, customer.planAssignedAt, customer.taskProgress) })
})
