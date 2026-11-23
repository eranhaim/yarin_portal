import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import type { AdminLead, LeadStatus } from '../../lib/types'

// "Bring a friend": the friends that customers invited. Marking a friend as joined
// gives the customer who invited them points, which move them up the prize pyramid.

const STATUS: Record<LeadStatus, string> = { new: 'חדש', contacted: 'בשיחה', joined: 'הצטרף', lost: 'לא רלוונטי' }
const STATUSES = Object.keys(STATUS) as LeadStatus[]

type Filter = 'open' | 'all'

export function LeadsPage({ onChange }: { onChange: () => void }) {
  const [leads, setLeads] = useState<AdminLead[] | null>(null)
  const [filter, setFilter] = useState<Filter>('open')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api<{ leads: AdminLead[] }>('/admin/leads')
      setLeads(res.leads)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const setStatus = async (lead: AdminLead, status: LeadStatus) => {
    setBusy(lead.id)
    try {
      await api(`/admin/leads/${lead.id}`, { method: 'PATCH', body: { status } })
      setLeads((list) => list?.map((l) => (l.id === lead.id ? { ...l, status } : l)) ?? null)
      onChange()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const shown = leads?.filter((l) => filter === 'all' || l.status === 'new' || l.status === 'contacted') ?? []
  const counts = { open: leads?.filter((l) => l.status === 'new' || l.status === 'contacted').length ?? 0, all: leads?.length ?? 0 }
  const joined = leads?.filter((l) => l.status === 'joined').length ?? 0

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>חבר מביא חבר</h1>
          <p>
            החברים שהלקוחות הזמינו דרך הקישור האישי שלהם. סמנו „הצטרף” כשחבר נרשם לליווי: הלקוח שהזמין מקבל 200 נקודות ומתקדם בפירמידת
            הפרסים.
          </p>
        </div>
        {leads && (
          <div className="adm-leads__score">
            <strong>{joined}</strong>
            <span>הצטרפו</span>
          </div>
        )}
      </header>

      <div className="adm-tabs" role="tablist" aria-label="סינון חברים">
        {(['open', 'all'] as const).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} className="adm-tab" onClick={() => setFilter(f)}>
            {f === 'open' ? 'פתוחים' : 'כולם'}
            {counts[f] > 0 && <span className="adm-tab__count">{counts[f]}</span>}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {leads === null && !error ? (
        <div className="page-loader">
          <span className="spinner" />
        </div>
      ) : shown.length === 0 ? (
        <div className="adm-empty">
          <span className="adm-empty__icon">
            <Icon name="users" size={30} />
          </span>
          <h2>{filter === 'open' ? 'אין חברים שמחכים לשיחה' : 'עדיין אין הזמנות'}</h2>
          <p>כל לקוח מקבל קישור אישי בעמוד הפרסים. חבר שנרשם דרכו מופיע כאן.</p>
        </div>
      ) : (
        <ul className="adm-leads">
          {shown.map((lead) => (
            <li key={lead.id} className={`adm-leads__item adm-leads__item--${lead.status}`}>
              <div className="adm-leads__who">
                <strong>{lead.name}</strong>
                <span>
                  {lead.phone && (
                    <a href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`} className="ltr">
                      {lead.phone}
                    </a>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} className="ltr">
                      {lead.email}
                    </a>
                  )}
                </span>
                {lead.note && <span className="adm-leads__note">„{lead.note}”</span>}
              </div>
              <div className="adm-leads__from">
                <small>הוזמן/ה ע״י</small>
                <Link to={`/admin/customers/${lead.referrer.id}`}>{lead.referrer.name}</Link>
                <small>{formatDateTime(lead.createdAt)}</small>
              </div>
              <label className="adm-leads__status">
                <select
                  className="select"
                  aria-label={`הסטטוס של ${lead.name}`}
                  value={lead.status}
                  disabled={busy === lead.id}
                  onChange={(e) => void setStatus(lead, e.target.value as LeadStatus)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS[s]}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
