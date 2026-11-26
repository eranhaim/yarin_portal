import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import { z } from 'zod'
import { businessFile } from '../../ai/businessFile.ts'
import { AiError, aiWorks, sendAiError, useAiQuota } from '../../ai/claude.ts'
import { readFiles } from '../../ai/files.ts'
import { methodOfTask } from '../../ai/knowledge.ts'
import { settleScore, verdictFor } from '../../ai/prompts.ts'
import { defendWork, reviewWork } from '../../ai/sessions.ts'
import { answersAsText, worksheetAnswersSchema, type Quiz, type Worksheet, type WorksheetAnswers } from '../../game/content.ts'
import { passScoreOf, TRIES_BEFORE_MOVING_ON, versionOf } from '../../game/flow.ts'
import { XP } from '../../game/rules.ts'
import { award, gameSummary } from '../../game/xp.ts'
import { parseBody } from '../../http.ts'
import { Customer, type CustomerDoc } from '../../models/Customer.ts'
import { Lead, QuizAttempt, WorksheetResponse, type WorksheetResponseDoc } from '../../models/Game.ts'
import type { TaskView } from '../../models/Plan.ts'
import { Submission } from '../../models/Submission.ts'
import { botReleased } from '../../ai/release.ts'
import { tellAdminsRequest } from '../../whatsapp/notify.ts'
import { customerOf, findTask, openTask, planOf, planView, skillOf, syncTask } from './shared.ts'

// The learning loop for customers: worksheets with versions, the AI examiner, quizzes, the summary of both
// metrics, and "bring a friend".
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

/** A check that takes longer than this was cut off (a video of five minutes takes about four). */
const REVIEW_LIMIT_MS = 12 * 60_000

const isReviewing = (response: WorksheetResponseDoc | null) => Boolean(response?.reviewingSince && Date.now() - response.reviewingSince.getTime() < REVIEW_LIMIT_MS)

export function responseView(response: WorksheetResponseDoc | null) {
  if (!response) return { answers: {}, submittedAt: null, review: null, reviewing: false, reviewError: null, chat: [], attempts: [], accepted: false, human: null }
  return {
    answers: response.answers ?? {},
    submittedAt: response.submittedAt,
    review: response.review ?? null,
    reviewing: isReviewing(response),
    reviewError: response.reviewError || null,
    chat: response.chat.map((turn) => ({ role: turn.role, text: turn.text, at: turn.at })),
    attempts: response.attempts.map((a) => ({ number: a.number ?? 1, files: a.files, submittedAt: a.submittedAt, score: a.score ?? null, summary: a.summary })),
    accepted: Boolean(response.acceptedAt),
    human:
      response.human && response.human.status !== 'none'
        ? { status: response.human.status, request: response.human.request, note: response.human.note, by: response.human.by, at: response.human.at }
        : null,
  }
}

/** The worksheet state, and the plan (its steps, the focus and the level can change). */
async function withPlan(customer: CustomerDoc, plan: Parameters<typeof planView>[1], response: WorksheetResponseDoc | null, completed = false) {
  return { view: responseView(response), plan: await planView(customer, plan), completed }
}

const findResponse = (customer: CustomerDoc, taskId: string) => WorksheetResponse.findOne({ customerId: customer._id, taskId })

gameRouter.get('/tasks/:taskId/worksheet', async (req, res) => {
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  res.json({ view: responseView(await findResponse(customer, req.params.taskId)) })
})

const answersBody = z.object({ answers: worksheetAnswersSchema })

async function saveAnswers(customerId: CustomerDoc['_id'], planId: unknown, taskId: string, answers: WorksheetAnswers) {
  return WorksheetResponse.findOneAndUpdate({ customerId, taskId }, { $set: { answers, planId } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true })
}

// A draft. It saves by itself while the customer writes.
gameRouter.put('/tasks/:taskId/worksheet', async (req, res) => {
  const body = parseBody(answersBody, req, res)
  if (!body) return
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const response = await saveAnswers(customer._id, found.plan._id, req.params.taskId, body.answers)
  res.json({ view: responseView(response) })
})

function filledFields(ws: Worksheet, answers: WorksheetAnswers): number {
  return ws.sections
    .flatMap((s) => s.fields)
    .filter((field) => {
      const value = answers[field.id]
      if (Array.isArray(value)) return value.some((row) => (Array.isArray(row) ? row.some((c) => c.trim()) : String(row).trim()))
      return value !== undefined && String(value).trim() !== ''
    }).length
}

