import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { Response } from 'express'
import type { Types } from 'mongoose'
import type { z } from 'zod'
import { env } from '../env.ts'
import { dayKey } from '../game/rules.ts'
import { AiUsage } from '../models/Game.ts'

// Claude for the AI features. Two kinds of calls:
//   aiJson: structured output, validated against a Zod schema (reviews, quizzes, evaluations).
//   aiText: a plain reply (coach and simulator chats).
// Both enable server-side refusal fallbacks, so a declined request is retried on a fallback model.

export const aiEnabled = Boolean(env.ANTHROPIC_API_KEY)
const client = aiEnabled ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 300_000 }) : null

/** Server-side refusal fallback: the API re-runs a declined request on a suitable fallback model. */
const fallback = (): { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: 'default' } => ({
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default',
})

type Effort = 'low' | 'medium' | 'high'

/** Content of a message: text, images and PDF documents. */
export type AiContent = Anthropic.Beta.BetaContentBlockParam[]
export type AiMessage = Anthropic.Beta.BetaMessageParam

/**
 * A system prompt in parts. Parts that repeat between requests (the playbook, the lessons) come first
 * with cache: true, so a conversation reads them from the prompt cache; the customer's own data follows.
 */
export type SystemPart = { text: string; cache?: boolean }

function systemBlocks(system: string | SystemPart[]): string | Anthropic.Beta.BetaTextBlockParam[] {
  if (typeof system === 'string') return system
  return system
    .filter((part) => part.text.trim())
    .map((part) => ({ type: 'text', text: part.text, ...(part.cache ? { cache_control: { type: 'ephemeral' as const } } : {}) }))
}

export class AiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function requireClient(): Anthropic {
  if (!client) throw new AiError(503, 'הבינה המלאכותית עוד לא מחוברת. פנו לירין.')
  return client
}

function translateError(err: unknown): never {
  if (err instanceof AiError) throw err
  if (err instanceof Anthropic.RateLimitError) throw new AiError(503, 'יש עומס על הבוט. נסו שוב בעוד דקה.')
  if (err instanceof Anthropic.AuthenticationError) throw new AiError(503, 'הבינה המלאכותית לא מוגדרת נכון. פנו לירין.')
  if (err instanceof Anthropic.BadRequestError) {
    console.error('Claude request rejected:', err.message)
    throw new AiError(502, 'הבוט לא הצליח לענות על הבקשה הזו.')
  }
  if (err instanceof Anthropic.APIConnectionError) throw new AiError(503, 'אין חיבור לבוט כרגע. נסו שוב בעוד רגע.')
  if (err instanceof Anthropic.APIError) {
    console.error(`Claude API error ${err.status}:`, err.message)
    throw new AiError(502, 'הבוט לא זמין כרגע. נסו שוב בעוד רגע.')
  }
  throw err
}

export async function aiJson<S extends z.ZodType>(options: {
  schema: S
  system: string | SystemPart[]
  messages: AiMessage[]
  effort: Effort
  maxTokens?: number
}): Promise<z.infer<S>> {
  const api = requireClient()
  try {
    const response = await api.beta.messages.parse({
      model: env.AI_MODEL,
      max_tokens: options.maxTokens ?? 16000,
      ...fallback(),
      system: systemBlocks(options.system),
      messages: options.messages,
      output_config: { format: betaZodOutputFormat(options.schema), effort: options.effort },
    })
    if (response.stop_reason === 'refusal') throw new AiError(422, 'הבוט לא יכול לעזור בבקשה הזו. נסו לנסח אחרת.')
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new AiError(502, 'הבוט לא סיים את התשובה. נסו שוב.')
    return response.parsed_output as z.infer<S>
  } catch (err) {
    translateError(err)
  }
}

export async function aiText(options: {
  system: string | SystemPart[]
  messages: AiMessage[]
  effort: Effort
  maxTokens?: number
}): Promise<string> {
  const api = requireClient()
  try {
    const response = await api.beta.messages.create({
      model: env.AI_MODEL,
      max_tokens: options.maxTokens ?? 4000,
      ...fallback(),
      system: systemBlocks(options.system),
      messages: options.messages,
      output_config: { effort: options.effort },
    })
    if (response.stop_reason === 'refusal') throw new AiError(422, 'הבוט לא יכול לעזור בבקשה הזו. נסו לנסח אחרת.')
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n')
      .trim()
    if (!text) throw new AiError(502, 'הבוט לא החזיר תשובה. נסו שוב.')
    return text
  } catch (err) {
    translateError(err)
  }
}

/** Counts one AI request for the customer; throws when today's cap is used up. */
export async function useAiQuota(customerId: Types.ObjectId): Promise<void> {
  const usage = await AiUsage.findOneAndUpdate(
    { customerId, day: dayKey() },
    { $inc: { count: 1 } },
    { upsert: true, returnDocument: 'after' },
  )
  if (usage.count > env.AI_DAILY_LIMIT) {
    throw new AiError(429, 'הגעתם למכסת השיחות עם הבוטים להיום. מחר ממשיכים!')
  }
}

/** Sends an AiError as a JSON response; other errors go to the app's error handler. */
export function sendAiError(err: unknown, res: Response): boolean {
  if (err instanceof AiError) {
    res.status(err.status).json({ error: err.message })
    return true
  }
  return false
}
