import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { deleteObjects, signedUrl } from '../storage.ts'

// A homework file that a customer uploaded for one task of their plan.
// The bytes live in the storage bucket; this document holds the details.
// The admin's inbox lists the "ready" submissions that nobody has seen yet (seenAt = null).

const submissionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },
    taskId: { type: Schema.Types.ObjectId, required: true },
    // Titles at upload time, so the inbox still reads well after the plan changes.
    planTitle: { type: String, default: '', maxlength: 200 },
    chapterTitle: { type: String, default: '', maxlength: 200 },
    taskTitle: { type: String, default: '', maxlength: 200 },
    fileName: { type: String, required: true, maxlength: 255 },
    contentType: { type: String, required: true, maxlength: 200 },
    size: { type: Number, required: true },
    key: { type: String, required: true },
    note: { type: String, trim: true, default: '', maxlength: 1000 },
    // "pending" until the browser finishes the upload to the bucket.
    status: { type: String, enum: ['pending', 'ready'], default: 'pending' },
    seenAt: { type: Date, default: null },
  },
  { timestamps: true },
)

submissionSchema.index({ customerId: 1, planId: 1, createdAt: 1 })
submissionSchema.index({ status: 1, seenAt: 1, createdAt: -1 })

export type SubmissionDoc = HydratedDocument<InferSchemaType<typeof submissionSchema>>

export const Submission = model('Submission', submissionSchema)

/** At most this many files per task and customer. */
export const MAX_SUBMISSIONS_PER_TASK = 30

export async function toSubmissionView(s: SubmissionDoc) {
  const [url, downloadUrl] = await Promise.all([
    signedUrl(s.key).catch(() => null),
    signedUrl(s.key, { downloadName: s.fileName }).catch(() => null),
  ])
  return {
    id: s.id as string,
    customerId: s.customerId.toString(),
    planId: s.planId.toString(),
    taskId: s.taskId.toString(),
    planTitle: s.planTitle,
    chapterTitle: s.chapterTitle,
    taskTitle: s.taskTitle,
    fileName: s.fileName,
    contentType: s.contentType,
    size: s.size,
    note: s.note,
    createdAt: s.createdAt,
    seenAt: s.seenAt,
    url,
    downloadUrl,
  }
}

export type SubmissionView = Awaited<ReturnType<typeof toSubmissionView>>

/** Deletes the submissions and their objects in the bucket. */
export async function deleteSubmissions(submissions: SubmissionDoc[]): Promise<void> {
  if (submissions.length === 0) return
  await deleteObjects(submissions.map((s) => s.key))
  await Submission.deleteMany({ _id: { $in: submissions.map((s) => s._id) } })
}
