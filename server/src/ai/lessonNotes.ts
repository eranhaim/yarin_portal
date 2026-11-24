import type { Types } from 'mongoose'
import { LessonNote, type LessonNoteDoc } from '../models/Game.ts'
import { aiJson } from './claude.ts'
import { forgetKnowledge } from './knowledge.ts'
import { LESSON_SYSTEM, lessonNoteSchema } from './prompts.ts'
import { forgetReleases } from './release.ts'

type LessonTask = { _id: Types.ObjectId; title: string; description?: string | null }

/** Writes what a lesson teaches, from its transcript and its slides. */
export async function writeLessonNote(planId: Types.ObjectId, task: LessonTask): Promise<LessonNoteDoc> {
  const stored = await LessonNote.findOne({ taskId: task._id })
  const transcript = (stored?.transcript ?? []).map((t) => `[${Math.round(t.start ?? 0)}] ${t.text ?? ''}`).join('\n')
  const note = await aiJson({
    schema: lessonNoteSchema,
    system: LESSON_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          `Lesson: ${task.title}`,
          `The task of the lesson:\n${task.description ?? ''}`,
          stored?.slides ? `Slides and worksheet:\n${stored.slides}` : '',
          transcript ? `Transcript (seconds in brackets):\n${transcript}` : '(no transcript)',
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    effort: 'medium',
    maxTokens: 12_000,
  })
  const last = stored?.transcript.at(-1)?.end ?? 0
  const saved = await LessonNote.findOneAndUpdate(
    { taskId: task._id },
    {
      $set: {
        planId,
        summary: note.summary,
        keyPoints: note.keyPoints.slice(0, 8),
        moments: note.moments.filter((m) => m.at >= 0 && m.at <= last).slice(0, 10),
        method: note.method,
        stale: false,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  )
  forgetKnowledge()
  forgetReleases()
  return saved
}
