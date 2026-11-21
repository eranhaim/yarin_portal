import { useState } from 'react'
import { formatDuration } from '../lib/format'
import type { Asset } from '../lib/types'
import { Icon } from './Icon'
import { VideoPlayer } from './VideoPlayer'

type Props = {
  videos: Asset[]
  heading?: string
  emptyText?: string
}

/** A video player with the list of videos on the side. With one video, it shows only the player. */
export function VideoPlaylist({ videos, heading = 'רשימת ניגון', emptyText = 'אין סרטונים עדיין.' }: Props) {
  const [index, setIndex] = useState(0)
  const [autoAdvance, setAutoAdvance] = useState(false)

  if (videos.length === 0) return <p className="empty-note">{emptyText}</p>

  const current = videos[Math.min(index, videos.length - 1)]!
  const totalSeconds = videos.reduce((sum, v) => sum + (v.durationSeconds ?? 0), 0)
  const hasList = videos.length > 1

  const play = (i: number) => {
    setIndex(i)
    setAutoAdvance(true)
  }

  return (
    <div className={`vpl${hasList ? ' vpl--with-list' : ''}`}>
      <div className="vpl__main">
        {current.url ? (
          <VideoPlayer
            key={current.id}
            src={current.url}
            poster={current.posterUrl}
            title={current.title}
            downloadUrl={current.downloadUrl}
            autoPlay={autoAdvance}
            onEnded={() => {
              if (index < videos.length - 1) play(index + 1)
            }}
          />
        ) : (
          <p className="empty-note">הסרטון לא זמין כרגע.</p>
        )}
        <div className="vpl__now">
          <h3>{current.title}</h3>
          {hasList && (
            <span>
              סרטון {index + 1} מתוך {videos.length}
            </span>
          )}
        </div>
      </div>

      {hasList && (
        <aside className="vpl__list" aria-label={heading}>
          <header className="vpl__list-head">
            <span className="vpl__list-title">{heading}</span>
            <span className="vpl__list-meta">
              {videos.length} סרטונים{totalSeconds > 0 ? ` · ${formatDuration(totalSeconds)}` : ''}
            </span>
          </header>
          <ol className="vpl__items">
            {videos.map((video, i) => {
              const active = i === index
              return (
                <li key={video.id}>
                  <button
                    type="button"
                    className={`vpl__item${active ? ' is-active' : ''}`}
                    onClick={() => play(i)}
                    aria-current={active ? 'true' : undefined}
                  >
                    <span className="vpl__thumb">
                      {video.posterUrl ? <img src={video.posterUrl} alt="" loading="lazy" /> : <Icon name="video" size={22} />}
                      {active ? (
                        <span className="vpl__eq" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : (
                        video.durationSeconds && <span className="vpl__duration">{formatDuration(video.durationSeconds)}</span>
                      )}
                    </span>
                    <span className="vpl__item-text">
                      <span className="vpl__item-index">{active ? 'מתנגן עכשיו' : `סרטון ${i + 1}`}</span>
                      <span className="vpl__item-title">{video.title}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </aside>
      )}
    </div>
  )
}
