import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Avatar } from '../../components/Avatar'
import { Icon, type IconName } from '../../components/Icon'
import { api, ApiError, errorMessage } from '../../lib/api'
import type { CustomerSelf, GameSummary, Host, Look, MyPlan, TaskStatus, XpItem } from '../../lib/types'
import type { CustomerContext } from './customerContext'
import { GameFeed, type Celebration } from './GameFeed'
import './customer.css'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/map', label: 'העיר', icon: 'map' },
  { to: '/skills', label: 'הסקילים', icon: 'chart' },
  { to: '/coach', label: 'המאמנים', icon: 'users' },
  { to: '/rewards', label: 'פרסים', icon: 'trophy' },
  { to: '/library', label: 'ספרייה', icon: 'video' },
  { to: '/character', label: 'הדמות', icon: 'sparkles' },
]

export function CustomerLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [me, setMe] = useState<CustomerSelf | null>(null)
  const [plan, setPlan] = useState<MyPlan | null>(null)
  const [game, setGame] = useState<GameSummary | null>(null)
  const [look, setLook] = useState<Look | null>(null)
  const [hosts, setHosts] = useState<Host[]>([])
  const [error, setError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<XpItem[]>([])
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  // Points the player has already seen (by item id) and the last known level and rank.
  // A better result on a retry updates the same item, so a toast shows only the added points.
  const seen = useRef<{ points: Map<string, number>; level: number; rank: number } | null>(null)

  const applyGame = useCallback((next: GameSummary) => {
    const known = seen.current
    if (known) {
      const fresh = next.recent
        // Toast ids must be unique even when the same item improves twice in a row.
        .map((e) => ({ ...e, id: `${e.id}:${e.points}`, points: e.points - (known.points.get(e.id) ?? 0) }))
        .filter((e) => e.points > 0)
      if (fresh.length) setToasts((list) => [...list, ...fresh.slice(0, 4).reverse()])
      if (next.level > known.level) setCelebration({ kind: 'level', level: next.level })
      else if (next.revenue.rank.index > known.rank) setCelebration({ kind: 'rank', label: next.revenue.rank.label })
    }
    const points = new Map(known?.points)
    for (const e of next.recent) points.set(e.id, e.points)
    seen.current = { points, level: next.level, rank: next.revenue.rank.index }
    setGame(next)
  }, [])

  const refreshGame = useCallback(async () => {
    try {
      const res = await api<{ game: GameSummary }>('/me/game')
      applyGame(res.game)
    } catch {
      // The game summary is extra; the page works without it.
    }
  }, [applyGame])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api<{ customer: CustomerSelf }>('/auth/me'),
      api<{ plan: MyPlan | null }>('/me/plan'),
      api<{ look: Look }>('/me/profile'),
      api<{ hosts: Host[] }>('/public/hosts').catch(() => ({ hosts: [] })),
    ])
      .then(([meRes, planRes, profile, hostRes]) => {
        if (cancelled) return
        setMe(meRes.customer)
        setPlan(planRes.plan)
        setLook(profile.look)
        setHosts(hostRes.hosts)
        void refreshGame()
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) navigate('/', { replace: true })
        else setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [navigate, refreshGame])

  const updateTask = useCallback(
    async (taskId: string, status: TaskStatus) => {
      const res = await api<{ plan: MyPlan }>(`/me/tasks/${taskId}`, { method: 'PATCH', body: { status } })
      setPlan(res.plan)
      void refreshGame()
    },
    [refreshGame],
  )

  const applyPlan = useCallback(
    (next: MyPlan | null) => {
      setPlan(next)
      void refreshGame()
    },
    [refreshGame],
  )

  const dropToast = useCallback((id: string) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    navigate('/', { replace: true })
  }

  const fullBleed = location.pathname === '/map'
  const xpPercent = game ? Math.round(((game.xp - game.floor) / Math.max(1, game.nextAt - game.floor)) * 100) : 0

  return (
    <div className={`cx${fullBleed ? ' cx--full' : ''}`}>
      <header className="cx-top">
        <div className="cx-top__inner">
          <NavLink to="/map" className="cx-top__logo" aria-label="לעיר">
            <span className="cx-top__mark" aria-hidden="true">SO</span>
            <span className="cx-top__brand">
              סקיל אורגני
              <small>המשחק של ירין ואורן</small>
            </span>
          </NavLink>
          <nav className="cx-top__nav" aria-label="ניווט ראשי">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className="cx-top__link">
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
          {me && (
            <div className="cx-top__user">
              {game && (
                <NavLink to="/skills" className="cx-top__level" title={`${game.xp} XP`}>
                  <b>{game.level}</b>
                  <span className="cx-top__xp" aria-label={`${xpPercent}% לרמה הבאה`}>
                    <i style={{ width: `${xpPercent}%` }} />
                  </span>
                </NavLink>
              )}
              <NavLink to="/character" aria-label="הדמות שלי">
                <Avatar name={me.name} url={me.avatarUrl} size={36} />
              </NavLink>
              <button type="button" className="icon-btn" onClick={logout} aria-label="התנתקות" title="התנתקות">
                <Icon name="logout" size={18} />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="cx-main">
        {error ? (
          <div className="cx-empty">
            <Icon name="alert" size={36} />
            <h2>משהו השתבש</h2>
            <p>{error}</p>
            <button type="button" className="btn btn--game" onClick={() => window.location.reload()}>
              נסו שוב
            </button>
          </div>
        ) : !me ? (
          <div className="page-loader">
            <span className="spinner" />
          </div>
        ) : (
          // A new key per page replays the page entrance animation.
          <div key={location.pathname} className="cx-page">
            <Outlet
              context={
                { me, plan, updateTask, applyPlan, game, refreshGame, look, setLook, setMe, hosts } satisfies CustomerContext
              }
            />
          </div>
        )}
      </main>

      <GameFeed
        toasts={toasts}
        onToastDone={dropToast}
        celebration={celebration}
        onCelebrationDone={() => setCelebration(null)}
        look={look}
      />
    </div>
  )
}
