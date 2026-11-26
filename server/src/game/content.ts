import { z } from 'zod'
import { PEOPLE, PERSON_IDS } from './people.ts'
import { SKILL_KEYS } from './rules.ts'

// Shapes of the game content on a task (worksheet, quiz, review rubric) and of a character's look.
// The same schemas validate admin input and constrain the AI's JSON output, so they avoid
// constraints that structured outputs do not support; limits are enforced after parsing.

// ---------- Worksheet ("מסך עבודה"): the in-app version of the Word worksheet ----------

export const WORKSHEET_FIELD_TYPES = ['short', 'long', 'number', 'choice', 'checklist', 'list', 'table'] as const

export const worksheetFieldSchema = z.object({
  id: z.string().describe('Short unique id in English snake_case, for example "pain_points".'),
  label: z.string().describe('The question or field label, in Hebrew.'),
  help: z.string().describe('One short hint in Hebrew, or an empty string.'),
  type: z.enum(WORKSHEET_FIELD_TYPES).describe('short = one line, long = paragraph, list = several short items, table = rows × columns.'),
  options: z.array(z.string()).describe('Choices for "choice" and "checklist"; otherwise empty.'),
  columns: z.array(z.string()).describe('Column titles for "table"; otherwise empty.'),
  rows: z.number().describe('Rows for "list" and "table" (for example 10 for ten ideas); otherwise 0.'),
})

export const worksheetSchema = z.object({
  intro: z.string().describe('One or two sentences in Hebrew: what this work screen is for.'),
  sections: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      fields: z.array(worksheetFieldSchema),
    }),
  ),
})

export type Worksheet = z.infer<typeof worksheetSchema>
export type WorksheetField = z.infer<typeof worksheetFieldSchema>

// ---------- Quiz ----------

export const quizSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()).describe('Exactly four answers.'),
      answer: z.number().describe('Index (0-3) of the correct answer.'),
      explanation: z.string().describe('One sentence: why this is the right answer.'),
    }),
  ),
})

export type Quiz = z.infer<typeof quizSchema>

// ---------- Everything the AI generates for one task ----------

export const taskContentSchema = z.object({
  skill: z.enum(SKILL_KEYS),
  worksheet: worksheetSchema,
  quiz: quizSchema,
  rubric: z.array(z.string()).describe('4-7 concrete criteria for reviewing the participant’s work, in Hebrew.'),
})

export type TaskContent = z.infer<typeof taskContentSchema>

/** Drops broken parts of AI or admin content and keeps the sizes sane. */
export function cleanWorksheet(ws: Worksheet | null | undefined): Worksheet | null {
  if (!ws) return null
  const seen = new Set<string>()
  const sections = ws.sections.slice(0, 12).map((section, si) => ({
    id: section.id || `s${si + 1}`,
    title: section.title.slice(0, 200),
    description: section.description.slice(0, 1000),
    fields: section.fields.slice(0, 30).flatMap((field, fi) => {
      let id = (field.id || `f${si + 1}_${fi + 1}`).replace(/[^\w-]/g, '_').slice(0, 60)
      while (seen.has(id)) id = `${id}_${fi}`
      seen.add(id)
      const options = field.type === 'choice' || field.type === 'checklist' ? field.options.slice(0, 12).map((o) => o.slice(0, 200)) : []
      const columns = field.type === 'table' ? field.columns.slice(0, 8).map((c) => c.slice(0, 100)) : []
      if ((field.type === 'choice' || field.type === 'checklist') && options.length === 0) return []
      if (field.type === 'table' && columns.length === 0) return []
      const rows = field.type === 'list' || field.type === 'table' ? Math.min(30, Math.max(1, Math.round(field.rows) || 3)) : 0
      return [{ id, label: field.label.slice(0, 500), help: field.help.slice(0, 500), type: field.type, options, columns, rows }]
    }),
  }))
  return { intro: ws.intro.slice(0, 1000), sections: sections.filter((s) => s.fields.length > 0) }
}

