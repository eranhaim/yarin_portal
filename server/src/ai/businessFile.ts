import { answersAsText, type Worksheet, type WorksheetAnswers } from '../game/content.ts'
import { businessSummary } from '../game/business.ts'
import { bottleneckLabel, diagnosisAsText, stageLabel, trackLabel, type DiagnosisAnswers } from '../game/tracks.ts'
import type { CustomerDoc } from '../models/Customer.ts'
import { BusinessReport, CoachMemory, Diagnosis, WorksheetResponse, type CoachPersona } from '../models/Game.ts'
import { learnerTasks, levelState, Plan, type PlanDoc } from '../models/Plan.ts'

// The "business file" (תיק העסק): everything the AI may know about one customer, in one text.
// It comes from what the customer told us: the diagnosis, the monthly numbers, the worksheets, and what the
// coaches remember. The customer sees the same facts on their business page.

const MAX = 14_000
const shekels = (value: number | null) => (value === null ? 'unknown' : `₪${Math.round(value).toLocaleString('en-US')}`)
const percent = (value: number | null) => (value === null ? 'unknown' : `${Math.round(value * 100)}%`)

export async function businessFile(customer: CustomerDoc, options: { plan?: PlanDoc | null; persona?: CoachPersona; skipTaskId?: string } = {}): Promise<string> {
  const plan = options.plan !== undefined ? options.plan : customer.planId ? await Plan.findById(customer.planId) : null
  const [diagnosis, reports, responses, memories] = await Promise.all([
    Diagnosis.findOne({ customerId: customer._id, submittedAt: { $ne: null } }).sort({ submittedAt: -1 }),
    BusinessReport.find({ customerId: customer._id }).sort({ month: 1 }).limit(24),
    plan ? WorksheetResponse.find({ customerId: customer._id, planId: plan._id, submittedAt: { $ne: null } }) : [],
    CoachMemory.find({ customerId: customer._id, ...(options.persona ? { persona: options.persona } : {}) }),
  ])

  const parts: string[] = [`Name: ${customer.name.split(' ')[0]}\nBusiness name: ${customer.company || 'not given'}`]
  if (customer.track) {
    parts.push(`Route: ${trackLabel(customer.track)}, stage: ${stageLabel(customer.stage)}, main bottleneck: ${bottleneckLabel(customer.bottleneck)}`)
  }
  if (diagnosis) parts.push(`## Opening diagnosis (${diagnosis.submittedAt!.toISOString().slice(0, 10)})\n${diagnosisAsText((diagnosis.answers ?? {}) as DiagnosisAnswers)}`)

  const business = businessSummary(reports)
  if (business.history.length > 0) {
    const lines = business.history
      .slice(-4)
      .map(
        (h) =>
          `- ${h.month}${h.baseline ? ' (starting point)' : ''}: revenue ${shekels(h.revenue)}, profit ${shekels(h.profit)} (${percent(h.margin)}), leads ${h.leads ?? 'unknown'}, sales calls ${h.calls ?? 'unknown'}, new customers ${h.deals ?? 'unknown'}, leads to calls ${percent(h.leadToCall)}, calls to customers ${percent(h.callToDeal)}`,
      )
    parts.push(`## Business numbers by month\n${lines.join('\n')}`)
  }

  if (plan) {
    const level = levelState(plan, customer)
    const tasks = learnerTasks(plan, customer)
    parts.push(`## Program\nLevel ${Math.min(level.index + 1, level.total)} of ${level.total}.`)
    // Their own worksheets. Customer, offer and brand work comes first: it is the best context for a coach.
    const order = ['customer', 'offer', 'brand', 'business', 'sales', 'hooks', 'writing', 'ideas', 'camera', 'mindset']
    const rank = (skill: unknown) => {
      const index = order.indexOf(String(skill))
      return index === -1 ? order.length : index
    }
    const done = responses
      .flatMap((response) => {
        const task = tasks.find((t) => t._id.equals(response.taskId))
        return task && task.worksheet && task._id.toString() !== options.skipTaskId ? [{ task, response }] : []
      })
      .sort((a, b) => rank(a.task.skill) - rank(b.task.skill))
    for (const { task, response } of done.slice(0, 7)) {
      const text = answersAsText(task.worksheet as Worksheet, (response.answers ?? {}) as WorksheetAnswers)
        .split('\n')
        .filter((line) => !line.includes('(ריק)'))
        .join('\n')
      const toFix = response.review?.improvements?.length ? `\nThe examiner asked to improve: ${response.review.improvements.join(' | ')}` : ''
      parts.push(`## Their work: ${task.title}\n${text.slice(0, 1700)}${toFix}`)
    }
  }

  for (const memory of memories) {
    const notes = memory.notes.slice(-12).map((n) => `- ${n.text}`)
    const open = memory.commitments.filter((c) => !c.doneAt).slice(-3)
    if (notes.length) parts.push(`## What the ${memory.persona} coach remembers\n${notes.join('\n')}`)
    if (open.length) parts.push(`## Open commitments (${memory.persona} coach)\n${open.map((c) => `- ${c.text} (from ${c.at?.toISOString().slice(0, 10) ?? ''})`).join('\n')}`)
  }

  return parts.join('\n\n').slice(0, MAX)
}
