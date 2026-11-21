import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import type { MascotPose } from './pose'

// The site's mascot: an original cartoon entrepreneur standing on a game-piece base.
// Built from simple shapes with toon shading and ink outlines, so it matches the printed board look
// and needs no model files. Loaded lazily (three.js is large), see Mascot.tsx.

// ---------- Shared geometry and materials (created once) ----------

const SPHERE = new THREE.SphereGeometry(1, 32, 24)
const CAPSULE = new THREE.CapsuleGeometry(1, 1, 8, 20)
const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 40)
const BOX = new THREE.BoxGeometry(1, 1, 1)
const SMILE = new THREE.TorusGeometry(1, 0.22, 10, 24, Math.PI)

/** Three hard light steps, like printed color fills. */
const TOON_STEPS = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.needsUpdate = true
  return texture
})()

const materials = new Map<string, THREE.MeshToonMaterial>()
function toon(color: string): THREE.MeshToonMaterial {
  let material = materials.get(color)
  if (!material) {
    material = new THREE.MeshToonMaterial({ color, gradientMap: TOON_STEPS })
    materials.set(color, material)
  }
  return material
}

const INK = new THREE.MeshBasicMaterial({ color: '#1f1a17', side: THREE.BackSide })
const SHADOW = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false })

const COLORS = {
  skin: '#f3c79b',
  cheek: '#f29a8e',
  hair: '#3b2417',
  blazer: '#e8573f',
  shirt: '#fffaf0',
  tie: '#f2b632',
  pants: '#22325e',
  shoe: '#fffaf0',
  case: '#c98f14',
  base: '#f2b632',
  eye: '#1f1a17',
}

type PartProps = {
  geometry: THREE.BufferGeometry
  color: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
  /** Outline weight: 0.08 is the normal line, 0 = no outline. */
  outline?: number
  children?: ReactNode
}

/** World units of ink per unit of outline weight. */
const OUTLINE_UNITS = 0.12

/**
 * One shape with toon shading and an ink outline: a back-face copy that is bigger by the same
 * absolute amount on every axis, so small and large parts get the same line width.
 */
function Part({ geometry, color, position, rotation, scale = [1, 1, 1], outline = 0.08, children }: PartProps) {
  const grow = outline * OUTLINE_UNITS
  const outlineScale = scale.map((s) => s + Math.sign(s) * grow) as [number, number, number]
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geometry} material={toon(color)} scale={scale} />
      {outline > 0 && <mesh geometry={geometry} material={INK} scale={outlineScale} />}
      {children}
    </group>
  )
}

// ---------- The character ----------

type CharacterProps = { pose: MascotPose; hopKey: number; reducedMotion: boolean }

const HOP_SECONDS = 0.32

