import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Icon } from '../Icon'
import { planBuildings } from './buildings'
import { layoutCity, parkingFor, ROAD, type CityLayout } from './layout'
import type { CityDistrict, CityMission } from './types'

// The navigation map: the same city from above. A small map in the corner shows where the customer is and the way to
// the current mission; the large one shows the whole route, all districts and every mission. Up is forward.

type View = { x: number; y: number; width: number; height: number }

type Props = {
  districts: CityDistrict[]
  missions: CityMission[]
  playerAt: number
}

/** How far the beach is from the avenue, to its left (meters). */
const SHORE = -236

const path = (layout: CityLayout, from: number, to: number, offset = 0) => {
  const points: string[] = []
  const steps = Math.max(2, Math.ceil((to - from) / 8))
  for (let i = 0; i <= steps; i++) {
    const p = layout.point(from + ((to - from) * i) / steps, offset)
    points.push(`${p.x.toFixed(1)},${p.z.toFixed(1)}`)
  }
  return `M${points.join('L')}`
}

/** Everything that does not depend on where the customer is. */
function useBase(districts: CityDistrict[], missions: CityMission[]) {
  return useMemo(() => {
    const layout = layoutCity(districts, missions)
    const end = layout.length + 120
    const avenue = path(layout, -70, end)
    // Streets that run along the avenue, and the side streets.
    const along = [-190, -118, 118, 190, 262, 350, 450, 560].map((o) => path(layout, -70, end, o))
    // The beach follows the avenue; the sea fills everything past it.
    const first = layout.point(-80, SHORE)
    const last = layout.point(layout.length + 260, SHORE)
    const north = -layout.length - 1600
    const shore = `M${first.x.toFixed(1)},900L${path(layout, -80, layout.length + 260, SHORE).slice(1)}L${last.x.toFixed(1)},${north.toFixed(0)}`
    const sea = `${shore}L-2600,${north.toFixed(0)}L-2600,900Z`
    const sides = layout.crossings.map((c) => {
      const f = layout.frame(c)
      const a = f.position.clone().addScaledVector(f.right, -190)
      const b = f.position.clone().addScaledVector(f.right, 900)
      return `M${a.x.toFixed(1)},${a.z.toFixed(1)}L${b.x.toFixed(1)},${b.z.toFixed(1)}`
    })
    const blocks = planBuildings(layout).map((b) => {
      const degrees = (-b.angle * 180) / Math.PI
      return { x: b.center.x, z: b.center.z, w: b.depth, h: b.width, degrees, tall: b.height > 45 }
    })
    const pins = missions.map((m) => layout.point(layout.missionAt[m.index]!, 0))
    const names = districts
      .filter((d) => layout.spans[d.index]!.to > layout.spans[d.index]!.from)
      .map((d) => {
        const span = layout.spans[d.index]!
        const p = layout.point((span.from + span.to) / 2, 30)
        return { district: d, x: p.x, z: p.z }
      })
    return { layout, avenue, along, shore, sea, sides, blocks, pins, names, end }
  }, [districts, missions])
}

type Base = ReturnType<typeof useBase>

