import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { currentMonth, formatShekels, monthLabel, monthShort, percent, RANKS } from '../../lib/game'
import type { BusinessNumbers, BusinessSummary, GameSummary } from '../../lib/types'
import { useCustomer } from './customerContext'
import './metrics.css'

// The second metric: how the business really performs. Leads, sales calls, customers, income and profit,
// month by month against the starting point.

export function BusinessPage() {
  const { game, applyGame, plan } = useCustomer()
  const [month, setMonth] = useState<string | null>(null)
  if (!game) {
    return (
      <div className="page-loader">
        <span className="spinner" />
      </div>
    )
  }
  const { business } = game
  const { latest, baseline } = business

  return (
    <div className="metric metric--biz">
      <header className="metric__hero">
        <div className="metric__hero-text">
          <span className="gta-eyebrow">מדד העסק</span>
          <h1 className="gta-title">איך העסק מתפקד</h1>
          <p>תוצאות אמיתיות, פעם בחודש. המדד הזה נפרד מהלמידה: קודם לומדים ומתרגלים, ואז רואים כאן את השינוי.</p>
          {latest ? (
            <div className="metric__big">
              <b>{formatShekels(latest.revenue)}</b>
              <div>
                <span>
                  הכנסה ב{monthLabel(latest.month)} {baseline && baseline.month !== latest.month && <Change from={baseline.revenue} to={latest.revenue} />}
                </span>
                <span>
                  דרגה: <strong>{business.rank.label}</strong>
                  {business.next && (
                    <>
                      {' '}
                      · עוד {formatShekels(business.next.min - latest.revenue)} ל{business.next.label}
                    </>
                  )}
                </span>
              </div>
            </div>
          ) : (
            <div className="metric__empty">
              <p>עוד אין נתונים. האבחון קובע את נקודת ההתחלה של העסק.</p>
              {plan && !plan.route.diagnosed && (
                <Link to="/diagnosis" className="btn btn--game">
                  לאבחון העסק
                </Link>
              )}
            </div>
          )}
        </div>
      </header>

      {business.due && month === null && (
        <div className="due-note">
          <Icon name="clock" size={20} />
          <span>
            <b>{monthLabel(business.due)} מחכה לעדכון.</b> שתי דקות, וככה נראה אם העבודה משנה את העסק.
          </span>
          <button type="button" className="btn btn--game btn--sm" onClick={() => setMonth(business.due)}>
            מעדכנים
          </button>
        </div>
      )}

      {latest && (
        <>
          <ul className="stat-row">
            <Stat label="פניות" value={latest.leads} base={baseline?.leads} show={(v) => v.toLocaleString('he-IL')} />
            <Stat label="שיחות מכירה" value={latest.calls} base={baseline?.calls} show={(v) => v.toLocaleString('he-IL')} />
            <Stat label="לקוחות חדשים" value={latest.deals} base={baseline?.deals} show={(v) => v.toLocaleString('he-IL')} />
            <Stat label="רווח" value={latest.profit} base={baseline?.profit} show={formatShekels} note={latest.margin === null ? undefined : `${percent(latest.margin)} מההכנסה`} />
          </ul>

          <div className="metric__split">
            <section className="panel">
              <h2 className="panel__title">
                <Icon name="chart" size={18} /> הכנסה ורווח
              </h2>
              <RevenueChart business={business} />
            </section>
            <section className="panel">
              <h2 className="panel__title">
                <Icon name="route" size={18} /> המשפך
              </h2>
              <Funnel numbers={latest} />
            </section>
          </div>

          {business.insights.length > 0 && (
            <ul className="insights">
              {business.insights.map((i) => (
                <li key={i.text} className={`insights__item insights__item--${i.tone}`}>
                  <Icon name={i.tone === 'good' ? 'trendUp' : i.tone === 'warn' ? 'alert' : 'bulb'} size={18} /> {i.text}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <section className="panel">
        <h2 className="panel__title">
          <Icon name="flag" size={18} /> הדרך לבוס
        </h2>
        <p className="metric__sub">הדרגה נקבעת רק לפי ההכנסה בחודש האחרון שדיווחתם.</p>
        <ol className="ladder">
          {RANKS.map((rank, i) => (
            <li key={rank.label} className={`ladder__rung${latest && i <= business.rank.index ? ' is-reached' : ''}${latest && i === business.rank.index ? ' is-current' : ''}`}>
              <b>{rank.label}</b>
              <span>{rank.min === 0 ? 'מתחילים' : formatShekels(rank.min)}</span>
            </li>
          ))}
        </ol>
      </section>

      <ReportForm key={month ?? 'new'} business={business} month={month ?? business.due ?? currentMonth()} open={month !== null} onDone={() => setMonth(null)} onSaved={applyGame} onEdit={setMonth} />
    </div>
  )
}

function Change({ from, to }: { from: number; to: number }) {
  if (from <= 0) return null
  const change = to / from - 1
  if (Math.abs(change) < 0.01) return <em className="change">בלי שינוי מנקודת ההתחלה</em>
  return (
    <em className={`change change--${change > 0 ? 'up' : 'down'}`}>
      {change > 0 ? '+' : '−'}
      {Math.round(Math.abs(change) * 100)}% מנקודת ההתחלה
    </em>
  )
}

function Stat({ label, value, base, show, note }: { label: string; value: number | null; base: number | null | undefined; show: (v: number) => string; note?: string }) {
  return (
    <li>
      <small>{label}</small>
      <b>{value === null ? '—' : show(value)}</b>
      <span>{note ?? (base != null && value !== null && base !== value ? `נקודת ההתחלה: ${show(base)}` : value === null ? 'עוד לא עדכנתם' : ' ')}</span>
    </li>
  )
}

function Funnel({ numbers }: { numbers: BusinessNumbers }) {
  const steps = [
    { label: 'פניות', value: numbers.leads, rate: null as number | null },
    { label: 'שיחות', value: numbers.calls, rate: numbers.leadToCall },
    { label: 'לקוחות', value: numbers.deals, rate: numbers.callToDeal },
  ]
  const top = Math.max(1, ...steps.map((s) => s.value ?? 0))
  if (steps.every((s) => s.value === null)) return <p className="empty-note">הוסיפו פניות, שיחות ולקוחות חדשים לעדכון החודשי.</p>
  return (
    <ol className="funnel">
      {steps.map((s) => (
        <li key={s.label}>
          <span className="funnel__label">{s.label}</span>
          <span className="funnel__bar">
            <i style={{ width: `${Math.max(4, ((s.value ?? 0) / top) * 100)}%` }} />
          </span>
          <b>{s.value ?? '—'}</b>
          <small>{s.rate === null ? '' : `${percent(s.rate)} מהשלב הקודם`}</small>
        </li>
      ))}
      {numbers.averageDeal !== null && <li className="funnel__note">עסקה ממוצעת: {formatShekels(numbers.averageDeal)}</li>}
    </ol>
  )
}

/** Income per month, split into what stays (profit) and what goes (expenses), against the next rank. */
function RevenueChart({ business }: { business: BusinessSummary }) {
  const months = business.history.slice(-8)
  const goal = business.next?.min ?? 100_000
  const max = Math.max(goal, ...months.map((m) => m.revenue)) * 1.12
  const height = (value: number) => `${(Math.max(0, value) / max) * 100}%`
  return (
    <figure className="columns">
      <div className="columns__plot">
        <span className="columns__goal" style={{ bottom: height(goal) }}>
          <span>
            {business.next?.label ?? 'הבוס'} · {formatShekels(goal)}
          </span>
        </span>
        {months.map((m, i) => {
          const profit = m.profit === null ? null : Math.max(0, Math.min(m.profit, m.revenue))
          return (
            <div
              key={m.month}
              className="columns__month"
              tabIndex={0}
              aria-label={`${monthLabel(m.month)}: הכנסה ${formatShekels(m.revenue)}${m.profit === null ? '' : `, רווח ${formatShekels(m.profit)}`}`}
            >
              <span className="columns__bar" style={{ height: height(m.revenue) }}>
                {i === months.length - 1 && <b>{formatShekels(m.revenue)}</b>}
                {profit === null ? (
                  <i className="columns__income" style={{ flex: 1 }} />
                ) : (
                  <>
                    {m.revenue > profit && <i className="columns__cost" style={{ flex: m.revenue - profit }} />}
                    {profit > 0 && <i className="columns__income" style={{ flex: profit }} />}
                  </>
                )}
              </span>
              <span className="columns__tip" role="tooltip">
                <strong>{monthLabel(m.month)}</strong>
                <span>הכנסה {formatShekels(m.revenue)}</span>
                <span>רווח {m.profit === null ? 'לא עודכן' : formatShekels(m.profit)}</span>
              </span>
              <small>{m.baseline ? 'התחלה' : monthShort(m.month)}</small>
            </div>
          )
        })}
      </div>
      <figcaption>
        <span>
          <i className="columns__income" /> נשאר (רווח)
        </span>
        <span>
          <i className="columns__cost" /> הוצאות
        </span>
      </figcaption>
    </figure>
  )
}

type FormProps = {
  business: BusinessSummary
  month: string
  open: boolean
  onDone: () => void
  onSaved: (game: GameSummary) => void
  onEdit: (month: string) => void
}

const FIELDS = [
  { key: 'revenue', label: 'הכנסה', help: 'כל מה שנכנס לעסק', unit: '₪' },
  { key: 'expenses', label: 'הוצאות', help: 'בלי המשכורת שלכם', unit: '₪' },
  { key: 'leads', label: 'פניות חדשות', help: 'הודעות, טלפונים, טפסים', unit: '' },
  { key: 'calls', label: 'שיחות מכירה', help: 'שיחה אמיתית, לא רק הודעה', unit: '' },
  { key: 'deals', label: 'לקוחות חדשים ששילמו', help: '', unit: '' },
] as const
type FieldKey = (typeof FIELDS)[number]['key']

function ReportForm({ business, month: startMonth, open, onDone, onSaved, onEdit }: FormProps) {
  const [shown, setShown] = useState(open || business.history.length === 0)
  const [month, setMonth] = useState(startMonth)
  const valuesOf = (key: string): Record<FieldKey, string> => {
    const existing = business.history.find((h) => h.month === key)
    const text = (v: number | null | undefined) => (v == null ? '' : String(v))
    return { revenue: text(existing?.revenue), expenses: text(existing?.expenses), leads: text(existing?.leads), calls: text(existing?.calls), deals: text(existing?.deals) }
  }
  const [values, setValues] = useState(() => valuesOf(startMonth))
  const [note, setNote] = useState(() => business.history.find((h) => h.month === startMonth)?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const number = (key: FieldKey) => (values[key].trim() === '' ? null : Number(values[key].replace(/[^\d]/g, '')))
    try {
      const res = await api<{ game: GameSummary }>('/me/business/reports', {
        body: { month, revenue: number('revenue') ?? 0, expenses: number('expenses'), leads: number('leads'), calls: number('calls'), deals: number('deals'), note },
      })
      onSaved(res.game)
      setShown(false)
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel report" id="report">
      <div className="panel__head">
        <div>
          <h2>העדכון החודשי</h2>
          <p>רק אתם, ירין ואורן רואים את הנתונים האלה.</p>
        </div>
        {!shown && (
          <button type="button" className="btn btn--game" onClick={() => setShown(true)}>
            <Icon name="plus" size={17} /> עדכון חודש
          </button>
        )}
      </div>
      {shown && (
        <form className="report__form" onSubmit={(e) => void submit(e)}>
          <label className="field">
            <span className="field__label">חודש</span>
            <input
              className="input"
              type="month"
              value={month}
              max={currentMonth()}
              required
              onChange={(e) => {
                setMonth(e.target.value)
                setValues(valuesOf(e.target.value))
                setNote(business.history.find((h) => h.month === e.target.value)?.note ?? '')
              }}
            />
          </label>
          {FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span className="field__label">
                {f.label} {f.unit && `(${f.unit})`}
                {f.help && <small>{f.help}</small>}
              </span>
              <input className="input" inputMode="numeric" value={values[f.key]} required={f.key === 'revenue'} onChange={(e) => setValues({ ...values, [f.key]: e.target.value.replace(/[^\d]/g, '') })} />
            </label>
          ))}
          <label className="field report__note">
            <span className="field__label">מה קרה החודש? (לא חובה)</span>
            <textarea className="textarea" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {error && (
            <div className="alert alert--error" role="alert">
              <Icon name="alert" size={18} /> {error}
            </div>
          )}
          <div className="report__actions">
            <button type="submit" className="btn btn--game" disabled={busy}>
              {busy ? <span className="spinner" /> : <Icon name="check" size={18} />} שמירה
            </button>
            {business.history.length > 0 && (
              <button
                type="button"
                className="btn btn--ghost-light"
                onClick={() => {
                  setShown(false)
                  onDone()
                }}
              >
                ביטול
              </button>
            )}
          </div>
        </form>
      )}
      {business.history.length > 0 && !shown && (
        <div className="report__table-wrap">
          <table className="report__table">
            <thead>
              <tr>
                <th>חודש</th>
                <th>הכנסה</th>
                <th>רווח</th>
                <th>פניות</th>
                <th>שיחות</th>
                <th>לקוחות</th>
                <th aria-label="עריכה" />
              </tr>
            </thead>
            <tbody>
              {[...business.history].reverse().map((h) => (
                <tr key={h.month}>
                  <td>
                    {monthLabel(h.month)} {h.baseline && <em>נקודת ההתחלה</em>}
                  </td>
                  <td>{formatShekels(h.revenue)}</td>
                  <td>{h.profit === null ? '—' : formatShekels(h.profit)}</td>
                  <td>{h.leads ?? '—'}</td>
                  <td>{h.calls ?? '—'}</td>
                  <td>{h.deals ?? '—'}</td>
                  <td>
                    <button type="button" className="icon-btn" aria-label={`עריכת ${monthLabel(h.month)}`} onClick={() => onEdit(h.month)}>
                      <Icon name="edit" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
