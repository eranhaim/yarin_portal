import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Avatar } from '../../components/Avatar'
import { FileBadge } from '../../components/FileList'
import { Board } from '../../components/Board'
import { groupColor } from '../../lib/groups'
import { Icon } from '../../components/Icon'
import { TaskStatusControl } from '../../components/TaskStatusControl'
import { api, errorMessage } from '../../lib/api'
import { dueInfo, formatBytes, formatDate, formatDateTime } from '../../lib/format'
import {
  taskStatus,
  type AdminCustomer,
  type PlanListItem,
  type PlanProgress,
  type Submission,
  type TaskStatus,
} from '../../lib/types'
import { CustomerFormModal } from './CustomerFormModal'
import { CustomerGamePanel } from './CustomerGamePanel'
import { useInbox } from './inbox'
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
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const inbox = useInbox()

  const submissionsByTask = useMemo(() => {
    const map = new Map<string, Submission[]>()
    for (const s of submissions) map.set(s.taskId, [...(map.get(s.taskId) ?? []), s])
    return map
  }, [submissions])
  const unseenIds = submissions.filter((s) => !s.seenAt).map((s) => s.id)
  const taskTitles = useMemo(
    () => new Map(progress?.chapters.flatMap((c) => c.tasks.map((t) => [t.id, t.title] as const)) ?? []),
    [progress],
  )

  const loadProgress = useCallback(async () => {
    const res = await api<{ plan: PlanProgress | null }>(`/admin/customers/${id}/plan`)
    setProgress(res.plan)
    setOpenChapter((current) => current ?? res.plan?.chapters[res.plan.level.index]?.id ?? null)
  }, [id])

  useEffect(() => {
    Promise.all([
      api<{ customer: AdminCustomer }>(`/admin/customers/${id}`),
      api<{ plans: PlanListItem[] }>('/admin/plans'),
      api<{ submissions: Submission[] }>(`/admin/customers/${id}/submissions`),
      loadProgress(),
    ])
      .then(([c, p, s]) => {
        setCustomer(c.customer)
        setPlans(p.plans)
        setSubmissions(s.submissions)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [id, loadProgress])

  const assignPlan = async (planId: string) => {
    if (!customer) return
    if (customer.plan && !window.confirm(`להחליף את התוכנית? ההתקדמות ב„${customer.plan.title}” תתאפס.`)) return
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

  const markSeen = async (ids: string[]) => {
    if (ids.length === 0) return
    try {
      await api('/admin/submissions/seen', { body: { ids } })
      const now = new Date().toISOString()
      setSubmissions((list) => list.map((s) => (ids.includes(s.id) ? { ...s, seenAt: s.seenAt ?? now } : s)))
      await inbox.refresh()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const remove = async () => {
    if (!customer) return
    if (!window.confirm(`למחוק את ${customer.name}? אי אפשר לבטל את הפעולה.`)) return
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
          <Icon name="arrowLeft" size={16} /> לקוחות
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
        <Icon name="arrowLeft" size={16} /> לקוחות
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
            {customer.active ? 'פעיל' : 'לא פעיל'}
          </span>
          <dl className="adm-profile__facts">
            <div>
              <dt>
                <Icon name="mail" size={15} /> אימייל
              </dt>
              <dd>
                <a href={`mailto:${customer.email}`} className="ltr">{customer.email}</a>
              </dd>
            </div>
            {customer.phone && (
              <div>
                <dt>
                  <Icon name="phone" size={15} /> טלפון
                </dt>
                <dd>
                  <a href={`tel:${customer.phone.replace(/[^\d+]/g, '')}`} className="ltr">{customer.phone}</a>
                </dd>
              </div>
            )}
            <div>
              <dt>
                <Icon name="clock" size={15} /> כניסה אחרונה
              </dt>
              <dd>{customer.lastLoginAt ? formatDateTime(customer.lastLoginAt) : 'עדיין לא נכנס/ה'}</dd>
            </div>
            <div>
              <dt>
                <Icon name="users" size={15} /> לקוח/ה מאז
              </dt>
              <dd>{formatDate(customer.createdAt)}</dd>
            </div>
          </dl>
          {customer.notes && <p className="adm-profile__notes">{customer.notes}</p>}
          <div className="adm-profile__actions">
            <button type="button" className="btn btn--outline btn--block" onClick={() => setEditOpen(true)}>
              <Icon name="edit" size={16} /> עריכת פרטים
            </button>
            <button type="button" className="btn btn--danger-soft btn--block" onClick={remove}>
              <Icon name="trash" size={16} /> מחיקת לקוח
            </button>
          </div>
        </aside>

        <div className="adm-detail__main">
          <section className="adm-card">
            <div className="adm-card__head">
              <div>
                <h2>תוכנית</h2>
                <p>הלקוח רואה את התוכנית כלוח משחק. כל שלב הוא קבוצת צבע בלוח.</p>
              </div>
              <select
                className="select adm-plan-select"
                value={customer.plan?.id ?? ''}
                onChange={(e) => void assignPlan(e.target.value)}
                aria-label="התוכנית המשויכת"
              >
                <option value="">ללא תוכנית</option>
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
                  <span>מיקום</span>
                  <strong>
                    <LevelBadge level={progress.level} />
                  </strong>
                  {progress.level.title && !progress.level.finished && <small>{progress.level.title}</small>}
                </div>
                <div>
                  <span>בוצעו</span>
                  <strong>
                    {progress.summary.completed}/{progress.summary.total}
                  </strong>
                  <small>משימות</small>
                </div>
                <div>
                  <span>בתהליך</span>
                  <strong>{progress.summary.started}</strong>
                  <small>משימות</small>
                </div>
                <div>
                  <span>הגשות</span>
                  <strong>{submissions.length}</strong>
                  <small>{unseenIds.length > 0 ? `${unseenIds.length} חדשות` : 'קבצים'}</small>
                </div>
                <div>
                  <span>שויכה ב-</span>
                  <strong>{formatDate(progress.assignedAt)}</strong>
                </div>
              </div>
            ) : (
              <p className="empty-note">לא שויכה תוכנית. בחרו תוכנית למעלה.</p>
            )}
          </section>

          {progress && (
            <div className="adm-detail__split">
              <section className="adm-card adm-card--map">
                <h2>המיקום בלוח</h2>
                <Board
                  chapters={progress.chapters}
                  player={{
                    id: customer.id,
                    name: customer.name,
                    avatarUrl: customer.avatarUrl,
                    position: progress.level.position,
                  }}
                  onSelectChapter={(i) => setOpenChapter(progress.chapters[i]!.id)}
                  onSelectTask={(i) => setOpenChapter(progress.chapters[i]!.id)}
                />
              </section>

              <section className="adm-card">
                <div className="adm-card__head">
                  <div>
                    <h2>משימות והגשות</h2>
                    <p>אפשר לשנות את הסטטוס של כל משימה, ולהוריד את הקבצים שהלקוח הגיש.</p>
                  </div>
                  {unseenIds.length > 0 && (
                    <button type="button" className="btn btn--sm" onClick={() => void markSeen(unseenIds)}>
                      <Icon name="check" size={15} /> סימון ההגשות כנקראו
                    </button>
                  )}
                </div>
                <div className="adm-chapters">
                  {progress.chapters.map((chapter, i) => {
                    const open = openChapter === chapter.id
                    const chapterFiles = chapter.tasks.reduce((sum, t) => sum + (submissionsByTask.get(t.id)?.length ?? 0), 0)
                    return (
                      <div key={chapter.id} className={`adm-chapter adm-chapter--${chapter.state}`} style={{ '--group': groupColor(i) } as CSSProperties}>
                        <button
                          type="button"
                          className="adm-chapter__head"
                          onClick={() => setOpenChapter(open ? null : chapter.id)}
                          aria-expanded={open}
                        >
                          <span className="adm-chapter__num">{chapter.state === 'completed' ? <Icon name="check" size={14} /> : i + 1}</span>
                          <span className="adm-chapter__title">{chapter.title}</span>
                          {chapterFiles > 0 && (
                            <span className="adm-chapter__files" title="קבצים שהוגשו">
                              <Icon name="clip" size={14} /> {chapterFiles}
                            </span>
                          )}
                          <span className="adm-chapter__count">
                            {chapter.completedCount}/{chapter.tasks.length}
                          </span>
                          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
                        </button>
                        {open && (
                          <ul className="adm-chapter__tasks">
                            {chapter.tasks.length === 0 && <li className="adm-muted">אין משימות בשלב הזה.</li>}
                            {chapter.tasks.map((task) => {
                              const due = dueInfo(task.dueAt, task.completed)
                              const files = submissionsByTask.get(task.id) ?? []
                              return (
                                <li key={task.id}>
                                  <div className="adm-task-row">
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
                                  </div>
                                  {files.length > 0 && (
                                    <ul className="adm-subs">
                                      {files.map((s) => (
                                        <li key={s.id} className={`adm-subs__item${s.seenAt ? '' : ' is-new'}`}>
                                          <FileBadge fileName={s.fileName} />
                                          <span className="adm-subs__text">
                                            <bdi>{s.fileName}</bdi>
                                            <small>
                                              {formatDateTime(s.createdAt)} · <span className="ltr">{formatBytes(s.size)}</span>
                                              {!s.seenAt && <span className="chip chip--warn">חדש</span>}
                                            </small>
                                            {s.note && <span className="adm-subs__note">„{s.note}”</span>}
                                          </span>
                                          {s.downloadUrl && (
                                            <a
                                              className="btn btn--sm"
                                              href={s.downloadUrl}
                                              onClick={() => !s.seenAt && void markSeen([s.id])}
                                            >
                                              <Icon name="download" size={15} /> הורדה
                                            </a>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
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

          <CustomerGamePanel customerId={customer.id} taskTitles={taskTitles} />
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
