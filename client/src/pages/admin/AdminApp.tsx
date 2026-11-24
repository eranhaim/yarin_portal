import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router'
import { Icon } from '../../components/Icon'
import { Logo } from '../../components/Logo'
import { ADMIN_UNAUTHORIZED, api, errorMessage } from '../../lib/api'
import type { AdminIdentity, AdminStatus } from '../../lib/types'
import { AdminsPage } from './AdminsPage'
import { BrainPage } from './BrainPage'
import { CustomerDetailPage } from './CustomerDetailPage'
import { CustomersPage } from './CustomersPage'
import { HostsPage } from './HostsPage'
import { InboxContext, useInboxPolling } from './inbox'
import { InboxPage } from './InboxPage'
import { LabPage } from './LabPage'
import { LeadsPage } from './LeadsPage'
import { PlanEditorPage } from './PlanEditorPage'
import { PlansPage } from './PlansPage'
import { WorksPage } from './WorksPage'
import './admin.css'

/** undefined = still checking; null = signed out. */
type Session = AdminIdentity | null | undefined

export function AdminApp() {
  const [me, setMe] = useState<Session>(undefined)

  const loadMe = () =>
    api<{ admin: AdminIdentity }>('/admin/me')
      .then((res) => setMe(res.admin))
      .catch(() => setMe(null))

  useEffect(() => {
    void loadMe()
    const onUnauthorized = () => setMe(null)
    window.addEventListener(ADMIN_UNAUTHORIZED, onUnauthorized)
    return () => window.removeEventListener(ADMIN_UNAUTHORIZED, onUnauthorized)
  }, [])

  if (me === undefined) {
    return (
      <div className="adm page-loader">
        <span className="spinner" />
      </div>
    )
  }
  if (me === null) return <AdminLogin onLogin={() => void loadMe()} />
  return <AdminShell me={me} onLogout={() => setMe(null)} />
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/admin/login', { body: { email, password } })
      onLogin()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adm-login">
      <form className="adm-login__card" onSubmit={submit}>
        <span className="adm-login__lock">
          <Icon name="lock" size={26} />
        </span>
        <Logo subtitle="ניהול" />
        <p className="adm-login__sub">היכנסו עם האימייל והסיסמה של חשבון המנהל שלכם.</p>
        {error && (
          <div className="alert alert--error" role="alert">
            <Icon name="alert" size={18} /> {error}
          </div>
        )}
        <label className="field">
          <span className="field__label">אימייל</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="you@business.com"
            autoFocus
          />
          <span className="field__hint">כניסה עם הסיסמה הראשית של השרת? השאירו את האימייל ריק.</span>
        </label>
        <label className="field">
          <span className="field__label">סיסמה</span>
          <span className="input-group">
            <input
              className="input"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="icon-btn input-group__addon"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'}
            >
              <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
            </button>
          </span>
        </label>
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy || !password}>
          {busy && <span className="spinner" />} כניסה לניהול
        </button>
      </form>
    </div>
  )
}

