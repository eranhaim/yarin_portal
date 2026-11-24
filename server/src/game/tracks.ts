// Personal routes: every customer shares the base of the plan, then gets different tasks.
// The first diagnosis decides the track (type of business), the stage (size) and the bottleneck.
// The rules here are deterministic, so a route never depends on the AI being available.

export const TRACKS = [
  {
    key: 'solo',
    label: 'נותני שירות עצמאיים',
    who: 'מאמנים, מטפלים, יועצים ויוצרים שעובדים לבד',
    focus: 'זרימה קבועה של פניות, ומעבר משיחה לתשלום',
  },
  {
    key: 'local',
    label: 'עסק מקומי וקליניקה',
    who: 'קליניקות, סטודיו, יופי, אוכל ושירותים באזור מסוים',
    focus: 'יומן מלא, לקוחות שחוזרים והמלצות מהאזור',
  },
  {
    key: 'products',
    label: 'מוצרים וחנות',
    who: 'חנויות, מותגים ומוצרים דיגיטליים',
    focus: 'הצעת מוצר חזקה, סל ממוצע גבוה ותוכן שמוכר',
  },
  {
    key: 'team',
    label: 'עסק עם צוות מכירות',
    who: 'סוכנויות, חברות שירות ועסקים שמוכרים דרך אנשי מכירות',
    focus: 'תהליך מכירה אחיד, מדידה וניהול של הצוות',
  },
] as const

export type TrackKey = (typeof TRACKS)[number]['key']
export const TRACK_KEYS = TRACKS.map((t) => t.key) as [TrackKey, ...TrackKey[]]

export const STAGES = [
  { key: 'start', label: 'בונים בסיס', maxRevenue: 15_000 },
  { key: 'grow', label: 'צומחים', maxRevenue: 60_000 },
  { key: 'scale', label: 'מרחיבים', maxRevenue: Infinity },
] as const

export type StageKey = (typeof STAGES)[number]['key']
export const STAGE_KEYS = STAGES.map((s) => s.key) as [StageKey, ...StageKey[]]

export const BOTTLENECKS = [
  { key: 'leads', label: 'אין מספיק פניות' },
  { key: 'sales', label: 'פניות שלא הופכות ללקוחות' },
  { key: 'offer', label: 'ההצעה והמחיר' },
  { key: 'content', label: 'תוכן וחשיפה' },
  { key: 'profit', label: 'הכנסה בלי מספיק רווח' },
  { key: 'time', label: 'עומס וחוסר זמן' },
] as const

export type BottleneckKey = (typeof BOTTLENECKS)[number]['key']
export const BOTTLENECK_KEYS = BOTTLENECKS.map((b) => b.key) as [BottleneckKey, ...BottleneckKey[]]

const labelOf = <T extends { key: string; label: string }>(list: readonly T[], key: string | null | undefined) =>
  list.find((item) => item.key === key)?.label ?? null
export const trackLabel = (key: string | null | undefined) => labelOf(TRACKS, key)
export const stageLabel = (key: string | null | undefined) => labelOf(STAGES, key)
export const bottleneckLabel = (key: string | null | undefined) => labelOf(BOTTLENECKS, key)

// ---------- The diagnosis questionnaire ----------

export type DiagnosisQuestion = {
  id: string
  group: string
  label: string
  help?: string
  type: 'text' | 'long' | 'number' | 'choice' | 'multi' | 'scale'
  options?: { value: string; label: string }[]
  unit?: string
  optional?: boolean
}

