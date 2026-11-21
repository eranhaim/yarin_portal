import { useOutletContext } from 'react-router'
import type { CustomerSelf, MyPlan, TaskStatus } from '../../lib/types'

export type CustomerContext = {
  me: CustomerSelf
  plan: MyPlan | null
  updateTask: (taskId: string, status: TaskStatus) => Promise<void>
  /** Replaces the plan with a newer copy from the server (for example, after a homework upload). */
  applyPlan: (plan: MyPlan | null) => void
}

export function useCustomer() {
  return useOutletContext<CustomerContext>()
}
