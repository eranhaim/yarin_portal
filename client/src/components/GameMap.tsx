import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { colorFromString, initials } from '../lib/format'
import type { ChapterState } from '../lib/types'
import { Icon } from './Icon'
import './GameMap.css'

export type MapLevel = { id: string; title: string; state: ChapterState; total: number; completed: number }

/** levelIndex = index of the current chapter; levels.length means the plan is finished. */
export type MapPlayer = { id: string; name: string; avatarUrl: string | null; levelIndex: number }

type Props = {
  levels: MapLevel[]
  /** The main character (customer view, or one customer in the admin panel). */
  player?: MapPlayer
  /** When set and lower than player.levelIndex, the character walks from that level to its current one. */
  animateFrom?: number | null
  onArrive?: () => void
  /** Many small avatars (admin view of everyone on a plan). */
  crowd?: MapPlayer[]
  onSelectLevel?: (index: number) => void
  onSelectPlayer?: (id: string) => void
  autoScroll?: boolean
  /** All levels look the same (no locks or stars). For the admin view of many customers. */
  plain?: boolean
}

// ---------- Geometry (SVG user units; the SVG scales to its container) ----------

const W = 440
const STEP = 170
const TOP = 170
const START_Y = 64
const CENTER = 220
const AMPLITUDE = 112

type Point = { x: number; y: number }

const levelPoint = (i: number): Point => ({ x: CENTER + AMPLITUDE * Math.sin(i * 1.2), y: TOP + i * STEP })

function trailPath(points: Point[]): string {
  if (points.length === 0) return ''
  let d = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const dy = (b.y - a.y) * 0.55
    d += ` C ${a.x} ${a.y + dy} ${b.x} ${b.y - dy} ${b.x} ${b.y}`
  }
  return d
}

/** Small seeded random generator, so the scenery is the same on every visit. */
function seededRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

// ---------- Scenery ----------

type Feature = 'trees' | 'mountain' | 'pond' | 'house' | 'rocks' | 'pines'
type Small = 'bush' | 'flowers' | 'tuft' | 'stone'
type Decoration = { kind: Feature | Small; x: number; y: number; s: number }

const FEATURES: Feature[] = ['trees', 'mountain', 'pond', 'pines', 'house', 'rocks']
const SMALLS: Small[] = ['bush', 'flowers', 'tuft', 'stone', 'flowers', 'tuft']

function buildScenery(points: Point[], height: number): { decorations: Decoration[]; patches: Point[] } {
  const random = seededRandom(points.length * 7919 + 17)
  const decorations: Decoration[] = []

  // The trail's x position at a height (close enough for keeping scenery off the trail).
  const trailX = (y: number) => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!
      const b = points[i]!
      if (y <= b.y) {
        const t = clamp((y - a.y) / (b.y - a.y || 1), 0, 1)
        const eased = t * t * (3 - 2 * t)
        return a.x + (b.x - a.x) * eased
      }
    }
    return points[points.length - 1]!.x
  }

  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    const side = p.x > CENTER ? -1 : 1
    decorations.push({
      kind: FEATURES[(i + points.length) % FEATURES.length]!,
      x: clamp(p.x + side * (140 + random() * 30), 58, W - 58),
      y: p.y + (random() - 0.5) * 50,
      s: 0.9 + random() * 0.25,
    })
  }

  const count = Math.round(height / 38)
  for (let i = 0; i < count; i++) {
    const y = 30 + random() * (height - 60)
    let x = 20 + random() * (W - 40)
    for (let tries = 0; tries < 8 && Math.abs(x - trailX(y)) < 62; tries++) x = 20 + random() * (W - 40)
    if (Math.abs(x - trailX(y)) < 50) continue
    decorations.push({ kind: SMALLS[i % SMALLS.length]!, x, y, s: 0.8 + random() * 0.5 })
  }

  decorations.sort((a, b) => a.y - b.y)
  const patches = Array.from({ length: Math.ceil(height / 220) }, () => ({ x: random() * W, y: random() * height }))
  return { decorations, patches }
}

