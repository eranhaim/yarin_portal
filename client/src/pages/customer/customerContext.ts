import { useOutletContext } from 'react-router'
import type { CustomerSelf, MyPlan, TaskStatus } from '../../lib/types'

export type CustomerContext = {
  me: CustomerSelf
  plan: MyPlan | null
  updateTask: (taskId: string, status: TaskStatus) => Promise<void>
}

export function useCustomer() {
  return useOutletContext<CustomerContext>()
}