// Handing in makes a new version. Earlier versions stay, so the customer sees how the work improves.
gameRouter.post('/tasks/:taskId/worksheet/submit', async (req, res) => {
  const body = parseBody(answersBody, req, res)
  if (!body) return
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const { task, plan } = found
  const worksheet = task.worksheet as Worksheet | null
  if (!worksheet) {
    res.status(404).json({ error: 'אין מסך עבודה למשימה הזו' })
    return
  }
  if (isReviewing(await findResponse(customer, task.id))) {
    res.status(409).json({ error: 'הבוחן קורא עכשיו את הגרסה הקודמת. חכו לתשובה, ואז הגישו.' })
    return
  }
  const files = await Submission.find({ customerId: customer._id, taskId: task.id, status: 'ready' }).sort({ createdAt: 1 })
  if (filledFields(worksheet, body.answers) === 0 && files.length === 0) {
    res.status(409).json({ error: 'מסך העבודה ריק. מלאו לפחות חלק ממנו, או צרפו קובץ.' })
    return
  }
  const response = await saveAnswers(customer._id, plan._id, task.id, body.answers)
  response.submittedAt = new Date()
  response.acceptedAt = null
  response.seenAt = null
  response.attempts.push({
    number: versionOf(response) + 1,
    answers: body.answers,
    files: files.map((f) => f.fileName),
    submittedAt: new Date(),
    score: null,
    summary: '',
  })
  // Keep the first version and the newest ones; the documents stay small.
  if (response.attempts.length > 12) response.attempts.splice(1, 1)
  await response.save()
  await award(customer._id, { skill: skillOf(task), points: XP.worksheet, refKey: `worksheet:${task.id}`, label: `מסך עבודה הוגש: ${task.title}` })
  const completed = await syncTask(customer, plan, task)
  res.json(await withPlan(customer, plan, response, completed))
})

// ---------- The AI examiner ("הבוחן") ----------

const reviewPoints = (score: number) => Math.round((Math.max(0, Math.min(100, score)) / 100) * XP.reviewMax)

async function awardReview(customer: CustomerDoc, task: TaskView, score: number, label: string) {
  await award(customer._id, { skill: skillOf(task), points: reviewPoints(score), refKey: `review:${task.id}`, label, mode: 'best' })
}

/** The worksheet as text. Version numbers come from the stored attempts. */
const workText = (task: TaskView, answers: unknown) =>
  task.worksheet ? answersAsText(task.worksheet as Worksheet, (answers ?? {}) as WorksheetAnswers) : '(this task has no worksheet; judge the files)'

/** Reads the work and stores the review. It runs after the answer, because a video can take minutes. */
async function runReview(customerId: string, taskId: string): Promise<void> {
  const customer = await Customer.findById(customerId)
  const found = customer ? await findTask(customer, taskId) : null
  const doc = customer ? await findResponse(customer, taskId) : null
  if (!customer || !found || !doc) return
  const { task, plan } = found
  const files = await Submission.find({ customerId: customer._id, taskId, status: 'ready' }).sort({ createdAt: 1 })
  const attempt = doc.attempts[doc.attempts.length - 1]!
  const before = doc.attempts.length > 1 ? doc.attempts[doc.attempts.length - 2]! : null
  const [read, method, business] = await Promise.all([
    readFiles(files.map((f) => ({ name: f.fileName, contentType: f.contentType, size: f.size, key: f.key, note: f.note }))),
    methodOfTask(task.id),
    businessFile(customer, { plan, skipTaskId: task.id }),
  ])
  const review = await reviewWork({
    task: { title: task.title, description: task.description, rubric: task.rubric },
    method,
    business,
    worksheet: workText(task, attempt.answers),
    files: read.content,
    previous: before
      ? { number: before.number ?? 1, score: before.score ?? null, improvements: doc.review?.improvements ?? [], worksheet: workText(task, before.answers) }
      : null,
  })
  const score = settleScore(review.score, review.criteria)
  const pass = passScoreOf(task)
  const questions = review.questions.slice(0, 2)
  doc.set('review', {
    attempt: attempt.number ?? versionOf(doc),
    score,
    verdict: verdictFor(score, pass),
    summary: review.summary,
    strengths: review.strengths.slice(0, 3),
    improvements: review.improvements.slice(0, 3),
    questions,
    criteria: review.criteria.slice(0, 12),
    progress: before ? review.progress : '',
    filesRead: read.read,
    filesSkipped: read.skipped,
    finalScore: null,
    finalNote: '',
    reviewedAt: new Date(),
    // Work that is not there yet goes back for a fix; only good work has a defense.
    finishedAt: score >= pass && questions.length > 0 ? null : new Date(),
  })
  attempt.score = score
  attempt.summary = review.summary.slice(0, 600)
  doc.markModified('attempts')
  doc.set('chat', score >= pass && questions.length > 0 ? [{ role: 'assistant', text: questions.join('\n'), at: new Date() }] : [])
  doc.reviewingSince = null
  doc.reviewError = ''
  await doc.save()
  await awardReview(customer, task, score, `הבוחן בדק: ${task.title}`)
  // The customer may have done something else meanwhile, so the progress is read again before it changes.
  const fresh = await Customer.findById(customerId)
  if (fresh) await syncTask(fresh, plan, task)
}

