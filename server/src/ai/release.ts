import { createHash } from 'node:crypto'
import { env } from '../env.ts'
import { BOT_KEYS, BotTestRun, COACH_PERSONAS, getSetting, putSetting, type BotKey, type CoachPersona } from '../models/Game.ts'
import { aiEnabled } from './claude.ts'
import { COACHES, coachBase, coachSession, evaluationSystem } from './coaches.ts'
import { methodFor } from './knowledge.ts'
import { casesOf } from './lab/cases.ts'
import { REVIEW_REPLY_SYSTEM, REVIEW_SYSTEM } from './prompts.ts'

// The gate in front of customers: a bot is open only with a version (prompts, lessons, model and tests) that passed
// the fixed tests in the lab. A change of the prompts, the model or the tests closes it until it passes again. A change
// of the lessons does not: customers keep the knowledge that passed, and the new one opens after its own tests.

export const PASS_RATE = 0.85

type Release = { version: string; code: string; method: string; at: string; by: string }

const isCoach = (bot: BotKey): bot is CoachPersona => (COACH_PERSONAS as readonly string[]).includes(bot)

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12)

/** Everything of a bot except the lessons. */
function codeOf(bot: BotKey): string {
  const parts: string[] = [env.AI_MODEL, JSON.stringify(casesOf(bot).map((c) => [c.id, c.title, c.critical, c.checks.map((k) => k.text)]))]
  if (isCoach(bot)) {
    parts.push(coachBase(bot, ''))
    for (const mode of COACHES[bot].modes) parts.push(coachSession(bot, mode.key, null), evaluationSystem(bot, mode.key))
  } else {
    parts.push(REVIEW_SYSTEM, REVIEW_REPLY_SYSTEM)
  }
  return hash(parts.join('\n---\n'))
}

/** The bot as it is now: its version, and the lessons it would teach from. */
export async function botNow(bot: BotKey): Promise<{ version: string; method: string }> {
  const method = isCoach(bot) ? await methodFor(COACHES[bot].knowledge) : ''
  return { version: hash(`${codeOf(bot)}\n${method}`), method }
}

const FRESH_MS = 30_000
const cache = new Map<BotKey, { at: number; release: Release | null }>()

/** Call after a release changes or a test run ends. */
export function forgetReleases(): void {
  cache.clear()
}

/** The release that customers meet, or null when the bot is closed. */
async function openRelease(bot: BotKey): Promise<Release | null> {
  if (!aiEnabled) return null
  const known = cache.get(bot)
  if (known && Date.now() - known.at < FRESH_MS) return known.release
  const stored = await getSetting<Release | null>(`bot-release:${bot}`, null)
  const release = stored?.code === codeOf(bot) ? stored : null
  cache.set(bot, { at: Date.now(), release })
  return release
}

export async function botReleased(bot: BotKey): Promise<boolean> {
  return (await openRelease(bot)) !== null
}

/** The lessons that passed the tests together with this coach. */
export async function approvedMethod(bot: CoachPersona): Promise<string> {
  return (await openRelease(bot))?.method ?? ''
}

export async function releaseBot(bot: BotKey, now: { version: string; method: string }, by: string): Promise<void> {
  await putSetting(`bot-release:${bot}`, { ...now, code: codeOf(bot), at: new Date().toISOString(), by } satisfies Release)
  forgetReleases()
}

export async function closeBot(bot: BotKey): Promise<void> {
  await putSetting(`bot-release:${bot}`, null)
  forgetReleases()
}

export const runPassed = (run: { status: string; total: number; passed: number; criticalFailed: number }) =>
  run.status === 'done' && run.total > 0 && run.criticalFailed === 0 && run.passed / run.total >= PASS_RATE

/** Everything the lab page shows about the bots. */
export async function botStatuses() {
  return Promise.all(
    BOT_KEYS.map(async (bot) => {
      const { version } = await botNow(bot)
      const [release, latest, forVersion] = await Promise.all([
        getSetting<Release | null>(`bot-release:${bot}`, null),
        BotTestRun.findOne({ bot }).sort({ createdAt: -1 }),
        BotTestRun.findOne({ bot, version, status: 'done' }).sort({ createdAt: -1 }),
      ])
      return {
        bot,
        version,
        tests: casesOf(bot).length,
        released: release !== null && release.code === codeOf(bot),
        // Open, but the lessons changed since: the new knowledge waits for its tests.
        waiting: release !== null && release.code === codeOf(bot) && release.version !== version,
        releasedBefore: release !== null,
        releasedAt: release?.at ?? null,
        releasedBy: release?.by ?? null,
        canRelease: forVersion !== null && runPassed(forVersion),
        latest,
      }
    }),
  )
}
