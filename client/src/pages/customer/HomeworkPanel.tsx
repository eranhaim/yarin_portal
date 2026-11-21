import { useRef, useState, type DragEvent } from 'react'
import { FileBadge } from '../../components/FileList'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { formatBytes, formatDateTime } from '../../lib/format'
import type { MyPlan, MyTask, Submission } from '../../lib/types'
import { uploadSubmission } from '../../lib/upload'

type Upload = { key: string; name: string; progress: number; error?: string }

type Props = {
  task: MyTask
  /** Called with the newer plan after an upload or a delete. */
  onPlan: (plan: MyPlan | null) => void
}

/** The customer hands in homework files for a task. Yarin gets them in the admin inbox. */
export function HomeworkPanel({ task, onPlan }: Props) {
  const [uploads, setUploads] = useState<Upload[]>([])
  const [note, setNote] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const busy = uploads.some((u) => !u.error)

  const patchUpload = (key: string, patch: Partial<Upload>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)))

  const start = async (files: File[]) => {
    if (files.length === 0 || busy) return
    setError(null)
    setSentCount(0)
    const queue = files.map((file) => ({ key: crypto.randomUUID(), file }))
    setUploads((list) => [...list.filter((u) => !u.error), ...queue.map(({ key, file }) => ({ key, name: file.name, progress: 0 }))])
    let sent = 0
    // One at a time, so big files do not compete for bandwidth.
    for (const { key, file } of queue) {
      try {
        const plan = await uploadSubmission({ taskId: task.id, file, note, onProgress: (p) => patchUpload(key, { progress: p }) })
        onPlan(plan)
        setUploads((list) => list.filter((u) => u.key !== key))
        sent++
      } catch (err) {
        patchUpload(key, { error: errorMessage(err) })
      }
    }
    if (sent > 0) {
      setNote('')
      setSentCount(sent)
    }
  }

  const remove = async (submission: Submission) => {
    if (!window.confirm(`למחוק את „${submission.fileName}”?`)) return
    setError(null)
    try {
      const res = await api<{ plan: MyPlan | null }>(`/me/submissions/${submission.id}`, { method: 'DELETE' })
      onPlan(res.plan)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    void start([...e.dataTransfer.files])
  }

  return (
    <section className="cx-paper cx-homework" aria-labelledby={`homework-${task.id}`}>
      <header className="cx-homework__head">
        <span className="cx-homework__icon" aria-hidden="true">
          <Icon name="upload" size={22} />
        </span>
        <div>
          <h2 id={`homework-${task.id}`}>הגשת המשימה</h2>
          <p>העלו את מה שהכנתם במשימה: מסמך, טבלה, תמונה או סרטון. ירין ואורן יקבלו התראה ויוכלו לעבור על זה.</p>
        </div>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {sentCount > 0 && (
        <div className="cx-homework__sent" role="status">
          <Icon name="check" size={20} />
          {sentCount === 1 ? 'הקובץ נשלח לירין ואורן!' : `${sentCount} קבצים נשלחו לירין ואורן!`}
        </div>
      )}

      {task.submissions.length > 0 && (
        <ul className="cx-homework__list">
          {task.submissions.map((s, i) => (
            <li key={s.id} className="cx-homework__item" style={{ animationDelay: `${i * 60}ms` }}>
              <FileBadge fileName={s.fileName} />
              <div className="cx-homework__text">
                <span className="cx-homework__name">
                  <bdi>{s.fileName}</bdi>
                </span>
                <span className="cx-homework__meta">
                  הוגש {formatDateTime(s.createdAt)} · <span className="ltr">{formatBytes(s.size)}</span>
                  {s.seenAt && (
                    <span className="cx-homework__seen">
                      <Icon name="eye" size={13} /> נצפה
                    </span>
                  )}
                </span>
                {s.note && <span className="cx-homework__note">{s.note}</span>}
              </div>
              {s.downloadUrl && (
                <a className="icon-btn" href={s.downloadUrl} aria-label={`הורדת ${s.fileName}`} title="הורדה">
                  <Icon name="download" size={17} />
                </a>
              )}
              <button type="button" className="icon-btn icon-btn--danger" onClick={() => void remove(s)} aria-label={`מחיקת ${s.fileName}`} title="מחיקה">
                <Icon name="trash" size={17} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {uploads.length > 0 && (
        <ul className="media__uploads">
          {uploads.map((u) => (
            <li key={u.key} className={u.error ? 'is-error' : ''}>
              <div className="media__upload-row">
                <span className="media__upload-name">
                  <bdi>{u.name}</bdi>
                </span>
                <span className="ltr">{u.error ? 'נכשל' : `${Math.round(u.progress * 100)}%`}</span>
                {u.error && (
                  <button type="button" className="icon-btn" onClick={() => setUploads((list) => list.filter((x) => x.key !== u.key))} aria-label="סגירה">
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
              {u.error ? (
                <span className="field__error">{u.error}</span>
              ) : (
                <div className="progress">
                  <div className="progress__bar" style={{ width: `${u.progress * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div
        className={`cx-homework__drop${dragOver ? ' is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <label className="field cx-homework__note-field">
          <span className="field__label">
            הערה לירין ואורן <small>(לא חובה)</small>
          </span>
          <textarea
            className="textarea"
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="למשל: מה הכי היה לכם קשה במשימה?"
          />
        </label>
        <div className="cx-homework__actions">
          <button type="button" className="btn btn--primary" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <span className="spinner" /> : <Icon name="upload" size={18} />}
            {busy ? 'מעלים…' : 'בחירת קבצים להגשה'}
          </button>
          <span>או גררו קבצים לכאן · עד 5GB לקובץ</span>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void start(files)
          }}
        />
      </div>
    </section>
  )
}
