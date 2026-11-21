import { Router, type Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { adminOf } from '../../auth/admin.ts'
import { hashPassword } from '../../auth/password.ts'
import { parseBody } from '../../http.ts'
import { Admin, toAdminAccountView, type AdminDoc } from '../../models/Admin.ts'

// Admin accounts: every admin can list, add, edit and remove admins (but not remove themselves).
export const adminsRouter = Router()

const password = z.string().min(6, 'הסיסמה צריכה לכלול לפחות 6 תווים').max(200)
const name = z.string().trim().min(1, 'חובה למלא שם').max(120, 'השם ארוך מדי')
const email = z.string().trim().toLowerCase().pipe(z.email('הזינו כתובת אימייל תקינה'))

async function findAdmin(id: string, res: Response): Promise<AdminDoc | null> {
  const admin = isValidObjectId(id) ? await Admin.findById(id) : null
  if (!admin) res.status(404).json({ error: 'המנהל לא נמצא' })
  return admin
}

async function emailTaken(value: string, exceptId?: string): Promise<boolean> {
  const existing = await Admin.findOne({ email: value })
  return Boolean(existing && existing.id !== exceptId)
}

adminsRouter.get('/', async (_req, res) => {
  const admins = await Admin.find().sort({ createdAt: 1 })
  res.json({ admins: admins.map(toAdminAccountView) })
})

adminsRouter.post('/', async (req, res) => {
  const body = parseBody(z.object({ name, email, password }), req, res)
  if (!body) return
  if (await emailTaken(body.email)) {
    res.status(409).json({ error: 'כבר קיים מנהל עם האימייל הזה', fields: { email: 'האימייל כבר בשימוש' } })
    return
  }
  const admin = await Admin.create({ name: body.name, email: body.email, passwordHash: await hashPassword(body.password) })
  res.status(201).json({ admin: toAdminAccountView(admin) })
})

adminsRouter.patch('/:id', async (req, res) => {
  const body = parseBody(z.object({ name, email, password }).partial(), req, res)
  if (!body) return
  const admin = await findAdmin(req.params.id, res)
  if (!admin) return
  if (body.email && (await emailTaken(body.email, admin.id as string))) {
    res.status(409).json({ error: 'כבר קיים מנהל עם האימייל הזה', fields: { email: 'האימייל כבר בשימוש' } })
    return
  }
  if (body.name) admin.name = body.name
  if (body.email) admin.email = body.email
  // A new password also ends that admin's open sessions (see auth/admin.ts).
  if (body.password) admin.passwordHash = await hashPassword(body.password)
  await admin.save()
  res.json({ admin: toAdminAccountView(admin) })
})

adminsRouter.delete('/:id', async (req, res) => {
  if (adminOf(res).id === req.params.id) {
    res.status(400).json({ error: 'אי אפשר למחוק את החשבון שאתם מחוברים אליו' })
    return
  }
  const admin = await findAdmin(req.params.id, res)
  if (!admin) return
  await admin.deleteOne()
  res.json({ ok: true })
})
