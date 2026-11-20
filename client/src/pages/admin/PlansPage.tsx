import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { formatDate } from '../../lib/format'
import type { PlanListItem } from '../../lib/types'

export function PlansPage() {
  const [plans, setPlans] = useState<PlanListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ plans: PlanListItem[] }>('/admin/plans')
      .then((res) => setPlans(res.plans))
      .catch((err) => setError(errorMessage(err)))
  }, [])

  return (
    <div className="adm-page">
      <header className="adm-page__head">
        <div>
          <h1>Plans</h1>
          <p>A plan has levels (chapters), and each level has tasks. Assign a plan to customers from their page.</p>
        </div>
        <Link to="/admin/plans/new" className="btn btn--primary">
          <Icon name="plus" size={18} /> New plan
        </Link>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {plans === null && !error ? (
        <div className="page-loader">
          <span className="spinner" />
        </div>
      ) : plans && plans.length === 0 ? (
        <div className="adm-empty">
          <span className="adm-empty__icon">
            <Icon name="layers" size={30} />
          </span>
          <h2>No plans yet</h2>
          <p>Create a plan with levels and tasks. Then add videos and files for each task.</p>
          <Link to="/admin/plans/new" className="btn btn--primary">
            <Icon name="plus" size={18} /> New plan
          </Link>
        </div>
      ) : (
        <ul className="adm-plans">
          {plans?.map((plan) => (
            <li key={plan.id}>
              <Link to={`/admin/plans/${plan.id}`} className="adm-plan">
                <span className="adm-plan__icon">
                  <Icon name="map" size={22} />
                </span>
                <span className="adm-plan__title">{plan.title}</span>
                {plan.description && <span className="adm-plan__desc">{plan.description}</span>}
                <span className="adm-plan__chips">
                  <span className="chip">
                    <Icon name="flag" size={13} /> {plan.chapterCount} level{plan.chapterCount === 1 ? '' : 's'}
                  </span>
                  <span className="chip">
                    <Icon name="list" size={13} /> {plan.taskCount} task{plan.taskCount === 1 ? '' : 's'}
                  </span>
                  <span className="chip chip--brand">
                    <Icon name="users" size={13} /> {plan.customerCount}
                  </span>
                </span>
                <span className="adm-plan__date">Updated {formatDate(plan.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