export function cleanQuiz(quiz: Quiz | null | undefined): Quiz | null {
  if (!quiz) return null
  const questions = quiz.questions
    .filter((q) => q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length)
    .slice(0, 15)
    .map((q) => ({
      question: q.question.slice(0, 500),
      options: q.options.slice(0, 6).map((o) => o.slice(0, 300)),
      answer: Math.round(q.answer),
      explanation: q.explanation.slice(0, 500),
    }))
  return questions.length ? { questions } : null
}

// ---------- Worksheet answers ----------

const cell = z.string().max(2000)
export const worksheetAnswersSchema = z.record(
  z.string().max(60),
  z.union([z.string().max(6000), z.number(), z.array(cell).max(40), z.array(z.array(cell).max(10)).max(40)]),
)
export type WorksheetAnswers = z.infer<typeof worksheetAnswersSchema>

/** Worksheet answers as readable text, for the AI reviewer and the admin. */
export function answersAsText(ws: Worksheet, answers: WorksheetAnswers): string {
  const lines: string[] = []
  for (const section of ws.sections) {
    lines.push(`## ${section.title}`)
    for (const field of section.fields) {
      const value = answers[field.id]
      let text = ''
      if (Array.isArray(value)) {
        text = value
          .map((row, i) => (Array.isArray(row) ? `  ${i + 1}. ${field.columns.map((c, j) => `${c}: ${row[j] ?? ''}`).join(' | ')}` : `  ${i + 1}. ${row}`))
          .filter((line) => line.replace(/[\d.:|\s]/g, '').length > 0)
          .join('\n')
      } else if (value !== undefined && value !== '') {
        text = String(value)
      }
      lines.push(`- ${field.label}:\n${text ? text : '  (ריק)'}`)
    }
  }
  return lines.join('\n')
}

// ---------- Character look ----------

export const lookSchema = z.object({
  /** The realistic person (game/people.ts). Looks saved before it existed have none; the app then shows the closest one. */
  person: z.enum(PERSON_IDS).optional(),
  skin: z.enum(['porcelain', 'light', 'tan', 'olive', 'brown', 'dark']),
  hair: z.enum(['short', 'quiff', 'slick', 'buzz', 'curly', 'long', 'bun', 'bald']),
  hairColor: z.enum(['black', 'darkBrown', 'brown', 'blond', 'red', 'gray', 'white']),
  beard: z.enum(['none', 'stubble', 'short', 'full']),
  mustache: z.boolean(),
  glasses: z.enum(['none', 'round', 'square', 'sun']),
  outfit: z.enum(['suit', 'blazer', 'hoodie', 'tee']),
  outfitColor: z.enum(['black', 'navy', 'red', 'gold', 'teal', 'purple', 'white', 'green', 'gray']),
  accessory: z.enum(['none', 'briefcase', 'phone', 'coffee']),
  chain: z.boolean().describe('A gold chain, for a "boss" look.'),
})

export type Look = z.infer<typeof lookSchema>

/** A stable starting look for a person who has not designed a character yet. */
export function defaultLook(seed: string): Look {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0
  const pick = <T,>(list: readonly T[], shift: number) => list[Math.abs(hash >> shift) % list.length]!
  const person = pick(PERSON_IDS, 0)
  const { skin, hair, hairColor, beard } = PEOPLE[person]
  return {
    person,
    skin,
    hair,
    hairColor,
    beard,
    mustache: false,
    glasses: pick(['none', 'none', 'round', 'none'] as const, 12),
    outfit: pick(['blazer', 'hoodie', 'tee', 'blazer'] as const, 15),
    outfitColor: pick(['red', 'navy', 'teal', 'purple', 'gold'] as const, 18),
    accessory: pick(['briefcase', 'phone', 'coffee', 'none'] as const, 21),
    chain: false,
  }
}