export const DIAGNOSIS: DiagnosisQuestion[] = [
  // --- The business ---
  { id: 'what', group: 'העסק', type: 'long', label: 'מה אתם מוכרים, ולמי?', help: 'במשפט או שניים, כמו שהייתם מסבירים לחבר.' },
  {
    id: 'type',
    group: 'העסק',
    type: 'choice',
    label: 'מה הכי מתאר את העסק?',
    options: [
      { value: 'personal', label: 'שירות אישי: אימון, טיפול, ייעוץ, הוראה' },
      { value: 'local', label: 'עסק מקומי: קליניקה, סטודיו, יופי, אוכל' },
      { value: 'products', label: 'מוצרים: חנות, מותג, מוצר דיגיטלי' },
      { value: 'company', label: 'סוכנות, חברת שירותים או B2B' },
    ],
  },
  {
    id: 'team',
    group: 'העסק',
    type: 'choice',
    label: 'מי עובד בעסק?',
    options: [
      { value: 'alone', label: 'רק אני' },
      { value: 'small', label: 'אני ועוד 1–2 אנשים' },
      { value: 'team', label: 'צוות של 3 ומעלה' },
    ],
  },
  {
    id: 'seller',
    group: 'העסק',
    type: 'choice',
    label: 'מי מדבר עם לקוחות חדשים ומוכר?',
    options: [
      { value: 'me', label: 'אני' },
      { value: 'rep', label: 'איש מכירות אחד' },
      { value: 'reps', label: 'צוות מכירות' },
      { value: 'online', label: 'קונים לבד באתר' },
    ],
  },
  // --- The numbers (the baseline of the business metric) ---
  { id: 'revenue', group: 'המספרים', type: 'number', unit: '₪', label: 'כמה העסק הכניס בחודש האחרון?', help: 'לפני הוצאות. הערכה זה בסדר.' },
  { id: 'expenses', group: 'המספרים', type: 'number', unit: '₪', label: 'כמה בערך היו ההוצאות בחודש הזה?', help: 'כל מה שהעסק שילם, בלי המשכורת שלכם.' },
  { id: 'leads', group: 'המספרים', type: 'number', label: 'כמה פניות חדשות קיבלתם בחודש האחרון?', help: 'הודעות, טלפונים, טפסים. לא כולל לקוחות קיימים.' },
  { id: 'calls', group: 'המספרים', type: 'number', label: 'עם כמה מהם הייתה שיחת מכירה אמיתית?' },
  { id: 'deals', group: 'המספרים', type: 'number', label: 'כמה לקוחות חדשים שילמו?' },
  { id: 'price', group: 'המספרים', type: 'number', unit: '₪', label: 'מה המחיר של ההצעה המרכזית שלכם?' },
  // --- Where you stand ---
  {
    id: 'sources',
    group: 'איפה אתם היום',
    type: 'multi',
    label: 'מאיפה מגיעים רוב הלקוחות?',
    options: [
      { value: 'referrals', label: 'המלצות' },
      { value: 'instagram', label: 'אינסטגרם' },
      { value: 'tiktok', label: 'טיקטוק' },
      { value: 'facebook', label: 'פייסבוק' },
      { value: 'google', label: 'גוגל' },
      { value: 'ads', label: 'קמפיינים ממומנים' },
      { value: 'walkin', label: 'עוברים ושבים' },
      { value: 'none', label: 'אין מקור קבוע' },
    ],
  },
  {
    id: 'posting',
    group: 'איפה אתם היום',
    type: 'choice',
    label: 'כמה סרטונים אתם מעלים היום?',
    options: [
      { value: 'none', label: 'כמעט לא' },
      { value: 'monthly', label: '1–3 בחודש' },
      { value: 'weekly', label: '1–2 בשבוע' },
      { value: 'daily', label: '3 ומעלה בשבוע' },
    ],
  },
  { id: 'camera', group: 'איפה אתם היום', type: 'scale', label: 'כמה נוח לכם לדבר מול מצלמה?' },
  { id: 'selling', group: 'איפה אתם היום', type: 'scale', label: 'כמה נוח לכם לנהל שיחת מכירה ולבקש כסף?' },
  {
    id: 'blocker',
    group: 'איפה אתם היום',
    type: 'choice',
    label: 'מה הכי עוצר אתכם כרגע?',
    options: BOTTLENECKS.map((b) => ({ value: b.key, label: b.label })),
  },
  // --- The target ---
  { id: 'goalRevenue', group: 'היעד', type: 'number', unit: '₪', label: 'לאיזו הכנסה חודשית אתם רוצים להגיע בעוד חצי שנה?' },
  { id: 'goal', group: 'היעד', type: 'long', label: 'איך תדעו שהתהליך הצליח?', help: 'מה יהיה שונה ביום-יום שלכם.' },
  {
    id: 'hours',
    group: 'היעד',
    type: 'choice',
    label: 'כמה שעות בשבוע אתם יכולים להשקיע בתהליך?',
    options: [
      { value: '2', label: 'עד שעתיים' },
      { value: '4', label: '3–5 שעות' },
      { value: '8', label: '6 שעות ומעלה' },
    ],
  },
]

export type DiagnosisAnswers = Record<string, string | number | string[]>

