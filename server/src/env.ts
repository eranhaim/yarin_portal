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

  // Hebrew speech to text, for videos, call recordings and voice. A fast service (any OpenAI-compatible
  // transcription address) when both are set:
  SPEECH_API_URL: optional(z.url()),
  SPEECH_API_KEY: optional(z.string()),
  SPEECH_API_MODEL: z.preprocess(blankToUndefined, z.string().default('whisper-large-v3')),
  // … or a small Hebrew model on this server: the folder that keeps it (about 72 MB, downloads once). Empty = off.
  SPEECH_MODEL_DIR: optional(z.string()),

  // WhatsApp messages through Green API (green-api.com). Off until both are set. The address is
  // https://<first 4 digits of the instance>.api.greenapi.com unless GREEN_API_URL says otherwise.
  GREEN_API_ID: optional(z.string().regex(/^\d+$/, 'must be the idInstance (digits)')),
  GREEN_API_TOKEN: optional(z.string()),
  GREEN_API_URL: optional(z.url()),
  // The site's public address, for the links in messages (for example https://app.example.com).
  APP_URL: optional(z.url()),
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
