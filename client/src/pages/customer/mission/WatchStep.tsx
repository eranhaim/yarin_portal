import { useCallback, useState } from 'react'
import { FileList } from '../../../components/FileList'
import { Icon } from '../../../components/Icon'
import { VideoPlayer } from '../../../components/VideoPlayer'
import { errorMessage } from '../../../lib/api'
import { formatDuration } from '../../../lib/format'
import type { MyPlan, MyTask } from '../../../lib/types'
import { useWatch } from '../useWatch'

// The lesson: it resumes where the customer stopped, shows the main points, and jumps to key moments.

export function WatchStep({ task, onPlan }: { task: MyTask; onPlan: (plan: MyPlan | null) => void }) {
  const firstOpen = task.videos.findIndex((v) => !v.watched)
  const [index, setIndex] = useState(Math.max(0, firstOpen))
  const [seek, setSeek] = useState<{ at: number; key: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const video = task.videos[index]
  const onFinished = useCallback((plan: MyPlan) => onPlan(plan), [onPlan])
  const { onWatch, onRest, markDone } = useWatch(video, onFinished)

  if (!video) return null
  const allWatched = task.videos.every((v) => v.watched)

  const already = async () => {
    setBusy(true)
    setError(null)
    try {
      await markDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="watch">
      {video.url ? (
        <VideoPlayer
          key={video.id}
          src={video.url}
          poster={video.posterUrl}
          title={video.title}
          downloadUrl={video.downloadUrl}
          startAt={video.watched ? 0 : video.position}
          captionsUrl={task.lesson?.captions && index === 0 ? `/api/me/tasks/${task.id}/captions.vtt` : null}
          onWatch={onWatch}
          onRest={onRest}
          seek={seek}
        />
      ) : (
        <p className="empty-note">הסרטון לא זמין כרגע.</p>
      )}

      <div className="watch__bar">
        {task.videos.length > 1 && (
          <div className="watch__list" role="tablist" aria-label="סרטונים">
            {task.videos.map((v, i) => (
              <button key={v.id} type="button" role="tab" aria-selected={i === index} className="watch__tab" onClick={() => setIndex(i)}>
                {v.watched && <Icon name="check" size={14} />} {v.title}
              </button>
            ))}
          </div>
        )}
        {allWatched ? (
          <span className="watch__state">
            <Icon name="check" size={16} /> השיעור נצפה
          </span>
        ) : (
          <>
            <span className="watch__state watch__state--muted">
              {video.position > 5 ? `ממשיכים מ-${formatDuration(video.position)}` : 'השלב נסגר לבד כשמסיימים לצפות'}
            </span>
            <button type="button" className="btn btn--sm btn--ghost-light" onClick={() => void already()} disabled={busy}>
              {busy && <span className="spinner" />} כבר צפיתי
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {task.lesson && (task.lesson.summary || task.lesson.keyPoints.length > 0) && (
        <section className="panel lesson">
          <h2 className="panel__title">
            <Icon name="list" size={18} /> השיעור בקצרה
          </h2>
          {task.lesson.summary && <p className="lesson__summary">{task.lesson.summary}</p>}
          <div className="lesson__cols">
            {task.lesson.keyPoints.length > 0 && (
              <ul className="lesson__points">
                {task.lesson.keyPoints.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {task.lesson.moments.length > 0 && (
              <ol className="lesson__moments" aria-label="רגעים חשובים">
                {task.lesson.moments.map((m) => (
                  <li key={`${m.at}-${m.title}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setIndex(0)
                        setSeek({ at: m.at, key: Date.now() })
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                    >
                      <span className="ltr">{formatDuration(m.at)}</span> {m.title}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}

      {task.files.length > 0 && (
        <section className="panel">
          <h2 className="panel__title">
            <Icon name="file" size={18} /> קבצים של השיעור
          </h2>
          <FileList files={task.files} />
        </section>
      )}
    </div>
  )
}
