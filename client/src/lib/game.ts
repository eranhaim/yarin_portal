import type { IconName } from '../components/Icon'
import type { CoachPersona, LeadStatus, Look, SkillKey } from './types'

export const COACH_TITLES: Record<CoachPersona, string> = {
  sales: 'סימולטור מכירות',
  scripts: 'סימולטור תסריטים',
  mental: 'מאמן מנטלי',
}

/** How a referred friend's status reads, to the customer who referred them. */
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = { new: 'נרשם/ה', contacted: 'בשיחה', joined: 'הצטרף/ה!', lost: 'לא הפעם' }

// Client-side game metadata: how skills and character options look. Names and rules come from the server.

export const SKILL_META: Record<SkillKey, { label: string; icon: IconName; color: string }> = {
  business: { label: 'אבחון ומספרים', icon: 'chart', color: '#3ec1ff' },
  customer: { label: 'הכרת הלקוח', icon: 'users', color: '#2fe0b0' },
  offer: { label: 'בניית הצעה', icon: 'briefcase', color: '#ffc93c' },
  brand: { label: 'מותג אישי', icon: 'star', color: '#ff6fb5' },
  ideas: { label: 'רעיונות', icon: 'bulb', color: '#ff9f40' },
  writing: { label: 'כתיבה ותסריטים', icon: 'edit', color: '#b18cff' },
  hooks: { label: 'הוקים', icon: 'sparkles', color: '#ff5470' },
  camera: { label: 'מצלמה ותוכן', icon: 'video', color: '#7dff6a' },
  sales: { label: 'מכירות', icon: 'trophy', color: '#ffd84d' },
  mindset: { label: 'מנטליות', icon: 'gauge', color: '#9fd8ff' },
}

/** Neon colors of the city districts (plan levels), in order. */
export const DISTRICT_COLORS = ['#ff4fa3', '#2fe0b0', '#ffc93c', '#b18cff', '#4fb3ff', '#ff8a3c', '#7dff6a', '#ff5470']

export const formatShekels = (value: number) => `₪${Math.round(value).toLocaleString('he-IL')}`

/** "2026-11" -> "נובמבר 2026" */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(new Date(year!, (m ?? 1) - 1, 1))
}

export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ---------- Character options (labels for the creator, colors for the 3D model) ----------

export const SKIN: Record<Look['skin'], string> = {
  porcelain: '#f6d7c3',
  light: '#f1c6a1',
  tan: '#d9a06f',
  olive: '#c48f5f',
  brown: '#8d5a3b',
  dark: '#5b3a26',
}

export const HAIR_COLOR: Record<Look['hairColor'], string> = {
  black: '#1b1714',
  darkBrown: '#3b2417',
  brown: '#6b4126',
  blond: '#d9b35b',
  red: '#a4462a',
  gray: '#8f8f8f',
  white: '#e8e6e0',
}

export const OUTFIT_COLOR: Record<Look['outfitColor'], string> = {
  black: '#22201f',
  navy: '#1e2f5c',
  red: '#e0463a',
  gold: '#e3b23c',
  teal: '#1f9e8e',
  purple: '#7a4fd0',
  white: '#f2efe8',
  green: '#3f9a4a',
  gray: '#7c8189',
}

type Option<T extends string | boolean> = { value: T; label: string }

export const LOOK_OPTIONS = {
  skin: [
    { value: 'porcelain', label: 'בהיר מאוד' },
    { value: 'light', label: 'בהיר' },
    { value: 'tan', label: 'שזוף' },
    { value: 'olive', label: 'זית' },
    { value: 'brown', label: 'חום' },
    { value: 'dark', label: 'כהה' },
  ],
  hair: [
    { value: 'short', label: 'קצר' },
    { value: 'quiff', label: 'קוויף' },
    { value: 'slick', label: 'משוך לאחור' },
    { value: 'buzz', label: 'קצוץ' },
    { value: 'curly', label: 'מתולתל' },
    { value: 'long', label: 'ארוך' },
    { value: 'bun', label: 'קוקו' },
    { value: 'bald', label: 'קרחת' },
  ],
  hairColor: [
    { value: 'black', label: 'שחור' },
    { value: 'darkBrown', label: 'חום כהה' },
    { value: 'brown', label: 'חום' },
    { value: 'blond', label: 'בלונד' },
    { value: 'red', label: 'ג׳ינג׳י' },
    { value: 'gray', label: 'אפור' },
    { value: 'white', label: 'לבן' },
  ],
  beard: [
    { value: 'none', label: 'בלי' },
    { value: 'stubble', label: 'זיפים' },
    { value: 'short', label: 'קצר' },
    { value: 'full', label: 'מלא' },
  ],
  glasses: [
    { value: 'none', label: 'בלי' },
    { value: 'round', label: 'עגולים' },
    { value: 'square', label: 'מרובעים' },
    { value: 'sun', label: 'שמש' },
  ],
  outfit: [
    { value: 'suit', label: 'חליפה' },
    { value: 'blazer', label: 'בלייזר' },
    { value: 'hoodie', label: 'קפוצ׳ון' },
    { value: 'tee', label: 'טי-שירט' },
  ],
  outfitColor: [
    { value: 'black', label: 'שחור' },
    { value: 'navy', label: 'כחול' },
    { value: 'red', label: 'אדום' },
    { value: 'gold', label: 'זהב' },
    { value: 'teal', label: 'טורקיז' },
    { value: 'purple', label: 'סגול' },
    { value: 'white', label: 'לבן' },
    { value: 'green', label: 'ירוק' },
    { value: 'gray', label: 'אפור' },
  ],
  accessory: [
    { value: 'none', label: 'בלי' },
    { value: 'briefcase', label: 'תיק' },
    { value: 'phone', label: 'טלפון' },
    { value: 'coffee', label: 'קפה' },
  ],
} satisfies { [K in Exclude<keyof Look, 'mustache' | 'chain'>]: Option<Look[K]>[] }

export const DEFAULT_LOOK: Look = {
  skin: 'light',
  hair: 'quiff',
  hairColor: 'darkBrown',
  beard: 'none',
  mustache: false,
  glasses: 'none',
  outfit: 'blazer',
  outfitColor: 'red',
  accessory: 'briefcase',
  chain: false,
}

/** "שיעור 07 · תוכן כחלק…" -> { badge: "07", label: "תוכן כחלק…" } */
export function missionLabel(title: string, fallbackNumber: number): { badge: string; label: string } {
  const [head, ...rest] = title.split(' · ')
  const digits = head?.match(/\d+/)?.[0]
  if (rest.length > 0 && digits) return { badge: digits, label: rest.join(' · ') }
  return { badge: String(fallbackNumber), label: title }
}
