import type { Types } from 'mongoose'
import { aiEnabled, aiHealth } from '../ai/claude.ts'
import { Customer, type CustomerDoc } from '../models/Customer.ts'
import { BusinessReport, CoachSession, getSetting, Lead, putSetting, WatchProgress, WorksheetResponse, XpEvent } from '../models/Game.ts'
import { Plan } from '../models/Plan.ts'
import { WhatsAppMessage, type WhatsAppKind } from '../models/WhatsApp.ts'
import { chatIdOf, ownChat, sendText, WhatsAppError, whatsappConfigured } from './greenApi.ts'
import { texts } from './texts.ts'

// WhatsApp messages: every message goes into a queue (one document, with a unique key), and a loop sends them.
// Nothing goes out at night or on Shabbat (unless the admins turn that off); such messages wait for the morning.
// Customers can turn the messages off (Customer.whatsapp); the admins choose which kinds are sent.

export type WhatsAppSettings = {
  /** All messages on or off. */
  enabled: boolean
  /** Yarin's and Oren's numbers. Empty = the linked WhatsApp account's own chat. */
  adminPhones: string[]
  kinds: Record<Exclude<WhatsAppKind, 'test'>, boolean>
  /** No messages at night (21:00-08:30) and from Friday 13:30 to Saturday night. */
  quiet: boolean
}

export const DEFAULT_SETTINGS: WhatsAppSettings = {
  enabled: true,
  adminPhones: [],
  kinds: { welcome: true, decision: true, reminder: true, monthly: true, adminRequest: true, adminLead: true, adminDigest: true, adminAi: true },
  quiet: true,
}

export async function whatsappSettings(): Promise<WhatsAppSettings> {
  const saved = await getSetting<Partial<WhatsAppSettings>>('whatsapp', {})
  return { ...DEFAULT_SETTINGS, ...saved, kinds: { ...DEFAULT_SETTINGS.kinds, ...saved.kinds } }
}

export async function saveWhatsappSettings(settings: WhatsAppSettings): Promise<void> {
  await putSetting('whatsapp', settings)
}

// ---------- Israel time and quiet hours ----------

const ZONE = 'Asia/Jerusalem'
const format = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** The time in Israel: weekday (0 = Sunday), minutes after midnight, the date and the month. */
export function israelTime(at: Date) {
  const parts = Object.fromEntries(format.formatToParts(at).map((p) => [p.type, p.value]))
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday!)
  return { weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute), date: `${parts.year}-${parts.month}-${parts.day}`, month: `${parts.year}-${parts.month}`, day: Number(parts.day) }
}

/** Sunday to Thursday 08:30-21:00, Friday 08:30-13:30, no messages on Saturday. */
export function quietAt(at: Date): boolean {
  const { weekday, minutes } = israelTime(at)
  if (weekday === 6) return true
  if (minutes < 8 * 60 + 30) return true
  return minutes >= (weekday === 5 ? 13 * 60 + 30 : 21 * 60)
}

/** The first moment at or after `at` when a message may go out. */
export function nextAllowed(at: Date, quiet: boolean): Date {
  if (!quiet) return at
  const t = new Date(at)
  for (let i = 0; i < 4 * 24 * 4 && quietAt(t); i++) t.setTime(t.getTime() + 15 * 60_000)
  return t
}

// ---------- The queue ----------

type Outgoing = {
  key: string
  kind: WhatsAppKind
  phone: string | null
  toName: string
  text: string
  customerId?: Types.ObjectId | null
  urgent?: boolean
}

/** Puts a message in the queue (once per key). Returns false when it is not sent (off, no number, ...). */
export async function enqueue(message: Outgoing, settings?: WhatsAppSettings): Promise<boolean> {
  if (!whatsappConfigured) return false
  const s = settings ?? (await whatsappSettings())
  if (message.kind !== 'test' && (!s.enabled || !s.kinds[message.kind])) return false
  const chatId = chatIdOf(message.phone)
  if (!chatId) return false
  const now = new Date()
  const result = await WhatsAppMessage.updateOne(
    { key: message.key },
    {
      $setOnInsert: {
        kind: message.kind,
        chatId,
        toName: message.toName,
        customerId: message.customerId ?? null,
        text: message.text,
        urgent: Boolean(message.urgent),
        sendAfter: message.urgent ? now : nextAllowed(now, s.quiet),
      },
    },
    { upsert: true },
  )
  if (result.upsertedCount > 0) void flush()
  return result.upsertedCount > 0
}

let ownChatCache: { chat: string | null; at: number } | null = null
async function adminChats(s: WhatsAppSettings): Promise<{ phone: string; name: string }[]> {
  const listed = s.adminPhones.filter((p) => chatIdOf(p)).map((phone) => ({ phone, name: 'מנהל' }))
  if (listed.length > 0) return listed
  if (!ownChatCache || Date.now() - ownChatCache.at > 3_600_000) ownChatCache = { chat: await ownChat().catch(() => null), at: Date.now() }
  return ownChatCache.chat ? [{ phone: ownChatCache.chat, name: 'המספר המחובר' }] : []
}

