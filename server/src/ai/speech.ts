import { execFile, fork, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, rename, stat } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { env } from '../env.ts'

// Hebrew speech to text, on this server: a small streaming model (Zipformer by Yakov Kolani, published by ivrit.ai,
// CC BY 4.0) with sherpa-onnx. It is as accurate as the large Whisper model and about ten times faster than real time.
// In calls the voices are told apart (pyannote segmentation, MIT, and 3D-Speaker CAM++, Apache 2.0).
// A transcription service (any OpenAI-compatible address) is used instead when its address and key are set.

const run = promisify(execFile)

export type Segment = { start: number; end: number; text: string; speaker?: number }
/** shares: how much each voice spoke (0-1), when there is more than one. */
export type Heard = { segments: Segment[]; shares: number[] }
export type SpeechMode = 'api' | 'local' | 'off'

export function speechMode(): SpeechMode {
  if (env.SPEECH_API_URL && env.SPEECH_API_KEY) return 'api'
  return env.SPEECH_MODEL_DIR ? 'local' : 'off'
}

/** The longest recording that is read to its end. */
export const MAX_RECORDING_SECONDS = 120 * 60

// How many seconds one second of speech takes here; it follows what the server really does.
let pace = 0.35
/** About how long a recording will take, in seconds, with the answer after it. */
export const speechEta = (seconds: number) => Math.round(25 + seconds * (speechMode() === 'api' ? 0.03 : pace))

// ---------- The model ----------

const HF = 'https://huggingface.co'
const HEBREW = `${HF}/ivrit-ai/zipformer2-66m-streaming-he/resolve/ee769a2a13b887f91572eec349458bfb0fe79e7a/sherpa-onnx`
// Exact revisions and sizes: what was tested is what runs.
const MODEL_FILES: [name: string, bytes: number, url: string][] = [
  ['encoder.int8.onnx', 70_478_964, `${HEBREW}/encoder.int8.onnx`],
  ['decoder.int8.onnx', 1_049_105, `${HEBREW}/decoder.int8.onnx`],
  ['joiner.int8.onnx', 771_805, `${HEBREW}/joiner.int8.onnx`],
  ['tokens.txt', 17_086, `${HEBREW}/tokens.txt`],
  ['speakers-segmentation.int8.onnx', 1_540_506, `${HF}/csukuangfj/sherpa-onnx-pyannote-segmentation-3-0/resolve/9403a6902bb58e3d5ae8c7e77c3422de279db2e0/model.int8.onnx`],
  ['speakers-embedding.onnx', 29_596_979, `${HF}/csukuangfj/speaker-embedding-models/resolve/a8055d6daef723a6a4ecf4de233708575bf4994f/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx`],
]
const modelDir = () => join(env.SPEECH_MODEL_DIR!, 'zipformer2-66m-he')

let modelState: Promise<boolean> | null = null

/** The models are here. They download once (about 103 MB) into the model folder. */
function localReady(): Promise<boolean> {
  if (!env.SPEECH_MODEL_DIR) return Promise.resolve(false)
  modelState ??= (async () => {
    const dir = modelDir()
    await mkdir(dir, { recursive: true })
    for (const [name, bytes, url] of MODEL_FILES) {
      const file = join(dir, name)
      if (existsSync(file) && (await stat(file)).size === bytes) continue
      const res = await fetch(url)
      if (!res.ok || !res.body) throw new Error(`speech model: HTTP ${res.status}`)
      await pipeline(Readable.fromWeb(res.body as never), createWriteStream(`${file}.part`))
      if ((await stat(`${file}.part`)).size !== bytes) throw new Error(`speech model: ${name} has an unexpected size`)
      await rename(`${file}.part`, file)
    }
    console.log('The Hebrew speech model is ready.')
    return true
  })().catch((err: unknown) => {
    console.warn('Speech recognition is off:', err)
    modelState = null // try again on the next file
    return false
  })
  return modelState
}

export const speechReady = (): Promise<boolean> => (speechMode() === 'api' ? Promise.resolve(true) : localReady())

/** Starts the model download early, so the first recording does not wait for it. */
export function warmUpSpeech(): void {
  if (speechMode() === 'local') void localReady()
}

// ---------- The worker process ----------

type Waiting = { resolve: (heard: Heard) => void; reject: (err: Error) => void; onProgress?: (share: number) => void }

let worker: ChildProcess | null = null
let nextId = 1
const jobs = new Map<number, Waiting>()

