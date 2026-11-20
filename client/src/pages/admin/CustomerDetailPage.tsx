import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Avatar } from '../../components/Avatar'
import { GameMap } from '../../components/GameMap'
import { Icon } from '../../components/Icon'
import { TaskStatusControl } from '../../components/TaskStatusControl'
import { api, errorMessage } from '../../lib/api'
import { dueInfo, formatDate, formatDateTime } from '../../lib/format'
import { taskStatus, type AdminCustomer, type PlanListItem, type PlanProgress, type TaskStatus } from '../../lib/types'
import { CustomerFormModal } from './CustomerFormModal'
import { LevelBadge } from './LevelBadge'

export function CustomerDetailPage() {
  const { id } = useParams()
  return <CustomerDetail key={id} id={id!} />
}

function CustomerDetail({ id }: { id: string }) {
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<AdminCustomer | null>(null)
  const [progress, setProgress] = useState<PlanProgress | null>(null)
  const [plans, setPlans] = useState<PlanListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [openChapter, setOpenChapter] = useState<string | null>(null)

  const loadProgress = useCallback(async () => {
    const res = await api<{ plan: PlanProgress | null }>(`/admin/customers/${id}/plan`)
    setProgress(res.plan)
    setOpenChapter((current) => current ?? res.plan?.chapters[res.plan.level.index]?.id ?? null)
  }, [id])

  useEffect(() => {
    Promise.all([
      api<{ customer: AdminCustomer }>(`/admin/customers/${id}`),
      api<{ plans: PlanListItem[] }>('/admin/plans'),
      loadProgress(),
    ])
      .then(([c, p]) => {
        setCustomer(c.customer)
        setPlans(p.plans)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [id, loadProgress])

  const assignPlan = async (planId: string) => {
    if (!customer) return
    if (customer.plan && !window.confirm(`Change the plan? The progress on “${customer.plan.title}” will be reset.`)) return
    try {
      const res = await api<{ customer: AdminCustomer; plan: PlanProgress | null }>(`/admin/customers/${customer.id}/plan`, {
        method: 'PUT',
        body: { planId: planId || null },
      })
      setCustomer(res.customer)
      setProgress(res.plan)
      setOpenChapter(res.plan?.chapters[0]?.id ?? null)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const setStatus = async (taskId: string, status: TaskStatus) => {
    if (!customer) return
    setBusyTask(taskId)
    try {
      const res = await api<{ plan: PlanProgress }>(`/admin/customers/${customer.id}/plan/tasks/${taskId}`, {
        method: 'PATCH',
        body: { status },
      })
      setProgress(res.plan)
      setCustomer((c) =>
        c?.plan ? { ...c, plan: { ...c.plan, ...res.plan.summary, level: res.plan.level } } : c,
      )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyTask(null)
    }
  }

  const remove = async () => {
    if (!customer) return
    if (!window.confirm(`Delete ${customer.name}? This cannot be undone.`)) return
    try {
      await api(`/admin/customers/${customer.id}`, { method: 'DELETE' })
      navigate('/admin/customers', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (error && !customer) {
    return (
      <div className="adm-page">
        <Link to="/admin/customers" className="adm-back">
          <Icon name="arrowLeft" size={16} /> Customers
        </Link>
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="page-loader">
        <span className="spinner" />
      </div>
    )
  }

  return (
    <div className="adm-page">
      <Link to="/admin/customers" className="adm-back">
        <Icon name="arrowLeft" size={16} /> Customers
      </Link>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      <div className="adm-detail">
        <aside className="adm-card adm-profile">
          <Avatar name={customer.name} url={customer.avatarUrl} size={112} />
          <h1>{customer.name}</h1>
          {customer.company && <p className="adm-profile__company">{customer.company}</p>}
          <span className={`chip ${customer.active ? 'chip--success' : 'chip--danger'}`}>
            {customer.active ? 'Active' : 'Inactive'}
          </span>
          <dl className="adm-profile__facts">
            <div>
              <dt>
                <Icon name="mail" size={15} /> Email
              </dt>
              <dd>
                <a href={`mailto:${customer.email}`}>{customer.email}</a>
              </dd>
            </div>
            {customer.phone && (
              <div>
                <dt>
                  <Icon name="phone" size={15} /> Phone
                </dt>
                <dd>
                  <a href={`tel:${customer.phone.replace(/[^\d+]/g, '')}`}>{customer.phone}</a>
                </dd>
              </div>
            )}
            <div>
              <dt>
                <Icon name="clock" size={15} /> Last sign-in
              </dt>
              <dd>{customer.lastLoginAt ? formatDateTime(customer.lastLoginAt) : 'Never'}</dd>
            </div>
            <div>
              <dt>
                <Icon name="users" size={15} /> Customer since
              </dt>
              <dd>{formatDate(customer.createdAt)}</dd>
            </div>
          </dl>
          {customer.notes && <p className="adm-profile__notes">{customer.notes}</p>}
          <div className="adm-profile__actions">
            <button type="button" className="btn btn--outline btn--block" onClick={() => setEditOpen(true)}>
              <Icon name="edit" size={16} /> Edit details
            </button>
            <button type="button" className="btn btn--danger-soft btn--block" onClick={remove}>
              <Icon name="trash" size={16} /> Delete customer
            </button>
          </div>
        </aside>

        <div className="adm-detail__main">
          <section className="adm-card">
            <div className="adm-card__head">
              <div>
                <h2>Plan</h2>
                <p>The customer sees the plan as a map. Each chapter is a level.</p>
              </div>
              <select
                className="select adm-plan-select"
                value={customer.plan?.id ?? ''}
                onChange={(e) => void assignPlan(e.target.value)}
                aria-label="Assigned plan"
              >
                <option value="">No plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>

            {customer.plan && progress ? (
              <div className="adm-stats">
                <div>
                  <span>Position</span>
                  <strong>
                    <LevelBadge level={progress.level} />
                  </strong>
                  {progress.level.title && !progress.level.finished && <small>{progress.level.title}</small>}
                </div>
                <div>
                  <span>Completed</span>
                  <strong>
                    {progress.summary.completed}/{progress.summary.total}
                  </strong>
                  <small>tasks</small>
                </div>
                <div>
                  <span>In progress</span>
                  <strong>{progress.summary.started}</strong>
                  <small>tasks</small>
                </div>
                <div>
                  <span>Assigned</span>
                  <strong>{formatDate(progress.assignedAt)}</strong>
                </div>
              </div>
            ) : (
              <p className="empty-note">No plan assigned. Choose a plan above.</p>
            )}
          </section>

          {progress && (
            <div className="adm-detail__split">
              <section className="adm-card adm-card--map">
                <h2>Map position</h2>
                <GameMap
                  levels={progress.chapters.map((c) => ({
                    id: c.id,
                    title: c.title,
                    state: c.state,
                    total: c.tasks.length,
                    completed: c.completedCount,
                  }))}
                  player={{
                    id: customer.id,
                    name: customer.name,
                    avatarUrl: customer.avatarUrl,
                    levelIndex: progress.level.index,
                  }}
                  onSelectLevel={(i) => setOpenChapter(progress.chapters[i]!.id)}
                />
              </section>

              <section className="adm-card">
                <h2>Tasks</h2>
                <p className="adm-card__sub">You can change the status of any task for this customer.</p>
                <div className="adm-chapters">
                  {progress.chapters.map((chapter, i) => {
                    const open = openChapter === chapter.id
                    return (
                      <div key={chapter.id} className={`adm-chapter adm-chapter--${chapter.state}`}>
                        <button
                          type="button"
                          className="adm-chapter__head"
                          onClick={() => setOpenChapter(open ? null : chapter.id)}
                          aria-expanded={open}
                        >
                          <span className="adm-chapter__num">{chapter.state === 'completed' ? <Icon name="check" size={14} /> : i + 1}</span>
                          <span className="adm-chapter__title">{chapter.title}</span>
                          <span className="adm-chapter__count">
                            {chapter.completedCount}/{chapter.tasks.length}
                          </span>
                          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
                        </button>
                        {open && (
                          <ul className="adm-chapter__tasks">
                            {chapter.tasks.length === 0 && <li className="adm-muted">No tasks in this level.</li>}
                            {chapter.tasks.map((task) => {
                              const due = dueInfo(task.dueAt, task.completed)
                              return (
                                <li key={task.id} className="adm-task-row">
                                  <div>
                                    <span className="adm-task-row__title">{task.title}</span>
                                    {due && <span className={`adm-due adm-due--${due.tone}`}>{due.label}</span>}
                                  </div>
                                  <TaskStatusControl
                                    size="sm"
                                    value={taskStatus(task)}
                                    disabled={busyTask === task.id}
                                    onChange={(s) => void setStatus(task.id, s)}
                                  />
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      {editOpen && (
      <CustomerFormModal
        open
        onClose={() => setEditOpen(false)}
        customer={customer}
        plans={plans}
        onSaved={(saved) => {
          setCustomer(saved)
          setEditOpen(false)
          void loadProgress()
        }}
      />
      )}
    </div>
  )
}
