// The interface is in English, so dates are too (day-month order, 24-hour clock).
// Change to 'he-IL' if the site switches to Hebrew.
export const LOCALE = 'en-GB'

const dateTime = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const dateOnly = new Intl.DateTimeFormat(LOCALE, { year: 'numeric', month: 'short', day: 'numeric' })

export function formatDateTime(iso: string | null): string {
  return iso ? dateTime.format(new Date(iso)) : ''
}

export function formatDate(iso: string | null): string {
  return iso ? dateOnly.format(new Date(iso)) : ''
}

export type DueInfo = { label: string; tone: 'danger' | 'warn' | 'ok' | 'muted' }

/** A short label for a due time, for example "Overdue" or "Due in 3 days". */
export function dueInfo(iso: string | null, completed: boolean): DueInfo | null {
  if (!iso) return null
  const due = new Date(iso).getTime()
  const now = Date.now()
  const days = Math.round((due - now) / 86_400_000)
  if (completed) return { label: `Due ${formatDateTime(iso)}`, tone: 'muted' }
  if (due < now) return { label: `Overdue · ${formatDateTime(iso)}`, tone: 'danger' }
  if (due - now < 86_400_000) return { label: `Due today · ${formatDateTime(iso)}`, tone: 'warn' }
  if (days <= 3) return { label: `Due in ${days} day${days === 1 ? '' : 's'}`, tone: 'warn' }
  return { label: `Due ${formatDateTime(iso)}`, tone: 'ok' }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '0:00'
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? [parts[0]![0], parts[parts.length - 1]![0]] : [parts[0]?.[0], parts[0]?.[1]]
  return letters.filter(Boolean).join('').toUpperCase() || '?'
}

/** A stable, pleasant color for a name (used behind initials). */
export function colorFromString(value: string): string {
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return `hsl(${Math.abs(hash) % 360} 62% 52%)`
}

/** ISO time -> value for <input type="datetime-local"> (local time). */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Value of <input type="datetime-local"> -> ISO time, or null when empty. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]{1,6})$/i.exec(name)
  return match ? match[1]!.toLowerCase() : ''
}
