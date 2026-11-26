import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { DEFAULT_LOOK } from '../../lib/game'
import type { Look } from '../../lib/types'
import type { CastMember, Framing } from './MascotScene'
import type { MascotPose } from './pose'
import { prefersReducedMotion, supportsWebGL } from './webgl'

// 3D people. three.js is large, so the scene loads only where a person appears.
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
  /** Head to toe, or from the thighs up. By default: the whole body in tall frames, from the thighs up in small ones. */
  framing?: Framing
  /** Shown while the scene loads, and instead of it when 3D is not available. */
  fallback?: ReactNode
}

export function Mascot({ look, pose = 'idle', hopKey = 0, cast, base = true, className, framing, fallback = null }: Props) {
  const [canRender] = useState(supportsWebGL)
  const [reducedMotion] = useState(prefersReducedMotion)
  const members = cast ?? [{ look: look ?? DEFAULT_LOOK, pose, hopKey, base }]
  return (
    <span className={`mascot${className ? ` ${className}` : ''}`}>
      {canRender ? (
        <SceneBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <MascotScene cast={members} reducedMotion={reducedMotion} framing={framing ?? (base || members.length > 1 ? 'full' : 'bust')} />
          </Suspense>
        </SceneBoundary>
      ) : (
        fallback
      )}
    </span>
  )
}
