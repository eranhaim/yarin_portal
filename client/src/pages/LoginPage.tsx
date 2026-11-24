import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
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
              לומדים, מתרגלים,
              <br />
              <span>ורואים את העסק גדל.</span>
            </h1>
            <p>סימולטור להתפתחות עסקית עם ירין ואורן: בכל רגע משימה אחת ברורה, משוב על עבודה אמיתית, ושני מדדים: הלמידה והעסק.</p>
          </div>
          <ul className="login__perks">
            <li>
              <span>
                <Icon name="route" size={18} />
              </span>
              מסלול אישי לפי העסק שלכם
            </li>
            <li>
              <span>
                <Icon name="users" size={18} />
              </span>
              שלושה מאמנים שמכירים את העסק ובודקים עבודה
            </li>
            <li>
              <span>
                <Icon name="chart" size={18} />
              </span>
              לידים, שיחות, הכנסה ורווח, חודש אחרי חודש
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
          <div className="login__card-body">
            <div className="login__mobile-logo">
              <Logo />
            </div>
            <h2>ברוכים הבאים</h2>
            <p className="login__sub">התחברו כדי להמשיך מאיפה שעצרתם.</p>

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
              {busy && <span className="spinner" />}
              {busy ? 'מתחברים…' : 'כניסה'}
            </button>

            <p className="login__help">אין לכם חשבון? פנו לירין כדי לקבל גישה.</p>
          </div>
        </form>
      </main>
    </div>
  )
}
