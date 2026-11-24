import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Avatar } from '../../components/Avatar'
import { FileBadge } from '../../components/FileList'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { formatBytes, formatDateTime } from '../../lib/format'
import type { InboxSubmission } from '../../lib/types'
import { useInbox } from './inbox'
import { WorkTabs } from './WorksPage'

type Filter = 'unread' | 'all'

/** All homework the customers handed in, newest first. */
export function InboxPage() {
  const { summary, refresh } = useInbox()
  const [filter, setFilter] = useState<Filter>('unread')
  const [items, setItems] = useState<InboxSubmission[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [permission, setPermission] = useState(() => (typeof Notification === 'undefined' ? 'denied' : Notification.permission))

  const load = useCallback(async (which: Filter) => {
    try {
      const res = await api<{ submissions: InboxSubmission[] }>(`/admin/submissions?filter=${which}`)
      setItems(res.submissions)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [])

  // Reload when the filter changes, and when new homework arrives (the bell's poll).
  useEffect(() => {
    void load(filter)
  }, [filter, load, summary.latestAt])

  const markSeen = async (ids?: string[]) => {
    try {
      await api('/admin/submissions/seen', { body: ids ? { ids } : {} })
      const now = new Date().toISOString()
      setItems((list) =>
        (list ?? [])
          .map((s) => (!ids || ids.includes(s.id) ? { ...s, seenAt: s.seenAt ?? now } : s))
          .filter((s) => filter === 'all' || !s.seenAt),
      )
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return
    setPermission(await Notification.requestPermission())
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>עבודות</h1>
          <p>
            {summary.unread === 0 ? 'אין הגשות חדשות.' : summary.unread === 1 ? 'הגשה חדשה אחת.' : `${summary.unread} הגשות חדשות.`} הקבצים
            שהלקוחות העלו למשימות, מהחדש לישן.
          </p>
        </div>
        <div className="adm-page__actions">
          {permission === 'default' && (
            <button type="button" className="btn btn--outline" onClick={() => void enableNotifications()}>
              <Icon name="bell" size={17} /> התראות בדפדפן
            </button>
          )}
          {summary.unread > 0 && (
            <button type="button" className="btn btn--primary" onClick={() => void markSeen()}>
              <Icon name="check" size={17} /> סימון הכול כנקרא
            </button>
          )}
        </div>
      </header>

      <WorkTabs />
      <div className="adm-filter" role="radiogroup" aria-label="סינון">
        {(['unread', 'all'] as const).map((f) => (
          <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}>
            {f === 'unread' ? 'חדשים' : 'כל הקבצים'}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {items === null && !error ? (
        <div className="page-loader">
          <span className="spinner" />
        </div>
      ) : items && items.length === 0 ? (
        <div className="adm-empty">
          <span className="adm-empty__icon">
            <Icon name="inbox" size={30} />
          </span>
          <h2>{filter === 'unread' ? 'הכול נקרא' : 'עדיין אין הגשות'}</h2>
          <p>כשלקוח מעלה קובץ למשימה, הוא מופיע כאן, והפעמון למעלה מראה כמה הגשות חדשות יש.</p>
        </div>
      ) : (
        <ul className="adm-inbox">
          {items?.map((s, i) => (
            <li key={s.id} className={`adm-inbox__item${s.seenAt ? '' : ' is-new'}`} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
              <Link to={s.customer ? `/admin/customers/${s.customer.id}` : '#'} className="adm-inbox__who">
                <Avatar name={s.customer?.name ?? '?'} url={s.customer?.avatarUrl} size={44} />
                <span>
                  <strong>{s.customer?.name ?? 'לקוח שנמחק'}</strong>
                  <small>{formatDateTime(s.createdAt)}</small>
                </span>
              </Link>
              <div className="adm-inbox__task">
                <span className="adm-inbox__task-title">{s.taskTitle}</span>
                <span className="adm-inbox__task-meta">
                  {s.chapterTitle} · {s.planTitle}
                </span>
                {s.note && <span className="adm-inbox__note">„{s.note}”</span>}
              </div>
              <div className="adm-inbox__file">
                <FileBadge fileName={s.fileName} />
                <span>
                  <bdi>{s.fileName}</bdi>
                  <small className="ltr">{formatBytes(s.size)}</small>
                </span>
              </div>
              <div className="adm-inbox__actions">
                {s.downloadUrl && (
                  <a className="btn btn--sm" href={s.downloadUrl} onClick={() => !s.seenAt && void markSeen([s.id])}>
                    <Icon name="download" size={15} /> הורדה
                  </a>
                )}
                {!s.seenAt && (
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => void markSeen([s.id])}>
                    <Icon name="check" size={15} /> נקרא
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
