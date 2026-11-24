import { randomUUID } from 'node:crypto'
import express, { Router, type Response } from 'express'
import { isValidObjectId, Types } from 'mongoose'
import { z } from 'zod'
import { parseBody } from '../../http.ts'
import { Asset, deleteAssets, toAssetView, type AssetDoc } from '../../models/Asset.ts'
import { Plan, planTaskIds } from '../../models/Plan.ts'
import { deleteObject, headObject, putObject, signedUploadUrl, storageEnabled } from '../../storage.ts'
import { MAX_UPLOAD_BYTES, safeFileName, titleFromFileName } from '../../uploads.ts'

// Videos and files for plans and tasks.
//
// Upload flow:
//   1. POST /plans/:planId/assets         -> creates a "pending" asset and returns a signed upload URL
//   2. The browser PUTs the file straight to the bucket (with progress).
//   3. PUT  /assets/:id/poster  (videos)  -> optional preview image the browser captured from the video
//   4. POST /assets/:id/complete          -> the server checks the object exists and marks the asset "ready"

export const assetsRouter = Router()

const objectId = z.string().refine(isValidObjectId, 'מזהה לא תקין')

const createAssetSchema = z.object({
  kind: z.enum(['video', 'file']),
  taskId: objectId.nullable().default(null),
  title: z.string().trim().max(200).optional(),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().max(200).default('application/octet-stream'),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, 'גודל קובץ מקסימלי: 5GB'),
  durationSeconds: z.number().positive().nullable().optional(),
})

async function findAsset(id: string, res: Response): Promise<AssetDoc | null> {
  const asset = isValidObjectId(id) ? await Asset.findById(id) : null
  if (!asset) res.status(404).json({ error: 'הקובץ לא נמצא' })
  return asset
}

assetsRouter.get('/plans/:planId/assets', async (req, res) => {
  if (!isValidObjectId(req.params.planId)) {
    res.status(404).json({ error: 'התוכנית לא נמצאה' })
    return
  }
  const assets = await Asset.find({ planId: req.params.planId, status: 'ready' }).sort({ order: 1, createdAt: 1 })
  res.json({ assets: await Promise.all(assets.map(toAssetView)) })
})

assetsRouter.post('/plans/:planId/assets', async (req, res) => {
  if (!storageEnabled) {
    res.status(503).json({ error: 'אחסון הקבצים לא מוגדר' })
    return
  }
  const body = parseBody(createAssetSchema, req, res)
  if (!body) return

  const plan = isValidObjectId(req.params.planId) ? await Plan.findById(req.params.planId) : null
  if (!plan) {
    res.status(404).json({ error: 'התוכנית לא נמצאה' })
    return
  }
  if (body.taskId && !planTaskIds(plan).has(body.taskId)) {
    res.status(404).json({ error: 'המשימה לא נמצאה בתוכנית. שמרו את התוכנית קודם.' })
    return
  }
  if (body.kind === 'video' && !body.contentType.startsWith('video/')) {
    res.status(415).json({ error: 'זה לא קובץ וידאו. השתמשו בקובץ MP4 (H.264) לתמיכה הטובה ביותר.' })
    return
  }

  // Uploads that never finished (closed tab, lost connection) are removed after a day.
  await deleteAssets(await Asset.find({ planId: plan._id, status: 'pending', createdAt: { $lt: new Date(Date.now() - 86_400_000) } }))

  const scope = body.taskId ? `tasks/${body.taskId}` : 'plan'
  const key = `plans/${plan.id}/${scope}/${body.kind}s/${randomUUID()}-${safeFileName(body.fileName)}`

  const last = await Asset.findOne({ planId: plan._id, taskId: body.taskId, kind: body.kind }).sort({ order: -1 })
  const asset = await Asset.create({
    planId: plan._id,
    taskId: body.taskId ? new Types.ObjectId(body.taskId) : null,
    kind: body.kind,
    title: body.title || titleFromFileName(body.fileName),
    fileName: body.fileName,
    contentType: body.contentType,
    size: body.size,
    durationSeconds: body.durationSeconds ?? null,
    key,
    order: (last?.order ?? -1) + 1,
    status: 'pending',
  })

  res.status(201).json({
    asset: await toAssetView(asset),
    upload: { url: await signedUploadUrl(key, body.contentType), method: 'PUT', headers: { 'Content-Type': body.contentType } },
  })
})

const POSTER_TYPES = ['image/jpeg', 'image/webp', 'image/png']

assetsRouter.put('/assets/:id/poster', express.raw({ type: POSTER_TYPES, limit: '3mb' }), async (req, res) => {
  const asset = await findAsset(req.params.id, res)
  if (!asset) return
  const data: unknown = req.body
  const type = req.headers['content-type'] ?? ''
  if (!Buffer.isBuffer(data) || data.length === 0 || !POSTER_TYPES.includes(type)) {
    res.status(415).json({ error: 'שלחו תמונה מסוג JPEG, WebP או PNG' })
    return
  }
  const ext = type.split('/')[1]
  const key = `${asset.key}.poster.${ext}`
  await putObject(key, data, type)
  if (asset.posterKey && asset.posterKey !== key) await deleteObject(asset.posterKey).catch(() => undefined)
  asset.posterKey = key
  await asset.save()
  res.json({ asset: await toAssetView(asset) })
})

assetsRouter.post('/assets/:id/complete', async (req, res) => {
  const asset = await findAsset(req.params.id, res)
  if (!asset) return
  const head = await headObject(asset.key)
  if (!head) {
    res.status(409).json({ error: 'ההעלאה לא הגיעה לאחסון. נסו שוב.' })
    return
  }
  asset.size = head.size
  asset.status = 'ready'
  await asset.save()
  res.json({ asset: await toAssetView(asset) })
})

assetsRouter.patch('/assets/:id', async (req, res) => {
  const body = parseBody(
    z.object({
      title: z.string().trim().min(1, 'חובה למלא כותרת').max(200).optional(),
      durationSeconds: z.number().positive().nullable().optional(),
    }),
    req,
    res,
  )
  if (!body) return
  const asset = await findAsset(req.params.id, res)
  if (!asset) return
  asset.set(body)
  await asset.save()
  res.json({ asset: await toAssetView(asset) })
})

// Sets the order of a list of assets (for example, the plan's video playlist).
assetsRouter.put('/plans/:planId/assets/order', async (req, res) => {
  const body = parseBody(z.object({ ids: z.array(objectId).max(1000) }), req, res)
  if (!body) return
  await Asset.bulkWrite(
    body.ids.map((id, order) => ({
      updateOne: { filter: { _id: new Types.ObjectId(id), planId: new Types.ObjectId(req.params.planId) }, update: { order } },
    })),
  )
  res.json({ ok: true })
})

assetsRouter.delete('/assets/:id', async (req, res) => {
  const asset = await findAsset(req.params.id, res)
  if (!asset) return
  await deleteAssets([asset])
  res.json({ ok: true })
})
