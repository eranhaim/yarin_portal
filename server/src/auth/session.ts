import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { jwtVerify, SignJWT } from 'jose'
import { env, isProduction } from '../env.ts'

// Sessions are signed JWTs in httpOnly cookies. JavaScript in the page cannot read them.

type Role = 'customer' | 'admin'

const SESSION = {
  customer: { cookie: 'yp_session', path: '/api', maxAgeSeconds: 60 * 60 * 24 * 14, sameSite: 'lax' },
  admin: { cookie: 'yp_admin', path: '/api/admin', maxAgeSeconds: 60 * 60 * 8, sameSite: 'strict' },
} as const

const key = new TextEncoder().encode(env.SESSION_SECRET)

const sha256 = (value: string) => createHash('sha256').update(value).digest()

// Admin sessions carry a fingerprint of ADMIN_PASSWORD.
// When the password in .env changes, all old admin sessions stop working.
const adminFingerprint = sha256(`admin-session:${env.ADMIN_PASSWORD}`).toString('base64url').slice(0, 16)

export function isAdminPassword(candidate: string): boolean {
  // Compare fixed-length digests so the check takes the same time for any input.
  return timingSafeEqual(sha256(candidate), sha256(env.ADMIN_PASSWORD))
}

function cookieOptions(role: Role) {
  const { path, sameSite } = SESSION[role]
  return { httpOnly: true, secure: isProduction, sameSite, path } as const
}

export async function startSession(res: Response, role: Role, subject: string): Promise<void> {
  const { cookie, maxAgeSeconds } = SESSION[role]
  const token = await new SignJWT(role === 'admin' ? { role, fp: adminFingerprint } : { role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(key)
  res.cookie(cookie, token, { ...cookieOptions(role), maxAge: maxAgeSeconds * 1000 })
}

export function endSession(res: Response, role: Role): void {
  res.clearCookie(SESSION[role].cookie, cookieOptions(role))
}

/** Returns the session subject (customer id, or "admin"), or null when there is no valid session. */
export async function readSession(req: Request, role: Role): Promise<string | null> {
  const token: unknown = req.cookies?.[SESSION[role].cookie]
  if (typeof token !== 'string') return null
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
    if (payload.role !== role || !payload.sub) return null
    if (role === 'admin' && payload.fp !== adminFingerprint) return null
    return payload.sub
  } catch {
    return null
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!(await readSession(req, 'admin'))) {
    res.status(401).json({ error: 'Admin login required' })
    return
  }
  next()
}