function AdminShell({ me, onLogout }: { me: AdminIdentity; onLogout: () => void }) {
  const [status, setStatus] = useState<AdminStatus | null>(null)
  const inbox = useInboxPolling()
  const unread = inbox.summary.unread + inbox.works.open
  const [newLeads, setNewLeads] = useState(0)

  const loadLeads = useCallback(() => {
    api<{ new: number }>('/admin/leads/summary')
      .then((res) => setNewLeads(res.new))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    api<AdminStatus>('/admin/status')
      .then(setStatus)
      .catch(() => undefined)
    loadLeads()
    // New friends arrive from the public invite page; check now and then.
    const timer = setInterval(loadLeads, 120_000)
    return () => clearInterval(timer)
  }, [loadLeads])

  const logout = async () => {
    await api('/admin/logout', { method: 'POST' }).catch(() => undefined)
    onLogout()
  }

  const storageOk = status?.storage.status === 'connected'
  const dbOk = status?.db === 'connected'

  return (
    <div className="adm">
      <header className="adm-top">
        <div className="adm-top__inner">
          <NavLink to="/admin/customers" className="adm-top__logo">
            <Logo subtitle="ניהול" />
          </NavLink>
          <nav className="adm-top__nav" aria-label="ניווט ניהול">
            <NavLink to="/admin/customers" className="adm-top__link">
              <Icon name="users" size={18} /> לקוחות
            </NavLink>
            <NavLink to="/admin/plans" className="adm-top__link">
              <Icon name="layers" size={18} /> תוכניות
            </NavLink>
            <NavLink
              to={inbox.works.open > 0 || inbox.summary.unread === 0 ? '/admin/works' : '/admin/inbox'}
              className={`adm-top__link adm-top__inbox${unread > 0 ? ' has-unread' : ''}`}
              aria-label={unread > 0 ? `עבודות, ${unread} חדשות` : 'עבודות'}
            >
              <Icon name="bell" size={18} /> עבודות
              {unread > 0 && (
                <span key={unread} className="adm-top__badge">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </NavLink>
            <NavLink to="/admin/leads" className="adm-top__link adm-top__inbox" aria-label={newLeads > 0 ? `חבר מביא חבר, ${newLeads} חדשים` : 'חבר מביא חבר'}>
              <Icon name="star" size={18} /> חבר מביא חבר
              {newLeads > 0 && <span className="adm-top__badge">{newLeads > 99 ? '99+' : newLeads}</span>}
            </NavLink>
            <NavLink to="/admin/brain" className="adm-top__link">
              <Icon name="brain" size={18} /> המוח
            </NavLink>
            <NavLink to="/admin/lab" className="adm-top__link">
              <Icon name="shield" size={18} /> מאמנים
            </NavLink>
            <NavLink to="/admin/hosts" className="adm-top__link">
              <Icon name="sparkles" size={18} /> דמויות
            </NavLink>
            <NavLink to="/admin/admins" className="adm-top__link">
              <Icon name="briefcase" size={18} /> מנהלים
            </NavLink>
          </nav>
          {status && (
            <div className="adm-top__status" title={`מסד נתונים: ${status.db} · אחסון: ${status.storage.status}`}>
              <span className={`adm-dot${dbOk ? ' is-ok' : ''}`} /> מסד נתונים
              <span className={`adm-dot${storageOk ? ' is-ok' : ''}`} /> אחסון
            </div>
          )}
          <span className="adm-top__me" title={me.email ?? undefined}>
            {me.name}
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={logout}>
            <Icon name="logout" size={16} /> התנתקות
          </button>
        </div>
        <div className="adm-stripes" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} style={{ background: `var(--g${i + 1})` }} />
          ))}
        </div>
      </header>
      {status && !status.ai.ok && (
        <div className="adm-alert" role="alert">
          <Icon name="alert" size={18} />
          <span>
            <strong>{status.ai.reason === 'credit' ? 'נגמר הקרדיט ב-Anthropic.' : status.ai.reason === 'key' ? 'המפתח של Anthropic לא עובד.' : 'הבינה המלאכותית לא מחוברת.'}</strong> המאמנים והבוחן מושהים, ועבודות של
            לקוחות מגיעות אליכם לבדיקה.{' '}
            {status.ai.reason === 'credit' && (
              <>
                אחרי טעינה ב-
                <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer">
                  console.anthropic.com
                </a>{' '}
                הכול חוזר לבד תוך כמה דקות.
              </>
            )}
          </span>
        </div>
      )}
      <main className="adm-main">
        <InboxContext.Provider value={inbox}>
          <Routes>
            <Route index element={<Navigate to="customers" replace />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="plans" element={<PlansPage />} />
            <Route path="plans/:id" element={<PlanEditorPage />} />
            <Route path="works" element={<WorksPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="brain" element={<BrainPage />} />
            <Route path="lab" element={<LabPage />} />
            <Route path="leads" element={<LeadsPage onChange={loadLeads} />} />
            <Route path="hosts" element={<HostsPage />} />
            <Route path="admins" element={<AdminsPage me={me} />} />
            <Route path="*" element={<Navigate to="customers" replace />} />
          </Routes>
        </InboxContext.Provider>
      </main>
    </div>
  )
}