function Tree({ x, y, s }: Point & { s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="16" rx="18" ry="5" className="gm-shadow" />
      <rect x="-3" y="2" width="6" height="14" rx="2" fill="#8b5a2b" />
      <circle cx="-10" cy="0" r="11" fill="#2f9e44" />
      <circle cx="10" cy="0" r="11" fill="#2b8a3e" />
      <circle cx="0" cy="-8" r="14" fill="#37b24d" />
      <circle cx="-5" cy="-13" r="4.5" fill="#fff" opacity="0.22" />
    </g>
  )
}

function Pine({ x, y, s }: Point & { s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="18" rx="14" ry="4.5" className="gm-shadow" />
      <rect x="-2.5" y="8" width="5" height="10" fill="#7a4b22" />
      <path d="M0 -30 L16 0 L-16 0 Z" fill="#1f7a43" />
      <path d="M0 -20 L19 10 L-19 10 Z" fill="#23904f" />
      <path d="M0 -38 L12 -14 L-12 -14 Z" fill="#2aa35b" />
    </g>
  )
}

function Decor({ d }: { d: Decoration }) {
  const { x, y, s } = d
  switch (d.kind) {
    case 'trees':
      return (
        <g>
          <Tree x={x - 18} y={y - 6} s={s * 0.85} />
          <Tree x={x + 16} y={y + 4} s={s} />
        </g>
      )
    case 'pines':
      return (
        <g>
          <Pine x={x - 16} y={y} s={s * 0.9} />
          <Pine x={x + 4} y={y - 10} s={s * 1.1} />
          <Pine x={x + 22} y={y + 6} s={s * 0.8} />
        </g>
      )
    case 'mountain':
      return (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          <ellipse cx="0" cy="22" rx="62" ry="9" className="gm-shadow" />
          <path d="M-60 22 L-18 -40 L22 22 Z" fill="#7d8aa3" />
          <path d="M-20 22 L22 -54 L64 22 Z" fill="#94a3bb" />
          <path d="M22 -54 L34 -32 L26 -36 L18 -28 L10 -32 Z" fill="#fff" />
          <path d="M-18 -40 L-9 -26 L-15 -29 L-22 -24 L-27 -28 Z" fill="#f1f3f5" />
        </g>
      )
    case 'pond':
      return (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          <ellipse cx="0" cy="0" rx="46" ry="20" fill="#4dabf7" stroke="#a5d8ff" strokeWidth="4" />
          <ellipse cx="-12" cy="-5" rx="16" ry="4" fill="#fff" opacity="0.35" />
          <circle cx="20" cy="4" r="5" fill="#51cf66" />
          <circle cx="8" cy="9" r="3.5" fill="#69db7c" />
        </g>
      )
    case 'house':
      return (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          <ellipse cx="0" cy="20" rx="30" ry="6" className="gm-shadow" />
          <rect x="-22" y="-6" width="44" height="26" rx="2" fill="#fff4e6" />
          <path d="M-28 -4 L0 -28 L28 -4 Z" fill="#e8590c" />
          <rect x="-6" y="6" width="12" height="14" rx="2" fill="#8b5a2b" />
          <rect x="10" y="0" width="8" height="8" rx="1.5" fill="#74c0fc" />
          <rect x="-18" y="0" width="8" height="8" rx="1.5" fill="#74c0fc" />
        </g>
      )
    case 'rocks':
      return (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          <ellipse cx="0" cy="10" rx="30" ry="6" className="gm-shadow" />
          <ellipse cx="-10" cy="2" rx="16" ry="11" fill="#adb5bd" />
          <ellipse cx="12" cy="5" rx="11" ry="8" fill="#868e96" />
          <ellipse cx="-14" cy="-3" rx="5" ry="3" fill="#fff" opacity="0.3" />
        </g>
      )
    case 'bush':
      return (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          <circle cx="-7" cy="0" r="7" fill="#40c057" />
          <circle cx="6" cy="0" r="8" fill="#37b24d" />
          <circle cx="0" cy="-5" r="7" fill="#51cf66" />
        </g>
      )
    case 'flowers':
      return (
        <g transform={`translate(${x} ${y}) scale(${s})`}>
          {[
            [-6, 0, '#ff8787'],
            [5, -3, '#ffd43b'],
            [2, 6, '#f783ac'],
          ].map(([fx, fy, color]) => (
            <g key={`${fx}-${fy}`}>
              <circle cx={fx} cy={fy} r="3.4" fill={color as string} />
              <circle cx={fx} cy={fy} r="1.2" fill="#fff" />
            </g>
          ))}
        </g>
      )
    case 'tuft':
      return (
        <path
          transform={`translate(${x} ${y}) scale(${s})`}
          d="M0 0 L-4 -9 M0 0 L0 -11 M0 0 L4 -9"
          stroke="#2f9e44"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      )
    case 'stone':
      return <ellipse cx={x} cy={y} rx={5 * s} ry={3.4 * s} fill="#ced4da" />
  }
}

