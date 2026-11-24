import type { Types } from 'mongoose'
import type { CustomerDoc } from '../models/Customer.ts'
import { BusinessReport, Lead, RewardDelivery, WorksheetResponse, XpEvent } from '../models/Game.ts'
import { levelState, progressSummary, type PlanDoc } from '../models/Plan.ts'
import { businessSummary } from './business.ts'
import { finalScoreOf } from './flow.ts'
import {
  conditionLabel,
  conditionProgress,
  dayKey,
  playerLevel,
  REWARDS,
  SKILLS,
  skillLevel,
  type SkillKey,
} from './rules.ts'

type CustomerId = Types.ObjectId | string

type Award = {
  skill: SkillKey
  points: number
  /** Unique per customer, for example "task-complete:<taskId>". The same key never pays twice. */
  refKey: string
  label: string
  /** "once": the first award stands. "best": keep the highest result (a retry pays only the improvement). */
  mode?: 'once' | 'best'
}

/** Gives points. Returns how many points were actually added (0 when nothing changed). */
export async function award(customerId: CustomerId, { skill, points, refKey, label, mode = 'once' }: Award): Promise<number> {
  const value = Math.max(0, Math.round(points))
  const existing = await XpEvent.findOne({ customerId, refKey })
  if (existing) {
    if (mode === 'once' || existing.points >= value) return 0
    const gained = value - existing.points
    existing.points = value
    existing.label = label
    await existing.save()
    return gained
  }
  if (value === 0) return 0
  try {
    await XpEvent.create({ customerId, refKey, skill, points: value, label, day: dayKey() })
    return value
  } catch (err) {
    // A parallel request created it first (unique index): nothing more to add.
    if ((err as { code?: number }).code === 11000) return 0
    throw err
  }
}

export async function revoke(customerId: CustomerId, refKey: string): Promise<void> {
  await XpEvent.deleteOne({ customerId, refKey })
}

/** Consecutive active days that end today or yesterday (Israel time). */
function streakFrom(days: string[]): number {
  const set = new Set(days)
  const cursor = new Date()
  if (!set.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1)
  let streak = 0
  while (set.has(dayKey(cursor))) {
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

/**
 * Both metrics of one customer, side by side and never mixed:
 * learning (points, skills, tasks, quality of the work) and business (leads, calls, income, profit).
 */
export async function gameSummary(customer: CustomerDoc, plan: PlanDoc | null) {
  const [events, recent, reports, joined, totalLeads, deliveries, responses] = await Promise.all([
    XpEvent.aggregate<{ _id: string; points: number }>([
      { $match: { customerId: customer._id } },
      { $group: { _id: '$skill', points: { $sum: '$points' } } },
    ]),
    XpEvent.find({ customerId: customer._id }).sort({ updatedAt: -1 }).limit(15),
    BusinessReport.find({ customerId: customer._id }).sort({ month: -1 }).limit(24),
    Lead.countDocuments({ referrerId: customer._id, status: 'joined' }),
    Lead.countDocuments({ referrerId: customer._id }),
    RewardDelivery.find({ customerId: customer._id }),
    WorksheetResponse.find({ customerId: customer._id, ...(plan ? { planId: plan._id } : {}) }, { answers: 0, 'attempts.answers': 0 }),
  ])
  const activeDays = await XpEvent.distinct('day', { customerId: customer._id })

  const bySkill = new Map(events.map((e) => [e._id, e.points]))
  const skills = SKILLS.map((s) => {
    const points = bySkill.get(s.key) ?? 0
    return { key: s.key, label: s.label, points, ...skillLevel(points) }
  })
  const xp = skills.reduce((sum, s) => sum + s.points, 0)

  const business = businessSummary(reports)

  // The quality of the work: checked tasks, their scores, and how much versions improve.
  const scores = responses.flatMap((r) => {
    const score = finalScoreOf(r)
    return score === null ? [] : [score]
  })
  const improvements = responses.flatMap((r) => {
    const checked = r.attempts.filter((a) => typeof a.score === 'number')
    return checked.length > 1 ? [checked.at(-1)!.score! - checked[0]!.score!] : []
  })
  const average = (list: number[]) => (list.length ? Math.round(list.reduce((sum, n) => sum + n, 0) / list.length) : null)

  const levels = plan ? levelState(plan, customer) : null
  const levelsDone = levels ? levels.chapters.filter((c) => c.state === 'completed').length : 0
  const facts = { referrals: joined, bestRevenue: business.best, levelsDone, allTasksDone: Boolean(levels?.finished) }
  const delivered = new Set(deliveries.map((d) => d.rewardKey))

  return {
    xp,
    ...playerLevel(xp),
    streak: streakFrom(activeDays),
    skills,
    learning: {
      tasks: plan ? progressSummary(plan, customer) : { total: 0, started: 0, completed: 0 },
      levelsDone,
      levels: levels?.total ?? 0,
      checked: scores.length,
      averageScore: average(scores),
      averageImprovement: average(improvements),
    },
    business,
    referrals: { joined, total: totalLeads, code: customer.referralCode },
    rewards: REWARDS.map((reward) => {
      const progress = Math.max(...reward.conditions.map((c) => conditionProgress(c, facts)))
      return {
        key: reward.key,
        title: reward.title,
        tier: reward.tier,
        conditions: reward.conditions.map(conditionLabel),
        progress,
        unlocked: progress >= 1,
        delivered: delivered.has(reward.key),
      }
    }),
    recent: recent.map((e) => ({
      id: e.id as string,
      skill: e.skill,
      points: e.points,
      label: e.label,
      at: e.updatedAt,
    })),
  }
}

export type GameSummary = Awaited<ReturnType<typeof gameSummary>>
