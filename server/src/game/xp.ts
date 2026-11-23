import type { Types } from 'mongoose'
import type { CustomerDoc } from '../models/Customer.ts'
import { Lead, RevenueReport, RewardDelivery, XpEvent } from '../models/Game.ts'
import { levelState, type PlanDoc } from '../models/Plan.ts'
import {
  conditionLabel,
  conditionProgress,
  dayKey,
  playerLevel,
  rankFor,
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

/** Everything the game UI shows about one player. */
export async function gameSummary(customer: CustomerDoc, plan: PlanDoc | null) {
  const [events, recent, reports, joined, totalLeads, deliveries] = await Promise.all([
    XpEvent.aggregate<{ _id: string; points: number }>([
      { $match: { customerId: customer._id } },
      { $group: { _id: '$skill', points: { $sum: '$points' } } },
    ]),
    XpEvent.find({ customerId: customer._id }).sort({ updatedAt: -1 }).limit(15),
    RevenueReport.find({ customerId: customer._id }).sort({ month: -1 }).limit(24),
    Lead.countDocuments({ referrerId: customer._id, status: 'joined' }),
    Lead.countDocuments({ referrerId: customer._id }),
    RewardDelivery.find({ customerId: customer._id }),
  ])
  const activeDays = await XpEvent.distinct('day', { customerId: customer._id })

  const bySkill = new Map(events.map((e) => [e._id, e.points]))
  const skills = SKILLS.map((s) => {
    const points = bySkill.get(s.key) ?? 0
    return { key: s.key, label: s.label, points, ...skillLevel(points) }
  })
  const xp = skills.reduce((sum, s) => sum + s.points, 0)

  const latest = reports[0] ?? null
  const bestRevenue = reports.reduce((max, r) => Math.max(max, r.amount), 0)
  const rank = rankFor(latest?.amount ?? 0)

  const levels = plan ? levelState(plan, customer.taskProgress) : null
  const levelsDone = levels ? levels.chapters.filter((c) => c.state === 'completed').length : 0
  const facts = { referrals: joined, bestRevenue, levelsDone, allTasksDone: Boolean(levels?.finished) }
  const delivered = new Set(deliveries.map((d) => d.rewardKey))

  return {
    xp,
    ...playerLevel(xp),
    streak: streakFrom(activeDays),
    skills,
    revenue: {
      latestMonth: latest?.month ?? null,
      latest: latest?.amount ?? 0,
      best: bestRevenue,
      rank: { ...rank.rank, index: rank.index },
      next: rank.next,
      history: reports.map((r) => ({ month: r.month, amount: r.amount })).reverse(),
    },
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
