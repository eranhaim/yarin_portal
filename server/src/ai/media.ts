import { execFile } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { env } from '../env.ts'

// Reads pictures, videos and recordings for the AI: ffmpeg makes small images and contact sheets, and
// whisper.cpp with the ivrit.ai Hebrew model writes down what is said. Both are optional: without them the
// examiner says openly which files it could not open.

const run = promisify(execFile)

let ffmpegState: Promise<boolean> | null = null
/** Whether ffmpeg is installed (checked once). */
export function ffmpegAvailable(): Promise<boolean> {
  ffmpegState ??= run('ffmpeg', ['-version'])
    .then(() => true)
    .catch(() => false)
  return ffmpegState
}

async function withTemp<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'yp-media-'))
  try {
    return await work(dir)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

// Customers choose these files, so ffmpeg may open only the signed https address: a "video" that is really a
// playlist cannot make it read local files or call services inside the server.
const SAFE_INPUT = ['-protocol_whitelist', 'https,tls,tcp,crypto']
const FFMPEG = ['-v', 'error', '-nostdin', '-y', ...SAFE_INPUT]
const LIMIT = { timeout: 180_000, maxBuffer: 4 * 1024 * 1024 }

/** A JPEG of at most 1568 px on the long side (what the model reads best). */
export async function smallImage(url: string): Promise<Buffer> {
  return withTemp(async (dir) => {
    const out = join(dir, 'image.jpg')
    const scale = "scale='if(gt(iw,ih),min(1568,iw),-2)':'if(gt(iw,ih),-2,min(1568,ih))'"
    await run('ffmpeg', [...FFMPEG, '-i', url, '-vf', scale, '-frames:v', '1', '-q:v', '4', out], LIMIT)
    return readFile(out)
  })
}

const MAX_SECONDS = 300

export type MediaReading = {
  seconds: number
  /** JPEG contact sheets: frames in order, left to right and top to bottom. */
  sheets: Buffer[]
  /** What is said. null when speech recognition is off; an empty string when nobody speaks. */
  transcript: string | null
}

async function probe(url: string): Promise<{ seconds: number; video: boolean; audio: boolean }> {
  const { stdout } = await run('ffprobe', ['-v', 'error', ...SAFE_INPUT, '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', url], LIMIT)
  const data = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type?: string }[] }
  return {
    seconds: Number(data.format?.duration ?? 0) || 0,
    video: Boolean(data.streams?.some((s) => s.codec_type === 'video')),
    audio: Boolean(data.streams?.some((s) => s.codec_type === 'audio')),
  }
}

/** One video or recording, up to five minutes: frames and speech. */
export async function readMedia(url: string): Promise<MediaReading> {
  const info = await probe(url)
  const seconds = Math.min(info.seconds || MAX_SECONDS, MAX_SECONDS)
  return withTemp(async (dir) => {
    const sheets: Buffer[] = []
    if (info.video) {
      // The opening seconds decide if people keep watching, so they get their own sheet.
      const opening = join(dir, 'opening.jpg')
      await run('ffmpeg', [...FFMPEG, '-t', '4', '-i', url, '-vf', 'fps=2,scale=-2:420,tile=8x1', '-frames:v', '1', '-q:v', '4', opening], LIMIT).catch(() => undefined)
      const whole = join(dir, 'whole.jpg')
      await run('ffmpeg', [...FFMPEG, '-t', String(seconds), '-i', url, '-vf', `fps=${(16 / Math.max(seconds, 2)).toFixed(5)},scale=-2:360,tile=8x2`, '-frames:v', '1', '-q:v', '4', whole], LIMIT).catch(() => undefined)
      for (const file of [opening, whole]) if (existsSync(file)) sheets.push(await readFile(file))
    }
    let transcript: string | null = null
    if (info.audio && (await speechReady())) {
      const wav = join(dir, 'audio.wav')
      await run('ffmpeg', [...FFMPEG, '-t', String(seconds), '-i', url, '-ac', '1', '-ar', '16000', wav], LIMIT)
      transcript = await transcribe(wav)
    } else if (!info.audio) transcript = ''
    return { seconds: info.seconds, sheets, transcript }
  })
}

// ---------- Speech (whisper.cpp) ----------

const MODEL_FILE = env.SPEECH_MODEL_DIR ? join(env.SPEECH_MODEL_DIR, 'ivrit-turbo.bin') : null
let modelState: Promise<boolean> | null = null

/** The program and the model are here. The model (about 1.6 GB) downloads once into the model folder. */
function speechReady(): Promise<boolean> {
  if (!env.SPEECH_BIN || !MODEL_FILE) return Promise.resolve(false)
  modelState ??= (async () => {
    if (!existsSync(env.SPEECH_BIN!)) return false
    if (!existsSync(MODEL_FILE)) {
      await mkdir(env.SPEECH_MODEL_DIR!, { recursive: true })
      const temp = `${MODEL_FILE}.part`
      console.log('Downloading the Hebrew speech model…')
      const res = await fetch(env.SPEECH_MODEL_URL)
      if (!res.ok || !res.body) throw new Error(`speech model: HTTP ${res.status}`)
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(temp))
      if ((await stat(temp)).size < 100_000_000) throw new Error('speech model: incomplete download')
      // A smaller copy of the model (q5) needs a third of the memory and runs faster on a CPU.
      if (env.SPEECH_QUANTIZE_BIN && existsSync(env.SPEECH_QUANTIZE_BIN)) {
        await run(env.SPEECH_QUANTIZE_BIN, [temp, `${temp}.q5`, 'q5_0'], { timeout: 20 * 60_000, maxBuffer: 16 * 1024 * 1024 })
        await rename(`${temp}.q5`, MODEL_FILE)
        await rm(temp, { force: true })
      } else await rename(temp, MODEL_FILE)
      console.log('The Hebrew speech model is ready.')
    }
    return true
  })().catch((err: unknown) => {
    console.warn('Speech recognition is off:', err)
    modelState = null // try again on the next file
    return false
  })
  return modelState
}

/** Starts the model download early, so the first homework video does not wait for it. */
export function warmUpSpeech(): void {
  void speechReady()
}

// One recording at a time: speech recognition uses a full CPU, and the server has two.
let queue: Promise<unknown> = Promise.resolve()

async function transcribe(wav: string): Promise<string | null> {
  const job = queue.then(async () => {
    const { stdout } = await run(
      env.SPEECH_BIN!,
      ['-m', MODEL_FILE!, '-f', wav, '-l', 'he', '-t', '2', '-nt', '-np'],
      { timeout: 15 * 60_000, maxBuffer: 8 * 1024 * 1024 },
    )
    return stdout.replace(/\s+/g, ' ').trim()
  })
  queue = job.catch(() => undefined)
  try {
    return await job
  } catch (err) {
    console.warn('Speech recognition failed:', err)
    return null
  }
}
