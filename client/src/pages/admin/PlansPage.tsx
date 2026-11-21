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
          <h1>תוכניות</h1>
          <p>לכל תוכנית יש שלבים, ולכל שלב יש משימות. משייכים תוכנית ללקוח מהעמוד שלו.</p>
        </div>
        <Link to="/admin/plans/new" className="btn btn--primary">
          <Icon name="plus" size={18} /> תוכנית חדשה
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
          <h2>עדיין אין תוכניות</h2>
          <p>צרו תוכנית עם שלבים ומשימות. אחר כך הוסיפו סרטונים וקבצים לכל משימה.</p>
          <Link to="/admin/plans/new" className="btn btn--primary">
            <Icon name="plus" size={18} /> תוכנית חדשה
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
                    <Icon name="flag" size={13} /> {plan.chapterCount === 1 ? 'שלב אחד' : `${plan.chapterCount} שלבים`}
                  </span>
                  <span className="chip">
                    <Icon name="list" size={13} /> {plan.taskCount === 1 ? 'משימה אחת' : `${plan.taskCount} משימות`}
                  </span>
                  <span className="chip chip--brand">
                    <Icon name="users" size={13} /> {plan.customerCount}
                  </span>
                </span>
                <span className="adm-plan__date">עודכן ב-{formatDate(plan.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
