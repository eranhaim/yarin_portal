import { Router } from 'express'
import { z } from 'zod'
import { parseBody } from '../../http.ts'
import { WhatsAppMessage } from '../../models/WhatsApp.ts'
import { chatIdOf, instanceState, ownChat, whatsappConfigured } from '../../whatsapp/greenApi.ts'
import { enqueue, flush, saveWhatsappSettings, whatsappSettings } from '../../whatsapp/notify.ts'
import { texts } from '../../whatsapp/texts.ts'
import { adminOf } from '../../auth/admin.ts'

// WhatsApp (Green API): whether the account is linked, which messages are sent, a test message, and the log.
export const whatsappRouter = Router()

const phoneOf = (chat: string | null) => (chat ? chat.replace(/@c\.us$/, '') : null)

whatsappRouter.get('/whatsapp', async (_req, res) => {
  const [settings, messages, counts] = await Promise.all([
    whatsappSettings(),
    WhatsAppMessage.find().sort({ createdAt: -1 }).limit(80),
    WhatsAppMessage.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ])
  let state: string | null = null
  let number: string | null = null
  if (whatsappConfigured) {
    ;[state, number] = await Promise.all([instanceState().catch(() => 'error'), ownChat().then(phoneOf).catch(() => null)])
  }
  res.json({
    configured: whatsappConfigured,
    state,
    number,
    settings,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    messages: messages.map((m) => ({
      id: m.id as string,
      kind: m.kind,
      to: m.toName,
      phone: phoneOf(m.chatId),
      text: m.text,
      status: m.status,
      error: m.error,
      createdAt: m.createdAt,
      sendAfter: m.sendAfter,
      sentAt: m.sentAt,
    })),
  })
})

const phone = z.string().trim().max(40).refine((p) => Boolean(chatIdOf(p)), 'מספר וואטסאפ לא תקין (למשל 050-1234567)')
const settingsBody = z.object({
  enabled: z.boolean(),
  adminPhones: z.array(phone).max(4),
  kinds: z.object({
    welcome: z.boolean(),
    decision: z.boolean(),
    reminder: z.boolean(),
    monthly: z.boolean(),
    adminRequest: z.boolean(),
    adminLead: z.boolean(),
    adminDigest: z.boolean(),
    adminAi: z.boolean(),
  }),
  quiet: z.boolean(),
})

whatsappRouter.put('/whatsapp/settings', async (req, res) => {
  const body = parseBody(settingsBody, req, res)
  if (!body) return
  await saveWhatsappSettings(body)
  res.json({ settings: await whatsappSettings() })
})

/** A test message, sent at once (also at night). Without a number: to the linked account itself. */
whatsappRouter.post('/whatsapp/test', async (req, res) => {
  const body = parseBody(z.object({ phone: z.union([z.literal(''), phone]).default('') }), req, res)
  if (!body) return
  if (!whatsappConfigured) {
    res.status(503).json({ error: 'Green API לא מוגדר בשרת' })
    return
  }
  const target = body.phone || (await ownChat().catch(() => null))
  if (!target) {
    res.status(502).json({ error: 'לא הצלחנו לקרוא את המספר של חשבון הוואטסאפ המחובר' })
    return
  }
  const admin = adminOf(res)
  const key = `test:${Date.now()}`
  await enqueue({ key, kind: 'test', phone: target, toName: body.phone ? 'בדיקה' : 'המספר המחובר', text: texts.test(admin.name), urgent: true })
  await flush()
  const message = await WhatsAppMessage.findOne({ key })
  if (!message || message.status !== 'sent') {
    res.status(502).json({ error: message?.error || 'ההודעה לא נשלחה' })
    return
  }
  res.json({ ok: true })
})
