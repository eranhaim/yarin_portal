import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { DEFAULT_LOOK } from '../../lib/game'
import type { Look } from '../../lib/types'
import type { CastMember } from './MascotScene'
import type { MascotPose } from './pose'
import { prefersReducedMotion, supportsWebGL } from './webgl'

// 3D characters. three.js is large, so the scene loads only where a character appears.
// Without WebGL (old devices, some locked-down browsers) or when the scene fails, the fallback shows.

const MascotScene = lazy(() => import('./MascotScene'))

export class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

type Props = {
  look?: Look | null
  pose?: MascotPose
  /** Change this number to make the character hop once (for example, once per square). */
  hopKey?: number
  /** Several characters side by side (overrides look/pose). */
  cast?: CastMember[]
  base?: boolean
  className?: string
  /** Shown while the scene loads, and instead of it when 3D is not available. */
  fallback?: ReactNode
}

export function Mascot({ look, pose = 'idle', hopKey = 0, cast, base = true, className, fallback = null }: Props) {
  const [canRender] = useState(supportsWebGL)
  const [reducedMotion] = useState(prefersReducedMotion)
  const members = cast ?? [{ look: look ?? DEFAULT_LOOK, pose, hopKey, base }]
  return (
    <span className={`mascot${className ? ` ${className}` : ''}`}>
      {canRender ? (
        <SceneBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <MascotScene cast={members} reducedMotion={reducedMotion} />
          </Suspense>
        </SceneBoundary>
      ) : (
        fallback
      )}
    </span>
  )
}