/** One message to each admin number. */
export async function notifyAdmins(kind: WhatsAppKind, key: string, text: string): Promise<void> {
  if (!whatsappConfigured) return
  const s = await whatsappSettings()
  if (!s.enabled || (kind !== 'test' && !s.kinds[kind])) return
  for (const admin of await adminChats(s)) await enqueue({ key: `${key}:${chatIdOf(admin.phone)}`, kind, phone: admin.phone, toName: admin.name, text }, s)
}

const ERRORS: Record<WhatsAppError['kind'], string> = {
  quota: 'המכסה של התוכנית ב-Green API נגמרה (בתוכנית החינמית: 3 צ׳אטים בחודש)',
  auth: 'המזהה או הטוקן של Green API לא נכונים',
  offline: 'חשבון הוואטסאפ לא מחובר ל-Green API',
  other: 'שגיאה זמנית בשליחה',
}

let flushing = false
/** Sends what is due, oldest first. A temporary error tries again later (up to 4 times). */
export async function flush(): Promise<void> {
  if (flushing || !whatsappConfigured) return
  flushing = true
  try {
    const s = await whatsappSettings()
    for (let round = 0; round < 5; round++) {
      const due = await WhatsAppMessage.find({ status: 'queued', sendAfter: { $lte: new Date() } }).sort({ createdAt: 1 }).limit(20)
      if (due.length === 0) break
      for (const message of due) {
        if (!message.urgent && s.quiet && quietAt(new Date())) {
          message.sendAfter = nextAllowed(new Date(), true)
          await message.save()
          continue
        }
        try {
          message.providerId = await sendText(message.chatId, message.text)
          message.status = 'sent'
          message.sentAt = new Date()
          message.error = ''
        } catch (err) {
          const kind = err instanceof WhatsAppError ? err.kind : 'other'
          message.tries += 1
          message.error = ERRORS[kind]
          if (kind === 'quota' || kind === 'auth' || message.tries >= 4) message.status = 'failed'
          else message.sendAfter = new Date(Date.now() + message.tries * 10 * 60_000)
          console.warn(`WhatsApp message ${message.kind} not sent: ${err instanceof Error ? err.message : err}`)
        }
        await message.save()
      }
    }
  } finally {
    flushing = false
  }
}

// ---------- Customers ----------

const reachable = (c: CustomerDoc) => c.active && c.whatsapp !== false && Boolean(chatIdOf(c.phone))

export function welcomeCustomer(c: CustomerDoc): void {
  if (!reachable(c)) return
  void enqueue({ key: `welcome:${c.id}`, kind: 'welcome', phone: c.phone, toName: c.name, customerId: c._id, text: texts.welcome(c.name, c.email) }).catch(logError)
}

/** Yarin's or Oren's answer on a work. */
export function tellDecision(c: CustomerDoc, workId: string, at: Date, action: 'approve' | 'return' | 'note', task: string, note: string, by: string): void {
  if (!reachable(c)) return
  const text = action === 'approve' ? texts.approved(c.name, task, note, by) : action === 'return' ? texts.returned(c.name, task, note, by) : texts.note(c.name, task, note, by)
  void enqueue({ key: `decision:${workId}:${at.getTime()}`, kind: 'decision', phone: c.phone, toName: c.name, customerId: c._id, text }).catch(logError)
}

/** A customer asked for a personal check (or moved on with work that did not pass). */
export function tellAdminsRequest(customer: string, workId: string, task: string, request: string): void {
  // Pressing twice within ten minutes sends one message.
  void notifyAdmins('adminRequest', `request:${workId}:${Math.floor(Date.now() / 600_000)}`, texts.adminRequest(customer, task, request)).catch(logError)
}

export function tellAdminsLead(leadId: string, lead: string, phone: string, referrer: string, note: string): void {
  void notifyAdmins('adminLead', `lead:${leadId}`, texts.adminLead(lead, phone, referrer, note)).catch(logError)
}

const logError = (err: unknown) => console.error('WhatsApp', err)

// ---------- Scheduled messages ----------

const DAY = 86_400_000

/** The last time the customer did anything in the program. */
async function lastActivity(c: CustomerDoc): Promise<Date> {
  const filter = { customerId: c._id }
  const latest = await Promise.all([
    XpEvent.findOne(filter).sort({ createdAt: -1 }).select('createdAt').lean(),
    WatchProgress.findOne(filter).sort({ updatedAt: -1 }).select('updatedAt').lean(),
    WorksheetResponse.findOne(filter).sort({ updatedAt: -1 }).select('updatedAt').lean(),
    CoachSession.findOne(filter).sort({ updatedAt: -1 }).select('updatedAt').lean(),
    BusinessReport.findOne(filter).sort({ updatedAt: -1 }).select('updatedAt').lean(),
  ])
  const times = [c.lastLoginAt, c.planAssignedAt, c.createdAt, ...latest.map((d) => (d as { updatedAt?: Date; createdAt?: Date } | null)?.updatedAt ?? (d as { createdAt?: Date } | null)?.createdAt)]
  return new Date(Math.max(...times.map((t) => (t ? new Date(t).getTime() : 0))))
}

