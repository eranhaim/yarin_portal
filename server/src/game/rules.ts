// The game: learning points and skill levels, business ranks (monthly revenue up to "the boss") and prizes.
// Learning points never come from business results or referrals: the two metrics stay apart.
// Labels are Hebrew because the whole product is Hebrew; the client adds icons and colors.

export const SKILLS = [
  { key: 'business', label: 'אבחון ומספרים' },
  { key: 'customer', label: 'הכרת הלקוח' },
  { key: 'offer', label: 'בניית הצעה' },
  { key: 'brand', label: 'מותג אישי' },
  { key: 'ideas', label: 'רעיונות' },
  { key: 'writing', label: 'כתיבה ותסריטים' },
  { key: 'hooks', label: 'הוקים' },
  { key: 'camera', label: 'מצלמה ותוכן' },
  { key: 'sales', label: 'מכירות' },
  { key: 'mindset', label: 'מנטליות' },
] as const

export type SkillKey = (typeof SKILLS)[number]['key']
export const SKILL_KEYS = SKILLS.map((s) => s.key) as [SkillKey, ...SkillKey[]]
export const isSkill = (value: unknown): value is SkillKey => SKILL_KEYS.includes(value as SkillKey)

/** Points for each action. "max" kinds keep the best result, so trying again only adds the improvement. */
export const XP = {
  taskStarted: 10,
  lessonWatched: 20,
  taskCompleted: 60,
  homework: 30,
  worksheet: 40,
  reviewMax: 120,
  quizPerCorrect: 10,
  simulatorMax: 80,
  mentalSession: 15,
  dailyVisit: 5,
} as const

// ---------- Levels ----------

/** Total points needed for skill levels 1..10. */
const SKILL_LEVELS = [0, 40, 100, 180, 280, 400, 550, 750, 1000, 1300]

export function skillLevel(points: number) {
  let level = 1
  for (let i = 0; i < SKILL_LEVELS.length; i++) if (points >= SKILL_LEVELS[i]!) level = i + 1
  const nextAt = SKILL_LEVELS[level] ?? null
  return { level, floor: SKILL_LEVELS[level - 1]!, nextAt, max: SKILL_LEVELS.length }
}

/** Player level n needs 50·n·(n−1) points in total: 0, 100, 300, 600, 1000, 1500… */
const playerLevelFloor = (n: number) => 50 * n * (n - 1)

export function playerLevel(xp: number) {
  let level = 1
  while (playerLevelFloor(level + 1) <= xp) level++
  return { level, floor: playerLevelFloor(level), nextAt: playerLevelFloor(level + 1) }
}

// ---------- Ranks: the road to "the boss" (monthly revenue, ₪) ----------

export const RANKS = [
  { key: 'rookie', label: 'טירון', min: 0 },
  { key: 'player', label: 'שחקן', min: 10_000 },
  { key: 'founder', label: 'יזם', min: 25_000 },
  { key: 'tycoon', label: 'טייקון', min: 50_000 },
  { key: 'mogul', label: 'מוגול', min: 75_000 },
  { key: 'boss', label: 'הבוס', min: 100_000 },
] as const

export function rankFor(monthlyRevenue: number) {
  let index = 0
  RANKS.forEach((rank, i) => {
    if (monthlyRevenue >= rank.min) index = i
  })
  return { index, rank: RANKS[index]!, next: RANKS[index + 1] ?? null }
}

// ---------- Prize pyramid ----------
// A prize unlocks when any one of its conditions is met. Tier 1 is the wide base, tier 4 the tip.

export type RewardCondition =
  | { type: 'referrals'; value: number }
  | { type: 'revenue'; value: number }
  | { type: 'levels'; value: number }
  | { type: 'allTasks' }

export const REWARDS: { key: string; title: string; tier: 1 | 2 | 3 | 4; conditions: RewardCondition[] }[] = [
  { key: 'airpods', title: 'AirPods', tier: 1, conditions: [{ type: 'referrals', value: 1 }] },
  { key: 'headphones', title: 'אוזניות סטודיו', tier: 1, conditions: [{ type: 'levels', value: 2 }, { type: 'referrals', value: 2 }] },
  { key: 'lighting', title: 'ערכת תאורה לצילום', tier: 2, conditions: [{ type: 'referrals', value: 3 }, { type: 'levels', value: 4 }] },
  { key: 'camera', title: 'מצלמה לתוכן', tier: 2, conditions: [{ type: 'referrals', value: 5 }, { type: 'revenue', value: 50_000 }] },
  { key: 'photoshoot', title: 'יום צילום עם צלם מקצועי', tier: 3, conditions: [{ type: 'referrals', value: 7 }, { type: 'allTasks' }] },
  { key: 'vacation', title: 'סופ״ש חופשה', tier: 4, conditions: [{ type: 'referrals', value: 10 }, { type: 'revenue', value: 100_000 }] },
]

export type RewardFacts = { referrals: number; bestRevenue: number; levelsDone: number; allTasksDone: boolean }

/** Progress (0..1) toward one condition. */
export function conditionProgress(condition: RewardCondition, facts: RewardFacts): number {
  switch (condition.type) {
    case 'referrals':
      return Math.min(1, facts.referrals / condition.value)
    case 'revenue':
      return Math.min(1, facts.bestRevenue / condition.value)
    case 'levels':
      return Math.min(1, facts.levelsDone / condition.value)
    case 'allTasks':
      return facts.allTasksDone ? 1 : 0
  }
}

export function conditionLabel(condition: RewardCondition): string {
  switch (condition.type) {
    case 'referrals':
      return condition.value === 1 ? 'חבר אחד שמצטרף' : `${condition.value} חברים שמצטרפים`
    case 'revenue':
      return `הכנסה חודשית של ₪${condition.value.toLocaleString('he-IL')}`
    case 'levels':
      return `השלמת ${condition.value} שלבים`
    case 'allTasks':
      return 'השלמת כל המשימות בתוכנית'
  }
}

/** Day key in Israel time (YYYY-MM-DD), for streaks and daily limits. */
export function dayKey(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