function Cloud({ x, y, s, className }: Point & { s: number; className: string }) {
  return (
    <g className={className}>
      <g transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity="0.9">
        <ellipse cx="0" cy="0" rx="26" ry="12" />
        <ellipse cx="-16" cy="4" rx="16" ry="9" />
        <ellipse cx="18" cy="4" rx="18" ry="9" />
        <ellipse cx="4" cy="-8" rx="15" ry="11" />
      </g>
    </g>
  )
}

// ---------- Characters ----------

function AvatarDisc({ name, url, r, clipId }: { name: string; url: string | null; r: number; clipId: string }) {
  return (
    <>
      <circle r={r + 3.5} fill="#fff" />
      {url ? (
        <>
          <clipPath id={clipId}>
            <circle r={r} />
          </clipPath>
          <image
            href={url}
            x={-r}
            y={-r}
            width={r * 2}
            height={r * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      ) : (
        <>
          <circle r={r} fill={colorFromString(name)} />
          <text className="gm-initials" fontSize={r * 0.8} dy="0.35em" textAnchor="middle">
            {initials(name)}
          </text>
        </>
      )}
    </>
  )
}

// ---------- The map ----------

export function GameMap({
  levels,
  player,
  animateFrom,
  onArrive,
  crowd,
  onSelectLevel,
  onSelectPlayer,
  autoScroll = false,
  plain = false,
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const n = levels.length
  const height = TOP + n * STEP + 150

  const points = useMemo(() => {
    const list: Point[] = [{ x: levelPoint(0).x, y: START_Y }]
    for (let i = 0; i <= n; i++) list.push(levelPoint(i)) // levels, then the finish
    return list
  }, [n])
  const fullPath = useMemo(() => trailPath(points), [points])
  const scenery = useMemo(() => buildScenery(points, height), [points, height])

  // Player position on the trail. points[0] is the start sign, points[i + 1] is level i.
  const target = player ? clamp(player.levelIndex, 0, n) + 1 : 0
  const from = player && animateFrom != null ? clamp(animateFrom, 0, n) + 1 : target
  const [pos, setPos] = useState<Point>(points[Math.min(from, target)] ?? points[0]!)
  const [walking, setWalking] = useState(false)
  const pathRef = useRef<SVGPathElement>(null)
  const anchorRef = useRef<SVGCircleElement>(null)
  const onArriveRef = useRef(onArrive)
  useEffect(() => {
    onArriveRef.current = onArrive
  })

  const progressPath = useMemo(() => trailPath(points.slice(0, Math.max(1, target) + 1)), [points, target])
  const hasPlayer = Boolean(player)

  useEffect(() => {
    if (!hasPlayer) return
    const path = pathRef.current
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (from >= target || !path || reduceMotion) {
      setPos(points[target]!)
      if (from < target) onArriveRef.current?.()
      return
    }

    // The trail always runs downward, so a binary search on y finds the length at a point.
    const total = path.getTotalLength()
    const lengthAt = (y: number) => {
      let lo = 0
      let hi = total
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2
        if (path.getPointAtLength(mid).y < y) lo = mid
        else hi = mid
      }
      return (lo + hi) / 2
    }
    const startLength = lengthAt(points[from]!.y)
    const endLength = lengthAt(points[target]!.y)
    const duration = 900 * (target - from) + 400
    let frame = 0
    let startTime = 0

    setPos(points[from]!)
    const timer = setTimeout(() => {
      setWalking(true)
      const step = (time: number) => {
        startTime ||= time
        const k = Math.min(1, (time - startTime) / duration)
        const eased = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2
        const p = path.getPointAtLength(startLength + (endLength - startLength) * eased)
        setPos({ x: p.x, y: p.y })
        if (k < 1) frame = requestAnimationFrame(step)
        else {
          setWalking(false)
          onArriveRef.current?.()
        }
      }
      frame = requestAnimationFrame(step)
    }, 800)

    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      setWalking(false)
    }
  }, [from, target, points, hasPlayer])

  useEffect(() => {
    if (!autoScroll) return
    const t = setTimeout(() => anchorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150)
    return () => clearTimeout(t)
  }, [autoScroll, target])

  const select = (i: number) => {
    if (levels[i]?.state !== 'locked') onSelectLevel?.(i)
  }
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      select(i)
    }
  }

  // Group the crowd by level, so several customers on one level spread out.
  const crowdGroups = useMemo(() => {
    const groups = new Map<number, MapPlayer[]>()
    for (const p of crowd ?? []) {
      const index = clamp(p.levelIndex, 0, n) + 1
      groups.set(index, [...(groups.get(index) ?? []), p])
    }
    return [...groups.entries()]
  }, [crowd, n])

  const finish = points[n + 1]!
  const finished = player ? player.levelIndex >= n && n > 0 : false

  return (
    <div className="gm">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        role="group"
        aria-label={`Plan map with ${n} level${n === 1 ? '' : 's'}`}
      >
        <defs>
          <linearGradient id={`${uid}-ground`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a3e48a" />
            <stop offset="55%" stopColor="#74cc6c" />
            <stop offset="100%" stopColor="#4fb060" />
          </linearGradient>
          <radialGradient id={`${uid}-gloss`} cx="35%" cy="28%" r="75%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.65" />
            <stop offset="55%" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-glow`}>
            <stop offset="0%" stopColor="#ffe066" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffe066" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ground and scenery */}
        <rect width={W} height={height} fill={`url(#${uid}-ground)`} />
        {scenery.patches.map((p, i) => (
          <ellipse key={i} cx={p.x} cy={p.y} rx={120} ry={60} fill={i % 2 ? '#5fbf63' : '#8fd97a'} opacity="0.35" />
        ))}
        {scenery.decorations.map((d, i) => (
          <Decor key={i} d={d} />
        ))}

        {/* Trail */}
        <path d={fullPath} ref={pathRef} className="gm-trail__edge" />
        <path d={fullPath} className="gm-trail__ground" />
        <path d={fullPath} className="gm-trail__dash" />
        {player && target > 1 && (
          <>
            <path d={progressPath} className="gm-trail__done" />
            <path d={progressPath} className="gm-trail__done-dash" />
          </>
        )}

        {/* Start sign */}
        <g transform={`translate(${points[0]!.x - 70} ${points[0]!.y})`} className="gm-sign">
          <rect x="-3" y="-6" width="6" height="34" rx="2" fill="#8b5a2b" />
          <rect x="-34" y="-28" width="68" height="26" rx="6" fill="#c08b4d" stroke="#8b5a2b" strokeWidth="3" />
          <text y="-10" textAnchor="middle" className="gm-sign__text">
            START
          </text>
        </g>

        {/* Finish castle */}
        <g transform={`translate(${finish.x} ${finish.y})`} className={finished ? 'gm-finish is-reached' : 'gm-finish'}>
          {finished && <circle r="90" fill={`url(#${uid}-glow)`} />}
          <ellipse cx="0" cy="30" rx="70" ry="12" className="gm-shadow" />
          <rect x="-44" y="-30" width="88" height="60" rx="3" fill="#e9ecef" stroke="#adb5bd" strokeWidth="2.5" />
          <rect x="-60" y="-52" width="28" height="82" rx="3" fill="#dee2e6" stroke="#adb5bd" strokeWidth="2.5" />
          <rect x="32" y="-52" width="28" height="82" rx="3" fill="#dee2e6" stroke="#adb5bd" strokeWidth="2.5" />
          {[-60, -49, 32, 43].map((cx) => (
            <rect key={cx} x={cx} y="-62" width="9" height="12" rx="1.5" fill="#dee2e6" stroke="#adb5bd" strokeWidth="2" />
          ))}
          <path d="M-14 30 V8 a14 14 0 0 1 28 0 V30 Z" fill="#7048e8" />
          <rect x="-50" y="-34" width="8" height="12" rx="4" fill="#4dabf7" />
          <rect x="42" y="-34" width="8" height="12" rx="4" fill="#4dabf7" />
          <line x1="0" y1="-30" x2="0" y2="-74" stroke="#495057" strokeWidth="3" />
          <path className="gm-flag" d="M0 -74 L30 -66 L0 -56 Z" fill="#ff6b6b" />
          <g transform="translate(0 56)">
            <rect x="-44" y="-13" width="88" height="26" rx="13" className="gm-label__pill gm-label__pill--finish" />
            <text textAnchor="middle" dy="0.35em" className="gm-label__title gm-label__title--finish">
              <tspan>FINISH</tspan>
            </text>
          </g>
        </g>

        {/* Levels */}
        {levels.map((level, i) => {
          const p = points[i + 1]!
          const title = truncate(level.title, 24)
          const pillWidth = Math.max(96, Math.min(220, title.length * 7.6 + 30))
          // Keep the label inside the map, also for points near the edge.
          const labelX = clamp(p.x, pillWidth / 2 + 8, W - pillWidth / 2 - 8) - p.x
          const state = plain ? 'plain' : level.state
          const clickable = state !== 'locked' && Boolean(onSelectLevel)
          const status = plain
            ? `${level.total} task${level.total === 1 ? '' : 's'}`
            : level.state === 'locked'
              ? 'Locked'
              : `${level.completed} of ${level.total} task${level.total === 1 ? '' : 's'} completed`
          return (
            <g
              key={level.id}
              transform={`translate(${p.x} ${p.y})`}
              className={`gm-level gm-level--${state}${clickable ? ' is-clickable' : ''}`}
              role={onSelectLevel ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-disabled={onSelectLevel && state === 'locked' ? true : undefined}
              aria-label={`Level ${i + 1}: ${level.title}. ${status}.${state === 'current' ? ' Current level.' : ''}`}
              onClick={() => select(i)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <title>{`${level.title} — ${status}`}</title>
              <ellipse cx="0" cy="30" rx="36" ry="10" className="gm-shadow" />
              <g className="gm-level__body">
                {state === 'current' && <circle r="33" className="gm-level__pulse" />}
                <circle r="33" cy="7" className="gm-level__base" />
                <circle r="33" className="gm-level__face" />
                <circle r="33" fill={`url(#${uid}-gloss)`} />
                {state === 'completed' ? (
                  <Icon name="check" size={30} x={-15} y={-15} className="gm-level__icon" />
                ) : state === 'locked' ? (
                  <Icon name="lock" size={26} x={-13} y={-14} className="gm-level__icon" />
                ) : (
                  <text className="gm-level__number" textAnchor="middle" dy="0.36em">
                    {i + 1}
                  </text>
                )}
              </g>
              {state === 'completed' && (
                <g className="gm-level__stars">
                  {[-22, 0, 22].map((sx) => (
                    <Icon key={sx} name="star" size={sx === 0 ? 20 : 16} x={sx - (sx === 0 ? 10 : 8)} y={sx === 0 ? -56 : -48} />
                  ))}
                </g>
              )}
              <g transform={`translate(${labelX} 56)`}>
                <rect x={-pillWidth / 2} y="-15" width={pillWidth} height="38" rx="12" className="gm-label__pill" />
                <text textAnchor="middle" className="gm-label__title" y="0">
                  {title}
                </text>
                <text textAnchor="middle" className="gm-label__meta" y="15">
                  {plain
                    ? `Level ${i + 1} · ${status}`
                    : state === 'locked'
                      ? `Level ${i + 1} · locked`
                      : `Level ${i + 1} · ${level.completed}/${level.total}`}
                </text>
              </g>
            </g>
          )
        })}

        {/* Clouds drift over the top of the map */}
        <Cloud x={70} y={36} s={0.9} className="gm-cloud gm-cloud--a" />
        <Cloud x={330} y={110} s={1.1} className="gm-cloud gm-cloud--b" />
        {n > 2 && <Cloud x={120} y={TOP + STEP * 2.5} s={0.8} className="gm-cloud gm-cloud--c" />}

        {/* Many customers (admin) */}
        {crowdGroups.map(([index, group]) => {
          const p = points[index]!
          const shown = group.slice(0, 5)
          const extra = group.length - shown.length
          const slots = shown.length + (extra > 0 ? 1 : 0)
          const dxFor = (slot: number) => (slot - (slots - 1) / 2) * 30
          return (
            <g key={index} className="gm-crowd">
              {shown.map((member, k) => {
                const dx = dxFor(k)
                return (
                  <g
                    key={member.id}
                    transform={`translate(${p.x + dx} ${p.y - 62 + (k % 2) * 8})`}
                    className={onSelectPlayer ? 'gm-crowd__member is-clickable' : 'gm-crowd__member'}
                    onClick={() => onSelectPlayer?.(member.id)}
                    role={onSelectPlayer ? 'button' : undefined}
                    tabIndex={onSelectPlayer ? 0 : undefined}
                    aria-label={member.name}
                    onKeyDown={(e) => (e.key === 'Enter' ? onSelectPlayer?.(member.id) : undefined)}
                  >
                    <title>{member.name}</title>
                    <AvatarDisc name={member.name} url={member.avatarUrl} r={16} clipId={`${uid}-c-${member.id}`} />
                  </g>
                )
              })}
              {extra > 0 && (
                <g transform={`translate(${p.x + dxFor(shown.length)} ${p.y - 62})`}>
                  <circle r="19" fill="#fff" />
                  <circle r="16" fill="#343a40" />
                  <text textAnchor="middle" dy="0.35em" className="gm-initials" fontSize="12">
                    +{extra}
                  </text>
                </g>
              )}
            </g>
          )
        })}

        {/* The main character */}
        {player && (
          <g transform={`translate(${pos.x} ${pos.y})`} className={walking ? 'gm-player is-walking' : 'gm-player'}>
            <ellipse cx="0" cy="-26" rx="18" ry="5" className="gm-shadow" />
            <g className="gm-player__bob">
              <path d="M0 -30 L-11 -52 L11 -52 Z" fill="#fff" />
              <g transform="translate(0 -80)">
                <AvatarDisc name={player.name} url={player.avatarUrl} r={27} clipId={`${uid}-player`} />
              </g>
            </g>
            {finished && !walking && <PlayerSparkles />}
          </g>
        )}
        {player && <circle ref={anchorRef} cx={points[target]!.x} cy={points[target]!.y - 40} r="1" fill="none" />}
      </svg>
    </div>
  )
}

function PlayerSparkles(): ReactNode {
  return (
    <g className="gm-sparkles">
      {[
        [-40, -110],
        [38, -118],
        [-30, -60],
        [44, -66],
      ].map(([x, y], i) => (
        <Icon key={i} name="star" size={14} x={x! - 7} y={y! - 7} className={`gm-sparkle gm-sparkle--${i}`} />
      ))}
    </g>
  )
}
