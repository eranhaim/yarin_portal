import { createRequire } from 'node:module'
import { open } from 'node:fs/promises'
import { setPriority } from 'node:os'
import { join } from 'node:path'

// Speech to text in its own process: recognition is heavy and blocks, and the memory returns when it ends.
// It gets jobs over IPC: a file of raw speech (16 kHz, mono, 16 bit) and answers with sentences and their times.
// For a call it also tells the voices apart.

type Job = { id: number; file: string; model: string; speakers: boolean }
type Segment = { start: number; end: number; text: string; speaker?: number }
/** One piece of a word, and when it was said. */
type Token = { at: number; text: string; speaker?: number }
/** Somebody speaks from start to end. */
type Turn = { start: number; end: number; speaker: number }

type Result = { text: string; tokens: string[]; timestamps: number[]; start_time: number }
type Stream = { acceptWaveform: (wave: { sampleRate: number; samples: Float32Array }) => void; inputFinished: () => void }
type Diarization = { process: (samples: Float32Array) => Turn[] }
type Recognizer = {
  createStream: () => Stream
  isReady: (s: Stream) => boolean
  decode: (s: Stream) => void
  isEndpoint: (s: Stream) => boolean
  reset: (s: Stream) => void
  getResult: (s: Stream) => Result
}

const RATE = 16_000
const CHUNK_SECONDS = 1
const IDLE_MS = 10 * 60_000
/** Telling voices apart needs the whole recording in memory. */
const MAX_SPEAKER_SECONDS = 50 * 60

type Sherpa = { OnlineRecognizer: new (config: unknown) => Recognizer; OfflineSpeakerDiarization: new (config: unknown) => Diarization }
const sherpaOf = () => createRequire(import.meta.url)('sherpa-onnx-node') as Sherpa

let recognizer: Recognizer | null = null

function load(dir: string): Recognizer {
  if (recognizer) return recognizer
  const sherpa = sherpaOf()
  recognizer = new sherpa.OnlineRecognizer({
    featConfig: { sampleRate: RATE, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: join(dir, 'encoder.int8.onnx'), decoder: join(dir, 'decoder.int8.onnx'), joiner: join(dir, 'joiner.int8.onnx') },
      tokens: join(dir, 'tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
      modelType: 'zipformer2',
      debug: 0,
    },
    decodingMethod: 'greedy_search',
    enableEndpoint: true,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 0.8,
    rule3MinUtteranceLength: 24,
  })
  return recognizer
}

/** Cuts the words into sentences: at a change of voice, after punctuation, at a pause, and when it gets long. */
function sentences(tokens: Token[]): Segment[] {
  const out: Segment[] = []
  let now: { text: string; start: number; last: number; speaker?: number } | null = null
  const push = () => {
    if (now?.text.trim()) out.push({ start: now.start, end: now.last + 0.35, text: now.text.trim().replace(/\s+([.,?!])/g, '$1'), ...(now.speaker === undefined ? {} : { speaker: now.speaker }) })
    now = null
  }
  for (const token of tokens) {
    // A new word may start a new sentence; a piece of a word may not.
    const word = token.text.startsWith(' ')
    if (now && word && (now.speaker !== token.speaker || token.at - now.last > 1.4 || token.at - now.start > 10)) push()
    now ??= { text: '', start: token.at, last: token.at, speaker: token.speaker }
    now.text += token.text
    now.last = token.at
    if (/[.?!]$/.test(token.text.trim()) && token.at - now.start > 1.2) push()
  }
  push()
  return out
}

/** Who speaks when. Very short voices are noise and join the voice before them. */
function turnsOf(dir: string, samples: Float32Array): Turn[] {
  const { OfflineSpeakerDiarization } = sherpaOf()
  const diarization = new OfflineSpeakerDiarization({
    segmentation: { pyannote: { model: join(dir, 'speakers-segmentation.int8.onnx') }, numThreads: 2 },
    embedding: { model: join(dir, 'speakers-embedding.onnx'), numThreads: 2 },
    clustering: { numClusters: -1, threshold: 0.6 },
    minDurationOn: 0.2,
    minDurationOff: 0.4,
  })
  const turns = diarization.process(samples).map((t) => ({ start: t.start, end: t.end, speaker: t.speaker })).sort((x, y) => x.start - y.start)
  const total = turns.reduce((sum, t) => sum + t.end - t.start, 0)
  const share = new Map<number, number>()
  for (const t of turns) share.set(t.speaker, (share.get(t.speaker) ?? 0) + (t.end - t.start) / Math.max(1, total))
  let before = turns.find((t) => (share.get(t.speaker) ?? 0) >= 0.06)?.speaker ?? 0
  // Numbers in the order of the first words: 1, 2, …
  const names = new Map<number, number>()
  return turns.map((t) => {
    const speaker = (share.get(t.speaker) ?? 0) >= 0.06 ? t.speaker : before
    before = speaker
    if (!names.has(speaker)) names.set(speaker, names.size + 1)
    return { ...t, speaker: names.get(speaker)! }
  })
}

