import { Router } from 'express'
import { dbState } from '../db.ts'

export const healthRouter = Router()

healthRouter.get('/', (_req, res) => {
  const db = dbState()
  const ok = db === 'connected'
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()) })
})
