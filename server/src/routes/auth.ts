import { Router } from 'express'
import { z } from 'zod'
import { DUMMY_HASH, verifyPassword } from '../auth/password.ts'
import { endSession, readSession, startSession } from '../auth/session.ts'
import { loginRateLimit, parseBody } from '../http.ts'
import { Customer, toCustomerView } from '../models/Customer.ts'

// Customer login, logout and "who am I".
export const authRouter = Router()

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Enter your password').max(200),
})

authRouter.post('/login', loginRateLimit(), async (req, res) => {
  const body = parseBody(loginSchema, req, res)
  if (!body) return

  const customer = await Customer.findOne({ email: body.email }).select('+passwordHash')
  const passwordOk = await verifyPassword(body.password, customer?.passwordHash ?? DUMMY_HASH)

  if (!customer || !passwordOk) {
    res.status(401).json({ error: 'Incorrect email or password' })
    return
  }
  if (!customer.active) {
    res.status(403).json({ error: 'This account is not active. Please contact Yarin.' })
    return
  }

  customer.lastLoginAt = new Date()
  await customer.save()
  await startSession(res, 'customer', customer.id)
  res.json({ customer: await toCustomerView(customer) })
})

authRouter.post('/logout', (_req, res) => {
  endSession(res, 'customer')
  res.json({ ok: true })
})

authRouter.get('/me', async (req, res) => {
  const id = await readSession(req, 'customer')
  const customer = id ? await Customer.findById(id) : null
  if (!customer || !customer.active) {
    endSession(res, 'customer')
    res.status(401).json({ error: 'Not logged in' })
    return
  }
  res.json({ customer: await toCustomerView(customer) })
})
