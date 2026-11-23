import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Board } from '../../components/Board'
import { groupColor } from '../../lib/groups'
import { Icon } from '../../components/Icon'
import { api, errorMessage } from '../../lib/api'
import { fromLocalInput, toLocalInput } from '../../lib/format'
import type { AdminCustomer, Asset, Plan, Quiz, TaskContent } from '../../lib/types'
import { MediaManager } from './MediaManager'
import { TaskGameContent } from './TaskGameContent'

// ---------- Draft model (what the form edits) ----------

type DraftTask = { key: string; id?: string; title: string; description: string; due: string; open: boolean }
type DraftChapter = { key: string; id?: string; title: string; description: string; tasks: DraftTask[]; collapsed: boolean }
type Draft = { title: string; description: string; chapters: DraftChapter[] }

const newKey = () => crypto.randomUUID()
const emptyDraft = (): Draft => ({
  title: '',
  description: '',
  chapters: [{ key: newKey(), title: '', description: '', tasks: [], collapsed: false }],
})

function toDraft(plan: Plan): Draft {
  return {
    title: plan.title,
    description: plan.description,
    chapters: plan.chapters.map((c) => ({
      key: c.id,
      id: c.id,
      title: c.title,
      description: c.description,
      collapsed: false,
      tasks: c.tasks.map((t) => ({
        key: t.id,
        id: t.id,
        title: t.title,
        description: t.description,
        due: toLocalInput(t.dueAt),
        open: false,
      })),
    })),
  }
}

function toPayload(d: Draft) {
  return {
    title: d.title,
    description: d.description,
    chapters: d.chapters.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      tasks: c.tasks.map((t) => ({ id: t.id, title: t.title, description: t.description, dueAt: fromLocalInput(t.due) })),
    })),
  }
}

/** After a save, copy the new ids from the server into the draft and keep the open/closed state. */
function mergeIds(draft: Draft, plan: Plan): Draft {
  return {
    ...draft,
    chapters: draft.chapters.map((c, i) => ({
      ...c,
      id: plan.chapters[i]?.id,
      tasks: c.tasks.map((t, j) => ({ ...t, id: plan.chapters[i]?.tasks[j]?.id })),
    })),
  }
}

/** A saved task's game content (the admin API sends the full quiz, with the answers). */
function contentOf(plan: Plan, taskId: string): TaskContent {
  const task = plan.chapters.flatMap((c) => c.tasks).find((t) => t.id === taskId)
  return {
    skill: task?.skill ?? null,
    worksheet: task?.worksheet ?? null,
    quiz: (task?.quiz as Quiz | null | undefined) ?? null,
    rubric: task?.rubric ?? [],
  }
}

function withContent(plan: Plan, taskId: string, content: TaskContent): Plan {
  return {
    ...plan,
    chapters: plan.chapters.map((c) => ({ ...c, tasks: c.tasks.map((t) => (t.id === taskId ? { ...t, ...content } : t)) })),
  }
}

function swap<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= list.length) return list
  const copy = [...list]
  ;[copy[index], copy[target]] = [copy[target]!, copy[index]!]
  return copy
}

// ---------- Page ----------

export function PlanEditorPage() {
  const { id } = useParams()
  return <PlanEditor key={id} id={id!} />
}

