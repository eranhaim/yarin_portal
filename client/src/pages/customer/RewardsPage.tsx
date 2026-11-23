import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { currentMonth, formatShekels, LEAD_STATUS_LABEL, monthLabel } from '../../lib/game'
import type { GameSummary, MyLead, RewardState } from '../../lib/types'
import { useCustomer } from './customerContext'

// Prizes: "bring a friend" (link + friends' status), the prize pyramid, and the road to "the boss".

const RANKS = [
  { label: 'טירון', min: 0 },
  { label: 'שחקן', min: 10_000 },
  { label: 'יזם', min: 25_000 },
  { label: 'טייקון', min: 50_000 },
  { label: 'מוגול', min: 75_000 },
  { label: 'הבוס', min: 100_000 },
]

export function RewardsPage() {
  const { game, refreshGame } = useCustomer()
  const [leads, setLeads] = useState<MyLead[] | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api<{ code: string; leads: MyLead[] }>('/me/referrals')
      .then((res) => {
        setCode(res.code)
        setLeads(res.leads)
      })
      .catch(() => setLeads([]))
  }, [])

  if (!game) {
    return (
      <div className="page-loader">
        <span className="spinner" />
      </div>
    )
  }

  const link = code ? `${window.location.origin}/join/${code}` : ''
  const share = `היי! אני בתוכנית הליווי העסקי של ירין ואורן ("סקיל אורגני") וזה ממש עושה לי את העבודה. שווה לך לבדוק: ${link}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be blocked; the link is visible to copy by hand.
    }
  }

  return (
    <div className="rewards-page">
      <header className="page-head">
        <span className="gta-eyebrow">חבר מביא חבר</span>
        <h1 className="gta-title">פרסים ובונוסים</h1>
        <p>מביאים חברים, מסיימים שלבים, מגדילים הכנסות, ופותחים פרסים אמיתיים.</p>
      </header>

      <section className="panel invite">
        <div className="invite__text">
          <h2 className="panel__title">
            <Icon name="users" size={20} /> הקישור האישי שלכם
          </h2>
          <p>כל חבר שנרשם דרך הקישור ומצטרף לליווי מזכה אתכם ב-200 XP ומקדם אתכם בפירמידת הפרסים.</p>
          <div className="invite__link">
            <code className="ltr">{link || '…'}</code>
            <button type="button" className="btn btn--sm" onClick={() => void copy()} disabled={!link}>
              <Icon name={copied ? 'check' : 'file'} size={15} /> {copied ? 'הועתק!' : 'העתקה'}
            </button>
            <a className="btn btn--sm btn--whatsapp" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer">
              שליחה בוואטסאפ
            </a>
          </div>
        </div>
        <div className="invite__stats">
          <span>
            <b>{game.referrals.joined}</b> הצטרפו
          </span>
          <span>
            <b>{game.referrals.total}</b> נרשמו
          </span>
        </div>
        {leads && leads.length > 0 && (
          <ul className="invite__leads">
            {leads.map((lead) => (
              <li key={lead.id} className={`invite__lead invite__lead--${lead.status}`}>
                <span>{lead.name}</span>
                <b>{LEAD_STATUS_LABEL[lead.status]}</b>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="section-title">פירמידת הפרסים</h2>
        <Pyramid rewards={game.rewards} />
      </section>

      <BossRoad game={game} onSaved={refreshGame} />
    </div>
  )
}

function Pyramid({ rewards }: { rewards: RewardState[] }) {
  const tiers = [4, 3, 2, 1] as const
  return (
    <div className="pyramid">
      {tiers.map((tier) => (
        <div key={tier} className={`pyramid__tier pyramid__tier--${tier}`}>
          {rewards
            .filter((r) => r.tier === tier)
            .map((r, i) => (
              <article
                key={r.key}
                className={`prize${r.unlocked ? ' is-unlocked' : ''}${r.delivered ? ' is-delivered' : ''}`}
                style={{ '--p': `${Math.round(r.progress * 100)}%`, animationDelay: `${(4 - tier) * 120 + i * 60}ms` } as CSSProperties}
              >
                <span className="prize__icon">
                  <Icon name={r.unlocked ? 'trophy' : 'lock'} size={22} />
                </span>
                <h3>{r.title}</h3>
                <p>{r.conditions.join(' או ')}</p>
                <span className="prize__bar">
                  <i />
                </span>
                <small>{r.delivered ? 'נמסר לכם 🎉' : r.unlocked ? 'נפתח! ירין ייצור קשר' : `${Math.round(r.progress * 100)}%`}</small>
              </article>
            ))}
        </div>
      ))}
    </div>
  )
}

function BossRoad({ game, onSaved }: { game: GameSummary; onSaved: () => Promise<void> }) {
  const [month, setMonth] = useState(currentMonth())
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = game.revenue.latest
  // Headroom above the boss line, so the line and its label never touch the top edge.
  const max = Math.max(100_000, ...game.revenue.history.map((h) => h.amount)) * 1.2

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/me/revenue', { body: { month, amount: Number(amount.replace(/[^\d.]/g, '')) } })
      setAmount('')
      await onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel boss-road">
      <div className="boss-road__head">
        <div>
          <h2 className="panel__title">
            <Icon name="chart" size={20} /> הדרך לבוס
          </h2>
          <p>הבוס = ₪100,000 הכנסה בחודש. דווחו כל חודש על ההכנסות ועלו בדרגות.</p>
        </div>
        <div className="boss-road__now">
          <span className="hud__money">{formatShekels(latest)}</span>
          <small>{game.revenue.latestMonth ? monthLabel(game.revenue.latestMonth) : 'עוד לא דיווחתם'}</small>
        </div>
      </div>

      <ol className="ladder">
        {RANKS.map((rank, i) => {
          const reached = i <= game.revenue.rank.index
          return (
            <li key={rank.label} className={`ladder__rung${reached ? ' is-reached' : ''}${i === game.revenue.rank.index ? ' is-current' : ''}`}>
              <b>{rank.label}</b>
              <span>{rank.min === 0 ? 'מתחילים' : formatShekels(rank.min)}</span>
            </li>
          )
        })}
      </ol>

      {game.revenue.history.length > 0 && (
        <div className="revenue-chart" role="img" aria-label="הכנסות לפי חודש">
          {game.revenue.history.map((h) => (
            <div key={h.month} className="revenue-chart__bar" style={{ '--h': `${Math.round((h.amount / max) * 100)}%` } as CSSProperties}>
              <em>{formatShekels(h.amount)}</em>
              <i />
              <small>{monthLabel(h.month).split(' ')[0]}</small>
            </div>
          ))}
          <span className="revenue-chart__goal" data-label="הבוס · ₪100,000" style={{ bottom: `${(100_000 / max) * 100}%` }} />
        </div>
      )}

      <form className="boss-road__form" onSubmit={(e) => void submit(e)}>
        <label className="field">
          <span className="field__label">חודש</span>
          <input className="input" type="month" value={month} max={currentMonth()} onChange={(e) => setMonth(e.target.value)} required />
        </label>
        <label className="field">
          <span className="field__label">הכנסה (₪)</span>
          <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="למשל 18000" required />
        </label>
        <button type="submit" className="btn btn--game" disabled={busy || !amount}>
          {busy ? <span className="spinner" /> : <Icon name="upload" size={18} />} דיווח
        </button>
      </form>
      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}
    </section>
  )
}
