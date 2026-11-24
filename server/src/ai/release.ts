import { createHash } from 'node:crypto'
import { env } from '../env.ts'
import { BOT_KEYS, BotTestRun, COACH_PERSONAS, getSetting, putSetting, type BotKey, type CoachPersona } from '../models/Game.ts'
import { aiEnabled } from './claude.ts'
import { COACHES, coachBase, coachSession, evaluationSystem } from './coaches.ts'
import { methodFor } from './knowledge.ts'
import { casesOf } from './lab/cases.ts'
import { REVIEW_REPLY_SYSTEM, REVIEW_SYSTEM } from './prompts.ts'

// The gate in front of customers: a bot is open only when its exact version (prompts, lessons, model and tests)
// passed the fixed tests in the lab. Any change makes a new version, which must pass again.

export const PASS_RATE = 0.85

type Release = { version: string; at: string; by: string }

const isCoach = (bot: BotKey): bot is CoachPersona => (COACH_PERSONAS as readonly string[]).includes(bot)

export async function botVersion(bot: BotKey): Promise<string> {
  const parts: string[] = [env.AI_MODEL, JSON.stringify(casesOf(bot).map((c) => [c.id, c.title, c.critical, c.checks.map((k) => k.text)]))]
  if (isCoach(bot)) {
    parts.push(coachBase(bot, await methodFor(COACHES[bot].knowledge)))
    for (const mode of COACHES[bot].modes) parts.push(coachSession(bot, mode.key, null), evaluationSystem(bot, mode.key))
  } else {
    parts.push(REVIEW_SYSTEM, REVIEW_REPLY_SYSTEM)
  }
  return createHash('sha256').update(parts.join('\n---\n')).digest('hex').slice(0, 12)
}

const FRESH_MS = 30_000
const cache = new Map<BotKey, { at: number; released: boolean }>()

/** Call after a release changes or a test run ends. */
export function forgetReleases(): void {
  cache.clear()
}

export async function botReleased(bot: BotKey): Promise<boolean> {
  if (!aiEnabled) return false
  const known = cache.get(bot)
  if (known && Date.now() - known.at < FRESH_MS) return known.released
  const release = await getSetting<Release | null>(`bot-release:${bot}`, null)
  const released = release !== null && release.version === (await botVersion(bot))
  cache.set(bot, { at: Date.now(), released })
  return released
}

export async function releaseBot(bot: BotKey, version: string | null, by: string): Promise<void> {
  await putSetting(`bot-release:${bot}`, version ? ({ version, at: new Date().toISOString(), by } satisfies Release) : null)
  forgetReleases()
}

export const runPassed = (run: { status: string; total: number; passed: number; criticalFailed: number }) =>
  run.status === 'done' && run.total > 0 && run.criticalFailed === 0 && run.passed / run.total >= PASS_RATE

/** Everything the lab page shows about the bots. */
export async function botStatuses() {
  return Promise.all(
    BOT_KEYS.map(async (bot) => {
      const version = await botVersion(bot)
      const [release, latest, forVersion] = await Promise.all([
        getSetting<Release | null>(`bot-release:${bot}`, null),
        BotTestRun.findOne({ bot }).sort({ createdAt: -1 }),
        BotTestRun.findOne({ bot, version, status: 'done' }).sort({ createdAt: -1 }),
      ])
      return {
        bot,
        version,
        tests: casesOf(bot).length,
        released: release !== null && release.version === version,
        releasedBefore: release !== null,
        releasedAt: release?.at ?? null,
        releasedBy: release?.by ?? null,
        canRelease: forVersion !== null && runPassed(forVersion),
        latest,
      }
    }),
  )
}
