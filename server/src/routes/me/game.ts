import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { aiJson, sendAiError, useAiQuota } from '../../ai/claude.ts'
import { REVIEW_REPLY_SYSTEM, REVIEW_SYSTEM, reviewReplySchema, reviewSchema } from '../../ai/prompts.ts'
import { answersAsText, worksheetAnswersSchema, type Quiz, type Worksheet, type WorksheetAnswers } from '../../game/content.ts'
import { XP } from '../../game/rules.ts'
import { award, gameSummary } from '../../game/xp.ts'
import { parseBody } from '../../http.ts'
import { Customer, type CustomerDoc } from '../../models/Customer.ts'
import { Lead, QuizAttempt, RevenueReport, WorksheetResponse, type WorksheetResponseDoc } from '../../models/Game.ts'
import { Submission } from '../../models/Submission.ts'
import { customerOf, openTask, planOf, skillOf } from './shared.ts'

// The game layer for customers: points summary, worksheets, the AI reviewer, quizzes,
// the revenue ladder and "bring a friend".
export const gameRouter = Router()

/** Every customer gets a short, unguessable referral code the first time it is needed. */
async function ensureReferralCode(customer: CustomerDoc): Promise<string> {
  if (customer.referralCode) return customer.referralCode
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomBytes(5).toString('base64url').replace(/[-_]/g, '').slice(0, 7).toUpperCase()
    if (code.length < 6 || (await Customer.exists({ referralCode: code }))) continue
    customer.referralCode = code
    await customer.save()
    return code
  }
  throw new Error('Could not create a referral code')
}

gameRouter.get('/game', async (_req, res) => {
  const customer = customerOf(res)
  await ensureReferralCode(customer)
  res.json({ game: await gameSummary(customer, await planOf(customer)) })
})

// ---------- Worksheet ----------

function reviewView(response: WorksheetResponseDoc | null) {
  if (!response) return { answers: {}, submittedAt: null, review: null, chat: [] }
  return {
    answers: response.answers ?? {},
    submittedAt: response.submittedAt,
    review: response.review ?? null,
    chat: response.chat.map((turn) => ({ role: turn.role, text: turn.text, at: turn.at })),
  }
}

gameRouter.get('/tasks/:taskId/worksheet', async (req, res) => {
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const response = await WorksheetResponse.findOne({ customerId: customer._id, taskId: req.params.taskId })
  res.json(reviewView(response))
})

const answersBody = z.object({ answers: worksheetAnswersSchema })

async function saveAnswers(customerId: CustomerDoc['_id'], planId: unknown, taskId: string, answers: WorksheetAnswers) {
  return WorksheetResponse.findOneAndUpdate(
    { customerId, taskId },
    { $set: { answers, planId } },
    { upsert: true, new: true },
  )
}

gameRouter.put('/tasks/:taskId/worksheet', async (req, res) => {
  const body = parseBody(answersBody, req, res)
  if (!body) return
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const response = await saveAnswers(customer._id, found.plan._id, req.params.taskId, body.answers)
  res.json(reviewView(response))
})

gameRouter.post('/tasks/:taskId/worksheet/submit', async (req, res) => {
  const body = parseBody(answersBody, req, res)
  if (!body) return
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const response = await saveAnswers(customer._id, found.plan._id, req.params.taskId, body.answers)
  response.submittedAt = new Date()
  await response.save()
  await award(customer._id, {
    skill: skillOf(found.task),
    points: XP.worksheet,
    refKey: `worksheet:${req.params.taskId}`,
    label: `מסך עבודה הוגש: ${found.task.title}`,
  })
  res.json(reviewView(response))
})

// ---------- The AI reviewer ("הבוחן") ----------

const reviewPoints = (score: number) => Math.round((Math.max(0, Math.min(100, score)) / 100) * XP.reviewMax)

