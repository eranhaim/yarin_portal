import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { SKILL_META } from '../../lib/game'
import type { SkillKey, TaskContent } from '../../lib/types'

// One task's game content: the skill it trains, the worksheet, the quiz, and the points the
// AI bot checks. The AI bot can write all of it from the task (and, optionally, the lesson's text).
// These changes save at once, apart from the plan's "save" button.

const SKILLS = Object.keys(SKILL_META) as SkillKey[]

type Props = {
  planId: string
  taskId: string
  content: TaskContent
  onSaved: (content: TaskContent) => void
}

export function TaskGameContent({ planId, taskId, content, onSaved }: Props) {
  const [busy, setBusy] = useState<'skill' | 'generate' | 'worksheet' | 'quiz' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const url = `/admin/plans/${planId}/tasks/${taskId}`

  const fieldCount = content.worksheet?.sections.reduce((n, s) => n + s.fields.length, 0) ?? 0
  const questionCount = content.quiz?.questions.length ?? 0
  const hasContent = fieldCount > 0 || questionCount > 0

  const patch = async (what: 'skill' | 'worksheet' | 'quiz', body: Partial<TaskContent>) => {
    setBusy(what)
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

  return (
    <div className="adm-content">
      <div className="adm-content__row">
        <h4>
          <Icon name="sparkles" size={16} /> המשחק במשימה
        </h4>
        <label className="adm-content__skill">
          <span>סקיל</span>
          <select
            className="select"
            value={content.skill ?? ''}
            disabled={busy !== null}
            onChange={(e) => void patch('skill', { skill: (e.target.value || null) as SkillKey | null })}
          >
            <option value="">ללא סקיל</option>
            {SKILLS.map((key) => (
              <option key={key} value={key}>
                {SKILL_META[key].label}
              </option>
            ))}
          </select>
        </label>
        <span className={`chip${fieldCount ? ' chip--success' : ''}`}>
          <Icon name="edit" size={13} /> {fieldCount ? `מסך עבודה · ${fieldCount} שדות` : 'אין מסך עבודה'}
        </span>
        <span className={`chip${questionCount ? ' chip--success' : ''}`}>
          <Icon name="bulb" size={13} /> {questionCount ? `חידון · ${questionCount} שאלות` : 'אין חידון'}
        </span>
        {content.rubric.length > 0 && <span className="chip">{content.rubric.length} קריטריונים לבוט</span>}
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
          <button
            type="button"
            className="btn btn--sm btn--danger-soft"
            disabled={busy !== null}
            onClick={() => window.confirm('למחוק את מסך העבודה של המשימה?') && void patch('worksheet', { worksheet: null })}
          >
            <Icon name="trash" size={14} /> מסך העבודה
          </button>
        )}
        {questionCount > 0 && (
          <button
            type="button"
            className="btn btn--sm btn--danger-soft"
            disabled={busy !== null}
            onClick={() => window.confirm('למחוק את החידון של המשימה?') && void patch('quiz', { quiz: null })}
          >
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
              <h5>מה הבוט בודק</h5>
              <ul>
                {content.rubric.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
