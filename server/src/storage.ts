import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from './env.ts'

// Files live in a private Vultr Object Storage bucket.
// The browser gets short-lived signed URLs, never the keys.

const bucket = env.S3_BUCKET
const client =
  env.S3_ENDPOINT && env.S3_ACCESS_KEY && env.S3_SECRET_KEY && bucket
    ? new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
        // S3-compatible providers do not always support the newer default checksums,
        // and signed upload URLs must not require them.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      })
    : null

export const storageEnabled = client !== null

export function requireClient(): S3Client {
  if (!client) throw new Error('File storage is not configured. Set the S3_* values in .env.')
  return client
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await requireClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'private, max-age=86400',
    }),
  )
}

export async function deleteObject(key: string): Promise<void> {
  await requireClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

/** Deletes objects one by one. Failures are logged, not thrown. */
export async function deleteObjects(keys: string[]): Promise<void> {
  const results = await Promise.allSettled(keys.map((key) => deleteObject(key)))
  for (const [i, result] of results.entries()) {
    if (result.status === 'rejected') console.warn(`Could not delete ${keys[i]}`, result.reason)
  }
}

export async function headObject(key: string): Promise<{ size: number; contentType: string | undefined } | null> {
  try {
    const out = await requireClient().send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return { size: out.ContentLength ?? 0, contentType: out.ContentType }
  } catch {
    return null
  }
}

const HOUR = 60 * 60

/** "attachment" header value that works for any file name, including Hebrew. */
function attachmentHeader(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

/**
 * Signed GET URL for a private object.
 * The signing time rounds down to the hour, so the URL stays identical for an hour
 * and the browser can cache the file. Every URL is valid for at least one hour.
 * With downloadName, the browser saves the file under that name instead of opening it.
 */
export async function signedUrl(key: string, options: { downloadName?: string } = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const signingDate = new Date((now - (now % HOUR)) * 1000)
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: options.downloadName ? attachmentHeader(options.downloadName) : undefined,
  })
  return getSignedUrl(requireClient(), command, { expiresIn: 2 * HOUR, signingDate })
}

/**
 * Signed PUT URL. The browser uploads the file straight to the bucket,
 * so large videos never pass through the API server.
 * The bucket needs a CORS rule for the site origin (see server/scripts/bucket-cors.ts).
 */
export async function signedUploadUrl(key: string, contentType: string): Promise<string> {
  return getSignedUrl(requireClient(), new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), {
    expiresIn: 6 * HOUR,
  })
}

export type StorageStatus =
  | { status: 'connected'; bucket: string }
  | { status: 'not_configured' }
  | { status: 'error'; bucket: string; error: string }

export async function storageStatus(): Promise<StorageStatus> {
  if (!client || !bucket) return { status: 'not_configured' }
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    return { status: 'connected', bucket }
  } catch (err) {
    return { status: 'error', bucket, error: err instanceof Error ? err.name : 'Unknown error' }
  }
}
