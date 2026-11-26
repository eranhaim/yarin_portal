import { env, isProduction } from './env.ts'
import { app } from './app.ts'
import { startCaretaker } from './ai/caretaker.ts'
import { closeStaleRuns } from './ai/lab/run.ts'
import { warmUpSpeech } from './ai/speech.ts'
import { connectDb, disconnectDb } from './db.ts'
import { migrate } from './migrate.ts'
import { storageEnabled } from './storage.ts'
import { startWhatsApp } from './whatsapp/notify.ts'

await connectDb()
await migrate()
await closeStaleRuns()
warmUpSpeech()
// On a developer's computer the tests run only by hand: every run costs money.
if (isProduction) startCaretaker()
// WhatsApp messages go out only from the server (a developer's computer with test data sends nothing).
if (isProduction) startWhatsApp()

const server = app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT} (${env.NODE_ENV})`)
  if (!storageEnabled) console.warn('File storage is not configured. Avatar uploads are off.')
})

// Docker sends SIGTERM on "docker compose down" or a redeploy. Finish open requests, then exit.
let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received, shutting down`)
  const forceExit = setTimeout(() => process.exit(1), 10_000)
  forceExit.unref()
  server.close()
  await disconnectDb()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
