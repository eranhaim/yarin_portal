import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import type { AdminCustomer, PlanListItem } from '../../lib/types'
import { CustomerFormModal } from './CustomerFormModal'
import { LevelBadge } from './LevelBadge'

export function CustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomer[] | null>(null)
  const [plans, setPlans] = useState<PlanListItem[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    Promise.all([api<{ customers: AdminCustomer[] }>('/admin/customers'), api<{ plans: PlanListItem[] }>('/admin/plans')])
      .then(([c, p]) => {
        setCustomers(c.customers)
        setPlans(p.plans)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!customers || !q) return customers ?? []
    return customers.filter((c) => [c.name, c.email, c.phone, c.company].join(' ').toLowerCase().includes(q))
  }, [customers, query])

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>Customers</h1>
          <p>{customers ? `${customers.length} customer${customers.length === 1 ? '' : 's'}` : 'Loading…'}</p>
        </div>
        <div className="adm-page__actions">
          <label className="adm-search">
            <Icon name="search" size={18} />
            <input
              className="input"
              type="search"
              placeholder="Search name, email, phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search customers"
            />
          </label>
          <button type="button" className="btn btn--primary" onClick={() => setFormOpen(true)}>
            <Icon name="plus" size={18} /> New customer
          </button>
        </div>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {customers === null && !error ? (
        <div className="page-loader">
          <span className="spinner" />
        </div>
      ) : customers && customers.length === 0 ? (
        <div className="adm-empty">
          <span className="adm-empty__icon">
            <Icon name="users" size={30} />
          </span>
          <h2>No customers yet</h2>
          <p>Add your first customer. You set their password, and they sign in on the main page.</p>
          <button type="button" className="btn btn--primary" onClick={() => setFormOpen(true)}>
            <Icon name="plus" size={18} /> New customer
          </button>
        </div>
      ) : (
        <>
          {filtered.length === 0 && <p className="empty-note">No customers match “{query}”.</p>}
          <ul className="adm-customers">
            {filtered.map((c) => (
              <li key={c.id}>
                <Link to={`/admin/customers/${c.id}`} className={`adm-customer${c.active ? '' : ' is-inactive'}`}>
                  <div className="adm-customer__head">
                    <Avatar name={c.name} url={c.avatarUrl} size={60} />
                    <div className="adm-customer__who">
                      <span className="adm-customer__name">{c.name}</span>
                      {c.company && <span className="adm-customer__company">{c.company}</span>}
                    </div>
                    {!c.active && <span className="chip chip--danger">Inactive</span>}
                  </div>
                  <div className="adm-customer__contact">
                    <span>
                      <Icon name="mail" size={15} /> {c.email}
                    </span>
                    {c.phone && (
                      <span>
                        <Icon name="phone" size={15} /> {c.phone}
                      </span>
                    )}
                  </div>
                  <div className="adm-customer__plan">
                    {c.plan ? (
                      <>
                        <div className="adm-customer__plan-row">
                          <span className="adm-customer__plan-title">{c.plan.title}</span>
                          <LevelBadge level={c.plan.level} />
                        </div>
                        <div className="progress">
                          <div
                            className="progress__bar"
                            style={{ width: `${c.plan.total ? (c.plan.completed / c.plan.total) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="adm-customer__plan-meta">
                          {c.plan.completed}/{c.plan.total} tasks completed
                        </span>
                      </>
                    ) : (
                      <span className="adm-customer__plan-none">No plan assigned</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {formOpen && (
      <CustomerFormModal
        open
        onClose={() => setFormOpen(false)}
        plans={plans}
        onSaved={(saved) => {
          setCustomers((list) => [saved, ...(list ?? []).filter((c) => c.id !== saved.id)])
          setFormOpen(false)
        }}
      />
      )}
    </div>
  )
}
