import { Router, type Response } from 'express'
import { isValidObjectId, Types } from 'mongoose'
import { z } from 'zod'
import { parseBody } from '../../http.ts'
import { Customer, toCustomerView } from '../../models/Customer.ts'
import { deleteSubmissions, Submission, toSubmissionView, type SubmissionDoc } from '../../models/Submission.ts'

// Homework that customers handed in: the admin's inbox, downloads and "seen" marks.
export const submissionsRouter = Router()

const objectId = z.string().refine(isValidObjectId, 'מזהה לא תקין')

/** Submission views with the customer's name and avatar, for lists that mix customers. */
async function withCustomers(submissions: SubmissionDoc[]) {
  const ids = [...new Set(submissions.map((s) => s.customerId.toString()))]
  const customers = await Customer.find({ _id: { $in: ids } })
  const byId = new Map(
    await Promise.all(customers.map(async (c) => [c.id as string, await toCustomerView(c)] as const)),
  )
  return Promise.all(
    submissions.map(async (s) => {
      const customer = byId.get(s.customerId.toString())
      return {
        ...(await toSubmissionView(s)),
        customer: customer ? { id: customer.id, name: customer.name, avatarUrl: customer.avatarUrl } : null,
      }
    }),
  )
}

/** Unread count for the bell, and per customer for the customer cards. */
submissionsRouter.get('/submissions/summary', async (_req, res) => {
  const groups = await Submission.aggregate<{ _id: Types.ObjectId; count: number; last: Date }>([
    { $match: { status: 'ready', seenAt: null } },
    { $group: { _id: '$customerId', count: { $sum: 1 }, last: { $max: '$createdAt' } } },
  ])
  const byCustomer = Object.fromEntries(groups.map((g) => [g._id.toString(), g.count]))
  const unread = groups.reduce((sum, g) => sum + g.count, 0)
  const latestAt = groups.reduce<Date | null>((max, g) => (!max || g.last > max ? g.last : max), null)
  res.json({ unread, byCustomer, latestAt })
})

submissionsRouter.get('/submissions', async (req, res) => {
  const query = z
    .object({
      filter: z.enum(['unread', 'all']).default('all'),
      limit: z.coerce.number().int().min(1).max(500).default(200),
    })
    .safeParse(req.query)
  const { filter, limit } = query.success ? query.data : { filter: 'all' as const, limit: 200 }
  const submissions = await Submission.find({ status: 'ready', ...(filter === 'unread' ? { seenAt: null } : {}) })
    .sort({ createdAt: -1 })
    .limit(limit)
  res.json({ submissions: await withCustomers(submissions) })
})

/** Marks the given submissions as seen, or all unread ones when no ids are sent. */
submissionsRouter.post('/submissions/seen', async (req, res) => {
  const body = parseBody(z.object({ ids: z.array(objectId).max(1000).optional() }), req, res)
  if (!body) return
  const result = await Submission.updateMany(
    { status: 'ready', seenAt: null, ...(body.ids ? { _id: { $in: body.ids } } : {}) },
    { $set: { seenAt: new Date() } },
  )
  res.json({ updated: result.modifiedCount })
})

submissionsRouter.get('/customers/:id/submissions', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(404).json({ error: 'הלקוח לא נמצא' })
    return
  }
  const submissions = await Submission.find({ customerId: req.params.id, status: 'ready' }).sort({ createdAt: -1 })
  res.json({ submissions: await Promise.all(submissions.map(toSubmissionView)) })
})

async function findSubmission(id: string, res: Response): Promise<SubmissionDoc | null> {
  const submission = isValidObjectId(id) ? await Submission.findById(id) : null
  if (!submission) res.status(404).json({ error: 'הקובץ לא נמצא' })
  return submission
}

submissionsRouter.delete('/submissions/:id', async (req, res) => {
  const submission = await findSubmission(req.params.id, res)
  if (!submission) return
  await deleteSubmissions([submission])
  res.json({ ok: true })
})
