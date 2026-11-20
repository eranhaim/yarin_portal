import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { endSession, readSession } from '../auth/session.ts'
import { parseBody } from '../http.ts'
import { Asset, toAssetView, type AssetView } from '../models/Asset.ts'
import { Customer, setTaskStatus, type CustomerDoc } from '../models/Customer.ts'
import { Plan, toPlanProgressView, type PlanDoc } from '../models/Plan.ts'

// The customer's own area: their plan, levels, tasks, videos and files.
export const meRouter = Router()

async function requireCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = await readSession(req, 'customer')
  const customer = id ? await Customer.findById(id) : null
  if (!customer || !customer.active) {
    endSession(res, 'customer')
    res.status(401).json({ error: 'Not logged in' })
    return
  }
  res.locals.customer = customer
  next()
}

meRouter.use(requireCustomer)

const customerOf = (res: Response) => res.locals.customer as CustomerDoc

async function planView(customer: CustomerDoc, plan: PlanDoc) {
  const assets = await Asset.find({ planId: plan._id, status: 'ready' }).sort({ order: 1, createdAt: 1 })
  const views = await Promise.all(assets.map(toAssetView))

  const byTask = new Map<string, { videos: AssetView[]; files: AssetView[] }>()
  const planVideos: AssetView[] = []
  const planFiles: AssetView[] = []
  for (const asset of views) {
    if (!asset.taskId) {
      ;(asset.kind === 'video' ? planVideos : planFiles).push(asset)
      continue
    }
    const group = byTask.get(asset.taskId) ?? { videos: [], files: [] }
    ;(asset.kind === 'video' ? group.videos : group.files).push(asset)
    byTask.set(asset.taskId, group)
  }

  const progress = toPlanProgressView(plan, customer.planAssignedAt, customer.taskProgress)
  return {
    ...progress,
    videos: planVideos,
    files: planFiles,
    chapters: progress.chapters.map((chapter) => ({
      ...chapter,
      tasks: chapter.tasks.map((task) => {
        const media = byTask.get(task.id)
        // Locked levels show their tasks, but not the videos and files yet.
        const locked = chapter.state === 'locked'
        return {
          ...task,
          videoCount: media?.videos.length ?? 0,
          fileCount: media?.files.length ?? 0,
          videos: locked ? [] : (media?.videos ?? []),
          files: locked ? [] : (media?.files ?? []),
        }
      }),
    })),
  }
}

meRouter.get('/plan', async (_req, res) => {
  const customer = customerOf(res)
  const plan = customer.planId ? await Plan.findById(customer.planId) : null
  res.json({ plan: plan ? await planView(customer, plan) : null })
})

meRouter.patch('/tasks/:taskId', async (req, res) => {
  const body = parseBody(z.object({ status: z.enum(['not_started', 'started', 'completed']) }), req, res)
  if (!body) return
  const customer = customerOf(res)
  const plan = customer.planId ? await Plan.findById(customer.planId) : null
  const view = plan ? toPlanProgressView(plan, customer.planAssignedAt, customer.taskProgress) : null
  const chapter = view?.chapters.find((c) => c.tasks.some((t) => t.id === req.params.taskId))
  if (!plan || !chapter) {
    res.status(404).json({ error: 'Task not found' })
    return
  }
  if (chapter.state === 'locked') {
    res.status(403).json({ error: 'Finish the earlier levels first' })
    return
  }
  setTaskStatus(customer, req.params.taskId, body.status)
  await customer.save()
  res.json({ plan: await planView(customer, plan) })
})
