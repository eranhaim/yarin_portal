export class ApiError extends Error {
  status: number
  fields: Record<string, string>

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Sent as JSON. */
  body?: unknown
  /** Sent as raw bytes (for image uploads). */
  raw?: Blob
  signal?: AbortSignal
}

/** Fired when an admin request gets 401, so the admin app can show the login screen. */
export const ADMIN_UNAUTHORIZED = 'yp:admin-unauthorized'

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const headers: Record<string, string> = {}
  let body: BodyInit | undefined
  if (options.raw) {
    body = options.raw
    headers['Content-Type'] = options.raw.type || 'application/octet-stream'
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body)
    headers['Content-Type'] = 'application/json'
  }

  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      credentials: 'same-origin',
      signal: options.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'אין חיבור לשרת. בדקו את החיבור לאינטרנט.')
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> }
  if (!res.ok) {
    if (res.status === 401 && path.startsWith('/admin/') && !['/admin/login', '/admin/me'].includes(path)) {
      window.dispatchEvent(new Event(ADMIN_UNAUTHORIZED))
    }
    throw new ApiError(res.status, data.error ?? `הבקשה נכשלה (${res.status})`, data.fields ?? {})
  }
  return data as T
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'משהו השתבש'
}