function MapShapes({ base, missions, playerAt, detail, onSelect }: { base: Base; missions: CityMission[]; playerAt: number; detail: 'small' | 'large'; onSelect?: (m: CityMission) => void }) {
  const { layout } = base
  const here = parkingFor(layout, playerAt)
  const target = layout.missionAt[playerAt] ?? layout.finishAt
  const car = layout.frame(here)
  const large = detail === 'large'
  const place = layout.point(here, ROAD.lane - 2)
  return (
    <>
      <path d={base.sea} className="gps__sea" />
      <path d={base.shore} className="gps__beach" />
      <g className="gps__blocks">
        {base.blocks.map((b, i) => (
          <rect key={i} x={-b.w / 2} y={-b.h / 2} width={b.w} height={b.h} transform={`translate(${b.x.toFixed(1)} ${b.z.toFixed(1)}) rotate(${b.degrees.toFixed(1)})`} className={b.tall ? 'is-tall' : undefined} />
        ))}
      </g>
      <path d={base.sides.join('')} className="gps__street" />
      <path d={base.along.join('')} className="gps__street gps__street--thin" />
      <path d={base.avenue} className="gps__avenue" />
      {/* The way so far, and the way to the mission. */}
      <path d={path(layout, -20, here)} className="gps__past" />
      <path d={path(layout, here, target)} className="gps__route" />
      <path d={path(layout, target, layout.finishAt)} className="gps__future" />
      {missions.map((m) => {
        const p = base.pins[m.index]!
        const current = m.state === 'current'
        const r = current ? 0 : m.state === 'done' ? 6 : 5
        return (
          <g
            key={m.id}
            className={`gps__pin gps__pin--${m.state}`}
            transform={`translate(${p.x.toFixed(1)} ${p.z.toFixed(1)})`}
            onClick={onSelect && m.state !== 'locked' ? () => onSelect(m) : undefined}
          >
            {large && !current && <circle r={16} className="gps__hit" />}
            {!current && <circle r={large ? r + 2 : r} />}
            {large && !current && (
              <text y={3} textAnchor="middle">
                {m.state === 'done' ? '✓' : m.badge}
              </text>
            )}
          </g>
        )
      })}
      <g transform={`translate(${layout.point(layout.finishAt, 0).x.toFixed(1)} ${layout.point(layout.finishAt, 0).z.toFixed(1)})`} className="gps__finish">
        <path d="M0-13 3.6-4.6 12.600-3.800 5.800 2.200 7.800 11 0 6.300-7.800 11-5.800 2.200-12.600-3.800-3.600-4.600z" />
      </g>
      {/* The current mission. */}
      <g transform={`translate(${layout.point(target, 0).x.toFixed(1)} ${layout.point(target, 0).z.toFixed(1)})`} className="gps__target">
        <circle r={22} className="gps__pulse" />
        <circle r={9} />
        <circle r={3.5} className="gps__dot" />
      </g>
      {/* The player. */}
      <g transform={`translate(${place.x.toFixed(1)} ${place.z.toFixed(1)}) rotate(${((-car.angle * 180) / Math.PI).toFixed(1)})`} className="gps__player">
        <path d="M0-11 8 9 0 4.500-8 9z" />
      </g>
    </>
  )
}

