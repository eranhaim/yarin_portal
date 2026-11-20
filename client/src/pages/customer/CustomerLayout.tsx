import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { Logo } from '../../components/Logo'
import { api, ApiError, errorMessage } from '../../lib/api'
import type { CustomerSelf, MyPlan, TaskStatus } from '../../lib/types'
import type { CustomerContext } from './customerContext'
import './customer.css'

export function CustomerLayout() {
  const navigate = useNavigate()
  const [me, setMe] = useState<CustomerSelf | null>(null)
  const [plan, setPlan] = useState<MyPlan | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([api<{ customer: CustomerSelf }>('/auth/me'), api<{ plan: MyPlan | null }>('/me/plan')])
      .then(([meRes, planRes]) => {
        if (cancelled) return
        setMe(meRes.customer)
        setPlan(planRes.plan)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 401) navigate('/', { replace: true })
        else setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [navigate])

  const updateTask = useCallback(async (taskId: string, status: TaskStatus) => {
    const res = await api<{ plan: MyPlan }>(`/me/tasks/${taskId}`, { method: 'PATCH', body: { status } })
    setPlan(res.plan)
  }, [])

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
    navigate('/', { replace: true })
  }

  return (
    <div className="cx">
      <header className="cx-top">
        <div className="cx-top__inner">
          <NavLink to="/map" className="cx-top__logo" aria-label="Go to the map">
            <Logo light />
          </NavLink>
          <nav className="cx-top__nav" aria-label="Main">
            <NavLink to="/map" className="cx-top__link">
              <Icon name="map" size={18} />
              <span>Map</span>
            </NavLink>
            <NavLink to="/library" className="cx-top__link">
              <Icon name="video" size={18} />
              <span>Library</span>
            </NavLink>
          </nav>
          {me && (
            <div className="cx-top__user">
              <Avatar name={me.name} url={me.avatarUrl} size={36} />
              <span className="cx-top__name">{me.name}</span>
              <button type="button" className="icon-btn" onClick={logout} aria-label="Log out" title="Log out">
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
            <h2>Something went wrong</h2>
            <p>{error}</p>
            <button type="button" className="btn btn--light" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        ) : !me ? (
          <div className="page-loader">
            <span className="spinner" />
          </div>
        ) : (
          <Outlet context={{ me, plan, updateTask } satisfies CustomerContext} />
        )}
      </main>
    </div>
  )
}
