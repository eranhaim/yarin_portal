import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Die } from '../components/Board'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { Mascot } from '../components/mascot/Mascot'
import { api, errorMessage } from '../lib/api'
import type { Host } from '../lib/types'
import './LoginPage.css'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shaking, setShaking] = useState(false)
  const [hosts, setHosts] = useState<Host[]>([])

  useEffect(() => {
    api<{ hosts: Host[] }>('/public/hosts')
      .then((res) => setHosts(res.hosts))
      .catch(() => undefined)
  }, [])

  // Already logged in? Go straight to the board.
  useEffect(() => {
    api('/auth/me')
      .then(() => navigate('/map', { replace: true }))
      .catch(() => undefined)
  }, [navigate])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/auth/login', { body: { email, password } })
      navigate('/map')
    } catch (err) {
      setError(errorMessage(err))
      setShaking(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <section className="login__brand">
        <div className="login__brand-inner">
          <Logo light />
          <div className="login__pitch">
            <h1>
              המסע העסקי שלכם,
              <br />
              <span>משימה אחרי משימה.</span>
            </h1>
            <p>התחברו כדי להמשיך בתוכנית עם ירין ואורן: שלבים ברורים, סרטוני הדרכה וכל הכלים שצריך בדרך.</p>
          </div>
          <ul className="login__perks">
            <li>
              <span style={{ background: 'var(--g1)' }}>
                <Icon name="map" size={18} />
              </span>
              עיר משחק עם שלבים ומשימות
            </li>
            <li>
              <span style={{ background: 'var(--g2)' }}>
                <Icon name="video" size={18} />
              </span>
              סרטוני הדרכה בכל שלב
            </li>
            <li>
              <span style={{ background: 'var(--g4)' }}>
                <Icon name="file" size={18} />
              </span>
              קבצים ותבניות במקום אחד
            </li>
          </ul>
        </div>
        {hosts.length > 0 && (
          <div className="login__hosts">
            <Mascot className="login__cast" cast={hosts.map((h) => ({ look: h.look, pose: 'boss', base: false }))} />
            <div className="login__host-names" aria-hidden="true">
              {hosts.map((h) => (
                <span key={h.key}>{h.name}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      <main className="login__main">
        <form
          className={`login__card${shaking ? ' is-shaking' : ''}`}
          onSubmit={submit}
          onAnimationEnd={() => setShaking(false)}
          noValidate
        >
          <div className="login__card-band">
            <Die value={6} />
            <span>כניסה למשחק</span>
            <Die value={4} />
          </div>
          <div className="login__card-body">
            <div className="login__mobile-logo">
              <Logo />
            </div>
            <h2>ברוכים הבאים</h2>
            <p className="login__sub">התחברו כדי להמשיך במסע.</p>

            {error && (
              <div className="alert alert--error" role="alert">
                <Icon name="alert" size={18} />
                <span>{error}</span>
              </div>
            )}

            <label className="field">
              <span className="field__label">אימייל</span>
              <span className="login__input">
                <Icon name="mail" size={18} />
                <input
                  className="input"
                  type="email"
                  autoComplete="email"
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </span>
            </label>

            <label className="field">
              <span className="field__label">סיסמה</span>
              <span className="login__input">
                <Icon name="lock" size={18} />
                <input
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="הסיסמה שלכם"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="icon-btn login__peek"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
                </button>
              </span>
            </label>

            <button type="submit" className="btn btn--game btn--lg btn--block login__submit" disabled={busy}>
              {busy ? <span className="spinner" /> : <Icon name="dice" size={20} />}
              {busy ? 'מתחברים…' : 'כניסה'}
            </button>

            <p className="login__help">אין לכם חשבון? פנו לירין כדי לקבל גישה.</p>
          </div>
        </form>
      </main>
    </div>
  )
}
