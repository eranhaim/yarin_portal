import type { Request, Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { z } from 'zod'

/**
 * Validates req.body against a schema.
 * On failure it sends a 400 response with field messages and returns null.
 */
export function parseBody<T extends z.ZodType>(schema: T, req: Request, res: Response): z.infer<T> | null {
  const result = schema.safeParse(req.body)
  if (result.success) return result.data
  const fields: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || '_'
    fields[field] ??= issue.message
  }
  res.status(400).json({ error: result.error.issues[0]?.message ?? 'Invalid request', fields })
  return null
}

/** Limits failed login attempts per IP address. */
export function loginRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  })
}
