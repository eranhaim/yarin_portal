import { Router } from 'express'
import { aiHealth } from '../../ai/claude.ts'
import { z } from 'zod'
import { accountFingerprint, currentAdmin, isOwnerPassword, OWNER, ownerFingerprint, requireAdmin } from '../../auth/admin.ts'
import { DUMMY_HASH, verifyPassword } from '../../auth/password.ts'
import { endSession, startSession } from '../../auth/session.ts'
import { dbState } from '../../db.ts'
import { loginRateLimit, parseBody } from '../../http.ts'
import { Admin } from '../../models/Admin.ts'
import { Customer } from '../../models/Customer.ts'
import { Plan } from '../../models/Plan.ts'
import { storageStatus } from '../../storage.ts'
import { adminsRouter } from './admins.ts'
import { assetsRouter } from './assets.ts'
import { customersRouter } from './customers.ts'
import { adminGameRouter } from './game.ts'
import { brainRouter } from './brain.ts'
import { labRouter } from './lab.ts'
import { lessonsRouter } from './lessons.ts'
import { plansRouter } from './plans.ts'
import { submissionsRouter } from './submissions.ts'
import { worksRouter } from './works.ts'

export const adminRouter = Router()

// ---------- Admin session ----------
// With an email: an admin account. Without an email: the main password (ADMIN_PASSWORD in .env).

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).default(''),
  password: z.string().min(1, 'הזינו סיסמה').max(200),
})

adminRouter.post('/login', loginRateLimit(), async (req, res) => {
  const body = parseBody(loginSchema, req, res)
  if (!body) return

  if (!body.email) {
    if (!isOwnerPassword(body.password)) {
      res.status(401).json({ error: 'סיסמה שגויה' })
      return
    }
    await startSession(res, 'admin', OWNER, ownerFingerprint)
    res.json({ ok: true })
    return
  }

  const admin = await Admin.findOne({ email: body.email }).select('+passwordHash')
  // Check a dummy hash when the email is unknown, so both cases take the same time.
  const ok = await verifyPassword(body.password, admin?.passwordHash ?? DUMMY_HASH)
  if (!admin || !ok) {
    res.status(401).json({ error: 'האימייל או הסיסמה שגויים' })
    return
  }
  admin.lastLoginAt = new Date()
  await admin.save()
  await startSession(res, 'admin', admin.id as string, accountFingerprint(admin.passwordHash))
  res.json({ ok: true })
})

adminRouter.post('/logout', (_req, res) => {
  endSession(res, 'admin')
  res.json({ ok: true })
})

adminRouter.get('/me', async (req, res) => {
  const admin = await currentAdmin(req)
  res.status(admin ? 200 : 401).json({ admin })
})

// ---------- Everything below needs an admin session ----------

adminRouter.use(requireAdmin)

adminRouter.get('/status', async (_req, res) => {
  const [storage, customers, plans] = await Promise.all([
    storageStatus(),
    Customer.estimatedDocumentCount(),
    Plan.estimatedDocumentCount(),
  ])
  res.json({ db: dbState(), storage, customers, plans, ai: aiHealth() })
})

adminRouter.use('/customers', customersRouter)
adminRouter.use('/plans', plansRouter)
adminRouter.use('/admins', adminsRouter)
adminRouter.use(assetsRouter)
adminRouter.use(submissionsRouter)
adminRouter.use(adminGameRouter)
adminRouter.use(worksRouter)
adminRouter.use(brainRouter)
adminRouter.use(labRouter)
adminRouter.use(lessonsRouter)
