import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router'
import { Avatar } from '../../components/Avatar'
import { FileBadge } from '../../components/FileList'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { api, errorMessage } from '../../lib/api'
import { formatBytes, formatDateTime } from '../../lib/format'
import type { CheckState, WorkDetail, WorkItem } from '../../lib/types'
import { useInbox } from './inbox'
import { ReviewView } from './ReviewView'

// The review queue. The AI checked the work already; Yarin and Oren approve it, send it back, or add a note.
// Their decision always wins.

const CHECK: Record<CheckState, { label: string; tone: string }> = {
  none: { label: 'עוד לא נבדק', tone: '' },
  fix: { label: 'הבוחן החזיר', tone: 'warn' },
  defense: { label: 'בשאלות', tone: 'brand' },
  passed: { label: 'עבר', tone: 'success' },
  returned: { label: 'החזרתם', tone: 'warn' },
  approved: { label: 'אישרתם', tone: 'success' },
  accepted: { label: 'המשיך הלאה', tone: 'warn' },
  waiting: { label: 'מחכה לכם', tone: 'danger' },
}

export function WorkTabs() {
  const { summary, works } = useInbox()
  return (
    <div className="adm-tabs">
      <NavLink to="/admin/works" className="adm-tab">
        עבודות לבדיקה {works.open > 0 && <span className="adm-tab__count">{works.open}</span>}
      </NavLink>
      <NavLink to="/admin/inbox" className="adm-tab">
        קבצים {summary.unread > 0 && <span className="adm-tab__count">{summary.unread}</span>}
      </NavLink>
    </div>
  )
}