const customersToReach = async () => (await Customer.find({ active: true, planId: { $ne: null }, phone: { $nin: ['', null] }, whatsapp: { $ne: false } })).filter(reachable)

/** After 3 and after 7 quiet days: the next task. Never more than these two for one quiet period. */
async function remind(s: WhatsAppSettings): Promise<void> {
  if (!s.kinds.reminder) return
  const { planView } = await import('../routes/me/shared.ts')
  for (const c of await customersToReach()) {
    const last = await lastActivity(c)
    const idle = (Date.now() - last.getTime()) / DAY
    const step = idle >= 7 ? 2 : idle >= 3 ? 1 : 0
    if (!step) continue
    const key = `reminder:${c.id}:${last.toISOString().slice(0, 10)}:${step}`
    if (await WhatsAppMessage.exists({ key })) continue
    const plan = await Plan.findById(c.planId)
    if (!plan) continue
    const { focus } = await planView(c, plan)
    if (focus.kind === 'finished') continue
    await enqueue({ key, kind: 'reminder', phone: c.phone, toName: c.name, customerId: c._id, text: texts.reminder(c.name, focus.title, focus.minutes, step === 2) }, s)
  }
}

const monthName = (month: string) => new Intl.DateTimeFormat('he-IL', { month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-15T00:00:00Z`))

/** On the 1st-3rd of the month: the business numbers of the month that ended, if they are missing. */
async function askForNumbers(s: WhatsAppSettings, now: ReturnType<typeof israelTime>): Promise<void> {
  if (!s.kinds.monthly || now.day > 3) return
  const [y, m] = now.month.split('-').map(Number) as [number, number]
  const previous = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  for (const c of await customersToReach()) {
    if (await BusinessReport.exists({ customerId: c._id, month: previous })) continue
    await enqueue({ key: `monthly:${c.id}:${previous}`, kind: 'monthly', phone: c.phone, toName: c.name, customerId: c._id, text: texts.monthly(c.name, monthName(previous)) }, s)
  }
}

/** Every morning: work to check, new leads, and customers who went quiet. Only when there is something. */
async function morningDigest(s: WhatsAppSettings, now: ReturnType<typeof israelTime>): Promise<void> {
  if (!s.kinds.adminDigest || now.minutes < 8 * 60 + 45 || now.minutes > 11 * 60) return
  const key = `digest:${now.date}`
  if (await WhatsAppMessage.exists({ key: new RegExp(`^${key}:`) })) return
  const { OPEN_WORKS } = await import('../routes/admin/works.ts')
  const [open, requested, leads, customers] = await Promise.all([
    WorksheetResponse.countDocuments(OPEN_WORKS),
    WorksheetResponse.countDocuments({ 'human.status': 'requested' }),
    Lead.countDocuments({ status: 'new' }),
    Customer.find({ active: true, planId: { $ne: null } }),
  ])
  const idle: string[] = []
  for (const c of customers) if (Date.now() - (await lastActivity(c)).getTime() >= 7 * DAY) idle.push(c.name)
  if (open + leads + idle.length === 0) return
  await notifyAdmins('adminDigest', key, texts.adminDigest(open, requested, leads, idle))
}

let aiDownSince: string | null = null
/** When the AI stops (credit, key) and when it works again. */
async function watchAi(): Promise<void> {
  if (!aiEnabled) return
  const health = aiHealth()
  if (!health.ok && health.since) {
    const since = new Date(health.since).toISOString()
    if (aiDownSince !== since) {
      aiDownSince = since
      await notifyAdmins('adminAi', `ai-down:${since}`, texts.aiDown(health.reason))
    }
  } else if (health.ok && aiDownSince) {
    const since = aiDownSince
    aiDownSince = null
    await notifyAdmins('adminAi', `ai-up:${since}`, texts.aiUp())
  }
}

let lastPlanned = 0
async function tick(): Promise<void> {
  try {
    await watchAi()
    const s = await whatsappSettings()
    // The scheduled kinds are checked twice an hour, in the day only.
    if (s.enabled && Date.now() - lastPlanned > 30 * 60_000 && !quietAt(new Date())) {
      lastPlanned = Date.now()
      const now = israelTime(new Date())
      await morningDigest(s, now)
      if (now.minutes >= 10 * 60 && now.minutes <= 19 * 60) {
        await askForNumbers(s, now)
        await remind(s)
      }
    }
    await flush()
  } catch (err) {
    console.error('The WhatsApp loop stopped early', err)
  }
}

/** The sending loop and the scheduled messages (production only: a developer's computer sends nothing). */
export function startWhatsApp(): void {
  if (!whatsappConfigured) {
    console.warn('WhatsApp (Green API) is not configured. No messages are sent.')
    return
  }
  setTimeout(() => void tick(), 20_000).unref()
  setInterval(() => void tick(), 60_000).unref()
}
