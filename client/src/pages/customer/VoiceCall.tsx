import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { errorMessage } from '../../lib/api'
import { canRecord, clock, newRecognition, speak, stopSpeaking, transcribeVoice, useHebrewVoice, useRecorder, type Recognition } from '../../lib/voice'

// A voice call with a coach or with a simulated client: the customer talks, the answer is read aloud, and so on.
// Every sentence is also written in the chat, so the score at the end works as usual.

type Props = {
  name: string
  /** The last thing that was said to the customer. */
  opening: string
  /** Sends what the customer said; returns the answer. */
  onSay: (text: string) => Promise<string>
  onClose: () => void
}

type Phase = 'speaking' | 'listening' | 'thinking' | 'waiting'

const PHASE: Record<Phase, string> = { speaking: 'מדבר', listening: 'מקשיב לכם', thinking: 'חושב', waiting: 'בהמתנה' }

export function VoiceCall({ name, opening, onSay, onClose }: Props) {
  const voice = useHebrewVoice()
  const recorder = useRecorder()
  const [phase, setPhase] = useState<Phase>('waiting')
  const [heard, setHeard] = useState('')
  const [said, setSaid] = useState(opening)
  const [error, setError] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const recognition = useRef<Recognition | null>(null)
  const open = useRef(true)
  const text = useRef('')

  const reply = useCallback(
    async (message: string) => {
      setPhase('thinking')
      setError(null)
      try {
        const answer = await onSay(message)
        if (!open.current) return
        setSaid(answer)
        setHeard('')
        setPhase('speaking')
        speak(answer, voice, () => open.current && listenRef.current())
      } catch (err) {
        if (!open.current) return
        setError(errorMessage(err))
        setPhase('waiting')
      }
    },
    [onSay, voice],
  )

  const listen = useCallback(() => {
    stopSpeaking()
    setError(null)
    setHeard('')
    text.current = ''
    const r = newRecognition(false)
    if (!r) {
      // Without the browser's recognition the customer presses to talk, and the server writes it down.
      if (!canRecord()) {
        setError('הדפדפן הזה לא תומך בהקלטה. אפשר להמשיך בכתב.')
        setPhase('waiting')
        return
      }
      void recorder.start().then(() => setPhase('listening'))
      return
    }
    r.onresult = (e) => {
      let all = ''
      for (let i = 0; i < e.results.length; i++) all += e.results[i]![0].transcript
      text.current = all.trim()
      setHeard(all)
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setError('אין גישה למיקרופון. אשרו אותה בהגדרות הדפדפן ונסו שוב.')
    }
    r.onend = () => {
      recognition.current = null
      if (!open.current) return
      if (text.current) void reply(text.current)
      else setPhase('waiting')
    }
    recognition.current = r
    try {
      r.start()
      setPhase('listening')
    } catch {
      recognition.current = null
      setPhase('waiting')
    }
  }, [recorder, reply])

  const listenRef = useRef(listen)
  useEffect(() => {
    listenRef.current = listen
  })

  const pressed = async () => {
    if (phase === 'thinking') return
    if (phase !== 'listening') {
      listen()
      return
    }
    if (recognition.current) {
      recognition.current.stop()
      return
    }
    const recording = await recorder.stop('voice')
    if (!recording) {
      setPhase('waiting')
      return
    }
    setPhase('thinking')
    try {
      const words = await transcribeVoice(recording.file)
      if (words) await reply(words)
      else {
        setError('לא שמענו דיבור. נסו שוב.')
        setPhase('waiting')
      }
    } catch (err) {
      setError(errorMessage(err))
      setPhase('waiting')
    }
  }

  // The call starts with the other side's last sentence.
  const firstVoice = useRef(voice)
  useEffect(() => {
    open.current = true
    setPhase('speaking')
    speak(opening, firstVoice.current, () => open.current && listenRef.current())
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current()
    window.addEventListener('keydown', onKey)
    return () => {
      open.current = false
      window.clearInterval(timer)
      window.removeEventListener('keydown', onKey)
      recognition.current?.abort()
      stopSpeaking()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  return (
    <div className="call" role="dialog" aria-modal="true" aria-label={`שיחה קולית עם ${name}`}>
      <header>
        <strong>{name}</strong>
        <time>{clock(seconds)}</time>
      </header>
      <button type="button" className={`call__face is-${phase}`} onClick={() => void pressed()} aria-label={phase === 'listening' ? 'סיימתי לדבר' : 'לדבר עכשיו'}>
        <span>{name.slice(0, 1)}</span>
      </button>
      <p className="call__phase" role="status">
        {phase === 'thinking' ? <span className="spinner" /> : null} {PHASE[phase]}
      </p>
      <div className="call__words">
        {phase === 'listening' || phase === 'thinking' ? <p className="call__me">{heard || '…'}</p> : <p>{said}</p>}
        {error && <p className="call__error">{error}</p>}
        {!voice && !error && <small>במכשיר הזה אין קול בעברית, לכן התשובות מופיעות בכתב.</small>}
      </div>
      <footer>
        <button type="button" className={`call__btn${phase === 'listening' ? ' is-on' : ''}`} onClick={() => void pressed()} disabled={phase === 'thinking'}>
          <Icon name={phase === 'listening' ? 'send' : 'mic'} size={24} />
          <small>{phase === 'listening' ? 'סיימתי' : 'לדבר'}</small>
        </button>
        <button type="button" className="call__btn call__btn--end" onClick={onClose}>
          <Icon name="phone" size={24} />
          <small>סיום השיחה</small>
        </button>
      </footer>
    </div>
  )
}
