import { api } from './api'
import { fileExtension } from './format'
import { inspectVideo } from './media'
import type { Asset, MyPlan, Submission } from './types'

const TYPES_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  txt: 'text/plain',
  csv: 'text/csv',
}

export function contentTypeOf(file: File, kind: Asset['kind'] = 'file'): string {
  if (file.type) return file.type
  return TYPES_BY_EXTENSION[fileExtension(file.name)] ?? (kind === 'video' ? 'video/mp4' : 'application/octet-stream')
}

type SignedUpload = { url: string; method: 'PUT'; headers: Record<string, string> }

/** PUT with upload progress (fetch() cannot report upload progress). */
export function putFile(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`ההעלאה נכשלה (${xhr.status})`))
    xhr.onerror = () =>
      reject(new Error('ההעלאה נכשלה. בדקו את החיבור, ושהאחסון מאפשר העלאות מהאתר הזה (CORS).'))
    xhr.onabort = () => reject(new DOMException('ההעלאה בוטלה', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(file)
  })
}

type UploadOptions = {
  planId: string
  taskId: string | null
  kind: Asset['kind']
  file: File
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/** Uploads a video or file straight to the storage bucket and registers it on the plan. */
export async function uploadAsset({ planId, taskId, kind, file, onProgress, signal }: UploadOptions): Promise<Asset> {
  const info = kind === 'video' ? await inspectVideo(file) : { duration: null, poster: null }
  const contentType = contentTypeOf(file, kind)

  const { asset, upload } = await api<{ asset: Asset; upload: SignedUpload }>(`/admin/plans/${planId}/assets`, {
    body: { kind, taskId, fileName: file.name, contentType, size: file.size, durationSeconds: info.duration },
  })

  try {
    await putFile(upload.url, file, upload.headers, onProgress, signal)
    if (info.poster) {
      await api(`/admin/assets/${asset.id}/poster`, { method: 'PUT', raw: info.poster }).catch(() => undefined)
    }
    const done = await api<{ asset: Asset }>(`/admin/assets/${asset.id}/complete`, { method: 'POST' })
    return done.asset
  } catch (err) {
    // Remove the unfinished entry, so it does not stay "pending".
    await api(`/admin/assets/${asset.id}`, { method: 'DELETE' }).catch(() => undefined)
    throw err
  }
}

type SubmissionOptions = {
  taskId: string
  file: File
  note?: string
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/** Uploads a customer's homework file for a task. Returns the updated plan (the task may now be "started"). */
export async function uploadSubmission({ taskId, file, note, onProgress, signal }: SubmissionOptions): Promise<MyPlan | null> {
  const { submission, upload } = await api<{ submission: Submission; upload: SignedUpload }>(`/me/tasks/${taskId}/submissions`, {
    body: { fileName: file.name, contentType: contentTypeOf(file), size: file.size, note: note ?? '' },
  })
  try {
    await putFile(upload.url, file, upload.headers, onProgress, signal)
    const done = await api<{ plan: MyPlan | null }>(`/me/submissions/${submission.id}/complete`, { method: 'POST' })
    return done.plan
  } catch (err) {
    await api(`/me/submissions/${submission.id}`, { method: 'DELETE' }).catch(() => undefined)
    throw err
  }
}