/** Required questions without a usable answer. */
export function missingAnswers(answers: DiagnosisAnswers): DiagnosisQuestion[] {
  return DIAGNOSIS.filter((q) => {
    if (q.optional) return false
    const value = answers[q.id]
    if (q.type === 'number' || q.type === 'scale') return typeof value !== 'number' || !Number.isFinite(value) || value < 0
    if (q.type === 'multi') return !Array.isArray(value) || value.length === 0
    if (q.type === 'choice') return !q.options!.some((o) => o.value === value)
    return typeof value !== 'string' || value.trim() === ''
  })
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)

export type Route = { track: TrackKey; stage: StageKey; bottleneck: BottleneckKey; reasons: string[] }

/** The route that the answers lead to, with the reasons in words (shown to the customer). */
export function routeFrom(answers: DiagnosisAnswers): Route {
  const reasons: string[] = []

  // Track: who sells beats the type of business, because it changes the work the most.
  let track: TrackKey
  if (answers.seller === 'reps' || (answers.seller === 'rep' && answers.team === 'team') || (answers.type === 'company' && answers.team === 'team')) {
    track = 'team'
    reasons.push('יש אצלכם אנשים שמוכרים, ולכן העבודה היא על תהליך ועל ניהול, לא רק על המכירה שלכם.')
  } else if (answers.type === 'products' || answers.seller === 'online') {
    track = 'products'
    reasons.push('אתם מוכרים מוצר, ולכן הדגש הוא על ההצעה, הסל והתוכן שמוביל לרכישה.')
  } else if (answers.type === 'local') {
    track = 'local'
    reasons.push('העסק עובד באזור מסוים, ולכן הדגש הוא על מילוי היומן, חזרה של לקוחות והמלצות.')
  } else {
    track = 'solo'
    reasons.push('אתם השירות, ולכן הדגש הוא על פניות קבועות ועל שיחות שמסתיימות בתשלום.')
  }

  const revenue = num(answers.revenue)
  const stage = STAGES.find((s) => revenue < s.maxRevenue)!.key

  // Bottleneck: the numbers decide first; what the owner feels decides when the numbers look healthy.
  const leads = num(answers.leads)
  const calls = num(answers.calls)
  const deals = num(answers.deals)
  const expenses = num(answers.expenses)
  const margin = revenue > 0 ? (revenue - expenses) / revenue : null
  let bottleneck: BottleneckKey
  if (leads < (track === 'products' ? 30 : 8)) {
    bottleneck = answers.posting === 'none' || answers.posting === 'monthly' ? 'content' : 'leads'
    reasons.push(`עם ${leads} פניות בחודש, קודם צריך יותר אנשים שמכירים אתכם.`)
  } else if (track !== 'products' && leads >= 8 && calls / leads < 0.4) {
    bottleneck = 'sales'
    reasons.push(`רק ${calls} מתוך ${leads} פניות הגיעו לשיחה אמיתית. הכסף הולך לאיבוד בין ההודעה לשיחה.`)
  } else if (calls >= 4 && deals / calls < 0.25) {
    bottleneck = answers.blocker === 'offer' ? 'offer' : 'sales'
    reasons.push(`${deals} מתוך ${calls} שיחות נסגרו. כאן יש הכי הרבה מה לשפר.`)
  } else if (margin !== null && margin < 0.25) {
    bottleneck = 'profit'
    reasons.push(`נשארים לכם ${Math.round(margin * 100)}% מההכנסה. קודם סוגרים את הדליפות.`)
  } else {
    bottleneck = BOTTLENECK_KEYS.includes(answers.blocker as BottleneckKey) ? (answers.blocker as BottleneckKey) : 'leads'
    reasons.push(`סימנתם שמה שעוצר אתכם הוא: ${bottleneckLabel(bottleneck)}.`)
  }

  return { track, stage, bottleneck, reasons }
}

/** The answers as readable lines, for the AI and for the admin. */
export function diagnosisAsText(answers: DiagnosisAnswers): string {
  return DIAGNOSIS.map((q) => {
    const value = answers[q.id]
    if (value === undefined || value === '') return null
    const text = Array.isArray(value)
      ? value.map((v) => q.options?.find((o) => o.value === v)?.label ?? v).join(', ')
      : (q.options?.find((o) => o.value === value)?.label ?? `${value}${q.unit ? ` ${q.unit}` : q.type === 'scale' ? '/5' : ''}`)
    return `- ${q.label} ${text}`
  })
    .filter(Boolean)
    .join('\n')
}
