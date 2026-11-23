import { useOutletContext } from 'react-router'
import type { CustomerSelf, GameSummary, Host, Look, MyPlan, TaskStatus } from '../../lib/types'

export type CustomerContext = {
  me: CustomerSelf
  plan: MyPlan | null
  updateTask: (taskId: string, status: TaskStatus) => Promise<void>
  /** Replaces the plan with a newer copy from the server (for example, after a homework upload). */
  applyPlan: (plan: MyPlan | null) => void
  /** Points, levels, rank, prizes. null while loading. */
  game: GameSummary | null
  /** Reloads the game summary; new points appear as "+XP" toasts and level-ups get a celebration. */
  refreshGame: () => Promise<void>
  look: Look | null
  setLook: (look: Look) => void
  setMe: (me: CustomerSelf) => void
  /** Yarin and Oren's characters. */
  hosts: Host[]
}

export function useCustomer() {
  return useOutletContext<CustomerContext>()
}
