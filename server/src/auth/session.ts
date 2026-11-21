import type { Request, Response } from 'express'
import { jwtVerify, SignJWT } from 'jose'
import { env, isProduction } from '../env.ts'

// Sessions are signed JWTs in httpOnly cookies. JavaScript in the page cannot read them.
// A session can carry a fingerprint (for example, of a password hash); the caller checks it,
// so a password change ends the old sessions. Admin checks live in auth/admin.ts.

type Role = 'customer' | 'admin'

const SESSION = {
  customer: { cookie: 'yp_session', path: '/api', maxAgeSeconds: 60 * 60 * 24 * 14, sameSite: 'lax' },
  admin: { cookie: 'yp_admin', path: '/api/admin', maxAgeSeconds: 60 * 60 * 8, sameSite: 'strict' },
} as const

const key = new TextEncoder().encode(env.SESSION_SECRET)

function cookieOptions(role: Role) {
  const { path, sameSite } = SESSION[role]
  return { httpOnly: true, secure: isProduction, sameSite, path } as const
}

export async function startSession(res: Response, role: Role, subject: string, fingerprint?: string): Promise<void> {
  const { cookie, maxAgeSeconds } = SESSION[role]
  const token = await new SignJWT(fingerprint ? { role, fp: fingerprint } : { role })
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

/** The session's subject and fingerprint, or null when there is no valid session for this role. */
export async function readSessionToken(req: Request, role: Role): Promise<{ subject: string; fingerprint: string | null } | null> {
  const token: unknown = req.cookies?.[SESSION[role].cookie]
  if (typeof token !== 'string') return null
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
    if (payload.role !== role || !payload.sub) return null
    return { subject: payload.sub, fingerprint: typeof payload.fp === 'string' ? payload.fp : null }
  } catch {
    return null
  }
}

/** Returns the session subject (for a customer: the customer id), or null. */
export async function readSession(req: Request, role: Role): Promise<string | null> {
  return (await readSessionToken(req, role))?.subject ?? null
}