function getWorker(): ChildProcess {
  if (worker?.connected) return worker
  const here = fileURLToPath(import.meta.url)
  const child = fork(join(dirname(here), `speechWorker${extname(here)}`), { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
  child.on('message', (message: { id: number; progress?: number; segments?: Segment[]; shares?: number[]; error?: string }) => {
    const job = jobs.get(message.id)
    if (!job) return
    if (message.progress !== undefined) job.onProgress?.(message.progress)
    else {
      jobs.delete(message.id)
      if (message.segments) job.resolve({ segments: message.segments, shares: message.shares ?? [] })
      else job.reject(new Error(message.error ?? 'speech worker failed'))
      keepAlive(child)
    }
  })
  child.on('exit', (code) => {
    if (worker === child) worker = null
    // A crash ends the jobs that waited; the next job starts a new process.
    for (const [id, job] of jobs) {
      jobs.delete(id)
      job.reject(new Error(`speech worker ended (${code})`))
    }
  })
  worker = child
  return child
}

/** An idle worker must not keep the program from ending; a busy one must. */
function keepAlive(child: ChildProcess): void {
  if (jobs.size > 0) {
    child.ref()
    child.channel?.ref()
  } else {
    child.unref()
    child.channel?.unref()
  }
}

function hear(file: string, speakers: boolean, onProgress?: (share: number) => void): Promise<Heard> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    jobs.set(id, { resolve, reject, onProgress })
    const child = getWorker()
    keepAlive(child)
    child.send({ id, file, model: modelDir(), speakers })
  })
}

// ---------- The service ----------

async function apiPiece(file: string, offset: number): Promise<Segment[]> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(await readFile(file))], { type: 'audio/mpeg' }), 'audio.mp3')
  form.append('model', env.SPEECH_API_MODEL)
  form.append('language', 'he')
  form.append('response_format', 'verbose_json')
  const res = await fetch(env.SPEECH_API_URL!, { method: 'POST', headers: { Authorization: `Bearer ${env.SPEECH_API_KEY!}` }, body: form, signal: AbortSignal.timeout(5 * 60_000) })
  if (!res.ok) throw new Error(`speech service: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { text?: string; segments?: { start: number; end: number; text: string }[] }
  if (data.segments?.length) return data.segments.map((s) => ({ start: offset + s.start, end: offset + s.end, text: s.text.trim() }))
  return data.text?.trim() ? [{ start: offset, end: offset, text: data.text.trim() }] : []
}

/**
 * What is said in a recording. "input" is a local file or a signed https address; "safe" are the ffmpeg options that
 * limit what it may open. Returns null when speech recognition is off or fails.
 */
export async function listen(
  input: string,
  options: { dir: string; seconds: number; safe: readonly string[]; speakers?: boolean; onProgress?: (share: number) => void },
): Promise<Heard | null> {
  if (!(await speechReady())) return null
  const seconds = Math.max(1, options.seconds)
  const from = ['-v', 'error', '-nostdin', '-y', ...options.safe, '-t', String(seconds), '-i', input, '-vn', '-ac', '1', '-ar', '16000']
  const limits = { timeout: 15 * 60_000, maxBuffer: 4 * 1024 * 1024 }
  try {
    if (speechMode() === 'local') {
      const file = join(options.dir, 'speech.raw')
      await run('ffmpeg', [...from, '-f', 's16le', file], limits)
      const started = Date.now()
      const heard = await hear(file, options.speakers ?? false, options.onProgress)
      if (seconds > 60) pace = pace * 0.6 + ((Date.now() - started) / 1000 / seconds) * 0.4
      return heard
    }
    const whole = join(options.dir, 'speech.mp3')
    await run('ffmpeg', [...from, '-b:a', '40k', whole], limits)
    const segments: Segment[] = []
    for (let at = 0; at < seconds; at += 600) {
      const part = join(options.dir, 'part.mp3')
      await run('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-ss', String(at), '-t', '600', '-i', whole, '-b:a', '40k', part], limits)
      // A few hundred bytes are only a header: the recording ended before its stated length.
      if ((await stat(part)).size < 2000) break
      segments.push(...(await apiPiece(part, at)))
      options.onProgress?.(Math.min(1, (at + 600) / seconds))
    }
    return { segments: segments.filter((s) => s.text), shares: [] }
  } catch (err) {
    console.warn('Speech recognition failed:', err)
    return null
  }
}

const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

/** The transcript with times (and voices, when there are several), for the AI and for people. */
export const withTimes = ({ segments, shares }: Heard) =>
  [
    ...(shares.length > 1 ? [`(voices, told apart by sound: ${shares.map((share, i) => `דובר ${i + 1} spoke about ${Math.round(share * 100)}%`).join(', ')})`] : []),
    ...segments.map((s) => `[${stamp(s.start)}] ${s.speaker ? `דובר ${s.speaker}: ` : ''}${s.text}`),
  ].join('\n')
export const plainText = ({ segments }: Heard) => segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim()
