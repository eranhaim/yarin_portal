import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { defaultLook, type Look } from '../game/content.ts'
import { parseBody } from '../http.ts'
import { Customer } from '../models/Customer.ts'
import { getSetting, Lead } from '../models/Game.ts'

// Routes without a login: the hosts' characters for the login screen, and the "bring a friend" page.
export const publicRouter = Router()

/** Yarin and Oren as "bosses" on the login screen. The admin designs them in the settings page. */
export const HOST_DEFAULTS: Record<'yarin' | 'oren', { name: string; look: Look }> = {
  yarin: {
    name: 'ירין',
    look: { person: 'arjun', skin: 'olive', hair: 'short', hairColor: 'black', beard: 'none', mustache: false, glasses: 'sun', outfit: 'suit', outfitColor: 'black', accessory: 'phone', chain: true },
  },
  oren: {
    name: 'אורן',
    look: { person: 'james', skin: 'light', hair: 'quiff', hairColor: 'darkBrown', beard: 'none', mustache: false, glasses: 'square', outfit: 'suit', outfitColor: 'navy', accessory: 'briefcase', chain: false },
  },
}

export async function hostLooks() {
  const saved = await getSetting<Partial<Record<'yarin' | 'oren', Look>>>('hosts', {})
  return (['yarin', 'oren'] as const).map((key) => ({ key, name: HOST_DEFAULTS[key].name, look: saved[key] ?? HOST_DEFAULTS[key].look }))
}

publicRouter.get('/hosts', async (_req, res) => {
  res.json({ hosts: await hostLooks() })
})

const codeSchema = z.string().regex(/^[A-Z0-9]{6,10}$/)

publicRouter.get('/join/:code', async (req, res) => {
  const code = codeSchema.safeParse(req.params.code)
  const referrer = code.success ? await Customer.findOne({ referralCode: code.data, active: true }) : null
  if (!referrer) {
    res.status(404).json({ error: 'הקישור לא תקין' })
    return
  }
  res.json({
    referrer: {
      firstName: referrer.name.split(' ')[0],
      look: (referrer.look as Look | null) ?? defaultLook(referrer.name),
    },
    hosts: await hostLooks(),
  })
})

const joinLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'יותר מדי פניות. נסו שוב בעוד רבע שעה.' },
})

publicRouter.post('/join/:code', joinLimit, async (req, res) => {
  const body = parseBody(
    z.object({
      name: z.string().trim().min(2, 'כתבו שם מלא').max(120, 'השם ארוך מדי'),
      phone: z
        .string()
        .trim()
        .min(9, 'כתבו מספר טלפון')
        .max(40, 'מספר הטלפון ארוך מדי')
        .regex(/^[+\d\s().-]*$/, 'מספר טלפון יכול לכלול רק ספרות, רווחים ו- + - ( )'),
      email: z.union([z.literal(''), z.string().trim().toLowerCase().pipe(z.email('הזינו כתובת אימייל תקינה'))]).default(''),
      note: z.string().trim().max(1000, 'ההודעה ארוכה מדי').default(''),
    }),
    req,
    res,
  )
  if (!body) return
  const code = codeSchema.safeParse(req.params.code)
  const referrer = code.success ? await Customer.findOne({ referralCode: code.data, active: true }) : null
  if (!referrer) {
    res.status(404).json({ error: 'הקישור לא תקין' })
    return
  }
  // The same person through the same friend counts once.
  const duplicate = await Lead.findOne({ referrerId: referrer._id, phone: body.phone })
  if (!duplicate) await Lead.create({ referrerId: referrer._id, ...body })
  res.status(201).json({ ok: true })
})
