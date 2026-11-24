import { useCallback, useEffect, useRef } from 'react'
import { api } from '../../lib/api'
import type { LessonVideo, MyPlan } from '../../lib/types'

const SLICE = 10
const EVERY_MS = 20_000

/**
 * Reports what the customer really watched: the position (to resume) and the ten-second slices that played.
 * Returns handlers for the video player. onFinished runs once, when the server counts the video as watched.
 */
export function useWatch(video: LessonVideo | undefined, onFinished: (plan: MyPlan) => void) {
  const pending = useRef(new Set<number>())
  const last = useRef({ position: 0, duration: 0 })
  const sentAt = useRef(0)
  const id = video?.id

  const send = useCallback(
    async (force = false) => {
      if (!id || (pending.current.size === 0 && !force)) return
      const slices = [...pending.current]
      pending.current.clear()
      sentAt.current = Date.now()
      try {
        const res = await api<{ watched: boolean; plan: MyPlan | null }>(`/me/assets/${id}/watch`, { method: 'PUT', body: { ...last.current, slices } })
        if (res.plan) onFinished(res.plan)
      } catch {
        // Try again with the next report.
        for (const s of slices) pending.current.add(s)
      }
    },
    [id, onFinished],
  )

  // The last report, when the customer leaves the page or switches the video.
  useEffect(() => {
    const slices = pending.current
    return () => {
      if (!id || slices.size === 0) return
      const body = JSON.stringify({ ...last.current, slices: [...slices] })
      slices.clear()
      void fetch(`/api/me/assets/${id}/watch`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined)
    }
  }, [id])

  const onWatch = useCallback(
    (position: number, duration: number) => {
      last.current = { position: Math.max(0, position), duration }
      pending.current.add(Math.floor(position / SLICE))
      if (Date.now() - sentAt.current > EVERY_MS) void send()
    },
    [send],
  )

  const onRest = useCallback(() => void send(), [send])

  const markDone = useCallback(async () => {
    if (!id) return
    const res = await api<{ watched: boolean; plan: MyPlan | null }>(`/me/assets/${id}/watch`, {
      method: 'PUT',
      body: { ...last.current, slices: [], markDone: true },
    })
    if (res.plan) onFinished(res.plan)
  }, [id, onFinished])

  return { onWatch, onRest, markDone }
}