function Character({ pose, hopKey, reducedMotion }: CharacterProps) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const eyes = useRef<THREE.Group>(null)
  const hop = useRef({ key: hopKey, start: -1 })
  // First blink after 2.5 s; later blinks get a random gap (set inside the frame loop).
  const blinkAt = useRef(2.5)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (!root.current || !body.current || !head.current || !armL.current || !armR.current || !legL.current || !legR.current || !eyes.current) return

    // A new hopKey starts one hop.
    if (hop.current.key !== hopKey) hop.current = { key: hopKey, start: t }
    const hopP = hop.current.start >= 0 ? (t - hop.current.start) / HOP_SECONDS : 1
    const hopping = hopP >= 0 && hopP < 1
    const motion = reducedMotion ? 0 : 1

    let y = 0
    let squash = 1
    let armLz = 0.18
    let armRz = -0.18
    let armRx = 0
    let legTuck = 0
    let spin = 0

    if (hopping) {
      y = Math.sin(Math.PI * hopP) * 0.55
      squash = 1 + Math.sin(Math.PI * hopP) * 0.08
      armLz = 0.9
      armRz = -0.9
      legTuck = Math.sin(Math.PI * hopP) * 0.6
    } else if (pose === 'cheer') {
      const jump = Math.abs(Math.sin(t * 4.2))
      y = jump * 0.35 * motion
      squash = 1 + (jump - 0.5) * 0.06 * motion
      armLz = 2.6 + Math.sin(t * 8.4) * 0.15 * motion
      armRz = -2.6 - Math.sin(t * 8.4) * 0.15 * motion
      spin = Math.sin(t * 1.4) * 0.5 * motion
    } else if (pose === 'wave') {
      y = Math.sin(t * 2) * 0.03 * motion
      armRz = -2.5
      armRx = Math.sin(t * 9) * 0.45 * motion
    } else {
      // Idle: breathe, sway, and now and then a small wave.
      y = Math.sin(t * 2) * 0.03 * motion
      squash = 1 + Math.sin(t * 2) * 0.012 * motion
      const wave = Math.max(0, Math.sin(t * 0.7) - 0.85) / 0.15
      armRz = -0.18 - wave * 2.2 * motion
      armRx = wave * Math.sin(t * 10) * 0.4 * motion
    }

    root.current.position.y = y
    root.current.rotation.y = spin + Math.sin(t * 0.6) * 0.12 * motion
    body.current.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash))
    head.current.rotation.z = Math.sin(t * 1.1) * 0.06 * motion
    head.current.rotation.x = Math.sin(t * 0.9) * 0.04 * motion
    armL.current.rotation.z = THREE.MathUtils.lerp(armL.current.rotation.z, armLz, 0.25)
    armR.current.rotation.z = THREE.MathUtils.lerp(armR.current.rotation.z, armRz, 0.25)
    armR.current.rotation.x = armRx
    legL.current.rotation.x = -legTuck
    legR.current.rotation.x = legTuck * 0.6

    // Blink every few seconds.
    if (t > blinkAt.current + 0.13) blinkAt.current = t + 2.5 + Math.random() * 3
    eyes.current.scale.y = t > blinkAt.current ? 0.12 : 1
  })

  return (
    <group ref={root}>
      {/* Game-piece base */}
      <Part geometry={CYLINDER} color={COLORS.base} position={[0, 0.09, 0]} scale={[0.82, 0.18, 0.82]} outline={0.06} />
      <Part geometry={CYLINDER} color={COLORS.base} position={[0, 0.22, 0]} scale={[0.62, 0.1, 0.62]} outline={0.06} />

      <group ref={body}>
        {/* Legs (pivot at the hip) */}
        <group ref={legL} position={[0.2, 0.92, 0]}>
          <Part geometry={CAPSULE} color={COLORS.pants} position={[0, -0.32, 0]} scale={[0.15, 0.24, 0.15]} />
          <Part geometry={SPHERE} color={COLORS.shoe} position={[0, -0.64, 0.08]} scale={[0.17, 0.11, 0.24]} />
        </group>
        <group ref={legR} position={[-0.2, 0.92, 0]}>
          <Part geometry={CAPSULE} color={COLORS.pants} position={[0, -0.32, 0]} scale={[0.15, 0.24, 0.15]} />
          <Part geometry={SPHERE} color={COLORS.shoe} position={[0, -0.64, 0.08]} scale={[0.17, 0.11, 0.24]} />
        </group>

        {/* Torso: blazer, shirt and tie */}
        <Part geometry={CAPSULE} color={COLORS.blazer} position={[0, 1.3, 0]} scale={[0.44, 0.26, 0.36]} />
        <Part geometry={SPHERE} color={COLORS.shirt} position={[0, 1.52, 0.27]} scale={[0.17, 0.2, 0.1]} outline={0.05} />
        <Part geometry={BOX} color={COLORS.tie} position={[0, 1.36, 0.36]} rotation={[0.2, 0, Math.PI / 4]} scale={[0.1, 0.1, 0.04]} outline={0.05} />
        <Part geometry={BOX} color={COLORS.tie} position={[0, 1.22, 0.37]} rotation={[0.15, 0, 0]} scale={[0.09, 0.22, 0.04]} outline={0.05} />

        {/* Arms (pivot at the shoulder) */}
        <group ref={armL} position={[0.44, 1.56, 0]}>
          <Part geometry={CAPSULE} color={COLORS.blazer} position={[0, -0.3, 0]} scale={[0.12, 0.2, 0.12]} />
          <Part geometry={SPHERE} color={COLORS.skin} position={[0, -0.58, 0]} scale={[0.12, 0.12, 0.12]} />
          {/* Briefcase */}
          <Part geometry={BOX} color={COLORS.case} position={[0.02, -0.82, 0.05]} scale={[0.42, 0.3, 0.12]} outline={0.05} />
          <Part geometry={BOX} color={COLORS.eye} position={[0.02, -0.65, 0.05]} scale={[0.14, 0.05, 0.05]} outline={0} />
        </group>
        <group ref={armR} position={[-0.44, 1.56, 0]}>
          <Part geometry={CAPSULE} color={COLORS.blazer} position={[0, -0.3, 0]} scale={[0.12, 0.2, 0.12]} />
          <Part geometry={SPHERE} color={COLORS.skin} position={[0, -0.58, 0]} scale={[0.12, 0.12, 0.12]} />
        </group>

        {/* Head */}
        <group ref={head} position={[0, 2.12, 0]}>
          <Part geometry={SPHERE} color={COLORS.skin} scale={[0.5, 0.48, 0.46]} />
          <Part geometry={SPHERE} color={COLORS.skin} position={[0.49, -0.02, 0]} scale={[0.09, 0.12, 0.07]} outline={0.05} />
          <Part geometry={SPHERE} color={COLORS.skin} position={[-0.49, -0.02, 0]} scale={[0.09, 0.12, 0.07]} outline={0.05} />
          {/* Hair: a cap and a quiff */}
          <Part geometry={SPHERE} color={COLORS.hair} position={[0, 0.17, -0.04]} scale={[0.52, 0.36, 0.48]} />
          <Part geometry={SPHERE} color={COLORS.hair} position={[0.08, 0.42, 0.22]} rotation={[0.5, 0, -0.35]} scale={[0.24, 0.13, 0.2]} outline={0.05} />
          {/* Face */}
          <group ref={eyes} position={[0, 0.02, 0.42]}>
            <mesh geometry={SPHERE} material={toon(COLORS.eye)} position={[0.16, 0, 0]} scale={[0.06, 0.085, 0.04]} />
            <mesh geometry={SPHERE} material={toon(COLORS.eye)} position={[-0.16, 0, 0]} scale={[0.06, 0.085, 0.04]} />
            <mesh geometry={SPHERE} material={toon('#ffffff')} position={[0.18, 0.03, 0.03]} scale={[0.02, 0.025, 0.015]} />
            <mesh geometry={SPHERE} material={toon('#ffffff')} position={[-0.14, 0.03, 0.03]} scale={[0.02, 0.025, 0.015]} />
          </group>
          <mesh geometry={BOX} material={toon(COLORS.hair)} position={[0.16, 0.16, 0.42]} rotation={[0, 0, -0.12]} scale={[0.13, 0.03, 0.03]} />
          <mesh geometry={BOX} material={toon(COLORS.hair)} position={[-0.16, 0.16, 0.42]} rotation={[0, 0, 0.12]} scale={[0.13, 0.03, 0.03]} />
          <mesh geometry={SPHERE} material={toon(COLORS.cheek)} position={[0.27, -0.1, 0.37]} scale={[0.07, 0.04, 0.03]} />
          <mesh geometry={SPHERE} material={toon(COLORS.cheek)} position={[-0.27, -0.1, 0.37]} scale={[0.07, 0.04, 0.03]} />
          <mesh geometry={SMILE} material={toon(COLORS.eye)} position={[0, -0.13, 0.43]} rotation={[0, 0, Math.PI]} scale={[0.11, 0.09, 0.09]} />
        </group>
      </group>

      {/* Soft shadow on the board */}
      <mesh geometry={CYLINDER} material={SHADOW} position={[0, 0.005, 0]} scale={[0.95, 0.001, 0.95]} />
    </group>
  )
}

export type MascotSceneProps = { pose: MascotPose; hopKey: number; reducedMotion: boolean }

export default function MascotScene({ pose, hopKey, reducedMotion }: MascotSceneProps) {
  const camera = useMemo(() => ({ position: [0, 1.5, 6.4] as [number, number, number], fov: 30 }), [])
  return (
    <Canvas
      dpr={[1, 2]}
      camera={camera}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      onCreated={({ camera: cam }) => cam.lookAt(0, 1.25, 0)}
      aria-hidden="true"
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} />
      <Character pose={pose} hopKey={hopKey} reducedMotion={reducedMotion} />
    </Canvas>
  )
}
