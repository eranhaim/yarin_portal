import { useCallback, useMemo, useState } from 'react'
import { FileList } from '../../components/FileList'
import { Icon } from '../../components/Icon'
import { VideoPlayer } from '../../components/VideoPlayer'
import { formatDuration } from '../../lib/format'
import { missionLabel } from '../../lib/game'
import type { LibraryLesson, MyPlan } from '../../lib/types'
import { useCustomer } from './customerContext'
import './library.css'
import { NoPlan } from './NoPlan'
import { useWatch } from './useWatch'

// Every recorded lesson of the program, in order, with search. Watching here counts for the task too.

export function LibraryPage() {
  const { me, plan } = useCustomer()
  if (!plan) return <NoPlan name={me.name} />
  return <Library plan={plan} />
}

function Library({ plan }: { plan: MyPlan }) {
  const { applyPlan } = useCustomer()
  const all = useMemo(() => plan.library.flatMap((c) => c.lessons.map((l) => ({ ...l, open: c.open }))), [plan.library])
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // Start where the customer is: the lesson in progress, or the first one that was not watched.
  const initial = all.find((l) => l.open && l.videos.some((v) => v.position > 5 && !v.watched)) ?? all.find((l) => l.open && !l.watched) ?? all.find((l) => l.open)
  const current = all.find((l) => l.taskId === selected) ?? initial
  const watched = all.filter((l) => l.watched).length
  const seconds = all.reduce((sum, l) => sum + l.seconds, 0)
  const q = query.trim()
  const match = (l: LibraryLesson) => !q || l.title.includes(q) || l.summary.includes(q)

  const choose = (lesson: LibraryLesson & { open: boolean }) => {
    if (!lesson.open) return
    setSelected(lesson.taskId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="library">
      <header className="page-head">
        <span className="gta-eyebrow">{plan.title}</span>
        <h1 className="gta-title">כל השיעורים</h1>
        <p>
          {all.length} שיעורים · {formatDuration(seconds)} · צפיתם ב-{watched}
        </p>
      </header>

      {current && current.videos[0] && <LessonPlayer key={current.taskId} lesson={current} onPlan={applyPlan} />}

      <label className="library__search">
        <Icon name="search" size={18} />
        <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש שיעור" aria-label="חיפוש שיעור" />
      </label>

      {plan.library.map((chapter, i) => {
        const lessons = chapter.lessons.filter(match)
        if (lessons.length === 0) return null
        return (
          <section key={chapter.id}>
            <h2 className="section-title">
              שלב {i + 1}: {chapter.title}
            </h2>
            <ol className="library__grid">
              {lessons.map((lesson) => {
                const label = missionLabel(lesson.title, 1)
                return (
                  <li key={lesson.taskId}>
                    <button
                      type="button"
                      className={`lesson-card${current?.taskId === lesson.taskId ? ' is-playing' : ''}`}
                      disabled={!chapter.open}
                      onClick={() => choose({ ...lesson, open: chapter.open })}
                    >
                      <span className="lesson-card__thumb">
                        {lesson.posterUrl ? <img src={lesson.posterUrl} alt="" loading="lazy" /> : <Icon name="video" size={26} />}
                        <span className="lesson-card__time ltr">{formatDuration(lesson.seconds)}</span>
                        {lesson.watched && (
                          <span className="lesson-card__done">
                            <Icon name="check" size={14} /> נצפה
                          </span>
                        )}
                        {!chapter.open && (
                          <span className="lesson-card__lock">
                            <Icon name="lock" size={20} />
                          </span>
                        )}
                      </span>
                      <span className="lesson-card__text">
                        <small>שיעור {label.badge}</small>
                        <strong>{label.label}</strong>
                        {lesson.summary && <em>{lesson.summary}</em>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
      {all.length === 0 && <p className="empty-note">עוד אין שיעורים מוקלטים.</p>}
      {all.length > 0 && !all.some(match) && <p className="empty-note">לא מצאנו שיעור כזה.</p>}

      {plan.files.length > 0 && (
        <section>
          <h2 className="section-title">קבצי התוכנית</h2>
          <FileList files={plan.files} />
        </section>
      )}
    </div>
  )
}

function LessonPlayer({ lesson, onPlan }: { lesson: LibraryLesson; onPlan: (plan: MyPlan) => void }) {
  const [index, setIndex] = useState(0)
  const video = lesson.videos[Math.min(index, lesson.videos.length - 1)]!
  const onFinished = useCallback((plan: MyPlan) => onPlan(plan), [onPlan])
  const { onWatch, onRest } = useWatch(video, onFinished)
  const label = missionLabel(lesson.title, 1)
  return (
    <section className="library__player">
      {video.url ? (
        <VideoPlayer
          key={video.id}
          src={video.url}
          poster={video.posterUrl}
          title={label.label}
          downloadUrl={video.downloadUrl}
          startAt={video.watched ? 0 : video.position}
          captionsUrl={index === 0 && lesson.captions ? `/api/me/tasks/${lesson.taskId}/captions.vtt` : null}
          onWatch={onWatch}
          onRest={onRest}
        />
      ) : (
        <p className="empty-note">הסרטון לא זמין כרגע.</p>
      )}
      <div className="library__now">
        <small>שיעור {label.badge}</small>
        <h2>{label.label}</h2>
        {lesson.summary && <p>{lesson.summary}</p>}
        {lesson.videos.length > 1 && (
          <div className="library__parts">
            {lesson.videos.map((v, i) => (
              <button key={v.id} type="button" aria-pressed={i === index} onClick={() => setIndex(i)}>
                {v.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
