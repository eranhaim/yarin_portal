import { createRequire } from 'node:module'
import { open } from 'node:fs/promises'
import { setPriority } from 'node:os'
import { join } from 'node:path'

// Speech to text in its own process: recognition is heavy and blocks, and the memory returns when it ends.
// It gets jobs over IPC: a file of raw speech (16 kHz, mono, 16 bit) and answers with sentences and their times.

type Job = { id: number; file: string; model: string }
type Segment = { start: number; end: number; text: string }

type Result = { text: string; tokens: string[]; timestamps: number[]; start_time: number }
type Stream = { acceptWaveform: (wave: { sampleRate: number; samples: Float32Array }) => void; inputFinished: () => void }
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

let recognizer: Recognizer | null = null

function load(dir: string): Recognizer {
  if (recognizer) return recognizer
  const sherpa = createRequire(import.meta.url)('sherpa-onnx-node') as { OnlineRecognizer: new (config: unknown) => Recognizer }
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

/** Cuts one stretch of speech into sentences, by punctuation and length. */
function sentences(result: Result): Segment[] {
  const out: Segment[] = []
  let text = ''
  let start = 0
  let last = 0
  const push = () => {
    if (text.trim()) out.push({ start: result.start_time + start, end: result.start_time + last + 0.35, text: text.trim() })
    text = ''
  }
  result.tokens.forEach((token, i) => {
    const at = result.timestamps[i] ?? last
    // A new word may start a new segment after a long one; a piece of a word may not.
    if (text && token.startsWith(' ') && at - start > 9) push()
    if (!text) start = at
    text += token
    last = at
    if (/[.?!]$/.test(token.trim()) && at - start > 1.2) push()
  })
  push()
  return out
}

async function recognize(job: Job): Promise<Segment[]> {
  const r = load(job.model)
  const stream = r.createStream()
  const segments: Segment[] = []
  const take = () => {
    const result = r.getResult(stream)
    if (result.tokens.length) segments.push(...sentences(result))
  }
  const file = await open(job.file)
  try {
    const { size } = await file.stat()
    const bytes = RATE * 2 * CHUNK_SECONDS
    const buffer = Buffer.alloc(bytes)
    let sent = 0
    for (let at = 0; at < size; at += bytes) {
      const { bytesRead } = await file.read(buffer, 0, bytes, at)
      const samples = new Float32Array(bytesRead >> 1)
      for (let i = 0; i < samples.length; i++) samples[i] = buffer.readInt16LE(i * 2) / 32_768
      stream.acceptWaveform({ sampleRate: RATE, samples })
      while (r.isReady(stream)) r.decode(stream)
      if (r.isEndpoint(stream)) {
        take()
        r.reset(stream)
      }
      const share = Math.min(1, (at + bytes) / size)
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
  } finally {
    await file.close()
  }
  return segments
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
      process.send?.({ id: job.id, segments: await recognize(job) })
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