gameRouter.post('/tasks/:taskId/review', async (req, res) => {
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const { task } = found
  const response = await WorksheetResponse.findOne({ customerId: customer._id, taskId: task.id })
  const files = await Submission.find({ customerId: customer._id, taskId: task.id, status: 'ready' })
  if (!response?.submittedAt && files.length === 0) {
    res.status(409).json({ error: 'הגישו קודם את מסך העבודה או קובץ, ואז הבוחן יבדוק.' })
    return
  }

  const worksheetText =
    task.worksheet && response ? answersAsText(task.worksheet as Worksheet, (response.answers ?? {}) as WorksheetAnswers) : '(no worksheet)'
  const filesText = files.length
    ? files.map((f) => `- ${f.fileName}${f.note ? ` (note: ${f.note})` : ''}`).join('\n')
    : '(no files)'
  const prompt = [
    `Task: ${task.title}`,
    `Instructions:\n${task.description || '(none)'}`,
    `Review criteria:\n${(task.rubric ?? []).map((r) => `- ${r}`).join('\n') || '- Concrete, real, complete work that follows the instructions.'}`,
    `Participant: ${customer.name}${customer.company ? `, business: ${customer.company}` : ''}`,
    `Worksheet answers:\n${worksheetText}`,
    `Files they handed in (you see only the names and notes):\n${filesText}`,
  ].join('\n\n')

  try {
    await useAiQuota(customer._id)
    const review = await aiJson({ schema: reviewSchema, system: REVIEW_SYSTEM, messages: [{ role: 'user', content: prompt }], effort: 'medium' })
    const score = Math.max(0, Math.min(100, Math.round(review.score)))
    const doc =
      response ?? (await WorksheetResponse.create({ customerId: customer._id, planId: found.plan._id, taskId: task.id, answers: {} }))
    doc.review = {
      score,
      verdict: review.verdict,
      summary: review.summary,
      strengths: review.strengths.slice(0, 3),
      improvements: review.improvements.slice(0, 4),
      questions: review.questions.slice(0, 3),
      finalScore: null,
      finalNote: '',
      reviewedAt: new Date(),
      finishedAt: null,
    }
    // The conversation restarts with the examiner's questions.
    doc.set('chat', [{ role: 'assistant', text: review.questions.slice(0, 3).join('\n'), at: new Date() }])
    await doc.save()
    await award(customer._id, { skill: skillOf(task), points: reviewPoints(score), refKey: `review:${task.id}`, label: `הבוחן בדק: ${task.title}`, mode: 'best' })
    res.json(reviewView(doc))
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})

gameRouter.post('/tasks/:taskId/review/reply', async (req, res) => {
  const body = parseBody(z.object({ message: z.string().trim().min(1, 'כתבו תשובה').max(4000, 'התשובה ארוכה מדי') }), req, res)
  if (!body) return
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const response = await WorksheetResponse.findOne({ customerId: customer._id, taskId: found.task.id })
  if (!response?.review) {
    res.status(409).json({ error: 'בקשו קודם בדיקה מהבוחן.' })
    return
  }
  if (response.review.finishedAt) {
    res.status(409).json({ error: 'הבדיקה הסתיימה. אפשר לבקש בדיקה חדשה.' })
    return
  }
  if (response.chat.length >= 12) {
    res.status(409).json({ error: 'השיחה עם הבוחן ארוכה מדי. בקשו בדיקה חדשה.' })
    return
  }

  const first = response.review
  const context = [
    `Task: ${found.task.title}`,
    `Your first review: score ${first.score}. ${first.summary}`,
    `Improvements you asked for: ${(first.improvements ?? []).join(' | ')}`,
  ].join('\n')
  const history = [...response.chat.map((t) => ({ role: t.role as 'user' | 'assistant', content: t.text })), { role: 'user' as const, content: body.message }]

  try {
    await useAiQuota(customer._id)
    const out = await aiJson({
      schema: reviewReplySchema,
      system: `${REVIEW_REPLY_SYSTEM}\n\n${context}`,
      messages: history,
      effort: 'medium',
      maxTokens: 8000,
    })
    response.chat.push({ role: 'user', text: body.message, at: new Date() }, { role: 'assistant', text: out.reply, at: new Date() })
    const score = Math.max(0, Math.min(100, Math.round(out.finalScore)))
    if (out.done || response.chat.length >= 10) {
      response.review.finalScore = score
      response.review.finalNote = out.finalNote
      response.review.finishedAt = new Date()
      await award(customer._id, { skill: skillOf(found.task), points: reviewPoints(score), refKey: `review:${found.task.id}`, label: `ציון סופי מהבוחן: ${found.task.title}`, mode: 'best' })
    }
    await response.save()
    res.json(reviewView(response))
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})

// ---------- Quiz ----------

gameRouter.post('/tasks/:taskId/quiz', async (req, res) => {
  const body = parseBody(z.object({ answers: z.array(z.number().int().min(-1).max(10)).max(20) }), req, res)
  if (!body) return
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const quiz = found.task.quiz as Quiz | null
  if (!quiz) {
    res.status(404).json({ error: 'אין חידון למשימה הזו' })
    return
  }
  const results = quiz.questions.map((q, i) => ({ correct: body.answers[i] === q.answer, answer: q.answer, explanation: q.explanation }))
  const correct = results.filter((r) => r.correct).length
  await QuizAttempt.create({ customerId: customer._id, taskId: found.task.id, answers: body.answers, correct, total: quiz.questions.length })
  const gained = await award(customer._id, {
    skill: skillOf(found.task),
    points: correct * XP.quizPerCorrect,
    refKey: `quiz:${found.task.id}`,
    label: `חידון: ${found.task.title}`,
    mode: 'best',
  })
  res.json({ correct, total: quiz.questions.length, results, gained })
})

// ---------- The road to the boss: monthly revenue ----------

gameRouter.post('/revenue', async (req, res) => {
  const body = parseBody(
    z.object({
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'חודש לא תקין'),
      amount: z.number().min(0, 'הסכום לא יכול להיות שלילי').max(100_000_000, 'הסכום גבוה מדי'),
    }),
    req,
    res,
  )
  if (!body) return
  const customer = customerOf(res)
  await RevenueReport.updateOne(
    { customerId: customer._id, month: body.month },
    { $set: { amount: Math.round(body.amount) } },
    { upsert: true },
  )
  await award(customer._id, { skill: 'business', points: XP.revenueReport, refKey: `revenue:${body.month}`, label: `דיווח הכנסות: ${body.month}` })
  res.json({ game: await gameSummary(customer, await planOf(customer)) })
})

// ---------- Bring a friend ----------

gameRouter.get('/referrals', async (_req, res) => {
  const customer = customerOf(res)
  const code = await ensureReferralCode(customer)
  const leads = await Lead.find({ referrerId: customer._id }).sort({ createdAt: -1 }).limit(100)
  res.json({
    code,
    leads: leads.map((l) => ({ id: l.id as string, name: l.name, status: l.status, createdAt: l.createdAt })),
  })
})
