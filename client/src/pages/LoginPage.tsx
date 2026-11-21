import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Die } from '../components/Board'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { Mascot } from '../components/mascot/Mascot'
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
              <span>משבצת אחרי משבצת.</span>
            </h1>
            <p>התחברו כדי להמשיך בתוכנית עם ירין ואורן: שלבים ברורים, סרטוני הדרכה וכל הכלים שצריך בדרך.</p>
          </div>
          <ul className="login__perks">
            <li>
              <span style={{ background: 'var(--g1)' }}>
                <Icon name="map" size={18} />
              </span>
              לוח משחק עם שלבים ומשימות
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
        <MiniBoard />
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

/** A small board on a table, in 3D, with a token and two dice. */
function MiniBoard() {
  const size = 6
  const squares: { row: number; col: number; band: string | null; corner: boolean }[] = []
  const colors = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--g4)', 'var(--g5)', 'var(--g6)', 'var(--g7)', 'var(--g8)']
  let n = 0
  for (let row = 1; row <= size; row++) {
    for (let col = 1; col <= size; col++) {
      const edge = row === 1 || row === size || col === 1 || col === size
      if (!edge) continue
      const corner = (row === 1 || row === size) && (col === 1 || col === size)
      squares.push({ row, col, corner, band: corner ? null : colors[Math.floor(n++ / 2.5) % colors.length]! })
    }
  }
  return (
    <div className="mini" aria-hidden="true">
      <div className="mini__board">
        {squares.map((s) => (
          <span
            key={`${s.row}-${s.col}`}
            className={`mini__sq${s.corner ? ' mini__sq--corner' : ''}`}
            style={{ gridRow: s.row, gridColumn: s.col, '--band': s.band ?? 'transparent' } as CSSProperties}
          />
        ))}
        <span className="mini__center">
          <span className="mini__banner">סקיל אורגני</span>
        </span>
        <span className="mini__token" />
      </div>
      <span className="mini__die mini__die--a">
        <Die value={5} />
      </span>
      <span className="mini__die mini__die--b">
        <Die value={3} />
      </span>
      <Mascot className="mini__mascot" pose="wave" />
    </div>
  )
}
