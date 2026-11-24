import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { COACH_META, COACH_TITLES, missionLabel } from '../../lib/game'
import type { CoachAttachment, CoachEvaluation, CoachSession, CoachWork } from '../../lib/types'
import { contentTypeOf, putFile } from '../../lib/upload'
import { canRecord, canSpeak, clock, recordingSeconds, speak, stopSpeaking, useDictation, useHebrewVoice, useRecorder } from '../../lib/voice'
import './coach.css'
import { useCustomer } from './customerContext'
import './mission/mission.css'
import { VoiceCall } from './VoiceCall'

// One session with a coach: a role play (written or as a voice call), a check of real work (files, screenshots,
// recordings or worksheets), or a talk. It ends with scores by skill area and one next step.

const ACCEPT = 'image/*,application/pdf,.docx,.pptx,.xlsx,.txt,.csv,video/*,audio/*'
const MAX_FILE = 60 * 1024 * 1024
/** Larger recordings go straight to the storage. */
const DIRECT = 15 * 1024 * 1024
const MAX_RECORDING = 600 * 1024 * 1024
const isMedia = (file: File) => /^(audio|video)\//.test(file.type) || /\.(mp3|m4a|wav|ogg|oga|opus|aac|amr|3gp|flac|mp4|mov|webm)$/i.test(file.name)

export function CoachChatPage() {
  const { id } = useParams()
  return <CoachChat key={id} id={id!} />
}

