import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { listen, MAX_RECORDING_SECONDS, plainText, withTimes } from './speech.ts'

// Reads pictures, videos and recordings for the AI: ffmpeg makes small images and contact sheets, and speech.ts
// writes down what is said. Both are optional: without them the examiner says openly which files it could not open.

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
// … and only real audio and video containers: no playlists, no lists of files.
const FORMATS = ['-format_whitelist', 'matroska,webm,mov,mp4,m4a,3gp,3g2,mj2,ogg,wav,mp3,aac,flac,amr,aiff,caf,asf,avi,mpegts,mpeg,flv']
const MEDIA = [...FFMPEG, ...FORMATS]
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

/** Homework videos: the examiner judges the first five minutes. */
const MAX_SECONDS = 300

export type MediaReading = {
  seconds: number
  /** JPEG contact sheets: frames in order, left to right and top to bottom. */
  sheets: Buffer[]
  /** What is said. null when speech recognition is off; an empty string when nobody speaks. */
  transcript: string | null
  /** The recording was longer than what was read. */
  cut: boolean
}

export async function probe(url: string): Promise<{ seconds: number; video: boolean; audio: boolean }> {
  const { stdout } = await run('ffprobe', ['-v', 'error', ...SAFE_INPUT, ...FORMATS, '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', url], LIMIT)
  const data = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type?: string }[] }
  return {
    seconds: Number(data.format?.duration ?? 0) || 0,
    video: Boolean(data.streams?.some((s) => s.codec_type === 'video')),
    audio: Boolean(data.streams?.some((s) => s.codec_type === 'audio')),
  }
}

/** One video or recording: frames and speech. A whole call is read with "long" (its transcript carries times). */
export async function readMedia(url: string, options: { long?: boolean; onProgress?: (share: number) => void } = {}): Promise<MediaReading> {
  const info = await probe(url)
  const limit = options.long ? MAX_RECORDING_SECONDS : MAX_SECONDS
  const seconds = Math.min(info.seconds || limit, limit)
  return withTemp(async (dir) => {
    const sheets: Buffer[] = []
    if (info.video) {
      // The opening seconds decide if people keep watching, so they get their own sheet.
      const opening = join(dir, 'opening.jpg')
      await run('ffmpeg', [...MEDIA, '-t', '4', '-i', url, '-vf', 'fps=2,scale=-2:420,tile=8x1', '-frames:v', '1', '-q:v', '4', opening], LIMIT).catch(() => undefined)
      const whole = join(dir, 'whole.jpg')
      await run('ffmpeg', [...MEDIA, '-t', String(seconds), '-i', url, '-vf', `fps=${(16 / Math.max(seconds, 2)).toFixed(5)},scale=-2:360,tile=8x2`, '-frames:v', '1', '-q:v', '4', whole], LIMIT).catch(() => undefined)
      for (const file of [opening, whole]) if (existsSync(file)) sheets.push(await readFile(file))
    }
    let transcript: string | null = null
    if (info.audio) {
      const segments = await listen(url, { dir, seconds, safe: [...SAFE_INPUT, ...FORMATS], onProgress: options.onProgress })
      transcript = segments && (options.long ? withTimes(segments) : plainText(segments))
    } else transcript = ''
    return { seconds: info.seconds, sheets, transcript, cut: info.seconds > seconds + 1 }
  })
}

/** A short voice message as text (up to five minutes). null when it could not be understood. */
export async function voiceText(data: Buffer): Promise<string | null> {
  return withTemp(async (dir) => {
    const file = join(dir, 'voice')
    await writeFile(file, data)
    // The bytes come from a browser: ffmpeg may open this one file and nothing else.
    const safe = ['-protocol_whitelist', 'file', ...FORMATS]
    const { stdout } = await run('ffmpeg', ['-hide_banner', '-nostdin', ...safe, '-i', file, '-vn', '-t', '300', '-f', 'null', '-progress', 'pipe:1', '-nostats', '-v', 'error', '-'], LIMIT)
    const seconds = Math.ceil(Number([...stdout.matchAll(/out_time_us=(\d+)/g)].at(-1)?.[1] ?? 0) / 1_000_000)
    if (seconds < 1) return ''
    const segments = await listen(file, { dir, seconds: Math.min(300, seconds), safe })
    return segments && plainText(segments)
  })
}