/** Starts the check. The customer's screen follows it with GET. */
gameRouter.post('/tasks/:taskId/review', async (req, res) => {
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const { task, plan } = found
  if (!(await botReleased('reviewer'))) {
    res.status(503).json({ error: aiWorks() ? 'הבוחן בבדיקות איכות. ירין ואורן יעברו על העבודה.' : 'הבוחן בהפסקה קצרה. ירין ואורן יעברו על העבודה.' })
    return
  }
  const response = await findResponse(customer, task.id)
  const files = await Submission.find({ customerId: customer._id, taskId: task.id, status: 'ready' }).sort({ createdAt: 1 })
  if (!response?.submittedAt && files.length === 0) {
    res.status(409).json({ error: 'הגישו קודם את מסך העבודה או קובץ, ואז הבוחן יבדוק.' })
    return
  }
  // A second press (or a second tab) joins the check that already runs.
  if (isReviewing(response)) {
    res.status(202).json(await withPlan(customer, plan, response))
    return
  }

  try {
    await useAiQuota(customer._id)
    const doc =
      response ?? (await WorksheetResponse.create({ customerId: customer._id, planId: plan._id, taskId: task.id, answers: {} }))
    if (versionOf(doc) === 0) {
      doc.attempts.push({ number: 1, answers: doc.answers ?? {}, files: files.map((f) => f.fileName), submittedAt: new Date(), score: null, summary: '' })
      doc.submittedAt ??= new Date()
    }
    doc.reviewingSince = new Date()
    doc.reviewError = ''
    await doc.save()
    const customerId = customer.id as string
    void runReview(customerId, task.id).catch(async (err: unknown) => {
      if (!(err instanceof AiError)) console.error(`Review of task ${task.id} failed`, err)
      const why = err instanceof AiError ? err.message : 'הבדיקה נעצרה באמצע. נסו שוב בעוד רגע.'
      await WorksheetResponse.updateOne({ customerId, taskId: task.id }, { $set: { reviewingSince: null, reviewError: why } }).catch(() => undefined)
    })
    res.status(202).json(await withPlan(customer, plan, doc))
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})

/** The work and the plan while a check runs, and after it ends. */
gameRouter.get('/tasks/:taskId/review', async (req, res) => {
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  res.json(await withPlan(customer, found.plan, await findResponse(customer, found.task.id)))
})

gameRouter.post('/tasks/:taskId/review/reply', async (req, res) => {
  const body = parseBody(z.object({ message: z.string().trim().min(1, 'כתבו תשובה').max(4000, 'התשובה ארוכה מדי') }), req, res)
  if (!body) return
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const { task, plan } = found
  const response = await findResponse(customer, task.id)
  if (!response?.review) {
    res.status(409).json({ error: 'בקשו קודם בדיקה מהבוחן.' })
    return
  }
  if (response.review.finishedAt) {
    res.status(409).json({ error: 'הבדיקה הסתיימה. אפשר להגיש גרסה חדשה.' })
    return
  }

  const first = response.review
  try {
    await useAiQuota(customer._id)
    const out = await defendWork({
      title: task.title,
      method: await methodOfTask(task.id),
      score: first.score ?? 0,
      summary: first.summary ?? '',
      improvements: first.improvements ?? [],
      worksheet: workText(task, response.answers),
      chat: response.chat.map((t) => ({ role: t.role as 'user' | 'assistant', text: t.text })),
      message: body.message,
    })
    response.chat.push({ role: 'user', text: body.message, at: new Date() }, { role: 'assistant', text: out.reply, at: new Date() })
    if (out.done || response.chat.length >= 5) {
      const start = first.score ?? 0
      const score = Math.round(Math.max(0, start - 15, Math.min(100, start + 15, out.finalScore)))
      response.review.finalScore = score
      response.review.finalNote = out.finalNote
      response.review.verdict = verdictFor(score, passScoreOf(task))
      response.review.finishedAt = new Date()
      const attempt = response.attempts[response.attempts.length - 1]
      if (attempt) {
        attempt.score = score
        response.markModified('attempts')
      }
      await awardReview(customer, task, score, `ציון סופי מהבוחן: ${task.title}`)
    }
    await response.save()
    const completed = await syncTask(customer, plan, task)
    res.json(await withPlan(customer, plan, response, completed))
  } catch (err) {
    if (!sendAiError(err, res)) throw err
  }
})

/** Nobody gets stuck: after a few checked versions the customer may go on, and Yarin and Oren see it. */
gameRouter.post('/tasks/:taskId/move-on', async (req, res) => {
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const response = await findResponse(customer, found.task.id)
  const tries = response?.attempts.filter((a) => a.score !== null && a.score !== undefined).length ?? 0
  if (!response || tries < TRIES_BEFORE_MOVING_ON) {
    res.status(409).json({ error: 'נסו עוד גרסה אחת לפני שממשיכים. אתם קרובים.' })
    return
  }
  response.acceptedAt = new Date()
  response.human = { status: 'requested', request: 'הלקוח המשיך הלאה עם עבודה שלא עברה את הבוחן.', note: '', by: '', at: null }
  await response.save()
  tellAdminsRequest(customer.name, response.id as string, found.task.title, response.human.request ?? '')
  const completed = await syncTask(customer, found.plan, found.task)
  res.json(await withPlan(customer, found.plan, response, completed))
})

/** "I want Yarin or Oren to look at this." */
gameRouter.post('/tasks/:taskId/human-check', async (req, res) => {
  const body = parseBody(z.object({ message: z.string().trim().max(1000, 'ההודעה ארוכה מדי').default('') }), req, res)
  if (!body) return
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const response = await findResponse(customer, found.task.id)
  if (!response?.submittedAt) {
    res.status(409).json({ error: 'הגישו קודם את העבודה.' })
    return
  }
  response.human = { status: 'requested', request: body.message, note: response.human?.note ?? '', by: '', at: null }
  response.seenAt = null
  await response.save()
  tellAdminsRequest(customer.name, response.id as string, found.task.title, body.message)
  res.json(await withPlan(customer, found.plan, response))
})

// ---------- Quiz ----------

gameRouter.post('/tasks/:taskId/quiz', async (req, res) => {
  const body = parseBody(z.object({ answers: z.array(z.number().int().min(-1).max(10)).max(20) }), req, res)
  if (!body) return
  const customer = customerOf(res)
  const found = await openTask(customer, req.params.taskId, res)
  if (!found) return
  const { task, plan } = found
  const quiz = task.quiz as Quiz | null
  if (!quiz) {
    res.status(404).json({ error: 'אין חידון למשימה הזו' })
    return
  }
  const results = quiz.questions.map((q, i) => ({ correct: body.answers[i] === q.answer, answer: q.answer, explanation: q.explanation }))
  const correct = results.filter((r) => r.correct).length
  await QuizAttempt.create({ customerId: customer._id, taskId: task.id, answers: body.answers, correct, total: quiz.questions.length })
  const gained = await award(customer._id, {
    skill: skillOf(task),
    points: correct * XP.quizPerCorrect,
    refKey: `quiz:${task.id}`,
    label: `חידון: ${task.title}`,
    mode: 'best',
  })
  const completed = await syncTask(customer, plan, task)
  res.json({ correct, total: quiz.questions.length, results, gained, plan: await planView(customer, plan), completed })
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