function CoachChat({ id }: { id: string }) {
  const { refreshGame } = useCustomer()
  const [session, setSession] = useState<CoachSession | null>(null)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<CoachAttachment[]>([])
  const [work, setWork] = useState<CoachWork[]>([])
  const [picking, setPicking] = useState<CoachWork[] | null>(null)
  const [uploading, setUploading] = useState<number | null>(null)
  /** Seconds of the attached recordings, for the waiting time. */
  const lengths = useRef(new Map<string, number>())
  const [call, setCall] = useState(false)
  const [aloud, setAloud] = useState(false)
  const voice = useHebrewVoice()
  const recorder = useRecorder()
  const dictation = useDictation(setText, true)
  const typed = useRef('')
  const [busy, setBusy] = useState<'send' | 'score' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api<{ session: CoachSession }>(`/me/coach/${id}`)
      .then((res) => setSession(res.session))
      .catch((err) => setError(errorMessage(err)))
  }, [id])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [session?.messages.length, busy, session?.pending])
  useEffect(() => stopSpeaking, [])

  // The coach listens to a recording on the server; the answer arrives here, also after leaving and coming back.
  const waiting = Boolean(session?.pending)
  useEffect(() => {
    if (!waiting) return
    let stopped = false
    const timer = window.setInterval(() => {
      api<{ session: CoachSession }>(`/me/coach/${id}`)
        .then((res) => !stopped && setSession(res.session))
        .catch(() => undefined)
    }, 4000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [waiting, id])

  /** One spoken sentence of a voice call. */
  const say = useCallback(
    async (message: string) => {
      const res = await api<{ session: CoachSession }>(`/me/coach/${id}/message`, { body: { text: message } })
      setSession(res.session)
      return res.session.messages.at(-1)!.text
    },
    [id],
  )

  if (!session) {
    return error ? (
      <div className="cx-empty">
        <h2>{error}</h2>
        <Link to="/coach" className="btn btn--game">
          למאמנים
        </Link>
      </div>
    ) : (
      <div className="page-loader">
        <span className="spinner" />
      </div>
    )
  }

  const meta = COACH_META[session.persona]
  const roleplay = session.scenario !== null
  const userTurns = session.messages.filter((m) => m.role === 'user').length
  const canWork = !roleplay && session.persona !== 'mental'
  const empty = !text.trim() && files.length === 0 && work.length === 0
  const withRecording = session.messages.some((m) => m.attachments.some((a) => /\.(mp3|m4a|wav|ogg|oga|opus|aac|amr|3gp|flac|mp4|mov|webm)$/i.test(a.name)))
  const other = session.scenario?.clientName ?? COACH_TITLES[session.persona]

  const upload = async (list: File[]) => {
    setUploading(0)
    setError(null)
    try {
      for (const file of list.slice(0, 4 - files.length)) {
        const media = isMedia(file)
        if (file.size > (media ? MAX_RECORDING : MAX_FILE)) throw new Error(media ? 'אפשר לצרף הקלטה עד 600MB.' : 'אפשר לצרף קובץ עד 60MB.')
        if (media) {
          const seconds = await recordingSeconds(file)
          if (seconds) lengths.current.set(file.name, seconds)
        }
        let attachment: CoachAttachment
        if (media && file.size > DIRECT) {
          const place = await api<{ attachment: CoachAttachment; upload: { url: string; headers: Record<string, string> } }>(`/me/coach/${session.id}/uploads`, {
            body: { name: file.name, contentType: contentTypeOf(file), size: file.size },
          })
          await putFile(place.upload.url, file, place.upload.headers, setUploading)
          attachment = place.attachment
        } else {
          const res = await fetch(`/api/me/coach/${session.id}/attachments`, {
            method: 'POST',
            headers: { 'Content-Type': file.type && file.type !== 'application/json' ? file.type : contentTypeOf(file), 'X-File-Name': encodeURIComponent(file.name) },
            body: file,
          })
          const data = (await res.json().catch(() => ({}))) as { attachment?: CoachAttachment; error?: string }
          if (!res.ok || !data.attachment) throw new Error(data.error ?? 'ההעלאה נכשלה')
          attachment = data.attachment
        }
        setFiles((all) => [...all, attachment])
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(null)
    }
  }

  const keepRecording = async () => {
    const when = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')
    const recording = await recorder.stop(`הקלטה ${when}`)
    if (!recording) return
    lengths.current.set(recording.file.name, recording.seconds)
    await upload([recording.file])
  }

  const talk = () => {
    if (dictation.state === 'listening') void dictation.stop(typed.current)
    else {
      typed.current = text
      void dictation.start(text)
    }
  }

  const retry = async () => {
    setError(null)
    try {
      const res = await api<{ session: CoachSession }>(`/me/coach/${session.id}/retry`, { method: 'POST' })
      setSession(res.session)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const openPicker = async () => {
    setError(null)
    try {
      const res = await api<{ work: CoachWork[] }>('/me/coach-work')
      setPicking(res.work)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (empty || busy) return
    const before = session
    const message = text.trim()
    setBusy('send')
    setError(null)
    setNotice(null)
    // Show the message right away; the reply follows.
    setSession({
      ...session,
      messages: [
        ...session.messages,
        { role: 'user', text: message || 'צירפתי את העבודה.', at: new Date().toISOString(), attachments: [...files, ...work.map((w) => ({ id: w.id, name: w.title }))] },
      ],
    })
    setText('')
    try {
      const res = await api<{ session: CoachSession; skipped: string[] }>(`/me/coach/${session.id}/message`, {
        body: {
          text: message,
          attachments: files,
          work: work.map(({ kind, id: workId }) => ({ kind, id: workId })),
          ...(files.some((f) => lengths.current.has(f.name)) ? { seconds: files.reduce((sum, f) => sum + (lengths.current.get(f.name) ?? 0), 0) } : {}),
        },
      })
      setSession(res.session)
      if (aloud && !res.session.pending) speak(res.session.messages.at(-1)!.text, voice)
      setFiles([])
      setWork([])
      if (res.skipped.length) setNotice(`לא הצלחנו לפתוח: ${res.skipped.join(', ')}`)
      if (session.persona === 'mental') void refreshGame()
    } catch (err) {
      setError(errorMessage(err))
      setSession(before)
      setText(message)
    } finally {
      setBusy(null)
    }
  }

  const finish = async () => {
    setBusy('score')
    setError(null)
    try {
      const res = await api<{ session: CoachSession }>(`/me/coach/${session.id}/evaluate`, { method: 'POST' })
      setSession(res.session)
      void refreshGame()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="coach-chat" style={{ '--c': meta.color } as CSSProperties}>
      <Link to="/coach" className="cx-back">
        <Icon name="arrowLeft" size={16} /> המאמנים
      </Link>
      <header className="coach-chat__head">
        <span className="coach-card__icon">
          <Icon name={meta.icon} size={22} />
        </span>
        <div>
          <h1>{session.title}</h1>
          <p>
            {COACH_TITLES[session.persona]}
            {session.scenario && ` · ${session.scenario.clientName} · ${session.scenario.difficulty}`}
          </p>
        </div>
        {(roleplay || session.persona === 'mental') && (canRecord() || canSpeak()) && (
          <button type="button" className="btn btn--ghost-light coach-chat__call" onClick={() => (stopSpeaking(), setCall(true))} disabled={busy !== null || waiting}>
            <Icon name="phone" size={17} /> שיחה קולית
          </button>
        )}
        <button
          type="button"
          className="btn btn--game"
          onClick={() => void finish()}
          disabled={busy !== null || waiting || userTurns < (withRecording ? 1 : 2)}
          title={userTurns < 2 ? 'כתבו לפחות שתי הודעות' : undefined}
        >
          {busy === 'score' ? <span className="spinner" /> : <Icon name="flag" size={17} />}
          {session.evaluation ? 'סיכום מחדש' : session.scored ? 'סיום וקבלת ציון' : 'סיום וסיכום'}
        </button>
      </header>

      {roleplay && session.messages.length <= 1 && <p className="coach-chat__hint">אתם מדברים עם לקוח. נהלו את השיחה כמו באמת: שאלו, הקשיבו, והציעו צעד הבא. בסוף מקבלים ניתוח.</p>}

      <div className="chat chat--coach" aria-live="polite">
        {session.messages.map((m, i) => (
          <div key={i} className={`chat__msg chat__msg--${m.role}`}>
            {m.role === 'assistant' && <span className="chat__who">{session.scenario?.clientName ?? COACH_TITLES[session.persona]}</span>}
            <Rich text={m.text} />
            {m.role === 'assistant' && !roleplay && i > 0 && <MessageTools text={m.text} voice={voice} />}
            {m.attachments.length > 0 && (
              <div className="chat__files">
                {m.attachments.map((a) => (
                  <span key={a.id}>
                    <Icon name="clip" size={13} /> <bdi>{a.name}</bdi>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {session.pending && <Listening pending={session.pending} />}
        {busy === 'send' && (
          <div className="chat__msg chat__msg--assistant chat__typing" aria-label="כותבים">
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={end} />
      </div>

      {session.evaluation && <Evaluation session={session} evaluation={session.evaluation} />}

      {notice && <div className="alert alert--info">{notice}</div>}
      {session.failed && !waiting && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {session.failed}
          {session.messages.at(-1)?.role === 'user' && (
            <button type="button" className="btn btn--sm" onClick={() => void retry()}>
              ניסיון נוסף
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      <form className="composer" onSubmit={(e) => void send(e)}>
        {(files.length > 0 || work.length > 0 || uploading !== null) && (
          <div className="composer__files">
            {files.map((f) => (
              <span key={f.id}>
                <Icon name="clip" size={14} /> <bdi>{f.name}</bdi>
                <button type="button" aria-label={`הסרת ${f.name}`} onClick={() => setFiles((all) => all.filter((x) => x.id !== f.id))}>
                  <Icon name="x" size={13} />
                </button>
              </span>
            ))}
            {work.map((w) => (
              <span key={w.id}>
                <Icon name="edit" size={14} /> {missionLabel(w.title, 1).label}
                <button type="button" aria-label={`הסרת ${w.title}`} onClick={() => setWork((all) => all.filter((x) => x.id !== w.id))}>
                  <Icon name="x" size={13} />
                </button>
              </span>
            ))}
            {uploading !== null && (
              <span>
                <span className="spinner" /> מעלים{uploading > 0 ? ` ${Math.round(uploading * 100)}%` : '…'}
              </span>
            )}
          </div>
        )}
        <textarea
          className="textarea"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={dictation.state === 'listening' ? 'מקשיבים, דברו…' : dictation.state === 'working' ? 'מפענחים את ההקלטה…' : roleplay ? `מה עונים ל${session.scenario!.clientName}?` : 'כתבו, או לחצו על המיקרופון ודברו…'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(e)
            }
          }}
        />
        {(dictation.error ?? recorder.error) && <p className="composer__error">{dictation.error ?? recorder.error}</p>}
        {recorder.state !== 'idle' ? (
          <div className="composer__rec" role="status">
            <i className="composer__level" style={{ '--l': recorder.level } as CSSProperties} aria-hidden="true" />
            <b>{clock(recorder.seconds)}</b>
            <span>{recorder.state === 'paused' ? 'ההקלטה בהשהיה' : 'מקליטים. אפשר להקליט תרגול, או שיחה ברמקול באישור הצד השני.'}</span>
            <button type="button" className="btn btn--sm btn--ghost-light" onClick={recorder.pause}>
              <Icon name={recorder.state === 'paused' ? 'play' : 'pause'} size={15} /> {recorder.state === 'paused' ? 'המשך' : 'השהיה'}
            </button>
            <button type="button" className="btn btn--sm btn--ghost-light" onClick={recorder.cancel}>
              <Icon name="trash" size={15} /> ביטול
            </button>
            <button type="button" className="btn btn--sm btn--game" onClick={() => void keepRecording()}>
              <Icon name="check" size={15} /> צירוף
            </button>
          </div>
        ) : (
          <div className="composer__bar">
            {dictation.supported && (
              <button
                type="button"
                className={`composer__mic${dictation.state === 'listening' ? ' is-on' : ''}`}
                onClick={talk}
                disabled={busy !== null || waiting || dictation.state === 'working'}
                aria-label={dictation.state === 'listening' ? 'סיום ההכתבה' : 'לדבר במקום להקליד'}
                title={dictation.state === 'listening' ? 'סיום' : 'לדבר במקום להקליד'}
              >
                {dictation.state === 'working' ? <span className="spinner" /> : <Icon name="mic" size={20} />}
              </button>
            )}
            {!roleplay && (
              <>
                <button type="button" className="btn btn--sm btn--ghost-light" onClick={() => input.current?.click()} disabled={uploading !== null || files.length >= 4 || waiting}>
                  <Icon name="clip" size={15} /> {session.persona === 'sales' ? 'הקלטה או קובץ' : 'קובץ'}
                </button>
                {canWork && canRecord() && (
                  <button type="button" className="btn btn--sm btn--ghost-light" onClick={() => void recorder.start()} disabled={uploading !== null || files.length >= 4 || waiting}>
                    <i className="composer__dot" aria-hidden="true" /> להקליט עכשיו
                  </button>
                )}
                {canWork && (
                  <button type="button" className="btn btn--sm btn--ghost-light" onClick={() => void openPicker()} disabled={waiting}>
                    <Icon name="list" size={15} /> מהעבודות שלי
                  </button>
                )}
                <input
                  ref={input}
                  type="file"
                  hidden
                  multiple
                  accept={ACCEPT}
                  onChange={(e) => {
                    const list = [...(e.target.files ?? [])]
                    e.target.value = ''
                    if (list.length) void upload(list)
                  }}
                />
              </>
            )}
            {voice && (
              <button type="button" className="btn btn--sm btn--ghost-light" aria-pressed={aloud} onClick={() => (stopSpeaking(), setAloud((v) => !v))} title="השמעת התשובות בקול">
                <Icon name={aloud ? 'volume' : 'volumeMute'} size={16} /> {aloud ? 'בקול' : 'בשקט'}
              </button>
            )}
            <button type="submit" className="btn btn--game" disabled={busy !== null || uploading !== null || empty || waiting || dictation.state !== 'idle'}>
              <Icon name="send" size={17} /> שליחה
            </button>
          </div>
        )}
      </form>

      {call && <VoiceCall name={other} opening={session.messages.filter((m) => m.role === 'assistant').at(-1)?.text ?? ''} onSay={say} onClose={() => setCall(false)} />}

      {picking && (
        <WorkPicker
          items={picking}
          selected={work}
          onClose={() => setPicking(null)}
          onToggle={(w) => setWork((all) => (all.some((x) => x.id === w.id) ? all.filter((x) => x.id !== w.id) : [...all, w].slice(-3)))}
        />
      )}
    </div>
  )
}

/** The coach listens to a recording, in the background. */
function Listening({ pending }: { pending: NonNullable<CoachSession['pending']> }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [])
  const passed = (now - new Date(pending.since).getTime()) / 1000
  // The server counts pieces of speech; the clock fills the time until the first piece.
  const share = Math.max(0.03, Math.min(0.97, Math.max(pending.progress * 0.92, Math.min(0.9, passed / Math.max(20, pending.eta)) * 0.6)))
  const left = Math.max(15, pending.progress > 0.08 ? (passed / pending.progress) * (1 - pending.progress) : pending.eta - passed)
  return (
    <div className="chat__msg chat__msg--assistant chat__listen" role="status">
      <strong>
        <span className="spinner" /> מקשיב להקלטה ומנתח
      </strong>
      <i style={{ '--p': `${Math.round(share * 100)}%` } as CSSProperties} />
      <small>{left > 90 ? `נשארו בערך ${Math.round(left / 60)} דקות.` : 'עוד רגע.'} אפשר לצאת ולחזור, התשובה תחכה כאן.</small>
    </div>
  )
}

/** Copy an answer (hooks, messages, scripts), or hear it. */
function MessageTools({ text, voice }: { text: string; voice: SpeechSynthesisVoice | null }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard
      .writeText(text.replaceAll('**', ''))
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      })
      .catch(() => undefined)
  }
  return (
    <div className="chat__tools">
      <button type="button" onClick={copy}>
        <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'הועתק' : 'העתקה'}
      </button>
      {voice && (
        <button type="button" onClick={() => speak(text, voice)}>
          <Icon name="volume" size={14} /> השמעה
        </button>
      )}
    </div>
  )
}

/** Plain text with **bold** (the coaches use it for short titles). */
function Rich({ text }: { text: string }) {
  return (
    <p>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part))}
    </p>
  )
}

function Evaluation({ session, evaluation }: { session: CoachSession; evaluation: CoachEvaluation }) {
  const shown = evaluation.dimensions.filter((d) => d.score >= 0)
  const card = session.scenario?.card
  return (
    <section className="panel evaluation">
      <header>
        {evaluation.score !== null && (
          <span className="evaluation__score">
            <b>{evaluation.score}</b>
            <small>מתוך 100</small>
          </span>
        )}
        <div>
          <h2>{evaluation.score !== null ? 'הניתוח שלכם' : 'סיכום השיחה'}</h2>
          <p>{evaluation.summary}</p>
        </div>
      </header>

      {shown.length > 0 && (
        <ul className="evaluation__areas">
          {shown.map((d) => (
            <li key={d.key}>
              <div className="evaluation__area-head">
                <strong>{d.label}</strong>
                <i style={{ '--p': `${d.score}%` } as CSSProperties} />
                <b>{d.score}</b>
              </div>
              {d.evidence && <q>{d.evidence.replace(/^["'״„”]+|["'״„”]+$/g, '')}</q>}
              {d.better && (
                <p>
                  <small>עדיף:</small> {d.better}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {card && (
        <details className="evaluation__card">
          <summary>מה {card.name} באמת חשב/ה</summary>
          <dl>
            <dt>המטרה</dt>
            <dd>{card.goal}</dd>
            <dt>הספק האמיתי</dt>
            <dd>{card.hidden}</dd>
            <dt>מה היה משכנע</dt>
            <dd>{card.trigger}</dd>
          </dl>
        </details>
      )}

      <p className="evaluation__next">
        <Icon name="flag" size={17} />
        <span>
          <small>עד הפעם הבאה</small>
          {evaluation.nextStep}
        </span>
      </p>
    </section>
  )
}

function WorkPicker({ items, selected, onToggle, onClose }: { items: CoachWork[]; selected: CoachWork[]; onToggle: (work: CoachWork) => void; onClose: () => void }) {
  return (
    <div className="setup" role="dialog" aria-modal="true" aria-label="בחירת עבודה" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="setup__card">
        <h2>איזו עבודה לבדוק?</h2>
        {items.length === 0 ? (
          <p className="empty-note">עוד לא הגשתם עבודות.</p>
        ) : (
          <ul className="work-picker">
            {items.map((w) => {
              const on = selected.some((x) => x.id === w.id)
              return (
                <li key={`${w.kind}-${w.id}`}>
                  <button type="button" aria-pressed={on} onClick={() => onToggle(w)}>
                    <Icon name={on ? 'check' : w.kind === 'file' ? 'file' : 'edit'} size={17} />
                    <span>{w.kind === 'file' ? <bdi>{w.title}</bdi> : missionLabel(w.title, 1).label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="setup__actions">
          <button type="button" className="btn btn--game" onClick={onClose}>
            סיום
          </button>
        </div>
      </div>
    </div>
  )
}
