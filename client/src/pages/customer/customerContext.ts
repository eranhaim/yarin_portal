import { useOutletContext } from 'react-router'
import type { CustomerSelf, GameSummary, Host, Look, MyPlan, TaskStatus } from '../../lib/types'

export type CustomerContext = {
  me: CustomerSelf
  plan: MyPlan | null
  updateTask: (taskId: string, status: Exclude<TaskStatus, 'not_started'>) => Promise<void>
  /** Replaces the plan with a newer copy from the server (for example, after a homework upload). */
  applyPlan: (plan: MyPlan | null) => void
  /** Both metrics, prizes and points. null while loading. */
  game: GameSummary | null
  applyGame: (game: GameSummary) => void
  /** Reloads the summary; new points appear as "+XP" toasts and level-ups get a celebration. */
  refreshGame: () => Promise<void>
  /** Shows "mission complete" with what comes next. */
  celebrateTask: (taskId: string) => void
  look: Look | null
  setLook: (look: Look) => void
  setMe: (me: CustomerSelf) => void
  /** Yarin and Oren's characters. */
  hosts: Host[]
}

export function useCustomer() {
  return useOutletContext<CustomerContext>()
}

/** Where the one thing to do now lives. */
export function focusPath(plan: MyPlan): string {
  const { focus } = plan
  if (focus.kind === 'diagnosis') return '/diagnosis'
  if (focus.kind === 'finished' || !focus.taskId) return '/business'
  return `/level/${focus.chapterId}/task/${focus.taskId}`
}
