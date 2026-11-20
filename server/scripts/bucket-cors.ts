// Lets the browser upload files straight to the storage bucket from the given site origins.
// It keeps the bucket's other CORS rules and only adds the missing origins.
//
// Usage (from the server folder):
//   node --env-file=../.env scripts/bucket-cors.ts                         -> show the current rules
//   node --env-file=../.env scripts/bucket-cors.ts http://localhost:5173   -> allow an origin
//   node --env-file=../.env scripts/bucket-cors.ts https://portal.example.com

import { GetBucketCorsCommand, PutBucketCorsCommand, type CORSRule } from '@aws-sdk/client-s3'
import { env } from '../src/env.ts'
import { requireClient } from '../src/storage.ts'

const RULE_ID = 'yarin-portal-uploads'
const origins = process.argv.slice(2).map((o) => o.replace(/\/+$/, ''))
const client = requireClient()
const Bucket = env.S3_BUCKET

let rules: CORSRule[] = []
try {
  rules = (await client.send(new GetBucketCorsCommand({ Bucket }))).CORSRules ?? []
} catch (err) {
  if ((err as { name?: string }).name !== 'NoSuchCORSConfiguration') throw err
}

console.log(`Current CORS rules on "${Bucket}":`, rules.length ? JSON.stringify(rules, null, 2) : 'none')
if (origins.length === 0) process.exit(0)

const ours = rules.find((r) => r.ID === RULE_ID)
const others = rules.filter((r) => r.ID !== RULE_ID)
const allowed = [...new Set([...(ours?.AllowedOrigins ?? []), ...origins])]

const rule: CORSRule = {
  ID: RULE_ID,
  AllowedOrigins: allowed,
  AllowedMethods: ['GET', 'PUT', 'HEAD'],
  AllowedHeaders: ['*'],
  ExposeHeaders: ['ETag'],
  MaxAgeSeconds: 3600,
}

await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: [...others, rule] } }))
console.log(`Done. Uploads are allowed from: ${allowed.join(', ')}`)
