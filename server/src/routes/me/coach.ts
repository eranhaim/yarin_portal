import { Router, type Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { aiJson, aiText, sendAiError, useAiQuota } from '../../ai/claude.ts'
import { coachEvaluationSchema, COACHES } from '../../ai/prompts.ts'
import { dayKey, XP } from '../../game/rules.ts'
import { award } from '../../game/xp.ts'
import { parseBody } from '../../http.ts'
import type { CustomerDoc } from '../../models/Customer.ts'
import { COACH_PERSONAS, CoachSession, type CoachSessionDoc } from '../../models/Game.ts'
import { customerContextText, customerOf } from './shared.ts'

// AI coaches: the sales simulator (role play), the script simulator and the mental coach.
export const coachRouter = Router()

const MAX_TURNS = 60

const OPENERS = {
  scripts: 'היי! בואו נכתוב סרטון שעובד. על מה הסרטון הבא שלכם, ולמי הוא מיועד?',
  mental: 'היי, טוב שבאתם. מה הכי מעסיק אתכם היום בעסק או מול המצלמה?',
} as const

const SKILL_OF = { sales: 'sales', scripts: 'writing', mental: 'mindset' } as const

function sessionView(session: CoachSessionDoc) {
  return {
    id: session.id as string,
    persona: session.persona,
    title: session.title,
    messages: session.messages.map((m) => ({ role: m.role, text: m.text, at: m.at })),
    evaluation: session.evaluation ?? null,
    updatedAt: session.updatedAt,
  }
}

async function findSession(customer: CustomerDoc, id: string, res: Response): Promise<CoachSessionDoc | null> {
  const session = isValidObjectId(id) ? await CoachSession.findOne({ _id: id, customerId: customer._id }) : null
  if (!session) res.status(404).json({ error: 'השיחה לא נמצאה' })
  return session
}

const asMessages = (session: CoachSessionDoc) => session.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.text }))

coachRouter.get('/coach', async (_req, res) => {
  const customer = customerOf(res)
  const sessions = await CoachSession.find({ customerId: customer._id }).sort({ updatedAt: -1 }).limit(40)
  res.json({
    sessions: sessions.map((s) => ({
      id: s.id as string,
      persona: s.persona,
      title: s.title,
      turns: s.messages.length,
      score: s.evaluation?.score ?? null,
      updatedAt: s.updatedAt,
    })),
  })
})

coachRouter.post('/coach', async (req, res) => {
  const body = parseBody(z.object({ persona: z.enum(COACH_PERSONAS) }), req, res)
  if (!body) return
  const customer = customerOf(res)
  const coach = COACHES[body.persona]
  try {
    let opener: string
    if (body.persona === 'sales') {
      // The simulated client opens the conversation.
      await useAiQuota(customer._id)
      opener = await aiText({
        system: coach.system(await customerContextText(customer)),
        messages: [{ role: 'user', content: '(The simulation starts now. Send your first message as the client.)' }],
        effort: 'low',
      })
    } else {
      opener = OPENERS[body.persona]
    }
    const session = await CoachSession.create({
      customerId: customer._id,
      persona: body.persona,
      title: coach.title,
      messages: [{ role: 'assistant', text: opener }],
    })
    res.status(201).json({ session: sessionView(session) })
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})

coachRouter.get('/coach/:id', async (req, res) => {
  const session = await findSession(customerOf(res), req.params.id, res)
  if (session) res.json({ session: sessionView(session) })
})

coachRouter.post('/coach/:id/message', async (req, res) => {
  const body = parseBody(z.object({ text: z.string().trim().min(1, 'כתבו הודעה').max(4000, 'ההודעה ארוכה מדי') }), req, res)
  if (!body) return
  const customer = customerOf(res)
  const session = await findSession(customer, req.params.id, res)
  if (!session) return
  if (session.messages.length >= MAX_TURNS) {
    res.status(409).json({ error: 'השיחה הזו ארוכה מדי. פתחו שיחה חדשה.' })
    return
  }
  const persona = session.persona as keyof typeof COACHES
  // The API needs the first message to be from the user, so the opener rides in the system prompt.
  const [opener, ...rest] = asMessages(session)
  const system = `${COACHES[persona].system(await customerContextText(customer))}\n\nYour first message in this conversation was:\n${opener?.content ?? ''}`
  try {
    await useAiQuota(customer._id)
    const reply = await aiText({ system, messages: [...rest, { role: 'user', content: body.text }], effort: 'low' })
    session.messages.push({ role: 'user', text: body.text, at: new Date() }, { role: 'assistant', text: reply, at: new Date() })
    await session.save()
    if (persona === 'mental') {
      await award(customer._id, { skill: 'mindset', points: XP.mentalSession, refKey: `mental:${dayKey()}`, label: 'שיחה עם המאמן המנטלי' })
    }
    res.json({ session: sessionView(session) })
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})

coachRouter.post('/coach/:id/evaluate', async (req, res) => {
  const customer = customerOf(res)
  const session = await findSession(customer, req.params.id, res)
  if (!session) return
  const persona = session.persona as keyof typeof COACHES
  if (persona === 'mental') {
    res.status(400).json({ error: 'אין ציון לשיחה עם המאמן המנטלי' })
    return
  }
  if (session.messages.filter((m) => m.role === 'user').length < 2) {
    res.status(409).json({ error: 'כתבו לפחות שתי הודעות לפני שמבקשים ציון.' })
    return
  }
  const transcript = session.messages
    .map((m) => `${m.role === 'user' ? (persona === 'sales' ? 'SELLER (participant)' : 'PARTICIPANT') : persona === 'sales' ? 'CLIENT (simulated)' : 'COACH'}: ${m.text}`)
    .join('\n\n')
  try {
    await useAiQuota(customer._id)
    const evaluation = await aiJson({
      schema: coachEvaluationSchema,
      system: `${COACHES[persona].evaluate}\nWrite the evaluation in Hebrew, plural address (אתם). Score honestly from 0 to 100.`,
      messages: [{ role: 'user', content: transcript }],
      effort: 'medium',
    })
    const score = Math.max(0, Math.min(100, Math.round(evaluation.score)))
    session.evaluation = {
      score,
      summary: evaluation.summary,
      strengths: evaluation.strengths.slice(0, 3),
      improvements: evaluation.improvements.slice(0, 3),
      nextStep: evaluation.nextStep,
      at: new Date(),
    }
    await session.save()
    await award(customer._id, {
      skill: SKILL_OF[persona],
      points: Math.round((score / 100) * XP.simulatorMax),
      refKey: `coach:${session.id as string}`,
      label: `${COACHES[persona].title}: ציון ${score}`,
      mode: 'best',
    })
    res.json({ session: sessionView(session) })
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})
