import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { DISTRICT_COLORS, missionLabel } from '../../lib/game'
import type { Host, Look, MyPlan } from '../../lib/types'
import { Board } from '../Board'
import { Icon } from '../Icon'
import { SceneBoundary } from '../mascot/Mascot'
import { prefersReducedMotion, supportsWebGL } from '../mascot/webgl'
import type { CityDistrict, CityMission } from './types'
import './CityMap.css'

// The customer's journey as a city: each level is a district, each task a mission on the main road.
// The 3D scene loads lazily; without WebGL the 2D board shows instead.

const CityScene = lazy(() => import('./CityScene'))

type Props = {
  plan: MyPlan
  look: Look | null
  hosts: Host[]
  /** The last mission the customer saw, so their character walks from there. */
  walkFrom: number
  onArrive: () => void
  /** The customer pressed the main button: drive up to the mission, then call onLeft. */
  leaving: boolean
  onLeft: () => void
  onSelectMission: (chapterId: string, taskId: string) => void
}

export function CityMap({ plan, look, hosts, walkFrom, onArrive, leaving, onLeft, onSelectMission }: Props) {
  const [canRender] = useState(supportsWebGL)
  const [reducedMotion] = useState(prefersReducedMotion)
  const labels = useRef<(HTMLElement | null)[]>([])
  const position = plan.level.position

  useEffect(() => {
    if (leaving) onLeft()
  }, [leaving, onLeft])

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

  const select = (m: CityMission) => {
    if (m.state === 'locked') return
    onSelectMission(plan.chapters[m.chapterIndex]!.id, m.id)
  }

  const fallback = (
    <div className="city__fallback">
      <Board
        chapters={plan.chapters.map((c) => ({
          id: c.id,
          title: c.title,
          state: c.state,
          tasks: c.tasks.map((t) => ({ id: t.id, title: t.title, started: t.started, completed: t.completed, submitted: t.submissions.length > 0 })),
        }))}
        title={plan.title}
        player={{ id: 'me', name: '', avatarUrl: null, position }}
        onSelectTask={(ci, ti) => onSelectMission(plan.chapters[ci]!.id, plan.chapters[ci]!.tasks[ti]!.id)}
      />
    </div>
  )

  if (!canRender) return fallback

  return (
    <div className="city">
      <div className="city__sky" aria-hidden="true">
        <span className="city__sun" />
      </div>
      <SceneBoundary fallback={fallback}>
        <Suspense fallback={<div className="city__loading">טוענים את העיר…</div>}>
          <CityScene
            districts={districts}
            missions={missions}
            playerLook={look}
            playerAt={position}
            walkFrom={Math.min(walkFrom, position)}
            hosts={hosts}
            reducedMotion={reducedMotion}
            onArrive={onArrive}
            onSelectMission={select}
            labels={labels}
          />
        </Suspense>
      </SceneBoundary>

      {/* HTML labels; CityScene moves them to their 3D anchors every frame. */}
      <div className="city__labels">
        {districts.map((d) => (
          <div
            key={d.id}
            ref={(el) => {
              labels.current[d.index] = el
            }}
            className={`city__district${d.state === 'locked' ? ' is-locked' : ''}`}
            style={{ '--c': d.color } as CSSProperties}
          >
            <small>שלב {d.index + 1}</small>
            {d.title}
            {d.state === 'locked' && <Icon name="lock" size={14} />}
          </div>
        ))}
        {missions.map((m) => {
          const i = districts.length + m.index
          return (
            <button
              key={m.id}
              type="button"
              ref={(el) => {
                labels.current[i] = el
              }}
              className={`city__mission city__mission--${m.state}`}
              onClick={() => select(m)}
              disabled={m.state === 'locked'}
              title={m.title}
            >
              <b>{m.state === 'done' ? <Icon name="check" size={13} /> : m.badge}</b>
              <span>{m.title}</span>
            </button>
          )
        })}
        <div
          ref={(el) => {
            labels.current[districts.length + missions.length] = el
          }}
          className="city__hq"
        >
          המטה של ירין ואורן
        </div>
        <div
          ref={(el) => {
            labels.current[districts.length + missions.length + 1] = el
          }}
          className="city__finish"
        >
          <Icon name="trophy" size={16} /> הבוס
        </div>
      </div>
    </div>
  )
}
