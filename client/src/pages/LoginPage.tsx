import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { api, errorMessage } from '../lib/api'
import './LoginPage.css'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shaking, setShaking] = useState(false)

  // Already logged in? Go straight to the map.
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
      <section className="login__brand" aria-hidden="false">
        <div className="login__brand-inner">
          <Logo light />
          <div className="login__pitch">
            <h1>
              Your business journey,
              <br />
              <span>one level at a time.</span>
            </h1>
            <p>Sign in to continue your plan with Yarin: clear levels, guidance videos and the tools you need.</p>
          </div>
          <ul className="login__perks">
            <li>
              <span>
                <Icon name="map" size={18} />
              </span>
              Clear levels and tasks
            </li>
            <li>
              <span>
                <Icon name="video" size={18} />
              </span>
              Guidance videos at every step
            </li>
            <li>
              <span>
                <Icon name="file" size={18} />
              </span>
              Files and templates in one place
            </li>
          </ul>
        </div>
        <JourneyArt />
      </section>

      <main className="login__main">
        <form
          className={`login__card${shaking ? ' is-shaking' : ''}`}
          onSubmit={submit}
          onAnimationEnd={() => setShaking(false)}
          noValidate
        >
          <div className="login__mobile-logo">
            <Logo />
          </div>
          <h2>Welcome back</h2>
          <p className="login__sub">Sign in to continue your journey.</p>

          {error && (
            <div className="alert alert--error" role="alert">
              <Icon name="alert" size={18} />
              <span>{error}</span>
            </div>
          )}

          <label className="field">
            <span className="field__label">Email</span>
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
            <span className="field__label">Password</span>
            <span className="login__input">
              <Icon name="lock" size={18} />
              <input
                className="input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="icon-btn login__peek"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </span>
          </label>

          <button type="submit" className="btn btn--primary btn--lg btn--block login__submit" disabled={busy}>
            {busy ? <span className="spinner" /> : null}
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <Icon name="chevronRight" size={18} />}
          </button>

          <p className="login__help">No account yet? Contact Yarin to get your access.</p>
        </form>
      </main>
    </div>
  )
}

/** Night-sky trail with levels; a light travels along it. */
function JourneyArt() {
  const path = 'M -20 470 C 90 470 70 360 170 350 S 260 250 330 230 S 420 120 520 110'
  const nodes = [
    { x: 170, y: 350, state: 'done' },
    { x: 330, y: 230, state: 'done' },
    { x: 430, y: 150, state: 'current' },
  ] as const
  return (
    <svg className="login__art" viewBox="0 0 520 520" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="login-trail" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#8c78ff" stopOpacity="0.15" />
          <stop offset="60%" stopColor="#ffd56b" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ff8f75" />
        </linearGradient>
        <radialGradient id="login-orb">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="40%" stopColor="#ffd56b" />
          <stop offset="100%" stopColor="#ffd56b" stopOpacity="0" />
        </radialGradient>
      </defs>
      {Array.from({ length: 34 }, (_, i) => (
        <circle
          key={i}
          className="login__star"
          cx={(i * 137.5) % 520}
          cy={(i * 89.3) % 330}
          r={i % 5 === 0 ? 1.8 : 1.1}
          style={{ animationDelay: `${(i % 7) * 0.45}s` }}
        />
      ))}
      <path d="M0 520 L0 430 Q 120 380 240 420 T 520 380 L520 520 Z" fill="rgba(255,255,255,0.04)" />
      <path d="M0 520 L0 470 Q 160 430 300 470 T 520 450 L520 520 Z" fill="rgba(255,255,255,0.05)" />
      <path id="login-path" d={path} fill="none" stroke="url(#login-trail)" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 12" />
      {nodes.map((n) => (
        <g key={n.x} transform={`translate(${n.x} ${n.y})`} className={`login__node login__node--${n.state}`}>
          <circle r="20" className="login__node-halo" />
          <circle r="13" className="login__node-core" />
        </g>
      ))}
      <g transform="translate(500 92)">
        <line x1="0" y1="18" x2="0" y2="-26" stroke="#d9d5ee" strokeWidth="2.5" />
        <path d="M0 -26 L22 -19 L0 -11 Z" fill="#ff8f75" />
      </g>
      <circle r="9" fill="url(#login-orb)">
        <animateMotion dur="7s" repeatCount="indefinite" rotate="auto">
          <mpath href="#login-path" />
        </animateMotion>
      </circle>
    </svg>
  )
}
