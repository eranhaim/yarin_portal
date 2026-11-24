import type { BusinessReportDoc } from '../models/Game.ts'
import { rankFor } from './rules.ts'

// The second metric: how the business really performs. It is separate from learning on purpose.
// A customer can learn well before the income changes, and the screen must say so honestly.

export type BusinessNumbers = {
  month: string
  revenue: number
  expenses: number | null
  leads: number | null
  calls: number | null
  deals: number | null
  baseline: boolean
  note: string
  // Derived. null when there is not enough data.
  profit: number | null
  margin: number | null
  leadToCall: number | null
  callToDeal: number | null
  averageDeal: number | null
}

const ratio = (part: number | null, whole: number | null) => (part !== null && whole !== null && whole > 0 ? part / whole : null)

export function numbersOf(report: BusinessReportDoc): BusinessNumbers {
  const revenue = report.amount
  const expenses = report.expenses ?? null
  const leads = report.leads ?? null
  const calls = report.calls ?? null
  const deals = report.deals ?? null
  const profit = expenses === null ? null : revenue - expenses
  return {
    month: report.month,
    revenue,
    expenses,
    leads,
    calls,
    deals,
    baseline: report.baseline,
    note: report.note,
    profit,
    margin: profit === null || revenue <= 0 ? null : profit / revenue,
    leadToCall: ratio(calls, leads),
    callToDeal: ratio(deals, calls),
    averageDeal: deals !== null && deals > 0 ? revenue / deals : null,
  }
}

/** The month now, in Israel time (YYYY-MM). */
export const currentMonth = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).format(now).slice(0, 7)

export function monthBefore(key: string): string {
  const [year, month] = key.split('-').map(Number) as [number, number]
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`
}

/** The month that still needs a report: the one that just ended. null when it is filled in. */
export function dueMonth(reports: { month: string; baseline?: boolean }[], now = new Date()): string | null {
  if (reports.length === 0) return null
  const last = monthBefore(currentMonth(now))
  const newest = reports.reduce((max, r) => (r.month > max ? r.month : max), '')
  return newest >= last ? null : last
}

export type Insight = { tone: 'good' | 'warn' | 'info'; text: string }

const percent = (value: number) => `${Math.round(value * 100)}%`

/** Plain observations about the funnel. Rules, not AI, so the same numbers always say the same thing. */
export function insightsFrom(history: BusinessNumbers[]): Insight[] {
  const insights: Insight[] = []
  const latest = history.at(-1)
  if (!latest) return insights
  const base = history.find((h) => h.baseline) ?? (history.length > 1 ? history[0]! : null)

  if (base && base.month !== latest.month && base.revenue > 0) {
    const change = latest.revenue / base.revenue - 1
    if (change >= 0.1) insights.push({ tone: 'good', text: `ההכנסה עלתה ב-${percent(change)} מאז נקודת ההתחלה.` })
    else if (change <= -0.1) insights.push({ tone: 'warn', text: `ההכנסה ירדה ב-${percent(-change)} מאז נקודת ההתחלה. שווה לעבור על זה במפגש הבא.` })
  }
  if (latest.leadToCall !== null && (latest.leads ?? 0) >= 5 && latest.leadToCall < 0.4) {
    insights.push({ tone: 'warn', text: `רק ${percent(latest.leadToCall)} מהפניות הגיעו לשיחה. מהירות התגובה וההודעה הראשונה הן המקום לשפר.` })
  }
  if (latest.callToDeal !== null && (latest.calls ?? 0) >= 4) {
    if (latest.callToDeal < 0.25) insights.push({ tone: 'warn', text: `${percent(latest.callToDeal)} מהשיחות נסגרו. שווה להתאמן בסימולטור המכירות.` })
    else if (latest.callToDeal >= 0.4) insights.push({ tone: 'good', text: `${percent(latest.callToDeal)} מהשיחות נסגרו. שיחות המכירה חזקות; עכשיו צריך יותר מהן.` })
  }
  if (latest.margin !== null) {
    if (latest.margin < 0.25) insights.push({ tone: 'warn', text: `נשארו ${percent(Math.max(0, latest.margin))} רווח. לפני שמגדילים הכנסות, בודקים מחיר והוצאות.` })
    else if (latest.margin >= 0.5) insights.push({ tone: 'good', text: `${percent(latest.margin)} מההכנסה נשארים רווח.` })
  }
  if (latest.leads === null || latest.calls === null || latest.deals === null) {
    insights.push({ tone: 'info', text: 'הוסיפו פניות, שיחות ולקוחות חדשים, כדי לראות איפה המשפך נחלש.' })
  }
  return insights.slice(0, 4)
}

export function businessSummary(reports: BusinessReportDoc[]) {
  const history = [...reports].sort((a, b) => a.month.localeCompare(b.month)).map(numbersOf)
  const latest = history.at(-1) ?? null
  const best = history.reduce((max, h) => Math.max(max, h.revenue), 0)
  const rank = rankFor(latest?.revenue ?? 0)
  return {
    latest,
    baseline: history.find((h) => h.baseline) ?? null,
    best,
    rank: { ...rank.rank, index: rank.index },
    next: rank.next,
    history,
    due: dueMonth(history),
    insights: insightsFrom(history),
  }
}
