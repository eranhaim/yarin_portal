import type { IconName } from '../components/Icon'
import type { CoachPersona, LeadStatus, Look, SkillKey, StepKey } from './types'

export const COACH_TITLES: Record<CoachPersona, string> = {
  sales: 'סימולטור מכירות',
  scripts: 'מאמן תסריטים',
  mental: 'מאמן מנטלי',
}

export const COACH_META: Record<CoachPersona, { icon: IconName; color: string; tagline: string }> = {
  sales: { icon: 'phone', color: '#e6b04a', tagline: 'מתאמנים על שיחות אמיתיות, עם לקוח שמתנגד כמו בחיים.' },
  scripts: { icon: 'edit', color: '#9aa7f0', tagline: 'מרעיון לתסריט מוכן לצילום, ובדיקה של סרטונים אמיתיים.' },
  mental: { icon: 'gauge', color: '#6fc3b2', tagline: 'ביטחון, התמדה ופחד ממכירה. כל שיחה נגמרת בצעד קטן.' },
}

export const STEP_ICON: Record<StepKey, IconName> = { watch: 'video', quiz: 'bulb', practice: 'edit', files: 'upload', check: 'sparkles' }

/** The ladder of monthly income up to "the boss" (the business metric; mirrors the server). */
export const RANKS = [
  { label: 'טירון', min: 0 },
  { label: 'שחקן', min: 10_000 },
  { label: 'יזם', min: 25_000 },
  { label: 'טייקון', min: 50_000 },
  { label: 'מוגול', min: 75_000 },
  { label: 'הבוס', min: 100_000 },
]

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

/** Colors of the city districts (plan levels), in order. */
export const DISTRICT_COLORS = ['#e6b04a', '#4fb6c9', '#d97b6c', '#8f9df0', '#63b98a', '#d39ad1', '#c9c05b', '#7fb0e8']

export const formatShekels = (value: number) => `₪${Math.round(value).toLocaleString('he-IL')}`

/** "2026-11" -> "נובמבר 2026" */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(new Date(year!, (m ?? 1) - 1, 1))
}

/** "2026-11" -> "נוב׳ 26" */
export function monthShort(month: string): string {
  const [year, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('he-IL', { month: 'short', year: '2-digit' }).format(new Date(year!, (m ?? 1) - 1, 1))
}

export const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)

/** 75 -> "שעה ו-15 דק׳" */
export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} דק׳`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const base = hours === 1 ? 'שעה' : hours === 2 ? 'שעתיים' : `${hours} שעות`
  return rest ? `${base} ו-${rest} דק׳` : base
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
