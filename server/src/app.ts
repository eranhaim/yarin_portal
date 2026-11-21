import cookieParser from 'cookie-parser'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { isProduction } from './env.ts'
import { adminRouter } from './routes/admin/index.ts'
import { authRouter } from './routes/auth.ts'
import { healthRouter } from './routes/health.ts'
import { meRouter } from './routes/me.ts'

export const app = express()

// In production, two proxies sit in front of the API (the host's Caddy and the web container),
// both on private addresses. Trusting private addresses makes req.ip the real visitor IP,
// which the login rate limit needs.
app.set('trust proxy', isProduction ? 'loopback, linklocal, uniquelocal' : false)

app.use(helmet())
app.use(express.json({ limit: '100kb' }))
app.use(cookieParser())

app.use('/api/health', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/admin', adminRouter)
app.use('/api/me', meRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'לא נמצא' })
})

// Express 5 sends errors from async handlers here.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const e = err as { code?: number; status?: number; type?: string; message?: string }

  if (e.code === 11000) {
    res.status(409).json({ error: 'כבר קיים לקוח עם האימייל הזה', fields: { email: 'האימייל כבר בשימוש' } })
    return
  }
  // Errors from the body parsers (bad JSON, body too large, and so on).
  if (e.status && e.status >= 400 && e.status < 500) {
    const message = e.type === 'entity.too.large' ? 'הקובץ גדול מדי' : 'בקשה לא תקינה'
    res.status(e.status).json({ error: message })
    return
  }

  console.error(err)
  res.status(500).json({ error: 'משהו השתבש. נסו שוב.' })
})