/** The voice at a moment (the recognizer marks words a little after they begin). */
function speakerAt(turns: Turn[], at: number): number | undefined {
  let best: Turn | undefined
  let distance = Infinity
  for (const t of turns) {
    const d = at < t.start ? t.start - at : at > t.end ? at - t.end : 0
    if (d < distance) {
      distance = d
      best = t
    }
    if (t.start > at + 2) break
  }
  return best?.speaker
}

async function recognize(job: Job): Promise<{ segments: Segment[]; shares: number[] }> {
  const r = load(job.model)
  const stream = r.createStream()
  const tokens: Token[] = []
  const take = () => {
    const result = r.getResult(stream)
    result.tokens.forEach((text, i) => tokens.push({ at: result.start_time + (result.timestamps[i] ?? 0), text: i === 0 && /^[^\s.,?!]/.test(text) ? ` ${text}` : text }))
  }
  const file = await open(job.file)
  try {
    const { size } = await file.stat()
    const seconds = size / 2 / RATE
    const voices = job.speakers && seconds > 8 && seconds < MAX_SPEAKER_SECONDS
    const whole = voices ? new Float32Array(Math.ceil(size / 2)) : null
    const bytes = RATE * 2 * CHUNK_SECONDS
    const buffer = Buffer.alloc(bytes)
    let sent = 0
    for (let at = 0; at < size; at += bytes) {
      const { bytesRead } = await file.read(buffer, 0, bytes, at)
      const samples = new Float32Array(bytesRead >> 1)
      for (let i = 0; i < samples.length; i++) samples[i] = buffer.readInt16LE(i * 2) / 32_768
      whole?.set(samples, at / 2)
      stream.acceptWaveform({ sampleRate: RATE, samples })
      while (r.isReady(stream)) r.decode(stream)
      if (r.isEndpoint(stream)) {
        take()
        r.reset(stream)
      }
      const share = Math.min(1, (at + bytes) / size) * (voices ? 0.45 : 1)
      if (share - sent > 0.03) {
        sent = share
        process.send?.({ id: job.id, progress: share })
      }
      // Lets the next message in, and other programs run.
      await new Promise((resolve) => setImmediate(resolve))
    }
    // A second and a half of silence brings out the last words.
    stream.acceptWaveform({ sampleRate: RATE, samples: new Float32Array(RATE * 1.5) })
    stream.inputFinished()
    while (r.isReady(stream)) r.decode(stream)
    take()

    let shares: number[] = []
    if (whole && tokens.length) {
      try {
        const turns = turnsOf(job.model, whole)
        const count = Math.max(0, ...turns.map((t) => t.speaker))
        if (count > 1) {
          for (const token of tokens) token.speaker = speakerAt(turns, token.at + 0.12)
          // A word is never split between two voices.
          tokens.forEach((token, i) => {
            if (!token.text.startsWith(' ') && i > 0) token.speaker = tokens[i - 1]!.speaker
          })
          const total = turns.reduce((sum, t) => sum + t.end - t.start, 0)
          shares = Array.from({ length: count }, (_, i) => turns.filter((t) => t.speaker === i + 1).reduce((sum, t) => sum + t.end - t.start, 0) / Math.max(1, total))
        }
      } catch (err) {
        console.warn('Could not tell the voices apart:', err)
      }
    }
    return { segments: sentences(tokens), shares }
  } finally {
    await file.close()
  }
}

let idle: NodeJS.Timeout | null = null
function rest() {
  if (idle) clearTimeout(idle)
  idle = setTimeout(() => process.exit(0), IDLE_MS)
}

let queue: Promise<unknown> = Promise.resolve()
process.on('message', (job: Job) => {
  if (idle) clearTimeout(idle)
  queue = queue.then(async () => {
    try {
      process.send?.({ id: job.id, ...(await recognize(job)) })
    } catch (err) {
      process.send?.({ id: job.id, error: err instanceof Error ? err.message : String(err) })
    }
    rest()
  })
})
process.on('disconnect', () => process.exit(0))

try {
  setPriority(10)
} catch {
  // Not allowed everywhere; only a courtesy to the rest of the server.
}
rest()
