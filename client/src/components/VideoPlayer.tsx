import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { formatDuration } from '../lib/format'
import { Icon } from './Icon'
import './VideoPlayer.css'

const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75]

type Props = {
  src: string
  poster?: string | null
  title?: string
  autoPlay?: boolean
  onEnded?: () => void
  downloadUrl?: string | null
}

export function VideoPlayer({ src, poster, title, autoPlay = false, onEnded, downloadUrl }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const idleTimer = useRef<number | undefined>(undefined)

  const [playing, setPlaying] = useState(false)
  const [started, setStarted] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [waiting, setWaiting] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [idle, setIdle] = useState(false)
  const [failed, setFailed] = useState(false)
  const [hover, setHover] = useState<{ left: number; time: number } | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const [flash, setFlash] = useState<{ icon: 'play' | 'pause' | 'back10' | 'forward10'; key: number } | null>(null)

  const video = () => videoRef.current

  const toggle = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused || v.ended) {
      void v.play().catch(() => undefined)
      setFlash({ icon: 'play', key: Date.now() })
    } else {
      v.pause()
      setFlash({ icon: 'pause', key: Date.now() })
    }
  }, [])

  const seekBy = (seconds: number) => {
    const v = video()
    if (!v) return
    v.currentTime = Math.min(Math.max(0, v.currentTime + seconds), v.duration || 0)
    setFlash({ icon: seconds < 0 ? 'back10' : 'forward10', key: Date.now() })
  }

  const setVol = (value: number) => {
    const v = video()
    if (!v) return
    v.volume = Math.min(1, Math.max(0, value))
    v.muted = v.volume === 0
  }

  const toggleFullscreen = async () => {
    const wrap = wrapRef.current
    const v = video() as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    if (!wrap) return
    if (document.fullscreenElement) await document.exitFullscreen()
    else if (wrap.requestFullscreen) await wrap.requestFullscreen().catch(() => undefined)
    else v?.webkitEnterFullscreen?.() // iPhone Safari
  }

  const togglePip = async () => {
    const v = video()
    if (!v) return
    if (document.pictureInPictureElement) await document.exitPictureInPicture()
    else await v.requestPictureInPicture().catch(() => undefined)
  }

  const cycleRate = () => {
    const v = video()
    if (!v) return
    v.playbackRate = RATES[(RATES.indexOf(v.playbackRate) + 1) % RATES.length] ?? 1
  }

  // Hide the controls after a short time without mouse movement while playing.
  const wake = () => {
    setIdle(false)
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setIdle(true), 2600)
  }

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      window.clearTimeout(idleTimer.current)
    }
  }, [])

  // ---------- Progress bar ----------

  const fractionAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  const seekTo = (fraction: number) => {
    const v = video()
    if (v && duration) v.currentTime = fraction * duration
  }

  const onTrackDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setScrubbing(true)
    seekTo(fractionAt(e.clientX))
  }
  const onTrackMove = (e: PointerEvent<HTMLDivElement>) => {
    const fraction = fractionAt(e.clientX)
    setHover({ left: fraction * 100, time: fraction * duration })
    if (scrubbing) seekTo(fraction)
  }
  const onTrackUp = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    setScrubbing(false)
  }

  // ---------- Keyboard ----------

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') && (e.key === ' ' || e.key === 'Enter')) return
    const actions: Record<string, () => void> = {
      ' ': toggle,
      k: toggle,
      ArrowLeft: () => seekBy(-5),
      ArrowRight: () => seekBy(5),
      j: () => seekBy(-10),
      l: () => seekBy(10),
      ArrowUp: () => setVol((video()?.volume ?? 1) + 0.1),
      ArrowDown: () => setVol((video()?.volume ?? 1) - 0.1),
      m: () => {
        const v = video()
        if (v) v.muted = !v.muted
      },
      f: () => void toggleFullscreen(),
    }
    const action = actions[e.key]
    if (action) {
      e.preventDefault()
      wake()
      action()
    }
  }

  const progress = duration ? (time / duration) * 100 : 0
  const bufferedPct = duration ? (buffered / duration) * 100 : 0
  const showControls = !playing || !idle || scrubbing
  const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled

  return (
    <div
      ref={wrapRef}
      className={`vp${showControls ? ' vp--controls' : ' vp--idle'}${fullscreen ? ' vp--fullscreen' : ''}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerMove={wake}
      onPointerLeave={() => playing && setIdle(true)}
      aria-label={title ? `Video player: ${title}` : 'Video player'}
    >
      <video
        ref={videoRef}
        className="vp__video"
        src={src}
        poster={poster ?? undefined}
        preload="metadata"
        playsInline
        autoPlay={autoPlay}
        onClick={toggle}
        onDoubleClick={() => void toggleFullscreen()}
        onPlay={() => {
          setPlaying(true)
          setStarted(true)
          wake()
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          onEnded?.()
        }}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered
          if (b.length) setBuffered(b.end(b.length - 1))
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume)
          setMuted(e.currentTarget.muted)
        }}
        onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
        onError={() => setFailed(true)}
      />

      {/* Start screen */}
      {!started && !failed && (
        <button type="button" className="vp__start" onClick={toggle} aria-label={`Play ${title ?? 'video'}`}>
          <span className="vp__start-button">
            <Icon name="play" size={34} />
          </span>
          {title && <span className="vp__start-title">{title}</span>}
          {duration > 0 && <span className="vp__start-duration">{formatDuration(duration)}</span>}
        </button>
      )}

      {waiting && playing && <div className="vp__spinner" aria-label="Loading" />}

      {flash && (
        <div key={flash.key} className="vp__flash" aria-hidden="true">
          <Icon name={flash.icon} size={30} />
        </div>
      )}

      {failed && (
        <div className="vp__error">
          <Icon name="alert" size={32} />
          <p>This video cannot play in your browser.</p>
          {downloadUrl && (
            <a className="btn btn--light btn--sm" href={downloadUrl}>
              <Icon name="download" size={16} /> Download the video
            </a>
          )}
        </div>
      )}

      {started && title && <div className="vp__top">{title}</div>}

      {started && (
        <div className="vp__bar" onPointerDown={(e) => e.stopPropagation()}>
          <div
            ref={trackRef}
            className={`vp__track${scrubbing ? ' is-scrubbing' : ''}`}
            role="slider"
            tabIndex={-1}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            aria-valuetext={`${formatDuration(time)} of ${formatDuration(duration)}`}
            onPointerDown={onTrackDown}
            onPointerMove={onTrackMove}
            onPointerUp={onTrackUp}
            onPointerLeave={() => setHover(null)}
          >
            <div className="vp__track-rail">
              <div className="vp__track-buffered" style={{ width: `${bufferedPct}%` }} />
              <div className="vp__track-played" style={{ width: `${progress}%` }} />
            </div>
            <div className="vp__track-thumb" style={{ left: `${progress}%` }} />
            {hover && (
              <div className="vp__track-tooltip" style={{ left: `${hover.left}%` }}>
                {formatDuration(hover.time)}
              </div>
            )}
          </div>

          <div className="vp__buttons">
            <button type="button" className="vp__btn vp__btn--main" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
              <Icon name={playing ? 'pause' : 'play'} size={22} />
            </button>
            <button type="button" className="vp__btn" onClick={() => seekBy(-10)} aria-label="Back 10 seconds">
              <Icon name="back10" size={22} />
            </button>
            <button type="button" className="vp__btn" onClick={() => seekBy(10)} aria-label="Forward 10 seconds">
              <Icon name="forward10" size={22} />
            </button>

            <div className="vp__volume">
              <button
                type="button"
                className="vp__btn"
                onClick={() => {
                  const v = video()
                  if (v) v.muted = !v.muted
                }}
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                <Icon name={muted || volume === 0 ? 'volumeMute' : 'volume'} size={22} />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => setVol(Number(e.target.value))}
                aria-label="Volume"
                style={{ '--vp-vol': `${(muted ? 0 : volume) * 100}%` } as CSSProperties}
              />
            </div>

            <span className="vp__time">
              {formatDuration(time)} <span>/ {formatDuration(duration)}</span>
            </span>

            <span className="vp__spacer" />

            <button type="button" className="vp__btn vp__btn--rate" onClick={cycleRate} aria-label={`Playback speed ${rate}x`}>
              {rate}×
            </button>
            {pipSupported && (
              <button type="button" className="vp__btn" onClick={() => void togglePip()} aria-label="Picture in picture">
                <Icon name="pip" size={20} />
              </button>
            )}
            <button
              type="button"
              className="vp__btn"
              onClick={() => void toggleFullscreen()}
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
            >
              <Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'} size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
