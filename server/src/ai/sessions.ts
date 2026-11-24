import type { z } from 'zod'
import type { CoachPersona } from '../models/Game.ts'
import { aiJson, aiText, type AiContent, type AiMessage, type SystemPart } from './claude.ts'
import {
  coachBase,
  coachSession,
  evaluationSchema,
  evaluationSystem,
  SCENARIO_SYSTEM,
  scenarioSchema,
  SCENARIOS,
  DIFFICULTIES,
  type ClientCard,
} from './coaches.ts'
import { REVIEW_REPLY_SYSTEM, REVIEW_SYSTEM, reviewReplySchema, reviewSchema } from './prompts.ts'

// The calls behind the examiner and the coaches. The routes and the lab's tests use the same functions,
// so a test checks exactly what a customer gets.

// ---------- The examiner ----------

export type ReviewInput = {
  task: { title: string; description: string; rubric: string[] }
  /** What the lesson teaches (Yarin and Oren's method). */
  method: string
  business: string
  worksheet: string
  files: AiContent
  previous: { number: number; score: number | null; improvements: string[]; worksheet: string } | null
}

export function reviewWork(input: ReviewInput) {
  const { task } = input
  const system: SystemPart[] = [{ text: REVIEW_SYSTEM }]
  if (input.method) system.push({ text: `What the lesson of this task teaches:\n${input.method}`, cache: true })
  const text = [
    `# The task\n${task.title}\n\nInstructions:\n${task.description || '(none)'}`,
    `# Review criteria\n${task.rubric.map((r, i) => `${i + 1}. ${r}`).join('\n') || '1. Concrete, real, complete work that follows the instructions.'}`,
    `# The business (known facts)\n${input.business || '(unknown)'}`,
    input.previous
      ? `# The previous version (number ${input.previous.number}, score ${input.previous.score ?? 'none'})\nYou asked them to: ${input.previous.improvements.join(' | ') || '(nothing)'}\n<previous_work>\n${input.previous.worksheet.slice(0, 8000)}\n</previous_work>`
      : '',
    `# The work to check\n<work>\n${input.worksheet || '(no worksheet)'}\n</work>`,
    input.files.length ? '# The files they handed in' : '# Files: none',
  ]
    .filter(Boolean)
    .join('\n\n')
  return aiJson({
    schema: reviewSchema,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text }, ...input.files] }],
    effort: 'medium',
    maxTokens: 12_000,
  })
}

export function defendWork(input: { title: string; method: string; score: number; summary: string; improvements: string[]; worksheet: string; chat: { role: 'user' | 'assistant'; text: string }[]; message: string }) {
  const context = [
    `Task: ${input.title}`,
    `Your review: score ${input.score}. ${input.summary}`,
    `Improvements you asked for: ${input.improvements.join(' | ') || '(none)'}`,
    `<work>\n${input.worksheet.slice(0, 10_000)}\n</work>`,
  ].join('\n')
  return aiJson({
    schema: reviewReplySchema,
    system: [{ text: REVIEW_REPLY_SYSTEM }, { text: input.method ? `What the lesson teaches:\n${input.method}` : '', cache: Boolean(input.method) }, { text: context }],
    messages: [...startWithUser(input.chat.map((t) => ({ role: t.role, content: t.text }))), { role: 'user', content: input.message }],
    effort: 'medium',
    maxTokens: 6000,
  })
}

/** The API wants the first message from the user; a conversation that the bot opened gets a short lead-in. */
function startWithUser(messages: AiMessage[]): AiMessage[] {
  return messages[0]?.role === 'assistant' ? [{ role: 'user', content: '(The session starts.)' }, ...messages] : messages
}

// ---------- The coaches ----------

export type Scenario = { key: string; difficulty: string; card: ClientCard }

export function castClient(input: { scenario: string; difficulty: string; business: string }): Promise<ClientCard> {
  const s = SCENARIOS.find((x) => x.key === input.scenario) ?? SCENARIOS[0]
  const d = DIFFICULTIES.find((x) => x.key === input.difficulty) ?? DIFFICULTIES[1]
  return aiJson({
    schema: scenarioSchema,
    system: SCENARIO_SYSTEM,
    messages: [{ role: 'user', content: `Scenario: ${s.brief}\nDifficulty: ${d.brief}\n\nThe participant's business:\n${input.business || '(unknown: choose a common small service business)'}` }],
    effort: 'low',
    maxTokens: 3000,
  })
}

export type CoachTurn = { role: 'user' | 'assistant'; content: string | AiContent }

export function coachReply(input: {
  persona: CoachPersona
  mode: string
  scenario: Scenario | null
  method: string
  business: string
  history: CoachTurn[]
}): Promise<string> {
  const session = coachSession(input.persona, input.mode, input.scenario)
  const roleplay = Boolean(input.scenario)
  const system: SystemPart[] = [
    // In a role play the model is the client: it does not need the trainer's method, which would leak into its answers.
    ...(roleplay ? [] : [{ text: coachBase(input.persona, input.method), cache: true }]),
    ...(session ? [{ text: session }] : []),
    { text: roleplay ? `The seller's business, as you would know it from their page and the first messages:\n${input.business.slice(0, 2500)}` : `# What you know about this participant and their business\n${input.business}` },
  ]
  return aiText({ system, messages: startWithUser(input.history), effort: roleplay ? 'low' : 'medium', maxTokens: 4000 })
}

export type Evaluation = z.infer<typeof evaluationSchema>

export function evaluateSession(input: { persona: CoachPersona; mode: string; scenario: Scenario | null; business: string; transcript: string; work?: AiContent }): Promise<Evaluation> {
  const card = input.scenario ? `The simulated client (the participant did not see this):\n${JSON.stringify(input.scenario.card)}\n\n` : ''
  return aiJson({
    schema: evaluationSchema,
    system: evaluationSystem(input.persona, input.mode),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `${card}The business:\n${input.business.slice(0, 3000)}\n\n<session>\n${input.transcript}\n</session>` },
          ...(input.work ?? []),
        ],
      },
    ],
    effort: 'medium',
    maxTokens: 8000,
  })
}

export function transcriptOf(persona: CoachPersona, roleplay: boolean, messages: { role: string; text: string }[]): string {
  const other = roleplay ? 'CLIENT (simulated)' : 'COACH'
  return messages.map((m) => `${m.role === 'user' ? (persona === 'sales' ? 'SELLER (participant)' : 'PARTICIPANT') : other}: ${m.text}`).join('\n\n')
}
