import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LOOK, DISTRICT_COLORS, missionLabel } from '../../lib/game'
import type { Host, Look, MyPlan } from '../../lib/types'
import { Icon } from '../Icon'
import { SceneBoundary } from '../mascot/Mascot'
import { prefersReducedMotion, supportsWebGL } from '../mascot/webgl'
import { FullMap, MiniMap } from './GpsMap'
import type { CityDistrict, CityMission, Quality } from './types'
import './CityMap.css'

// The customer's journey as a city: the street in 3D, and the navigation map. The 3D part loads on its own; without
// WebGL (or when it fails) the map takes its place, so nobody loses the way.

const CityScene = lazy(() => import('./CityScene'))

type Props = {
  plan: MyPlan
  look: Look | null
  hosts: Host[]
  /** The last mission the customer saw, so their car drives from there. */
  walkFrom: number
  onArrive: () => void
  /** The customer pressed the main button: drive up to the mission, then call onLeft. */
  leaving: boolean
  onLeft: () => void
  onSelectMission: (chapterId: string, taskId: string) => void
  /** The button of the current focus. */
  onGo: () => void
}

const QUALITY_KEY = 'yp:city-quality'

/** A first guess; the scene lowers it when the picture is slow, and the visit remembers. */
function startQuality(): Quality {
  try {
    const saved = sessionStorage.getItem(QUALITY_KEY)
    if (saved === 'low' || saved === 'medium') return saved
  } catch {
    // Storage can be blocked.
  }
  const touch = window.matchMedia('(pointer: coarse)').matches
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8
  if (touch) return memory < 4 ? 'low' : 'medium'
  return memory < 4 ? 'medium' : 'high'
}

export function CityMap({ plan, look, hosts, walkFrom, onArrive, leaving, onLeft, onSelectMission, onGo }: Props) {
  const [canRender] = useState(supportsWebGL)
  const [reducedMotion] = useState(prefersReducedMotion)
  const [quality, setQuality] = useState<Quality>(startQuality)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 760)
  const position = plan.level.position

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth <= 760)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const { districts, missions } = useMemo(() => {
    const districts: CityDistrict[] = plan.chapters.map((c, i) => ({
      index: i,
      id: c.id,
      title: c.title,
      state: c.state,
      color: DISTRICT_COLORS[i % DISTRICT_COLORS.length]!,
    }))
    const missions: CityMission[] = []
    plan.chapters.forEach((c, ci) =>
      c.tasks.forEach((t, ti) => {
        const index = missions.length
        const { badge, label } = missionLabel(t.title, index + 1)
        missions.push({
          index,
          id: t.id,
          chapterIndex: ci,
          taskIndex: ti,
          badge,
          title: label,
          state: t.completed ? 'done' : index === position ? 'current' : c.state === 'locked' ? 'locked' : 'open',
        })
      }),
    )
    return { districts, missions }
  }, [plan, position])

  const closeMap = useCallback(() => setMapOpen(false), [])
  const focusTitle = missionLabel(plan.focus.title, 1).label

  const lower = useCallback((q: Quality) => {
    setQuality(q)
    try {
      sessionStorage.setItem(QUALITY_KEY, q)
    } catch {
      // Storage can be blocked.
    }
  }, [])

  const select = useCallback(
    (m: CityMission) => {
      if (m.state !== 'locked') onSelectMission(plan.chapters[m.chapterIndex]!.id, m.id)
    },
    [onSelectMission, plan.chapters],
  )

  // Without the 3D street there is no drive to wait for.
  const street = canRender && !failed
  useEffect(() => {
    if (leaving && (!street || !ready)) onLeft()
  }, [leaving, street, ready, onLeft])

  const shift = useMemo(() => (narrow ? { x: 0, y: 0.22 } : { x: 0.12, y: 0.02 }), [narrow])

  return (
    <div className="city">
      {street ? (
        <SceneBoundary fallback={<Fallback onShow={() => setFailed(true)} />}>
          <Suspense fallback={null}>
            <CityScene
              districts={districts}
              missions={missions}
              playerLook={look ?? DEFAULT_LOOK}
              playerAt={position}
              driveFrom={Math.min(walkFrom, position)}
              hosts={hosts}
              reducedMotion={reducedMotion}
              quality={quality}
              onQuality={lower}
              leaving={leaving}
              onLeft={onLeft}
              onArrive={onArrive}
              onSelectMission={select}
              onReady={() => setReady(true)}
              shift={shift}
            />
          </Suspense>
          <div className={`city__curtain${ready ? ' is-open' : ''}${leaving ? ' is-leaving' : ''}`} aria-hidden="true">
            {!ready && <span className="spinner" />}
          </div>
        </SceneBoundary>
      ) : (
        <FullMap districts={districts} missions={missions} playerAt={position} focusTitle={focusTitle} onGo={onGo} onSelect={select} />
      )}

      {street && (
        <>
          <MiniMap districts={districts} missions={missions} playerAt={position} onOpen={() => setMapOpen(true)} />
          <p className="city__hint">
            <Icon name="compass" size={14} /> גררו כדי להסתכל מסביב
          </p>
        </>
      )}
      {street && mapOpen && (
        <FullMap
          districts={districts}
          missions={missions}
          playerAt={position}
          focusTitle={focusTitle}
          onGo={() => {
            setMapOpen(false)
            onGo()
          }}
          onSelect={select}
          onClose={closeMap}
        />
      )}
    </div>
  )
}

/** The scene failed: show the map instead. */
function Fallback({ onShow }: { onShow: () => void }) {
  useEffect(onShow, [onShow])
  return null
}
