import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router'
import { Icon } from '../../components/Icon'
import { Logo } from '../../components/Logo'
import { ADMIN_UNAUTHORIZED, api, errorMessage } from '../../lib/api'
import type { AdminStatus } from '../../lib/types'
import { CustomerDetailPage } from './CustomerDetailPage'
import { CustomersPage } from './CustomersPage'
import { PlanEditorPage } from './PlanEditorPage'
import { PlansPage } from './PlansPage'
import './admin.css'

export function AdminApp() {
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading')

  useEffect(() => {
    api('/admin/me')
      .then(() => setState('in'))
      .catch(() => setState('out'))
    const onUnauthorized = () => setState('out')
    window.addEventListener(ADMIN_UNAUTHORIZED, onUnauthorized)
    return () => window.removeEventListener(ADMIN_UNAUTHORIZED, onUnauthorized)
  }, [])

  if (state === 'loading') {
    return (
      <div className="adm page-loader">
        <span className="spinner" />
      </div>
    )
  }
  if (state === 'out') return <AdminLogin onLogin={() => setState('in')} />
  return <AdminShell onLogout={() => setState('out')} />
}

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/admin/login', { body: { password } })
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
        <Logo subtitle="Admin" />
        <p className="adm-login__sub">Enter the admin password to manage customers and plans.</p>
        {error && (
          <div className="alert alert--error" role="alert">
            <Icon name="alert" size={18} /> {error}
          </div>
        )}
        <label className="field">
          <span className="field__label">Admin password</span>
          <span className="input-group">
            <input
              className="input"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
            <button
              type="button"
              className="icon-btn input-group__addon"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
            </button>
          </span>
        </label>
        <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy || !password}>
          {busy && <span className="spinner" />} Enter admin panel
        </button>
      </form>
    </div>
  )
}

function AdminShell({ onLogout }: { onLogout: () => void }) {
  const [status, setStatus] = useState<AdminStatus | null>(null)

  useEffect(() => {
    api<AdminStatus>('/admin/status')
      .then(setStatus)
      .catch(() => undefined)
  }, [])

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
            <Logo subtitle="Admin" />
          </NavLink>
          <nav className="adm-top__nav" aria-label="Admin">
            <NavLink to="/admin/customers" className="adm-top__link">
              <Icon name="users" size={18} /> Customers
            </NavLink>
            <NavLink to="/admin/plans" className="adm-top__link">
              <Icon name="layers" size={18} /> Plans
            </NavLink>
          </nav>
          {status && (
            <div className="adm-top__status" title={`Database: ${status.db} · Storage: ${status.storage.status}`}>
              <span className={`adm-dot${dbOk ? ' is-ok' : ''}`} /> DB
              <span className={`adm-dot${storageOk ? ' is-ok' : ''}`} /> Storage
            </div>
          )}
          <button type="button" className="btn btn--ghost btn--sm" onClick={logout}>
            <Icon name="logout" size={16} /> Log out
          </button>
        </div>
      </header>
      <main className="adm-main">
        <Routes>
          <Route index element={<Navigate to="customers" replace />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<CustomerDetailPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="plans/:id" element={<PlanEditorPage />} />
          <Route path="*" element={<Navigate to="customers" replace />} />
        </Routes>
      </main>
    </div>
  )
}
