import { Router } from 'express'
import { z } from 'zod'
import { endSession, isAdminPassword, readSession, requireAdmin, startSession } from '../../auth/session.ts'
import { dbState } from '../../db.ts'
import { loginRateLimit, parseBody } from '../../http.ts'
import { Customer } from '../../models/Customer.ts'
import { Plan } from '../../models/Plan.ts'
import { storageStatus } from '../../storage.ts'
import { customersRouter } from './customers.ts'
import { plansRouter } from './plans.ts'
import { assetsRouter } from './assets.ts'

export const adminRouter = Router()

// ---------- Admin session (password from ADMIN_PASSWORD in .env) ----------

adminRouter.post('/login', loginRateLimit(), async (req, res) => {
  const body = parseBody(z.object({ password: z.string().min(1, 'הזינו את סיסמת המנהל').max(200) }), req, res)
  if (!body) return
  if (!isAdminPassword(body.password)) {
    res.status(401).json({ error: 'סיסמה שגויה' })
    return
  }
  await startSession(res, 'admin', 'admin')
  res.json({ ok: true })
})

adminRouter.post('/logout', (_req, res) => {
  endSession(res, 'admin')
  res.json({ ok: true })
})

adminRouter.get('/me', async (req, res) => {
  const ok = Boolean(await readSession(req, 'admin'))
  res.status(ok ? 200 : 401).json({ admin: ok })
})

// ---------- Everything below needs an admin session ----------

adminRouter.use(requireAdmin)

adminRouter.get('/status', async (_req, res) => {
  const [storage, customers, plans] = await Promise.all([
    storageStatus(),
    Customer.estimatedDocumentCount(),
    Plan.estimatedDocumentCount(),
  ])
  res.json({ db: dbState(), storage, customers, plans })
})

adminRouter.use('/customers', customersRouter)
adminRouter.use('/plans', plansRouter)
adminRouter.use(assetsRouter)
