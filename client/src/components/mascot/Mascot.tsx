import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import type { MascotPose } from './pose'

// The 3D mascot. three.js is large, so the scene loads only where a mascot appears.
// Without WebGL (old devices, some locked-down browsers) or when the scene fails, the fallback shows.

const MascotScene = lazy(() => import('./MascotScene'))

let webglSupport: boolean | undefined

/** Checked once per page load (each check opens a WebGL context, and browsers limit how many exist). */
function supportsWebGL(): boolean {
  if (webglSupport === undefined) {
    try {
      const canvas = document.createElement('canvas')
      webglSupport = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
    } catch {
      webglSupport = false
    }
  }
  return webglSupport
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

type Props = {
  pose?: MascotPose
  /** Change this number to make the mascot hop once (for example, once per board square). */
  hopKey?: number
  className?: string
  /** Shown while the scene loads, and instead of it when 3D is not available. */
  fallback?: ReactNode
}

export function Mascot({ pose = 'idle', hopKey = 0, className, fallback = null }: Props) {
  const [canRender] = useState(supportsWebGL)
  const [reducedMotion] = useState(prefersReducedMotion)
  return (
    <span className={`mascot${className ? ` ${className}` : ''}`}>
      {canRender ? (
        <SceneBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <MascotScene pose={pose} hopKey={hopKey} reducedMotion={reducedMotion} />
          </Suspense>
        </SceneBoundary>
      ) : (
        fallback
      )}
    </span>
  )
}
