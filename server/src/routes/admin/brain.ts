import { randomUUID } from 'node:crypto'
import { Router, type Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { aiEnabled } from '../../ai/claude.ts'
import { COACHES } from '../../ai/coaches.ts'
import { kindOf } from '../../ai/files.ts'
import { brainSize, forgetKnowledge } from '../../ai/knowledge.ts'
import { isRunning } from '../../ai/lab/run.ts'
import { learn } from '../../ai/learn.ts'
import { botStatuses, forgetReleases } from '../../ai/release.ts'
import { speechMode } from '../../ai/speech.ts'
import { adminOf } from '../../auth/admin.ts'
import { parseBody } from '../../http.ts'
import { COACH_PERSONAS, KnowledgeItem, type CoachPersona, type KnowledgeItemDoc } from '../../models/Game.ts'
import { deleteObject, headObject, signedUploadUrl, storageEnabled } from '../../storage.ts'
import { safeFileName } from '../../uploads.ts'

// The brain: Yarin and Oren add what they know (text, documents, recordings), and the coaches learn it. New
// knowledge reaches customers only after the coach passes its fixed tests with it.
export const brainRouter = Router()

const MAX_FILE = 600 * 1024 * 1024

const view = (item: KnowledgeItemDoc) => ({
  id: item.id as string,
  title: item.title,
  personas: [...item.personas],
  source: item.source,
  fileName: item.fileName,
  status: item.status,
  progress: item.progress,
  error: item.error,
  enabled: item.enabled,
  method: item.method,
  raw: item.source === 'file' && !item.raw ? '' : item.raw.slice(0, 60_000),
  by: item.by,
  createdAt: item.createdAt,
})

brainRouter.get('/brain', async (_req, res) => {
  const [docs, size, statuses] = await Promise.all([KnowledgeItem.find({ status: { $ne: 'uploading' } }).sort({ createdAt: -1 }).limit(300), brainSize(), botStatuses()])
  res.json({
    enabled: aiEnabled,
    speech: speechMode(),
    size,
    items: docs.map(view),
    coaches: COACH_PERSONAS.map((persona) => {
      const s = statuses.find((x) => x.bot === persona)!
      return { key: persona, title: COACHES[persona].title, released: s.released, waiting: s.waiting, running: isRunning(persona) }
    }),
  })
})

const personas = z.array(z.enum(COACH_PERSONAS)).max(COACH_PERSONAS.length).default([])

async function findItem(id: string, res: Response) {
  const item = isValidObjectId(id) ? await KnowledgeItem.findById(id) : null
  if (!item) res.status(404).json({ error: 'הפריט לא נמצא' })
  return item
}

brainRouter.post('/brain/text', async (req, res) => {
  const body = parseBody(z.object({ title: z.string().trim().max(200).default(''), text: z.string().trim().min(30, 'כתבו לפחות כמה משפטים').max(200_000, 'הטקסט ארוך מדי. חלקו אותו לשניים.'), personas }), req, res)
  if (!body) return
  if (!aiEnabled) {
    res.status(503).json({ error: 'הבינה המלאכותית לא מחוברת.' })
    return
  }
  const item = await KnowledgeItem.create({ title: body.title || body.text.split('\n')[0]!.slice(0, 80), personas: body.personas, source: 'text', raw: body.text, by: adminOf(res).name })
  void learn(item.id as string)
  res.status(201).json({ item: view(item) })
})

/** A file or a recording: first a place to upload it, then "learn". */
brainRouter.post('/brain/files', async (req, res) => {
  const body = parseBody(
    z.object({
      title: z.string().trim().max(200).default(''),
      name: z.string().trim().min(1).max(200),
      contentType: z.string().max(200).default(''),
      size: z.number().int().positive().max(MAX_FILE, 'גודל קובץ מקסימלי: 600MB'),
      voice: z.boolean().default(false),
      personas,
    }),
    req,
    res,
  )
  if (!body) return
  if (!storageEnabled || !aiEnabled) {
    res.status(503).json({ error: 'האחסון או הבינה המלאכותית לא מחוברים.' })
    return
  }
  const contentType = body.contentType || 'application/octet-stream'
  if (kindOf({ name: body.name, contentType }) === 'other') {
    res.status(415).json({ error: 'אפשר להעלות PDF, Word, מצגת, טבלה, טקסט, תמונה, הקלטה או סרטון.' })
    return
  }
  const key = `brain/${randomUUID()}-${safeFileName(body.name)}`
  const item = await KnowledgeItem.create({
    title: body.title || body.name,
    personas: body.personas,
    source: body.voice ? 'voice' : 'file',
    fileName: body.name,
    contentType,
    size: body.size,
    key,
    status: 'uploading',
    by: adminOf(res).name,
  })
  res.status(201).json({ item: view(item), upload: { url: await signedUploadUrl(key, contentType), headers: { 'Content-Type': contentType } } })
})

brainRouter.post('/brain/:id/learn', async (req, res) => {
  const item = await findItem(req.params.id, res)
  if (!item) return
  if (item.status === 'processing' && Date.now() - item.updatedAt.getTime() < 60_000) {
    res.json({ item: view(item) })
    return
  }
  if (item.source !== 'text' && !(await headObject(item.key))) {
    res.status(409).json({ error: 'ההעלאה לא הגיעה לאחסון. נסו שוב.' })
    return
  }
  item.status = 'processing'
  item.progress = 0
  item.error = ''
  await item.save()
  void learn(item.id as string)
  res.status(202).json({ item: view(item) })
})

brainRouter.patch('/brain/:id', async (req, res) => {
  const body = parseBody(
    z.object({
      title: z.string().trim().min(1).max(200).optional(),
      personas: z.array(z.enum(COACH_PERSONAS)).optional(),
      method: z.string().trim().max(28_000, 'הטקסט ארוך מדי').optional(),
      enabled: z.boolean().optional(),
    }),
    req,
    res,
  )
  if (!body) return
  const item = await findItem(req.params.id, res)
  if (!item) return
  if (body.title !== undefined) item.title = body.title
  if (body.personas !== undefined) item.set('personas', body.personas as CoachPersona[])
  if (body.method !== undefined) item.method = body.method
  if (body.enabled !== undefined) item.enabled = body.enabled
  await item.save()
  forgetKnowledge()
  forgetReleases()
  res.json({ item: view(item) })
})

brainRouter.delete('/brain/:id', async (req, res) => {
  const item = await findItem(req.params.id, res)
  if (!item) return
  if (item.key) await deleteObject(item.key).catch(() => undefined)
  await item.deleteOne()
  forgetKnowledge()
  forgetReleases()
  res.json({ ok: true })
})
