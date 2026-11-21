import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { env } from '../env.ts'
import { Admin } from '../models/Admin.ts'
import { readSessionToken } from './session.ts'

// Who is signed in to the admin panel.
// Two kinds of admin sessions:
//   - "owner": opened with ADMIN_PASSWORD from .env. Changing that password ends these sessions.
//   - an admin account (subject = its id). Changing its password, or deleting it, ends its sessions.

export const OWNER = 'owner'

export type AdminIdentity = { id: string; name: string; email: string | null; owner: boolean }

const sha256 = (value: string) => createHash('sha256').update(value).digest()
const fingerprint = (value: string) => sha256(value).toString('base64url').slice(0, 16)

export const ownerFingerprint = fingerprint(`admin-session:${env.ADMIN_PASSWORD}`)

export function accountFingerprint(passwordHash: string): string {
  return fingerprint(`admin-account:${passwordHash}`)
}

export function isOwnerPassword(candidate: string): boolean {
  // Compare fixed-length digests so the check takes the same time for any input.
  return timingSafeEqual(sha256(candidate), sha256(env.ADMIN_PASSWORD))
}

export async function currentAdmin(req: Request): Promise<AdminIdentity | null> {
  const session = await readSessionToken(req, 'admin')
  if (!session) return null
  if (session.subject === OWNER) {
    return session.fingerprint === ownerFingerprint ? { id: OWNER, name: 'מנהל ראשי', email: null, owner: true } : null
  }
  const admin = isValidObjectId(session.subject) ? await Admin.findById(session.subject).select('+passwordHash') : null
  if (!admin || session.fingerprint !== accountFingerprint(admin.passwordHash)) return null
  return { id: admin.id as string, name: admin.name, email: admin.email, owner: false }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const admin = await currentAdmin(req)
  if (!admin) {
    res.status(401).json({ error: 'נדרשת התחברות מנהל' })
    return
  }
  res.locals.admin = admin
  next()
}

export const adminOf = (res: Response) => res.locals.admin as AdminIdentity
