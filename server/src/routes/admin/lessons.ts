import { Router, type Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { sendAiError } from '../../ai/claude.ts'
import { forgetKnowledge } from '../../ai/knowledge.ts'
import { writeLessonNote } from '../../ai/lessonNotes.ts'
import { forgetReleases } from '../../ai/release.ts'
import { parseBody } from '../../http.ts'
import { LessonNote, type LessonNoteDoc } from '../../models/Game.ts'
import { Plan } from '../../models/Plan.ts'

// What each recorded lesson teaches: a short summary for customers, captions, and the method that the coaches
// and the examiner learn from. It is the program's own content, so it lives in the database only.
export const lessonsRouter = Router()

async function findLesson(planId: string, taskId: string, res: Response) {
  const plan = isValidObjectId(planId) ? await Plan.findById(planId) : null
  const task = plan?.chapters.flatMap((c) => c.tasks).find((t) => t._id.toString() === taskId)
  if (!plan || !task) {
    res.status(404).json({ error: 'המשימה לא נמצאה' })
    return null
  }
  return { plan, task }
}

const noteView = (note: LessonNoteDoc | null) => ({
  summary: note?.summary ?? '',
  keyPoints: note?.keyPoints ?? [],
  moments: (note?.moments ?? []).map((m) => ({ at: m.at ?? 0, title: m.title ?? '' })),
  method: note?.method ?? '',
  captionLines: note?.transcript.length ?? 0,
})

lessonsRouter.get('/plans/:planId/tasks/:taskId/lesson', async (req, res) => {
  if (!(await findLesson(req.params.planId, req.params.taskId, res))) return
  res.json({ lesson: noteView(await LessonNote.findOne({ taskId: req.params.taskId })) })
})

const patchBody = z.object({
  summary: z.string().trim().max(4000).optional(),
  keyPoints: z.array(z.string().trim().min(1).max(400)).max(12).optional(),
  moments: z.array(z.object({ at: z.number().min(0).max(100_000), title: z.string().trim().min(1).max(120) })).max(20).optional(),
  method: z.string().trim().max(20_000).optional(),
  slides: z.string().trim().max(60_000).optional(),
  transcript: z.array(z.object({ start: z.number().min(0), end: z.number().min(0), text: z.string().max(2000) })).max(6000).optional(),
})

lessonsRouter.patch('/plans/:planId/tasks/:taskId/lesson', async (req, res) => {
  const body = parseBody(patchBody, req, res)
  if (!body) return
  const found = await findLesson(req.params.planId, req.params.taskId, res)
  if (!found) return
  const note = await LessonNote.findOneAndUpdate(
    { taskId: found.task._id },
    // New material: the caretaker writes the note again. Text that an admin wrote stays as it is.
    { $set: { planId: found.plan._id, ...body, ...(body.transcript && body.method === undefined ? { stale: true } : {}) } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  )
  // The coaches learn from this text, so their version changes and they must pass their tests again.
  forgetKnowledge()
  forgetReleases()
  res.json({ lesson: noteView(note) })
})

/** Writes the note from the transcript and the slides (sent here, or stored before). */
lessonsRouter.post('/plans/:planId/tasks/:taskId/lesson/generate', async (req, res) => {
  const body = parseBody(z.object({ slides: z.string().max(60_000).default('') }), req, res)
  if (!body) return
  const found = await findLesson(req.params.planId, req.params.taskId, res)
  if (!found) return
  const stored = await LessonNote.findOne({ taskId: found.task._id })
  if (!stored?.transcript.length && !stored?.slides && !body.slides) {
    res.status(409).json({ error: 'אין תמלול או מצגת לשיעור הזה.' })
    return
  }
  if (body.slides) {
    await LessonNote.updateOne({ taskId: found.task._id }, { $set: { planId: found.plan._id, slides: body.slides } }, { upsert: true, setDefaultsOnInsert: true })
  }
  try {
    res.json({ lesson: noteView(await writeLessonNote(found.plan._id, found.task)) })
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})
