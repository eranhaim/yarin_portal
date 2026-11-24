import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from './api'

// Voice: talking instead of typing, recording a file, and reading answers aloud in Hebrew.
// Dictation uses the browser's own speech recognition when there is one (instant). Otherwise the recording goes to
// the server, which writes down what was said.

// ---------- The browser's speech recognition (not in the TypeScript library) ----------

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } }
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> }
export type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type RecognitionClass = new () => Recognition
const recognitionClass = (): RecognitionClass | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const canRecognize = () => recognitionClass() !== null
export const canRecord = () => typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

export function newRecognition(continuous: boolean): Recognition | null {
  const Class = recognitionClass()
  if (!Class) return null
  const recognition = new Class()
  recognition.lang = 'he-IL'
  recognition.continuous = continuous
  recognition.interimResults = true
  return recognition
}

const micError = (err: unknown): string => {
  const name = err instanceof DOMException ? err.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'אין גישה למיקרופון. אשרו אותה בהגדרות הדפדפן ונסו שוב.'
  if (name === 'NotFoundError') return 'לא נמצא מיקרופון במכשיר.'
  return 'המיקרופון לא נפתח. נסו שוב.'
}

// ---------- Recording ----------

const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
const extensionOf = (type: string) => (type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm')

export type Recording = { file: File; seconds: number }

/** Records the microphone into a file. "level" (0-1) follows the voice. */
export function useRecorder() {
  const [state, setState] = useState<'idle' | 'recording' | 'paused'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const live = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; audio: AudioContext | null; timer: number; started: number; before: number } | null>(null)

  const release = useCallback(() => {
    const now = live.current
    if (!now) return
    window.clearInterval(now.timer)
    now.stream.getTracks().forEach((t) => t.stop())
    void now.audio?.close().catch(() => undefined)
    live.current = null
    setState('idle')
    setSeconds(0)
    setLevel(0)
  }, [])
  useEffect(() => release, [release])

  const start = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48_000 })
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      let audio: AudioContext | null = null
      let analyser: AnalyserNode | null = null
      try {
        audio = new AudioContext()
        analyser = audio.createAnalyser()
        analyser.fftSize = 512
        audio.createMediaStreamSource(stream).connect(analyser)
      } catch {
        // The level meter is extra.
      }
      const samples = new Uint8Array(512)
      const timer = window.setInterval(() => {
        const now = live.current
        if (!now) return
        if (now.recorder.state === 'recording') setSeconds(now.before + (Date.now() - now.started) / 1000)
        if (analyser) {
          analyser.getByteTimeDomainData(samples)
          let sum = 0
          for (const s of samples) sum += ((s - 128) / 128) ** 2
          setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4))
        }
      }, 100)
      live.current = { recorder, stream, chunks, audio, timer, started: Date.now(), before: 0 }
      recorder.start(1000)
      setState('recording')
    } catch (err) {
      setError(micError(err))
    }
  }, [])

  const pause = useCallback(() => {
    const now = live.current
    if (!now) return
    if (now.recorder.state === 'recording') {
      now.before += (Date.now() - now.started) / 1000
      now.recorder.pause()
      setState('paused')
    } else {
      now.started = Date.now()
      now.recorder.resume()
      setState('recording')
    }
  }, [])

  const stop = useCallback(
    (name = 'הקלטה') =>
      new Promise<Recording | null>((resolve) => {
        const now = live.current
        if (!now) {
          resolve(null)
          return
        }
        const total = now.before + (now.recorder.state === 'recording' ? (Date.now() - now.started) / 1000 : 0)
        now.recorder.onstop = () => {
          const type = (now.recorder.mimeType || 'audio/webm').split(';')[0]!
          const file = new File(now.chunks, `${name}.${extensionOf(type)}`, { type })
          release()
          resolve(file.size > 500 && total >= 0.6 ? { file, seconds: total } : null)
        }
        now.recorder.stop()
      }),
    [release],
  )

  return { state, seconds, level, error, start, pause, stop, cancel: release }
}

export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

// ---------- Dictation ----------

/** A short recording as text, by the server. */
export async function transcribeVoice(file: File): Promise<string> {
  const res = await fetch('/api/me/voice', { method: 'POST', headers: { 'Content-Type': file.type || 'audio/webm' }, body: file })
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
  if (!res.ok) throw new Error(data.error ?? 'לא הצלחנו לפענח את ההקלטה')
  return data.text ?? ''
}

