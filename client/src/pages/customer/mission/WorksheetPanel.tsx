import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../../components/Icon'
import { api, errorMessage } from '../../../lib/api'
import type { Worksheet, WorksheetAnswers, WorksheetField, WorksheetValue, WorksheetView, WorkResult } from '../../../lib/types'

// The in-app work screen ("מסך עבודה"): the Word worksheet as a form. Answers save automatically.

type Props = {
  taskId: string
  worksheet: Worksheet
  view: WorksheetView
  onView: (view: WorksheetView) => void
  /** The work was handed in (a new version). */
  onWork: (result: WorkResult) => void
  /** Whether an AI check follows. */
  examiner: boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function WorksheetPanel({ taskId, worksheet, view, onView, onWork, examiner }: Props) {
  const [answers, setAnswers] = useState<WorksheetAnswers>(view.answers)
  const [save, setSave] = useState<SaveState>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  const latest = useRef(answers)

  const persist = async (value: WorksheetAnswers) => {
    setSave('saving')
    try {
      const res = await api<{ view: WorksheetView }>(`/me/tasks/${taskId}/worksheet`, { method: 'PUT', body: { answers: value } })
      onView(res.view)
      setSave('saved')
    } catch {
      setSave('error')
    }
  }

  // Save a moment after the last change, and right away when the page closes.
  useEffect(
    () => () => {
      if (timer.current) {
        window.clearTimeout(timer.current)
        void persist(latest.current)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const change = (id: string, value: WorksheetValue) => {
    const next = { ...latest.current, [id]: value }
    latest.current = next
    setAnswers(next)
    setSave('idle')
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      void persist(next)
    }, 1200)
  }

  const submit = async () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
    setBusy(true)
    setError(null)
    try {
      const result = await api<WorkResult>(`/me/tasks/${taskId}/worksheet/submit`, { body: { answers: latest.current } })
      setSave('saved')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      onWork(result)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const filled = countFilled(worksheet, answers)

  return (
    <section className="panel worksheet">
      <header className="panel__head">
        <div>
          <h2>מסך העבודה</h2>
          {worksheet.intro && <p>{worksheet.intro}</p>}
        </div>
        <span className={`worksheet__save worksheet__save--${save}`} aria-live="polite">
          {save === 'saving' ? 'שומרים…' : save === 'saved' ? 'נשמר' : save === 'error' ? 'השמירה נכשלה' : `${filled.done}/${filled.total} שדות`}
        </span>
      </header>

      {worksheet.sections.map((section, si) => (
        <fieldset key={section.id} className="worksheet__section" style={{ animationDelay: `${si * 80}ms` }}>
          <legend>
            <span>{si + 1}</span> {section.title}
          </legend>
          {section.description && <p className="worksheet__desc">{section.description}</p>}
          {section.fields.map((field) => (
            <Field key={field.id} field={field} value={answers[field.id]} onChange={(v) => change(field.id, v)} />
          ))}
        </fieldset>
      ))}

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      <footer className="worksheet__footer">
        {view.attempts.length > 0 && <span className="worksheet__submitted">הגשתם גרסה {view.attempts.length}. אפשר לשפר ולהגיש שוב.</span>}
        <button type="button" className="btn btn--game" onClick={() => void submit()} disabled={busy}>
          {busy ? <span className="spinner" /> : <Icon name="check" size={18} />}
          {view.submittedAt ? 'הגשת גרסה חדשה' : examiner ? 'הגשה, ומשם לבדיקה' : 'הגשה'}
        </button>
      </footer>
    </section>
  )
}

function countFilled(ws: Worksheet, answers: WorksheetAnswers) {
  let total = 0
  let done = 0
  for (const section of ws.sections) {
    for (const field of section.fields) {
      total++
      const v = answers[field.id]
      const hasValue = Array.isArray(v)
        ? v.some((row) => (Array.isArray(row) ? row.some((c) => c.trim()) : String(row).trim()))
        : v !== undefined && String(v).trim() !== ''
      if (hasValue) done++
    }
  }
  return { total, done }
}

function Field({ field, value, onChange }: { field: WorksheetField; value: WorksheetValue | undefined; onChange: (v: WorksheetValue) => void }) {
  const label = (
    <span className="field__label">
      {field.label}
      {field.help && <small className="worksheet__help">{field.help}</small>}
    </span>
  )

  switch (field.type) {
    case 'short':
    case 'number':
      return (
        <label className="field worksheet__field">
          {label}
          <input
            className="input"
            type={field.type === 'number' ? 'number' : 'text'}
            inputMode={field.type === 'number' ? 'decimal' : undefined}
            value={value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )
    case 'long':
      return (
        <label className="field worksheet__field">
          {label}
          <textarea className="textarea" rows={4} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
        </label>
      )
    case 'choice':
      return (
        <div className="field worksheet__field" role="radiogroup" aria-label={field.label}>
          {label}
          <div className="worksheet__choices">
            {field.options.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={value === option}
                className="worksheet__choice"
                onClick={() => onChange(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )
    case 'checklist': {
      const selected = Array.isArray(value) ? (value as string[]) : []
      return (
        <div className="field worksheet__field">
          {label}
          <div className="worksheet__choices">
            {field.options.map((option) => {
              const on = selected.includes(option)
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={on}
                  className="worksheet__choice"
                  onClick={() => onChange(on ? selected.filter((o) => o !== option) : [...selected, option])}
                >
                  {on && <Icon name="check" size={14} />} {option}
                </button>
              )
            })}
          </div>
        </div>
      )
    }
    case 'list': {
      const rows = Array.from({ length: field.rows }, (_, i) => (Array.isArray(value) ? String((value as string[])[i] ?? '') : ''))
      return (
        <div className="field worksheet__field">
          {label}
          <ol className="worksheet__list">
            {rows.map((row, i) => (
              <li key={i}>
                <input
                  className="input"
                  value={row}
                  aria-label={`${field.label} ${i + 1}`}
                  onChange={(e) => onChange(rows.map((r, j) => (j === i ? e.target.value : r)))}
                />
              </li>
            ))}
          </ol>
        </div>
      )
    }
    case 'table': {
      const grid = Array.from({ length: field.rows }, (_, r) =>
        field.columns.map((_, c) => (Array.isArray(value) && Array.isArray(value[r]) ? String((value as string[][])[r]![c] ?? '') : '')),
      )
      return (
        <div className="field worksheet__field">
          {label}
          <div className="worksheet__table-wrap">
            <table className="worksheet__table">
              <thead>
                <tr>
                  <th aria-label="שורה" />
                  {field.columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row, r) => (
                  <tr key={r}>
                    <td className="worksheet__row-num">{r + 1}</td>
                    {row.map((cell, c) => (
                      <td key={c}>
                        <textarea
                          className="textarea"
                          rows={2}
                          value={cell}
                          aria-label={`${field.columns[c]} ${r + 1}`}
                          onChange={(e) => onChange(grid.map((rr, ri) => (ri === r ? rr.map((cc, ci) => (ci === c ? e.target.value : cc)) : rr)))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )
    }
  }
}