/** The small map in the corner. */
export function MiniMap({ districts, missions, playerAt, onOpen }: Props & { onOpen: () => void }) {
  const base = useBase(districts, missions)
  const { layout } = base
  const here = layout.point(parkingFor(layout, playerAt), 0)
  const size = 250
  return (
    <button type="button" className="minimap" onClick={onOpen} aria-label="פתיחת המפה המלאה">
      <svg viewBox={`${here.x - size / 2} ${here.z - size * 0.66} ${size} ${size}`} aria-hidden="true">
        <MapShapes base={base} missions={missions} playerAt={playerAt} detail="small" />
      </svg>
      <span className="minimap__open">
        <Icon name="map" size={15} /> מפה
      </span>
    </button>
  )
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

type FullMapProps = {
  /** The one thing to do now, and the way to it. */
  focusTitle: string
  onGo: () => void
  onSelect: (m: CityMission) => void
  /** Without it the map stands in for the street, and stays. */
  onClose?: () => void
}

/** The full map: the whole route, the districts, and a list that leads to every mission. */
export function FullMap({ districts, missions, playerAt, focusTitle, onGo, onSelect, onClose }: Props & FullMapProps) {
  const base = useBase(districts, missions)
  const { layout } = base
  const frame = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 800, h: 700 })
  const here = layout.point(parkingFor(layout, playerAt), 0)
  // The view is a center and a zoom (meters per pixel).
  const [view, setView] = useState({ x: here.x, z: here.z - 60, scale: 0.62 })
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = frame.current
    if (!el) return
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      setView((v) => ({ ...v, scale: clamp(v.scale * Math.exp(e.deltaY * 0.0012), 0.22, 2.6) }))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      observer.disconnect()
      el.removeEventListener('wheel', wheel)
    }
  }, [])

  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const down = (e: PointerEvent) => {
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false }
  }
  const move = (e: PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    drag.current = { ...d, x: e.clientX, y: e.clientY }
    setView((v) => ({ ...v, x: clamp(v.x - dx * v.scale, -260, 300), z: clamp(v.z - dy * v.scale, -layout.length - 120, 60) }))
  }
  const up = () => {
    window.setTimeout(() => (drag.current = null), 0)
  }

  const fit: View = { x: view.x - (box.w * view.scale) / 2, y: view.z - (box.h * view.scale) / 2, width: box.w * view.scale, height: box.h * view.scale }
  const goTo = (m: CityMission) => {
    const p = base.pins[m.index]!
    setView((v) => ({ ...v, x: p.x, z: p.z, scale: Math.min(v.scale, 0.45) }))
  }
  const doneCount = missions.filter((m) => m.state === 'done').length

  return (
    <div className={`fullmap${onClose ? '' : ' fullmap--base'}`} role={onClose ? 'dialog' : undefined} aria-modal={onClose ? true : undefined} aria-label="מפת המסלול">
      <div ref={frame} className="fullmap__canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <svg viewBox={`${fit.x} ${fit.y} ${fit.width} ${fit.height}`} aria-hidden="true">
          <MapShapes base={base} missions={missions} playerAt={playerAt} detail="large" onSelect={(m) => !drag.current?.moved && onSelect(m)} />
          {base.names.map(({ district, x, z }) => (
            <g key={district.id} className={`gps__name gps__name--${district.state}`} transform={`translate(${x.toFixed(1)} ${z.toFixed(1)})`} style={{ '--c': district.color } as CSSProperties}>
              <text textAnchor="end" className="gps__name-small" y={-13}>
                שלב {district.index + 1}
              </text>
              <text textAnchor="end">{district.title}</text>
            </g>
          ))}
        </svg>
      </div>

      <aside className="fullmap__list">
        <header>
          <div>
            <h2>המסלול שלי</h2>
            <p>
              {doneCount} מתוך {missions.length} משימות
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="סגירת המפה">
            <Icon name="x" size={20} />
          </button>
        </header>
        <button type="button" className="fullmap__now" onClick={onGo}>
          <Icon name="target" size={20} />
          <span>
            <small>היעד עכשיו</small>
            <strong>{focusTitle}</strong>
          </span>
          <Icon name="chevronRight" size={17} />
        </button>
        <ol>
          {districts.map((d) => {
            const own = missions.filter((m) => m.chapterIndex === d.index)
            if (own.length === 0) return null
            return (
              <li key={d.id} style={{ '--c': d.color } as CSSProperties} className={`is-${d.state}`}>
                <h3>
                  <i /> {d.title}
                  <small>
                    {own.filter((m) => m.state === 'done').length}/{own.length}
                  </small>
                </h3>
                <ul>
                  {own.map((m) => (
                    <li key={m.id}>
                      <button type="button" onClick={() => goTo(m)} onDoubleClick={() => m.state !== 'locked' && onSelect(m)} className={`is-${m.state}`}>
                        <span>{m.state === 'done' ? <Icon name="check" size={12} /> : m.state === 'locked' ? <Icon name="lock" size={11} /> : m.badge}</span>
                        {m.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ol>
      </aside>

      <div className="fullmap__zoom">
        <button type="button" onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale / 1.35, 0.22, 2.6) }))} aria-label="הגדלה">
          +
        </button>
        <button type="button" onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale * 1.35, 0.22, 2.6) }))} aria-label="הקטנה">
          −
        </button>
        <button type="button" onClick={() => setView({ x: here.x, z: here.z - 60, scale: 0.62 })} aria-label="חזרה למיקום שלי" title="המיקום שלי">
          <Icon name="compass" size={18} />
        </button>
      </div>
    </div>
  )
}
