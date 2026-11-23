import * as THREE from 'three'

// Shared geometry and toon materials for the 3D characters and the city (created once per page).

export const SPHERE = new THREE.SphereGeometry(1, 32, 24)
export const HALF_SPHERE = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)
export const CAPSULE = new THREE.CapsuleGeometry(1, 1, 8, 20)
export const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 36)
export const BOX = new THREE.BoxGeometry(1, 1, 1)
export const SMILE = new THREE.TorusGeometry(1, 0.22, 10, 24, Math.PI)
export const RING = new THREE.TorusGeometry(1, 0.14, 10, 32)
/** A torus with four segments is a square ring (rotate it 45° on Z to stand it straight). */
export const SQUARE_RING = new THREE.TorusGeometry(1, 0.12, 6, 4)
export const CONE = new THREE.ConeGeometry(1, 1, 24)

/** Three hard light steps, like printed color fills. */
const TOON_STEPS = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.needsUpdate = true
  return texture
})()

const toonCache = new Map<string, THREE.MeshToonMaterial>()

export function toon(color: string, opacity = 1): THREE.MeshToonMaterial {
  const key = `${color}/${opacity}`
  let material = toonCache.get(key)
  if (!material) {
    material = new THREE.MeshToonMaterial({ color, gradientMap: TOON_STEPS, transparent: opacity < 1, opacity })
    toonCache.set(key, material)
  }
  return material
}

const glowCache = new Map<string, THREE.MeshBasicMaterial>()

/** Unlit color (neon signs, mission markers). */
export function glow(color: string, opacity = 1): THREE.MeshBasicMaterial {
  const key = `${color}/${opacity}`
  let material = glowCache.get(key)
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })
    glowCache.set(key, material)
  }
  return material
}

export const INK = new THREE.MeshBasicMaterial({ color: '#141018', side: THREE.BackSide })
export const SHADOW = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false })
