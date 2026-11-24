import { useEffect, useState, type CSSProperties } from 'react'
import { Icon } from '../../components/Icon'
import { api } from '../../lib/api'
import { LEAD_STATUS_LABEL } from '../../lib/game'
import type { MyLead, RewardState } from '../../lib/types'
import { useCustomer } from './customerContext'
import './rewards.css'

// Prizes: "bring a friend" (a personal link and the friends' status) and the prize pyramid.

export function RewardsPage() {
  const { game } = useCustomer()
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
  const share = `היי! אני בתוכנית הליווי העסקי של ירין ואורן („סקיל אורגני”) וזה ממש עוזר לי. שווה לבדוק: ${link}`

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
        <h1 className="gta-title">פרסים</h1>
        <p>מביאים חברים, מסיימים שלבים או מגיעים ליעד הכנסה, ופותחים פרסים אמיתיים.</p>
      </header>

      <section className="panel invite">
        <div className="invite__text">
          <h2 className="panel__title">
            <Icon name="users" size={20} /> הקישור האישי שלכם
          </h2>
          <p>כל חבר שמצטרף לליווי דרך הקישור מקדם אתכם בפירמידת הפרסים.</p>
          <div className="invite__link">
            <code className="ltr">{link || '…'}</code>
            <button type="button" className="btn btn--sm" onClick={() => void copy()} disabled={!link}>
              <Icon name={copied ? 'check' : 'file'} size={15} /> {copied ? 'הועתק' : 'העתקה'}
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
    </div>
  )
}

function Pyramid({ rewards }: { rewards: RewardState[] }) {
  const tiers = [4, 3, 2, 1] as const
  return (
    <div className="pyramid">
      {tiers.map((tier) => (
        <div key={tier} className="pyramid__tier">
          {rewards
            .filter((r) => r.tier === tier)
            .map((r, i) => (
              <article
                key={r.key}
                className={`prize${r.unlocked ? ' is-unlocked' : ''}${r.delivered ? ' is-delivered' : ''}`}
                style={{ '--p': `${Math.round(r.progress * 100)}%`, animationDelay: `${(4 - tier) * 90 + i * 60}ms` } as CSSProperties}
              >
                <span className="prize__icon">
                  <Icon name={r.unlocked ? 'trophy' : 'lock'} size={21} />
                </span>
                <h3>{r.title}</h3>
                <p>{r.conditions.join(' או ')}</p>
                <span className="prize__bar">
                  <i />
                </span>
                <small>{r.delivered ? 'נמסר לכם' : r.unlocked ? 'נפתח! ירין ייצור קשר' : `${Math.round(r.progress * 100)}%`}</small>
              </article>
            ))}
        </div>
      ))}
    </div>
  )
}