function PlanEditor({ id }: { id: string }) {
  const isNew = id === 'new'
  const navigate = useNavigate()

  const [saved, setSaved] = useState<Plan | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [savedPayload, setSavedPayload] = useState(() => JSON.stringify(toPayload(emptyDraft())))
  const [assets, setAssets] = useState<Asset[]>([])
  const [customers, setCustomers] = useState<AdminCustomer[]>([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)

  const loadAssets = useCallback(async (planId: string) => {
    const res = await api<{ assets: Asset[] }>(`/admin/plans/${planId}/assets`)
    setAssets(res.assets)
  }, [])

  useEffect(() => {
    if (isNew) return
    Promise.all([
      api<{ plan: Plan }>(`/admin/plans/${id}`),
      loadAssets(id),
      api<{ customers: AdminCustomer[] }>('/admin/customers'),
    ])
      .then(([p, , c]) => {
        const d = toDraft(p.plan)
        setSaved(p.plan)
        setDraft(d)
        setSavedPayload(JSON.stringify(toPayload(d)))
        setCustomers(c.customers.filter((x) => x.plan?.id === p.plan.id))
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [id, isNew, loadAssets])

  const dirty = JSON.stringify(toPayload(draft)) !== savedPayload

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2500)
    return () => clearTimeout(t)
  }, [notice])

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const savedTaskIds = useMemo(
    () => new Set(saved?.chapters.flatMap((c) => c.tasks.map((t) => t.id)) ?? []),
    [saved],
  )

  // ---------- Draft edits ----------

  const setChapter = (key: string, patch: Partial<DraftChapter>) =>
    setDraft((d) => ({ ...d, chapters: d.chapters.map((c) => (c.key === key ? { ...c, ...patch } : c)) }))

  const setTask = (chapterKey: string, taskKey: string, patch: Partial<DraftTask>) =>
    setDraft((d) => ({
      ...d,
      chapters: d.chapters.map((c) =>
        c.key === chapterKey ? { ...c, tasks: c.tasks.map((t) => (t.key === taskKey ? { ...t, ...patch } : t)) } : c,
      ),
    }))

  const addChapter = () => {
    const key = newKey()
    setDraft((d) => ({ ...d, chapters: [...d.chapters, { key, title: '', description: '', tasks: [], collapsed: false }] }))
    setFocusKey(key)
  }

  const removeChapter = (chapter: DraftChapter) => {
    const hasContent = chapter.tasks.length > 0 || chapter.title
    if (hasContent && !window.confirm(`להסיר את השלב „${chapter.title || 'ללא שם'}” ואת ${chapter.tasks.length} המשימות שלו?`)) return
    setDraft((d) => ({ ...d, chapters: d.chapters.filter((c) => c.key !== chapter.key) }))
  }

  const addTask = (chapterKey: string) => {
    const key = newKey()
    setDraft((d) => ({
      ...d,
      chapters: d.chapters.map((c) =>
        c.key === chapterKey
          ? { ...c, collapsed: false, tasks: [...c.tasks, { key, title: '', description: '', due: '', open: false }] }
          : c,
      ),
    }))
    setFocusKey(key)
  }

  const removeTask = (chapterKey: string, task: DraftTask) => {
    const hasMedia = task.id ? assets.some((a) => a.taskId === task.id) : false
    const message = hasMedia
      ? `להסיר את המשימה „${task.title || 'ללא שם'}”? הסרטונים והקבצים שלה יימחקו בשמירה.`
      : `להסיר את המשימה „${task.title || 'ללא שם'}”?`
    if ((task.title || hasMedia) && !window.confirm(message)) return
    setDraft((d) => ({
      ...d,
      chapters: d.chapters.map((c) => (c.key === chapterKey ? { ...c, tasks: c.tasks.filter((t) => t.key !== task.key) } : c)),
    }))
  }

  // ---------- Save / delete ----------

  const save = async () => {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const payload = toPayload(draft)
      const res = isNew
        ? await api<{ plan: Plan }>('/admin/plans', { body: payload })
        : await api<{ plan: Plan }>(`/admin/plans/${id}`, { method: 'PUT', body: payload })
      const merged = mergeIds(draft, res.plan)
      setSaved(res.plan)
      setDraft(merged)
      setSavedPayload(JSON.stringify(toPayload(merged)))
      setNotice('התוכנית נשמרה')
      if (isNew) navigate(`/admin/plans/${res.plan.id}`, { replace: true })
      else await loadAssets(res.plan.id) // the server removes media of deleted tasks
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const deletePlan = async () => {
    if (!saved) return
    if (!window.confirm(`למחוק את התוכנית „${saved.title}” עם כל הסרטונים והקבצים שלה? אי אפשר לבטל את הפעולה.`)) return
    try {
      await api(`/admin/plans/${saved.id}`, { method: 'DELETE' })
      navigate('/admin/plans', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const mediaOf = (taskId: string | null, kind: Asset['kind']) =>
    assets.filter((a) => a.taskId === taskId && a.kind === kind).sort((a, b) => a.order - b.order)

  if (loading) {
    return (
      <div className="page-loader">
        <span className="spinner" />
      </div>
    )
  }

  if (!isNew && !saved) {
    return (
      <div className="adm-page">
        <Link to="/admin/plans" className="adm-back">
          <Icon name="arrowLeft" size={16} /> תוכניות
        </Link>
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error ?? 'התוכנית לא נמצאה'}
        </div>
      </div>
    )
  }

  const taskTotal = draft.chapters.reduce((sum, c) => sum + c.tasks.length, 0)

  return (
    <div className="adm-page adm-editor">
      <Link to="/admin/plans" className="adm-back">
        <Icon name="arrowLeft" size={16} /> תוכניות
      </Link>

      <header className="adm-page__head">
        <div>
          <h1>{isNew ? 'תוכנית חדשה' : saved?.title || 'תוכנית ללא שם'}</h1>
          <p>
            {draft.chapters.length} שלבים · {taskTotal} משימות
            {saved && ` · ${saved.customerCount} לקוחות`}
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={saving || (!dirty && !isNew)}>
          {saving ? <span className="spinner" /> : <Icon name="check" size={18} />}
          {isNew ? 'יצירת התוכנית' : 'שמירת שינויים'}
        </button>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      <section className="adm-card">
        <h2>פרטים</h2>
        <div className="adm-form">
          <label className="field">
            <span className="field__label">שם התוכנית *</span>
            <input
              className="input"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="לדוגמה: תוכנית צמיחה לעסק"
              autoFocus={isNew}
            />
          </label>
          <label className="field">
            <span className="field__label">תיאור</span>
            <textarea
              className="textarea"
              rows={2}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="adm-card">
        <div className="adm-card__head">
          <div>
            <h2>שלבים ומשימות</h2>
            <p>כל שלב הוא קבוצת צבע בלוח של הלקוח, וכל משימה היא משבצת. שלב נפתח אחרי שהלקוח מסיים את השלב שלפניו.</p>
          </div>
        </div>

        <ol className="adm-levels">
          {draft.chapters.map((chapter, ci) => (
            <li key={chapter.key} className="adm-level" style={{ '--group': groupColor(ci) } as CSSProperties}>
              <div className="adm-level__head">
                <span className="adm-level__badge">{ci + 1}</span>
                <input
                  className="input adm-level__title"
                  value={chapter.title}
                  onChange={(e) => setChapter(chapter.key, { title: e.target.value })}
                  placeholder={`שם שלב ${ci + 1}`}
                  aria-label={`שם שלב ${ci + 1}`}
                  autoFocus={focusKey === chapter.key}
                />
                <div className="adm-level__tools">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setDraft((d) => ({ ...d, chapters: swap(d.chapters, ci, -1) }))}
                    disabled={ci === 0}
                    aria-label="הזזת השלב למעלה"
                  >
                    <Icon name="arrowUp" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setDraft((d) => ({ ...d, chapters: swap(d.chapters, ci, 1) }))}
                    disabled={ci === draft.chapters.length - 1}
                    aria-label="הזזת השלב למטה"
                  >
                    <Icon name="arrowDown" size={16} />
                  </button>
                  <button type="button" className="icon-btn icon-btn--danger" onClick={() => removeChapter(chapter)} aria-label="הסרת השלב">
                    <Icon name="trash" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setChapter(chapter.key, { collapsed: !chapter.collapsed })}
                    aria-expanded={!chapter.collapsed}
                    aria-label={chapter.collapsed ? 'פתיחת השלב' : 'כיווץ השלב'}
                  >
                    <Icon name={chapter.collapsed ? 'chevronDown' : 'chevronUp'} size={18} />
                  </button>
                </div>
              </div>

              {!chapter.collapsed && (
                <div className="adm-level__body">
                  <textarea
                    className="textarea"
                    rows={2}
                    value={chapter.description}
                    onChange={(e) => setChapter(chapter.key, { description: e.target.value })}
                    placeholder="תיאור השלב (לא חובה)"
                    aria-label="תיאור השלב"
                  />

                  <ol className="adm-tasks">
                    {chapter.tasks.map((task, ti) => {
                      const mediaReady = Boolean(task.id && savedTaskIds.has(task.id) && saved)
                      const videoCount = task.id ? mediaOf(task.id, 'video').length : 0
                      const fileCount = task.id ? mediaOf(task.id, 'file').length : 0
                      const game = saved && task.id ? contentOf(saved, task.id) : null
                      const hasGame = Boolean(game?.worksheet || game?.quiz)
                      return (
                        <li key={task.key} className={`adm-task${task.open ? ' is-open' : ''}`}>
                          <div className="adm-task__row">
                            <span className="adm-task__num">{ti + 1}</span>
                            <input
                              className="input adm-task__title"
                              value={task.title}
                              onChange={(e) => setTask(chapter.key, task.key, { title: e.target.value })}
                              placeholder="שם המשימה"
                              aria-label={`שם משימה ${ti + 1}`}
                              autoFocus={focusKey === task.key}
                            />
                            <label className="adm-task__due">
                              <Icon name="clock" size={15} />
                              <input
                                className="input"
                                type="datetime-local"
                                value={task.due}
                                onChange={(e) => setTask(chapter.key, task.key, { due: e.target.value })}
                                aria-label="מועד יעד"
                              />
                            </label>
                            <button
                              type="button"
                              className={`btn btn--sm ${task.open ? 'btn--soft' : 'btn--ghost'} adm-task__more`}
                              onClick={() => setTask(chapter.key, task.key, { open: !task.open })}
                              aria-expanded={task.open}
                            >
                              <Icon name="video" size={14} /> {videoCount}
                              <Icon name="file" size={14} /> {fileCount}
                              {hasGame && (
                                <span className="adm-task__game" title="יש מסך עבודה או חידון">
                                  <Icon name="sparkles" size={14} />
                                </span>
                              )}
                              <Icon name={task.open ? 'chevronUp' : 'chevronDown'} size={14} />
                            </button>
                            <div className="adm-task__tools">
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() =>
                                  setChapter(chapter.key, { tasks: swap(chapter.tasks, ti, -1) })
                                }
                                disabled={ti === 0}
                                aria-label="הזזת המשימה למעלה"
                              >
                                <Icon name="arrowUp" size={15} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => setChapter(chapter.key, { tasks: swap(chapter.tasks, ti, 1) })}
                                disabled={ti === chapter.tasks.length - 1}
                                aria-label="הזזת המשימה למטה"
                              >
                                <Icon name="arrowDown" size={15} />
                              </button>
                              <button
                                type="button"
                                className="icon-btn icon-btn--danger"
                                onClick={() => removeTask(chapter.key, task)}
                                aria-label="הסרת המשימה"
                              >
                                <Icon name="trash" size={15} />
                              </button>
                            </div>
                          </div>

                          {task.open && (
                            <div className="adm-task__details">
                              <textarea
                                className="textarea"
                                rows={3}
                                value={task.description}
                                onChange={(e) => setTask(chapter.key, task.key, { description: e.target.value })}
                                placeholder="הנחיות ללקוח (לא חובה)"
                                aria-label="תיאור המשימה"
                              />
                              {mediaReady && saved && (
                                <TaskGameContent
                                  planId={saved.id}
                                  taskId={task.id!}
                                  content={contentOf(saved, task.id!)}
                                  onSaved={(content) => setSaved((p) => (p ? withContent(p, task.id!, content) : p))}
                                />
                              )}
                              {mediaReady && saved ? (
                                <div className="adm-task__media">
                                  <div>
                                    <h4>
                                      <Icon name="video" size={16} /> סרטונים
                                    </h4>
                                    <MediaManager
                                      planId={saved.id}
                                      taskId={task.id!}
                                      kind="video"
                                      assets={mediaOf(task.id!, 'video')}
                                      onChange={setAssets}
                                    />
                                  </div>
                                  <div>
                                    <h4>
                                      <Icon name="file" size={16} /> קבצים
                                    </h4>
                                    <MediaManager
                                      planId={saved.id}
                                      taskId={task.id!}
                                      kind="file"
                                      assets={mediaOf(task.id!, 'file')}
                                      onChange={setAssets}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <p className="alert alert--info">
                                  <Icon name="alert" size={16} /> שמרו את התוכנית כדי להוסיף סרטונים וקבצים למשימה.
                                </p>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ol>

                  <button type="button" className="btn btn--ghost btn--sm adm-add" onClick={() => addTask(chapter.key)}>
                    <Icon name="plus" size={16} /> הוספת משימה
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>

        <button type="button" className="btn btn--outline adm-add-level" onClick={addChapter}>
          <Icon name="plus" size={18} /> הוספת שלב
        </button>
      </section>

      {saved ? (
        <>
          <section className="adm-card">
            <div className="adm-card__head">
              <div>
                <h2>סרטוני הדרכה</h2>
                <p>רשימת הניגון של התוכנית עם הדרכות והנחיות. הלקוחות צופים בה בספרייה, בסדר הזה.</p>
              </div>
            </div>
            <MediaManager planId={saved.id} taskId={null} kind="video" assets={mediaOf(null, 'video')} onChange={setAssets} />
          </section>

          <section className="adm-card">
            <div className="adm-card__head">
              <div>
                <h2>קבצי התוכנית</h2>
                <p>קבצים לכל התוכנית, כמו תבניות ומדריכים.</p>
              </div>
            </div>
            <MediaManager planId={saved.id} taskId={null} kind="file" assets={mediaOf(null, 'file')} onChange={setAssets} />
          </section>

          <section className="adm-card">
            <div className="adm-card__head">
              <div>
                <h2>הלקוחות בתוכנית</h2>
                <p>איפה כל לקוח נמצא בלוח. לחצו על אסימון כדי לפתוח את הלקוח.</p>
              </div>
            </div>
            {customers.length === 0 ? (
              <p className="empty-note">אף לקוח עדיין לא משויך לתוכנית. משייכים מהעמוד של הלקוח.</p>
            ) : saved.chapters.length === 0 ? (
              <p className="empty-note">הוסיפו שלבים כדי לראות את הלוח.</p>
            ) : (
              <div className="adm-crowd-map">
                <Board
                  plain
                  title={saved.title}
                  chapters={saved.chapters.map((c) => ({
                    id: c.id,
                    title: c.title,
                    state: 'current',
                    tasks: c.tasks.map((t) => ({ id: t.id, title: t.title, started: false, completed: false })),
                  }))}
                  crowd={customers.map((c) => ({
                    id: c.id,
                    name: c.name,
                    avatarUrl: c.avatarUrl,
                    position: c.plan?.level.position ?? 0,
                  }))}
                  onSelectPlayer={(customerId) => navigate(`/admin/customers/${customerId}`)}
                />
              </div>
            )}
          </section>

          <section className="adm-card adm-danger">
            <div>
              <h2>מחיקת התוכנית</h2>
              <p>
                {saved.customerCount > 0
                  ? `קודם שייכו תוכנית אחרת ל-${saved.customerCount} הלקוחות בתוכנית הזו.`
                  : 'הפעולה מוחקת את התוכנית ואת כל הסרטונים והקבצים שלה.'}
              </p>
            </div>
            <button type="button" className="btn btn--danger-soft" onClick={() => void deletePlan()} disabled={saved.customerCount > 0}>
              <Icon name="trash" size={16} /> מחיקת התוכנית
            </button>
          </section>
        </>
      ) : (
        <p className="alert alert--info">
          <Icon name="alert" size={16} /> צרו קודם את התוכנית. אחר כך אפשר להוסיף סרטוני הדרכה, קבצים ומדיה לכל משימה.
        </p>
      )}

      {(dirty || notice) && (
        <div className={`adm-savebar${dirty ? '' : ' is-saved'}`} role="status">
          <span>{dirty ? 'יש שינויים שלא נשמרו' : notice}</span>
          {dirty && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => void save()} disabled={saving}>
              {saving && <span className="spinner" />} {isNew ? 'יצירת התוכנית' : 'שמירת שינויים'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
