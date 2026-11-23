// Capability checks for the 3D scenes.

let webglSupport: boolean | undefined

/** Checked once per page load (each check opens a WebGL context, and browsers limit how many exist). */
export function supportsWebGL(): boolean {
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

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
