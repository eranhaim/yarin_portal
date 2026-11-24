import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import type { SubmissionSummary } from '../../lib/types'

const EMPTY: SubmissionSummary = { unread: 0, byCustomer: {}, latestAt: null }
const POLL_MS = 30_000
const BASE_TITLE = typeof document === 'undefined' ? '' : document.title

/** Work (handed-in worksheets) that waits for Yarin and Oren. */
export type WorksSummary = { open: number; requested: number }
const NO_WORKS: WorksSummary = { open: 0, requested: 0 }

export type InboxState = { summary: SubmissionSummary; works: WorksSummary; refresh: () => Promise<void> }

export const InboxContext = createContext<InboxState>({ summary: EMPTY, works: NO_WORKS, refresh: async () => undefined })

export function useInbox() {
  return useContext(InboxContext)
}

/**
 * Polls the unread homework count while the admin panel is open.
 * New homework shows in the tab title and, when the admin allowed it, as a browser notification.
 */
export function useInboxPolling(): InboxState {
  const [summary, setSummary] = useState<SubmissionSummary>(EMPTY)
  const [works, setWorks] = useState<WorksSummary>(NO_WORKS)
  const lastLatest = useRef<string | null | undefined>(undefined)

  const refresh = useCallback(async () => {
    try {
      const [next, nextWorks] = await Promise.all([api<SubmissionSummary>('/admin/submissions/summary'), api<WorksSummary>('/admin/works/summary')])
      setWorks(nextWorks)
      // Only a later upload counts as new: marking items read can make latestAt older, or null.
      const known = lastLatest.current
      const isLater = next.latestAt !== null && (known == null || next.latestAt > known)
      const isNew = known !== undefined && isLater
      if (known === undefined || isLater) lastLatest.current = next.latestAt
      setSummary(next)
      if (isNew && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        new Notification('הגשה חדשה בסקיל אורגני', { body: 'לקוח העלה קובץ למשימה. לחצו כדי לפתוח את תיבת ההגשות.', tag: 'yp-inbox' }).onclick = () => {
          window.focus()
          window.location.assign('/admin/inbox')
        }
      }
    } catch {
      // A failed poll is fine; the next one tries again.
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), POLL_MS)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  useEffect(() => {
    const count = summary.unread + works.open
    document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE
    return () => {
      document.title = BASE_TITLE
    }
  }, [summary.unread, works.open])

  return { summary, works, refresh }
}
