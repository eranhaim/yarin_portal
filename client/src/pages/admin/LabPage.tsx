import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import type { BotKey, LabBot } from '../../lib/types'

// The coach lab. Every bot has a fixed set of tests. Its exact version (instructions, lessons, model and tests)
// must pass before customers meet it, and any change closes it until it passes again.

type Lab = { enabled: boolean; passRate: number; bots: LabBot[] }

export function LabPage() {
  const [lab, setLab] = useState<Lab | null>(null)
  const [busy, setBusy] = useState<BotKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setLab(await api<Lab>('/admin/lab'))
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  const running = lab?.bots.some((b) => b.running) ?? false

  useEffect(() => {
    void load()
  }, [load])

  // While tests run, the page follows them.
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => void load(), 4000)
    return () => window.clearInterval(timer)
  }, [running, load])

  const run = async (bot: BotKey) => {
    setBusy(bot)
    setError(null)
    try {
      await api(`/admin/lab/${bot}/run`, { method: 'POST' })
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const release = async (bot: BotKey, released: boolean) => {
    setBusy(bot)
    setError(null)
    try {
      await api(`/admin/lab/${bot}/release`, { body: { released } })
      await load()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>מעבדת המאמנים</h1>
          <p>
            לכל בוט יש סט בדיקות קבוע. הוא נפתח ללקוחות רק אחרי שהגרסה המדויקת שלו עוברת לפחות {Math.round((lab?.passRate ?? 0.85) * 100)}% מהן, בלי אף כישלון
            בבדיקה קריטית. כל שינוי בהנחיות או בחומר של השיעורים דורש בדיקה מחדש.
          </p>
        </div>
        {lab?.enabled && (
          <button
            type="button"
            className="btn btn--primary"
            disabled={running || busy !== null}
            onClick={() => lab.bots.forEach((b) => !b.released && void run(b.bot))}
          >
            <Icon name="shield" size={17} /> בדיקת כל מי שסגור
          </button>
        )}
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}
      {lab && !lab.enabled && <div className="alert alert--error">הבינה המלאכותית לא מחוברת (חסר ANTHROPIC_API_KEY).</div>}

      {!lab ? (
        !error && (
          <div className="page-loader">
            <span className="spinner" />
          </div>
        )
      ) : (
        <div className="adm-lab">
          {lab.bots.map((bot) => (
            <BotCard key={bot.bot} bot={bot} busy={busy === bot.bot} enabled={lab.enabled} onRun={() => void run(bot.bot)} onRelease={(r) => void release(bot.bot, r)} />
          ))}
        </div>
      )}
    </div>
  )
}

function BotCard({ bot, busy, enabled, onRun, onRelease }: { bot: LabBot; busy: boolean; enabled: boolean; onRun: () => void; onRelease: (released: boolean) => void }) {
  const { latest } = bot
  const fresh = latest && latest.version === bot.version
  const state = bot.running
    ? { label: 'בבדיקה…', tone: 'brand' }
    : bot.released
      ? { label: 'פתוח ללקוחות', tone: 'success' }
      : bot.releasedBefore
        ? { label: 'השתנה. צריך בדיקה מחדש', tone: 'warn' }
        : { label: 'סגור', tone: 'danger' }
  return (
    <section className="adm-card adm-bot">
      <div className="adm-card__head">
        <div>
          <h2>{bot.title}</h2>
          <p>
            {bot.tests} בדיקות
            {bot.released && bot.releasedAt && ` · נפתח ${formatDateTime(bot.releasedAt)}`}
          </p>
        </div>
        <span className={`chip chip--${state.tone}`}>{state.label}</span>
      </div>

      {latest && (
        <div className="adm-bot__result">
          <div className="adm-bot__bar" role="img" aria-label={`${latest.passed} מתוך ${latest.total} עברו`}>
            <i style={{ width: `${(latest.passed / Math.max(1, latest.total)) * 100}%` }} className={latest.ok ? 'is-ok' : ''} />
          </div>
          <span>
            <b>
              {latest.passed}/{latest.total}
            </b>{' '}
            עברו {latest.criticalFailed > 0 && <em>· {latest.criticalFailed} כישלונות קריטיים</em>}
            {latest.status === 'done' && !fresh && <small> · של גרסה קודמת</small>}
            {latest.status === 'failed' && <em> · {latest.error}</em>}
          </span>
        </div>
      )}

      <div className="adm-bot__actions">
        <button type="button" className="btn btn--sm btn--primary" onClick={onRun} disabled={!enabled || bot.running || busy}>
          {bot.running || busy ? <span className="spinner" /> : <Icon name="refresh" size={15} />} {bot.running ? `${latest?.cases.length ?? 0}/${bot.tests}` : 'הרצת הבדיקות'}
        </button>
        {bot.released ? (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => onRelease(false)} disabled={busy}>
            סגירה ללקוחות
          </button>
        ) : (
          bot.canRelease && (
            <button type="button" className="btn btn--sm btn--outline" onClick={() => onRelease(true)} disabled={busy}>
              פתיחה ללקוחות
            </button>
          )
        )}
      </div>

      <details className="adm-bot__list">
        <summary>הבדיקות</summary>
        <ul>
          {bot.list.map((test) => {
            const result = latest?.cases.find((c) => c.id === test.id)
            return (
              <li key={test.id} className={result ? (result.passed ? 'is-passed' : 'is-failed') : ''}>
                <details>
                  <summary>
                    <span className="adm-bot__mark">{result ? <Icon name={result.passed ? 'check' : 'x'} size={13} /> : '·'}</span>
                    {test.title}
                    {test.critical && <em>קריטי</em>}
                  </summary>
                  {result && (
                    <div className="adm-bot__case">
                      <ul>
                        {result.checks.map((k, i) => (
                          <li key={i} className={k.passed ? 'is-passed' : 'is-failed'}>
                            <span dir="ltr">{k.text}</span>
                            {k.why && <small>{k.why}</small>}
                          </li>
                        ))}
                      </ul>
                      {result.output && <pre>{result.output}</pre>}
                    </div>
                  )}
                </details>
              </li>
            )
          })}
        </ul>
      </details>
    </section>
  )
}