export function WorksPage() {
  const { works: counts, refresh } = useInbox()
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [items, setItems] = useState<WorkItem[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api<{ works: WorkItem[] }>(`/admin/works?filter=${filter}`)
      setItems(res.works)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  const close = () => {
    setOpenId(null)
    void load()
    void refresh()
  }

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>עבודות</h1>
          <p>
            הבוחן כבר בדק. אתם מאשרים, מחזירים לתיקון או מוסיפים הערה, וההחלטה שלכם קובעת.
            {counts.requested > 0 && ` ${counts.requested === 1 ? 'לקוח אחד ביקש' : `${counts.requested} לקוחות ביקשו`} שתסתכלו.`}
          </p>
        </div>
      </header>
      <WorkTabs />
      <div className="adm-filter" role="radiogroup" aria-label="סינון">
        {(['open', 'all'] as const).map((f) => (
          <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}>
            {f === 'open' ? 'מחכות לכם' : 'הכול'}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {items === null ? (
        !error && (
          <div className="page-loader">
            <span className="spinner" />
          </div>
        )
      ) : items.length === 0 ? (
        <div className="adm-empty">
          <span className="adm-empty__icon">
            <Icon name="check" size={30} />
          </span>
          <h2>{filter === 'open' ? 'אין עבודות שמחכות' : 'עוד לא הוגשו עבודות'}</h2>
          <p>כשלקוח מגיש מסך עבודה, הוא מופיע כאן עם הבדיקה של הבוחן.</p>
        </div>
      ) : (
        <ul className="adm-works">
          {items.map((w) => (
            <li key={w.id} className={w.human?.status === 'requested' ? 'is-requested' : ''}>
              <button type="button" onClick={() => setOpenId(w.id)}>
                <Avatar name={w.customer.name} url={w.customer.avatarUrl} size={42} />
                <span className="adm-works__who">
                  <strong>{w.customer.name}</strong>
                  <small>{formatDateTime(w.submittedAt)}</small>
                </span>
                <span className="adm-works__task">
                  <strong>{w.taskTitle}</strong>
                  <small>
                    {w.chapterTitle} {w.version > 1 && `· גרסה ${w.version}`}
                    {w.human?.status === 'requested' && w.human.request && ` · „${w.human.request}”`}
                  </small>
                </span>
                {w.score !== null && <b className="adm-works__score">{w.score}</b>}
                <span className={`chip${CHECK[w.check].tone ? ` chip--${CHECK[w.check].tone}` : ''}`}>{w.human?.status === 'requested' ? 'מבקש שתסתכלו' : CHECK[w.check].label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openId && <WorkModal id={openId} onClose={close} />}
    </div>
  )
}

function WorkModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [work, setWork] = useState<WorkDetail | null>(null)
  const [note, setNote] = useState('')
  const [version, setVersion] = useState<number | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ work: WorkDetail }>(`/admin/works/${id}`)
      .then((res) => {
        setWork(res.work)
        setNote(res.work.human?.status === 'returned' ? res.work.human.note : '')
      })
      .catch((err) => setError(errorMessage(err)))
  }, [id])

  const decide = async (action: 'approve' | 'return' | 'note') => {
    setBusy(action)
    setError(null)
    try {
      await api(`/admin/works/${id}/decision`, { body: { action, note } })
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(null)
    }
  }

  const shownText = work ? (work.attempts.find((a) => a.number === version)?.text ?? work.text) : ''

  return (
    <Modal
      open
      onClose={onClose}
      title={work ? `${work.customer.name} · ${work.taskTitle}` : 'עבודה'}
      size="xl"
      footer={
        work && (
          <div className="adm-decision">
            <textarea className="textarea" rows={2} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="הערה ללקוח: מה טוב, ומה בדיוק לשפר" aria-label="הערה ללקוח" />
            <div>
              <button type="button" className="btn btn--primary" disabled={busy !== null} onClick={() => void decide('approve')}>
                {busy === 'approve' ? <span className="spinner" /> : <Icon name="check" size={16} />} אישור
              </button>
              <button type="button" className="btn btn--outline" disabled={busy !== null || !note.trim()} onClick={() => void decide('return')}>
                {busy === 'return' ? <span className="spinner" /> : <Icon name="edit" size={16} />} החזרה לתיקון
              </button>
              <button type="button" className="btn btn--ghost" disabled={busy !== null || !note.trim()} onClick={() => void decide('note')}>
                רק הערה
              </button>
            </div>
          </div>
        )
      }
    >
      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}
      {!work ? (
        !error && (
          <div className="page-loader">
            <span className="spinner" />
          </div>
        )
      ) : (
        <div className="adm-work">
          <div className="adm-work__answers">
            <p className="adm-work__meta">
              <Link to={`/admin/customers/${work.customer.id}`}>לעמוד הלקוח</Link>
              {work.attempts.length > 1 && (
                <select className="select" value={version ?? ''} onChange={(e) => setVersion(e.target.value ? Number(e.target.value) : null)} aria-label="גרסה">
                  <option value="">הגרסה האחרונה</option>
                  {work.attempts.map((a) => (
                    <option key={a.number} value={a.number}>
                      גרסה {a.number}
                      {a.score !== null && ` · ${a.score}`}
                    </option>
                  ))}
                </select>
              )}
            </p>
            {work.human?.status === 'requested' && work.human.request && (
              <div className="alert alert--info">
                <Icon name="users" size={17} /> הלקוח ביקש: {work.human.request}
              </div>
            )}
            <pre className="adm-worksheets__answers">{shownText || 'אין מסך עבודה.'}</pre>
            {work.files.length > 0 && (
              <ul className="adm-subs">
                {work.files.map((f) => (
                  <li key={f.id} className="adm-subs__item">
                    <FileBadge fileName={f.fileName} />
                    <span className="adm-subs__text">
                      <bdi>{f.fileName}</bdi>
                      <small className="ltr">{formatBytes(f.size)}</small>
                      {f.note && <span className="adm-subs__note">„{f.note}”</span>}
                    </span>
                    {f.downloadUrl && (
                      <a className="btn btn--sm" href={f.downloadUrl}>
                        <Icon name="download" size={15} /> הורדה
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="adm-work__review">{work.review ? <ReviewView review={work.review} chat={work.chat} /> : <p className="empty-note">הבוחן עוד לא בדק את העבודה.</p>}</div>
        </div>
      )}
    </Modal>
  )
}
