// Shared rules for files that browsers upload straight to the storage bucket.

/** The largest object a single S3 PUT accepts. */
export const MAX_UPLOAD_BYTES = 5 * 1024 ** 3

/** A file name that is safe inside an object key (Hebrew and spaces become "-"). */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned.slice(-100) || 'file'
}

/** "Lesson notes.pdf" -> "Lesson notes". */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || name
}
