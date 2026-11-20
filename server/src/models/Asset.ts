import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose'
import { deleteObjects, signedUrl } from '../storage.ts'

// A video or file that belongs to a plan (taskId = null) or to one task of a plan.
// The bytes live in the storage bucket; this document holds the details.

const assetSchema = new Schema(
  {
    planId: { type: Schema.Types.ObjectId, ref: 'Plan', required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, default: null },
    kind: { type: String, enum: ['video', 'file'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    fileName: { type: String, required: true, maxlength: 255 },
    contentType: { type: String, required: true, maxlength: 200 },
    size: { type: Number, required: true },
    key: { type: String, required: true },
    posterKey: { type: String, default: null },
    durationSeconds: { type: Number, default: null },
    order: { type: Number, default: 0 },
    // "pending" until the browser finishes the upload to the bucket.
    status: { type: String, enum: ['pending', 'ready'], default: 'pending' },
  },
  { timestamps: true },
)

export type AssetDoc = HydratedDocument<InferSchemaType<typeof assetSchema>>

export const Asset = model('Asset', assetSchema)

export async function toAssetView(a: AssetDoc) {
  const [url, downloadUrl, posterUrl] = await Promise.all([
    signedUrl(a.key).catch(() => null),
    signedUrl(a.key, { downloadName: a.fileName }).catch(() => null),
    a.posterKey ? signedUrl(a.posterKey).catch(() => null) : null,
  ])
  return {
    id: a.id as string,
    kind: a.kind,
    title: a.title,
    fileName: a.fileName,
    contentType: a.contentType,
    size: a.size,
    durationSeconds: a.durationSeconds,
    taskId: a.taskId ? a.taskId.toString() : null,
    order: a.order,
    url,
    downloadUrl,
    posterUrl,
  }
}

export type AssetView = Awaited<ReturnType<typeof toAssetView>>

/** Deletes the assets and their objects in the bucket. */
export async function deleteAssets(assets: AssetDoc[]): Promise<void> {
  if (assets.length === 0) return
  const keys = assets.flatMap((a) => (a.posterKey ? [a.key, a.posterKey] : [a.key]))
  await deleteObjects(keys)
  await Asset.deleteMany({ _id: { $in: assets.map((a) => a._id) } })
}
