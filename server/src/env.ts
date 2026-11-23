import { z } from 'zod'

// Empty values in .env (KEY=) count as "not set".
const blankToUndefined = (value: unknown) => (value === '' ? undefined : value)
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional())

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),
  MONGO_URI: z.string().min(1, 'is required'),
  // The database name. It wins over a name in MONGO_URI, so an Atlas URL without one
  // does not silently write to the default "test" database.
  MONGO_DB: z.preprocess(blankToUndefined, z.string().default('yarin_portal')),
  // Optional, comma-separated (for example "1.1.1.1,8.8.8.8"). Only for computers where
  // Node.js cannot look up mongodb+srv:// addresses with the system DNS settings.
  DNS_SERVERS: optional(z.string()),
  ADMIN_PASSWORD: z.string().min(1, 'is required'),
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),

  // Vultr Object Storage (S3-compatible). Storage features stay off until all four are set.
  S3_ENDPOINT: optional(z.url()),
  S3_REGION: z.preprocess(blankToUndefined, z.string().default('us-east-1')),
  S3_ACCESS_KEY: optional(z.string()),
  S3_SECRET_KEY: optional(z.string()),
  S3_BUCKET: optional(z.string()),

  // Claude API for the AI features (task reviewer, quizzes, simulators, avatar from a photo).
  // The AI features stay off until the key is set.
  ANTHROPIC_API_KEY: optional(z.string()),
  AI_MODEL: z.preprocess(blankToUndefined, z.string().default('claude-opus-5-5')),
  // Safety cap: AI requests per customer per day.
  AI_DAILY_LIMIT: z.coerce.number().int().positive().default(120),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment configuration. Check your .env file:')
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')} ${issue.message}`)
  }
  process.exit(1)
}

export const env = parsed.data
export const isProduction = env.NODE_ENV === 'production'
