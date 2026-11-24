import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { formatDuration } from '../../lib/format'
import { SKILL_META } from '../../lib/game'
import type { LessonNote, RouteOptions, SkillKey, StageKey, TaskContent, TrackKey } from '../../lib/types'

// One task's game content: the skill it trains, who it is for, how it is done, the worksheet, the quiz, the
// points the AI examiner checks, and what the lesson teaches (the coaches learn from it).
// The AI bot can write the content. These changes save at once, apart from the plan's "save" button.

const SKILLS = Object.keys(SKILL_META) as SkillKey[]

type Props = {
  planId: string
  taskId: string
  content: TaskContent
  routes: RouteOptions | null
  onSaved: (content: TaskContent) => void
}

export function TaskGameContent({ planId, taskId, content, routes, onSaved }: Props) {
  const [busy, setBusy] = useState<'patch' | 'generate' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const url = `/admin/plans/${planId}/tasks/${taskId}`

  const fieldCount = content.worksheet?.sections.reduce((n, s) => n + s.fields.length, 0) ?? 0
  const questionCount = content.quiz?.questions.length ?? 0
  const hasContent = fieldCount > 0 || questionCount > 0

  const patch = async (body: Partial<TaskContent>) => {
    setBusy('patch')
    setError(null)
    try {
      const res = await api<{ content: TaskContent }>(`${url}/content`, { method: 'PATCH', body })
      onSaved(res.content)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const generate = async () => {
    if (hasContent && !window.confirm('הבוט יכתוב מחדש את מסך העבודה, החידון והקריטריונים של המשימה. להמשיך?')) return
    setBusy('generate')
    setError(null)
    try {
      const res = await api<{ content: TaskContent }>(`${url}/generate`, { body: { sourceText: source ?? '' } })
      onSaved(res.content)
      setSource(null)
      setPreview(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const toggle = <T extends string>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

  return (
    <div className="adm-content">
      <div className="adm-content__row">
        <h4>
          <Icon name="sparkles" size={16} /> המשימה
        </h4>
        <label className="adm-content__skill">
          <span>סקיל</span>
          <select className="select" value={content.skill ?? ''} disabled={busy !== null} onChange={(e) => void patch({ skill: (e.target.value || null) as SkillKey | null })}>
            <option value="">ללא סקיל</option>
            {SKILLS.map((key) => (
              <option key={key} value={key}>
                {SKILL_META[key].label}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-content__skill">
          <span>תרגול</span>
          <select className="select" value={content.practice} disabled={busy !== null} onChange={(e) => void patch({ practice: e.target.value as TaskContent['practice'] })}>
            <option value="worksheet">מסך עבודה</option>
            <option value="diagnosis">אבחון העסק</option>
          </select>
        </label>
        <label className="adm-content__skill">
          <span>קובץ</span>
          <select className="select" value={content.fileRule} disabled={busy !== null} onChange={(e) => void patch({ fileRule: e.target.value as TaskContent['fileRule'] })}>
            <option value="optional">לא חובה</option>
            <option value="required">חובה להגיש</option>
            <option value="none">בלי קבצים</option>
          </select>
        </label>
        <label className="adm-content__skill">
          <span>ציון עובר</span>
          <NumberField value={content.passScore} min={0} max={100} disabled={busy !== null} onSave={(v) => v !== null && void patch({ passScore: v })} />
        </label>
        <label className="adm-content__skill">
          <span>דקות תרגול</span>
          <NumberField value={content.minutes} min={1} max={600} disabled={busy !== null} onSave={(v) => void patch({ minutes: v })} />
        </label>
      </div>

      {routes && (
        <div className="adm-content__audience">
          <span>למי המשימה?</span>
          {routes.tracks.map((t) => (
            <button key={t.key} type="button" aria-pressed={content.tracks.includes(t.key)} disabled={busy !== null} onClick={() => void patch({ tracks: toggle<TrackKey>(content.tracks, t.key) })}>
              {t.label}
            </button>
          ))}
          {routes.stages.map((s) => (
            <button key={s.key} type="button" aria-pressed={content.stages.includes(s.key)} disabled={busy !== null} onClick={() => void patch({ stages: toggle<StageKey>(content.stages, s.key) })}>
              {s.label}
            </button>
          ))}
          <small>{content.tracks.length + content.stages.length === 0 ? 'לכולם (בסיס משותף)' : 'רק למי שמסומן'}</small>
        </div>
      )}

      <div className="adm-content__row">
        <span className={`chip${fieldCount ? ' chip--success' : ''}`}>
          <Icon name="edit" size={13} /> {fieldCount ? `מסך עבודה · ${fieldCount} שדות` : 'אין מסך עבודה'}
        </span>
        <span className={`chip${questionCount ? ' chip--success' : ''}`}>
          <Icon name="bulb" size={13} /> {questionCount ? `חידון · ${questionCount} שאלות` : 'אין חידון'}
        </span>
        {content.rubric.length > 0 && <span className="chip">{content.rubric.length} קריטריונים לבוחן</span>}
      </div>

      {source !== null && (
        <label className="field">
          <span className="field__label">חומר מהשיעור (לא חובה)</span>
          <textarea
            className="textarea"
            rows={5}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="הדביקו כאן טקסט מהמצגת או מדף המשימה המקורי. הבוט יבנה ממנו את מסך העבודה והחידון."
          />
        </label>
      )}

      <div className="adm-content__actions">
        <button type="button" className="btn btn--sm btn--primary" onClick={() => void generate()} disabled={busy !== null}>
          {busy === 'generate' ? <span className="spinner" /> : <Icon name="sparkles" size={15} />}
          {busy === 'generate' ? 'הבוט כותב… (עד שתי דקות)' : hasContent ? 'כתיבה מחדש עם AI' : 'יצירה עם AI'}
        </button>
        {source === null && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setSource('')} disabled={busy !== null}>
            <Icon name="file" size={15} /> הוספת חומר מהשיעור
          </button>
        )}
        {hasContent && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setPreview((v) => !v)} aria-expanded={preview}>
            <Icon name={preview ? 'eyeOff' : 'eye'} size={15} /> {preview ? 'הסתרה' : 'תצוגה'}
          </button>
        )}
        {fieldCount > 0 && (
          <button type="button" className="btn btn--sm btn--danger-soft" disabled={busy !== null} onClick={() => window.confirm('למחוק את מסך העבודה של המשימה?') && void patch({ worksheet: null })}>
            <Icon name="trash" size={14} /> מסך העבודה
          </button>
        )}
        {questionCount > 0 && (
          <button type="button" className="btn btn--sm btn--danger-soft" disabled={busy !== null} onClick={() => window.confirm('למחוק את החידון של המשימה?') && void patch({ quiz: null })}>
            <Icon name="trash" size={14} /> החידון
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {preview && hasContent && (
        <div className="adm-content__preview">
          {content.worksheet && (
            <div>
              <h5>מסך העבודה</h5>
              {content.worksheet.intro && <p className="adm-muted">{content.worksheet.intro}</p>}
              <ol>
                {content.worksheet.sections.map((s) => (
                  <li key={s.id}>
                    <strong>{s.title}</strong>
                    <ul>
                      {s.fields.map((f) => (
                        <li key={f.id}>
                          {f.label}
                          {f.type === 'table' && <small> (טבלה: {f.columns.join(' · ')})</small>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {content.quiz && (
            <div>
              <h5>החידון</h5>
              <ol>
                {content.quiz.questions.map((q, i) => (
                  <li key={i}>
                    <strong>{q.question}</strong>
                    <ul>
                      {q.options.map((o, oi) => (
                        <li key={oi} className={oi === q.answer ? 'is-answer' : ''}>
                          {oi === q.answer && <Icon name="check" size={13} />} {o}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {content.rubric.length > 0 && (
            <div>
              <h5>מה הבוחן בודק</h5>
              <ul>
                {content.rubric.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <LessonNoteEditor url={url} />
    </div>
  )
}

/** A number that saves when the field loses focus. */
function NumberField({ value, min, max, disabled, onSave }: { value: number | null; min: number; max: number; disabled: boolean; onSave: (value: number | null) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value))
  return (
    <input
      className="input adm-content__number"
      type="number"
      min={min}
      max={max}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const next = text.trim() === '' ? null : Math.min(max, Math.max(min, Math.round(Number(text))))
        if (next !== value && !(next === null && value === null)) onSave(next)
      }}
    />
  )
}

/** What the lesson teaches: for the customers (in short) and for the coaches (the method). */
function LessonNoteEditor({ url }: { url: string }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<LessonNote | null>(null)
  const [busy, setBusy] = useState<'save' | 'generate' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open || note) return
    api<{ lesson: LessonNote }>(`${url}/lesson`)
      .then((res) => setNote(res.lesson))
      .catch((err) => setMessage(errorMessage(err)))
  }, [open, note, url])

  const save = async () => {
    if (!note) return
    setBusy('save')
    setMessage(null)
    try {
      const res = await api<{ lesson: LessonNote }>(`${url}/lesson`, {
        method: 'PATCH',
        body: { summary: note.summary, keyPoints: note.keyPoints.filter((k) => k.trim()), method: note.method },
      })
      setNote(res.lesson)
      setMessage('נשמר. המאמנים לומדים מהטקסט הזה, ולכן צריך להריץ שוב את הבדיקות שלהם במעבדה.')
    } catch (err) {
      setMessage(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const generate = async () => {
    if (note?.method && !window.confirm('הבוט יכתוב מחדש את הסיכום ואת השיטה מתוך התמלול. להמשיך?')) return
    setBusy('generate')
    setMessage(null)
    try {
      const res = await api<{ lesson: LessonNote }>(`${url}/lesson/generate`, { body: {} })
      setNote(res.lesson)
    } catch (err) {
      setMessage(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <details className="adm-lesson" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <Icon name="list" size={15} /> מה השיעור מלמד (המאמנים והבוחן לומדים מכאן)
      </summary>
      {!note ? (
        <span className="spinner" />
      ) : (
        <div className="adm-lesson__body">
          <label className="field">
            <span className="field__label">השיעור בקצרה (ללקוח)</span>
            <textarea className="textarea" rows={2} value={note.summary} onChange={(e) => setNote({ ...note, summary: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">נקודות עיקריות (שורה לכל נקודה)</span>
            <textarea className="textarea" rows={5} value={note.keyPoints.join('\n')} onChange={(e) => setNote({ ...note, keyPoints: e.target.value.split('\n') })} />
          </label>
          <label className="field">
            <span className="field__label">השיטה, כמו שאתם מלמדים אותה (למאמנים)</span>
            <textarea className="textarea" rows={10} value={note.method} onChange={(e) => setNote({ ...note, method: e.target.value })} />
          </label>
          <p className="adm-muted">
            {note.captionLines > 0 ? `${note.captionLines} שורות כתוביות` : 'אין תמלול לשיעור הזה'}
            {note.moments.length > 0 && ` · רגעים: ${note.moments.map((m) => `${formatDuration(m.at)} ${m.title}`).join(', ')}`}
          </p>
          <div className="adm-content__actions">
            <button type="button" className="btn btn--sm btn--primary" disabled={busy !== null} onClick={() => void save()}>
              {busy === 'save' && <span className="spinner" />} שמירה
            </button>
            {note.captionLines > 0 && (
              <button type="button" className="btn btn--sm btn--ghost" disabled={busy !== null} onClick={() => void generate()}>
                {busy === 'generate' ? <span className="spinner" /> : <Icon name="sparkles" size={15} />} כתיבה מהתמלול
              </button>
            )}
          </div>
        </div>
      )}
      {message && <p className="alert alert--info">{message}</p>}
    </details>
  )
}
