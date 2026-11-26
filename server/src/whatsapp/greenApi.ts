import { env } from '../env.ts'

// A small client for Green API (green-api.com), which sends WhatsApp messages from a linked WhatsApp account.
// Every request is {host}/waInstance{idInstance}/{method}/{apiTokenInstance}. The token is part of the address,
// so addresses are never logged.

export const whatsappConfigured = Boolean(env.GREEN_API_ID && env.GREEN_API_TOKEN)

const host = () => (env.GREEN_API_URL ?? `https://${env.GREEN_API_ID!.slice(0, 4)}.api.greenapi.com`).replace(/\/+$/, '')
const address = (method: string) => `${host()}/waInstance${env.GREEN_API_ID}/${method}/${env.GREEN_API_TOKEN}`

export class WhatsAppError extends Error {
  /** quota = the plan's limit (HTTP 466); auth = bad id or token; offline = the phone is not linked; other. */
  readonly kind: 'quota' | 'auth' | 'offline' | 'other'
  constructor(kind: WhatsAppError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

async function call<T>(method: string, body?: unknown): Promise<T> {
  if (!whatsappConfigured) throw new WhatsAppError('auth', 'WhatsApp is not configured')
  let res: Response
  try {
    res = await fetch(address(method), {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    throw new WhatsAppError('other', `Green API ${method}: ${err instanceof Error ? err.name : 'network error'}`)
  }
  if (res.status === 466) throw new WhatsAppError('quota', 'Green API: the plan limit was reached (466)')
  if (res.status === 401 || res.status === 403) throw new WhatsAppError('auth', `Green API: the id or the token is wrong (${res.status})`)
  if (!res.ok) throw new WhatsAppError('other', `Green API ${method}: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`)
  return (await res.json()) as T
}

export type InstanceState = 'authorized' | 'notAuthorized' | 'blocked' | 'sleepMode' | 'starting' | 'yellowCard' | string

/** Whether the WhatsApp account is linked and ready. */
export async function instanceState(): Promise<InstanceState> {
  const out = await call<{ stateInstance: InstanceState }>('getStateInstance')
  return out.stateInstance
}

/** The linked account's own chat ("972501234567@c.us"). */
export async function ownChat(): Promise<string | null> {
  const out = await call<{ wid?: string }>('getSettings')
  return out.wid || null
}

/** Sends a text; returns Green API's message id. */
export async function sendText(chatId: string, message: string): Promise<string> {
  const out = await call<{ idMessage?: string }>('sendMessage', { chatId, message, linkPreview: false })
  return out.idMessage ?? ''
}

/**
 * A phone number as a WhatsApp chat id. Israeli numbers may be local (050-1234567) or international
 * (+972 50 123 4567); numbers of other countries need their country code. null = not a usable number.
 */
export function chatIdOf(phone: string | null | undefined): string | null {
  if (!phone) return null
  if (/@c\.us$/.test(phone)) return phone
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `972${digits.slice(1)}`
  if (digits.length < 10 || digits.length > 15) return null
  // An Israeli mobile number has 9 digits after 972, starting with 5.
  if (digits.startsWith('972') && !/^9725\d{8}$/.test(digits)) return null
  return `${digits}@c.us`
}