/** Talking into a text box: onText gets the whole text so far, while the customer speaks. */
export function useDictation(onText: (text: string) => void, server: boolean) {
  const recorder = useRecorder()
  const [state, setState] = useState<'idle' | 'listening' | 'working'>('idle')
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const latest = useRef(onText)
  useEffect(() => {
    latest.current = onText
  })
  useEffect(() => () => recognition.current?.abort(), [])

  const supported = canRecognize() || (server && canRecord())

  const start = async (before: string) => {
    setError(null)
    const prefix = before.trim() ? `${before.trim()} ` : ''
    const r = newRecognition(true)
    if (!r) {
      await recorder.start()
      setState('listening')
      return
    }
    let final = ''
    r.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!
        if (result.isFinal) final += `${result[0].transcript.trim()} `
        else live += result[0].transcript
      }
      latest.current(`${prefix}${final}${live}`.replace(/\s+/g, ' '))
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('אין גישה למיקרופון. אשרו אותה בהגדרות הדפדפן ונסו שוב.')
      else if (e.error === 'network') setError('זיהוי הדיבור של הדפדפן לא זמין כרגע. אפשר להקליד.')
    }
    r.onend = () => {
      recognition.current = null
      setState('idle')
    }
    recognition.current = r
    try {
      r.start()
      setState('listening')
    } catch {
      recognition.current = null
      setError('המיקרופון תפוס. נסו שוב בעוד רגע.')
    }
  }

  const stop = async (before: string) => {
    if (recognition.current) {
      recognition.current.stop()
      return
    }
    const recording = await recorder.stop('voice')
    if (!recording) {
      setState('idle')
      return
    }
    setState('working')
    try {
      const text = await transcribeVoice(recording.file)
      if (text) latest.current(`${before.trim() ? `${before.trim()} ` : ''}${text}`)
      else setError('לא שמענו דיבור. נסו שוב.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setState('idle')
    }
  }

  return { supported, state, error: error ?? recorder.error, start, stop }
}

// ---------- Reading aloud ----------

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window

/** The best Hebrew voice of this device; null when it has none. */
export function hebrewVoice(): SpeechSynthesisVoice | null {
  if (!canSpeak()) return null
  const voices = window.speechSynthesis.getVoices().filter((v) => /^(he|iw)/i.test(v.lang))
  return voices.find((v) => /natural|online|google/i.test(v.name)) ?? voices[0] ?? null
}

/** The voices load late in some browsers; this asks again when they arrive. */
export function useHebrewVoice(): SpeechSynthesisVoice | null {
  const [voice, setVoice] = useState(hebrewVoice)
  useEffect(() => {
    if (!canSpeak()) return
    const update = () => setVoice(hebrewVoice())
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  return voice
}

const forReading = (text: string) => text.replace(/\*\*|[„”"#]/g, '').replace(/₪/g, ' שקלים ').replace(/[–—]/g, ', ')

/** Reads a text aloud. Long texts go sentence by sentence (some browsers stop in the middle of long ones). */
export function speak(text: string, voice: SpeechSynthesisVoice | null, onEnd?: () => void): void {
  if (!canSpeak()) {
    onEnd?.()
    return
  }
  const synth = window.speechSynthesis
  synth.cancel()
  const sentences = forReading(text).match(/[^.!?\n]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? []
  if (sentences.length === 0) {
    onEnd?.()
    return
  }
  let done = false
  const finish = () => {
    if (done) return
    done = true
    onEnd?.()
  }
  sentences.forEach((sentence, i) => {
    const u = new SpeechSynthesisUtterance(sentence)
    u.lang = 'he-IL'
    if (voice) u.voice = voice
    u.rate = 1.02
    if (i === sentences.length - 1) {
      u.onend = finish
      u.onerror = finish
    }
    synth.speak(u)
  })
}

export const stopSpeaking = () => {
  if (canSpeak()) window.speechSynthesis.cancel()
}

/** The length of a recording, when the browser can read it. */
export function recordingSeconds(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const finish = (value: number | undefined) => {
      URL.revokeObjectURL(url)
      resolve(value)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : undefined)
    audio.onerror = () => finish(undefined)
    window.setTimeout(() => finish(undefined), 4000)
    audio.src = url
  })
}
