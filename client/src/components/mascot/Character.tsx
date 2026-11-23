import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { HAIR_COLOR, OUTFIT_COLOR, SKIN } from '../../lib/game'
import type { Look } from '../../lib/types'
import type { MascotPose } from './pose'
import { BOX, CAPSULE, CYLINDER, HALF_SPHERE, INK, RING, SHADOW, SMILE, SPHERE, SQUARE_RING, toon } from './toon'

// A cartoon character built from simple shapes, with toon shading and ink outlines.
// Everything about its look comes from `look` (skin, hair, beard, glasses, outfit, accessory, chain).

type Vec3 = [number, number, number]

type PartProps = {
  geometry: THREE.BufferGeometry
  color: string
  position?: Vec3
  rotation?: Vec3
  scale?: Vec3
  /** Outline weight: 1 is the normal line, 0 = no outline. */
  outline?: number
  opacity?: number
  children?: ReactNode
}

/** World units of ink per unit of outline weight. */
const OUTLINE_UNITS = 0.0096

/** One shape with toon shading and an ink outline (a back-face copy bigger by the same amount on every axis). */
function Part({ geometry, color, position, rotation, scale = [1, 1, 1], outline = 1, opacity = 1, children }: PartProps) {
  const grow = outline * OUTLINE_UNITS
  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geometry} material={toon(color, opacity)} scale={scale} />
      {outline > 0 && <mesh geometry={geometry} material={INK} scale={scale.map((s) => s + Math.sign(s) * grow) as Vec3} />}
      {children}
    </group>
  )
}

const INK_COLOR = '#141018'

function Hair({ look }: { look: Look }) {
  const color = HAIR_COLOR[look.hairColor]
  switch (look.hair) {
    case 'bald':
      return null
    case 'buzz':
      return <Part geometry={HALF_SPHERE} color={color} position={[0, 0.02, -0.02]} scale={[0.505, 0.47, 0.475]} outline={0.6} />
    case 'short':
      return (
        <>
          <Part geometry={HALF_SPHERE} color={color} position={[0, 0.06, -0.03]} scale={[0.53, 0.46, 0.5]} />
          <Part geometry={SPHERE} color={color} position={[0.05, 0.36, 0.3]} rotation={[0.4, 0, 0]} scale={[0.32, 0.09, 0.14]} outline={0.6} />
        </>
      )
    case 'slick':
      return (
        <>
          <Part geometry={HALF_SPHERE} color={color} position={[0, 0.07, -0.05]} rotation={[-0.15, 0, 0]} scale={[0.535, 0.48, 0.52]} />
          <Part geometry={SPHERE} color={color} position={[0, 0.3, -0.12]} scale={[0.44, 0.22, 0.4]} outline={0.6} />
        </>
      )
    case 'curly':
      return (
        <>
          <Part geometry={HALF_SPHERE} color={color} position={[0, 0.04, -0.03]} scale={[0.53, 0.45, 0.5]} />
          {[
            [0, 0.44, 0.1],
            [0.24, 0.38, 0.14],
            [-0.24, 0.38, 0.14],
            [0.12, 0.42, -0.18],
            [-0.14, 0.42, -0.18],
            [0.36, 0.2, 0.02],
            [-0.36, 0.2, 0.02],
          ].map((p, i) => (
            <Part key={i} geometry={SPHERE} color={color} position={p as Vec3} scale={[0.17, 0.15, 0.17]} outline={0.6} />
          ))}
        </>
      )
    case 'long':
      return (
        <>
          <Part geometry={HALF_SPHERE} color={color} position={[0, 0.04, -0.03]} scale={[0.54, 0.47, 0.51]} />
          <Part geometry={CAPSULE} color={color} position={[0, -0.28, -0.2]} scale={[0.46, 0.3, 0.24]} />
          <Part geometry={CAPSULE} color={color} position={[0.4, -0.18, 0.02]} scale={[0.1, 0.24, 0.12]} outline={0.6} />
          <Part geometry={CAPSULE} color={color} position={[-0.4, -0.18, 0.02]} scale={[0.1, 0.24, 0.12]} outline={0.6} />
        </>
      )
    case 'bun':
      return (
        <>
          <Part geometry={HALF_SPHERE} color={color} position={[0, 0.05, -0.03]} scale={[0.53, 0.46, 0.5]} />
          <Part geometry={SPHERE} color={color} position={[0, 0.5, -0.22]} scale={[0.2, 0.18, 0.2]} />
        </>
      )
    case 'quiff':
    default:
      return (
        <>
          <Part geometry={HALF_SPHERE} color={color} position={[0, 0.06, -0.04]} scale={[0.53, 0.46, 0.5]} />
          <Part geometry={SPHERE} color={color} position={[0.08, 0.42, 0.22]} rotation={[0.5, 0, -0.35]} scale={[0.25, 0.14, 0.2]} outline={0.6} />
        </>
      )
  }
}

function Glasses({ kind }: { kind: Look['glasses'] }) {
  if (kind === 'none') return null
  if (kind === 'sun') {
    return (
      <group position={[0, 0.03, 0.44]}>
        {[0.16, -0.16].map((x) => (
          <mesh key={x} geometry={CYLINDER} material={toon('#0d0b10')} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.13, 0.03, 0.1]} />
        ))}
        {[0.2, -0.12].map((x) => (
          <mesh key={x} geometry={SPHERE} material={toon('#6a7ad8')} position={[x, 0.04, 0.02]} scale={[0.025, 0.015, 0.01]} />
        ))}
        <mesh geometry={BOX} material={toon('#0d0b10')} position={[0, 0.02, 0]} scale={[0.1, 0.025, 0.02]} />
      </group>
    )
  }
  const ring = kind === 'round' ? RING : SQUARE_RING
  return (
    <group position={[0, 0.03, 0.45]}>
      {[0.16, -0.16].map((x) => (
        <mesh key={x} geometry={ring} material={toon(INK_COLOR)} position={[x, 0, 0]} rotation={[0, 0, kind === 'square' ? Math.PI / 4 : 0]} scale={0.11} />
      ))}
      <mesh geometry={BOX} material={toon(INK_COLOR)} position={[0, 0.01, 0]} scale={[0.1, 0.02, 0.02]} />
    </group>
  )
}

function Beard({ look }: { look: Look }) {
  const color = HAIR_COLOR[look.hairColor]
  return (
    <>
      {look.beard === 'stubble' && <mesh geometry={SPHERE} material={toon(color, 0.35)} position={[0, -0.16, 0.08]} scale={[0.47, 0.3, 0.4]} />}
      {look.beard === 'short' && <Part geometry={SPHERE} color={color} position={[0, -0.2, 0.1]} scale={[0.42, 0.24, 0.36]} outline={0.6} />}
      {look.beard === 'full' && <Part geometry={SPHERE} color={color} position={[0, -0.24, 0.1]} scale={[0.46, 0.32, 0.4]} outline={0.7} />}
      {look.mustache && (
        <Part geometry={CAPSULE} color={color} position={[0, -0.075, 0.43]} rotation={[0, 0, Math.PI / 2]} scale={[0.04, 0.08, 0.04]} outline={0.4} />
      )}
    </>
  )
}

/** The tie color that reads well on each suit. */
const TIE: Record<Look['outfitColor'], string> = {
  black: '#d63a3a',
  navy: '#e3b23c',
  red: '#1d1b1a',
  gold: '#1d1b1a',
  teal: '#1d1b1a',
  purple: '#e3b23c',
  white: '#1e2f5c',
  green: '#1d1b1a',
  gray: '#d63a3a',
}

function Accessory({ kind }: { kind: Look['accessory'] }) {
  switch (kind) {
    case 'briefcase':
      return (
        <>
          <Part geometry={BOX} color="#b8862a" position={[0.02, -0.82, 0.05]} scale={[0.42, 0.3, 0.12]} outline={0.6} />
          <mesh geometry={BOX} material={toon(INK_COLOR)} position={[0.02, -0.65, 0.05]} scale={[0.14, 0.05, 0.05]} />
        </>
      )
    case 'phone':
      return <Part geometry={BOX} color="#16151a" position={[0, -0.66, 0.12]} rotation={[0.4, 0, 0]} scale={[0.1, 0.18, 0.025]} outline={0.5} />
    case 'coffee':
      return (
        <>
          <Part geometry={CYLINDER} color="#fffaf0" position={[0, -0.68, 0.1]} scale={[0.08, 0.17, 0.08]} outline={0.5} />
          <mesh geometry={CYLINDER} material={toon('#8a5a32')} position={[0, -0.68, 0.1]} scale={[0.085, 0.06, 0.085]} />
        </>
      )
    default:
      return null
  }
}

export type CharacterProps = {
  look: Look
  pose: MascotPose
  /** Change it to hop once. */
  hopKey?: number
  reducedMotion?: boolean
  /** The gold game-piece base under the feet (off in the city). */
  base?: boolean
}

const HOP_SECONDS = 0.32

export function Character({ look, pose, hopKey = 0, reducedMotion = false, base = true }: CharacterProps) {
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

  const skin = SKIN[look.skin]
  const cloth = OUTFIT_COLOR[look.outfitColor]
  const formal = look.outfit === 'suit' || look.outfit === 'blazer'
  const pants = look.outfit === 'suit' ? cloth : look.outfit === 'blazer' ? '#26314f' : '#2f4b7c'
  const shoes = formal ? '#1a1716' : '#fffaf0'
  const sleeve = look.outfit === 'tee' ? skin : cloth

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const parts = [root.current, body.current, head.current, armL.current, armR.current, legL.current, legR.current, eyes.current]
    if (parts.some((p) => !p)) return
    const [r, b, h, al, ar, ll, lr, e] = parts as THREE.Group[]

    if (hop.current.key !== hopKey) hop.current = { key: hopKey, start: t }
    const hopP = hop.current.start >= 0 ? (t - hop.current.start) / HOP_SECONDS : 1
    const hopping = hopP >= 0 && hopP < 1
    const motion = reducedMotion ? 0 : 1

    let y = 0
    let squash = 1
    let armLz = 0.18
    let armRz = -0.18
    let armRx = 0
    let legSwing = 0
    let spin = 0
    let chin = 0

    if (hopping) {
      y = Math.sin(Math.PI * hopP) * 0.55
      squash = 1 + Math.sin(Math.PI * hopP) * 0.08
      armLz = 0.9
      armRz = -0.9
      legSwing = Math.sin(Math.PI * hopP) * 0.6
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
    } else if (pose === 'walk') {
      const step = Math.sin(t * 9) * motion
      y = Math.abs(step) * 0.06
      legSwing = step * 0.55
      armLz = 0.18 + step * 0.05
      armRz = -0.18 + step * 0.05
      armRx = -step * 0.5
    } else if (pose === 'boss') {
      // Confident: chin up, slow sway, arms a little away from the body.
      y = Math.sin(t * 1.4) * 0.02 * motion
      chin = -0.1
      armLz = 0.32
      armRz = -0.32
      spin = Math.sin(t * 0.5) * 0.18 * motion
    } else {
      // Idle: breathe, sway, and now and then a small wave.
      y = Math.sin(t * 2) * 0.03 * motion
      squash = 1 + Math.sin(t * 2) * 0.012 * motion
      const wave = Math.max(0, Math.sin(t * 0.7) - 0.85) / 0.15
      armRz = -0.18 - wave * 2.2 * motion
      armRx = wave * Math.sin(t * 10) * 0.4 * motion
    }

    r.position.y = y
    r.rotation.y = spin + (pose === 'walk' ? 0 : Math.sin(t * 0.6) * 0.12 * motion)
    b.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash))
    h.rotation.z = Math.sin(t * 1.1) * 0.06 * motion
    h.rotation.x = chin + Math.sin(t * 0.9) * 0.04 * motion
    al.rotation.z = THREE.MathUtils.lerp(al.rotation.z, armLz, 0.25)
    ar.rotation.z = THREE.MathUtils.lerp(ar.rotation.z, armRz, 0.25)
    ar.rotation.x = armRx
    ll.rotation.x = -legSwing
    lr.rotation.x = legSwing * (pose === 'walk' ? 1 : 0.6)

    if (t > blinkAt.current + 0.13) blinkAt.current = t + 2.5 + Math.random() * 3
    e.scale.y = t > blinkAt.current ? 0.12 : 1
  })

  // Without the base, lower the body so the shoes stand on the ground.
  const lift = base ? 0 : -0.17

  return (
    <group ref={root}>
      {base && (
        <>
          <Part geometry={CYLINDER} color="#f2b632" position={[0, 0.09, 0]} scale={[0.82, 0.18, 0.82]} outline={0.6} />
          <Part geometry={CYLINDER} color="#f2b632" position={[0, 0.22, 0]} scale={[0.62, 0.1, 0.62]} outline={0.6} />
        </>
      )}
      <group ref={body} position={[0, lift, 0]}>
        {/* Legs (pivot at the hip) */}
        {[0.2, -0.2].map((x, i) => (
          <group key={x} ref={i === 0 ? legL : legR} position={[x, 0.92, 0]}>
            <Part geometry={CAPSULE} color={pants} position={[0, -0.32, 0]} scale={[0.15, 0.24, 0.15]} />
            <Part geometry={SPHERE} color={shoes} position={[0, -0.64, 0.08]} scale={[0.17, 0.11, 0.24]} />
          </group>
        ))}

        {/* Torso */}
        <Part geometry={CAPSULE} color={cloth} position={[0, 1.3, 0]} scale={[0.44, 0.26, 0.36]} />
        {look.outfit === 'hoodie' ? (
          <>
            <Part geometry={RING} color={cloth} position={[0, 1.62, -0.08]} rotation={[Math.PI / 2.4, 0, 0]} scale={[0.26, 0.26, 0.5]} outline={0.6} />
            {[0.08, -0.08].map((x) => (
              <mesh key={x} geometry={CYLINDER} material={toon('#fffaf0')} position={[x, 1.42, 0.35]} scale={[0.015, 0.16, 0.015]} />
            ))}
          </>
        ) : look.outfit === 'tee' ? (
          <mesh geometry={SPHERE} material={toon(skin)} position={[0, 1.6, 0.2]} scale={[0.13, 0.06, 0.08]} />
        ) : (
          <>
            <Part geometry={SPHERE} color="#fffaf0" position={[0, 1.52, 0.27]} scale={[0.17, 0.2, 0.1]} outline={0.5} />
            {look.outfit === 'suit' && (
              <>
                <Part geometry={BOX} color={TIE[look.outfitColor]} position={[0, 1.36, 0.36]} rotation={[0.2, 0, Math.PI / 4]} scale={[0.1, 0.1, 0.04]} outline={0.5} />
                <Part geometry={BOX} color={TIE[look.outfitColor]} position={[0, 1.22, 0.37]} rotation={[0.15, 0, 0]} scale={[0.09, 0.22, 0.04]} outline={0.5} />
              </>
            )}
          </>
        )}
        {look.chain && (
          <>
            <mesh geometry={RING} material={toon('#f2c230')} position={[0, 1.5, 0.12]} rotation={[1.25, 0, 0]} scale={[0.26, 0.24, 0.1]} />
            <Part geometry={CYLINDER} color="#f2c230" position={[0, 1.27, 0.38]} rotation={[Math.PI / 2.2, 0, 0]} scale={[0.07, 0.02, 0.07]} outline={0.4} />
          </>
        )}

        {/* Arms (pivot at the shoulder) */}
        <group ref={armL} position={[0.44, 1.56, 0]}>
          <Part geometry={CAPSULE} color={sleeve} position={[0, -0.3, 0]} scale={[0.12, 0.2, 0.12]} />
          {look.outfit === 'tee' && <Part geometry={CAPSULE} color={cloth} position={[0, -0.1, 0]} scale={[0.135, 0.08, 0.135]} outline={0.5} />}
          <Part geometry={SPHERE} color={skin} position={[0, -0.58, 0]} scale={[0.12, 0.12, 0.12]} />
          <Accessory kind={look.accessory} />
        </group>
        <group ref={armR} position={[-0.44, 1.56, 0]}>
          <Part geometry={CAPSULE} color={sleeve} position={[0, -0.3, 0]} scale={[0.12, 0.2, 0.12]} />
          {look.outfit === 'tee' && <Part geometry={CAPSULE} color={cloth} position={[0, -0.1, 0]} scale={[0.135, 0.08, 0.135]} outline={0.5} />}
          <Part geometry={SPHERE} color={skin} position={[0, -0.58, 0]} scale={[0.12, 0.12, 0.12]} />
        </group>

        {/* Head */}
        <group ref={head} position={[0, 2.12, 0]}>
          <Part geometry={SPHERE} color={skin} scale={[0.5, 0.48, 0.46]} />
          <Part geometry={SPHERE} color={skin} position={[0.49, -0.02, 0]} scale={[0.09, 0.12, 0.07]} outline={0.5} />
          <Part geometry={SPHERE} color={skin} position={[-0.49, -0.02, 0]} scale={[0.09, 0.12, 0.07]} outline={0.5} />
          <Hair look={look} />
          <Beard look={look} />
          {/* Eyes are hidden behind sunglasses */}
          <group ref={eyes} position={[0, 0.02, 0.42]} visible={look.glasses !== 'sun'}>
            <mesh geometry={SPHERE} material={toon(INK_COLOR)} position={[0.16, 0, 0]} scale={[0.06, 0.085, 0.04]} />
            <mesh geometry={SPHERE} material={toon(INK_COLOR)} position={[-0.16, 0, 0]} scale={[0.06, 0.085, 0.04]} />
            <mesh geometry={SPHERE} material={toon('#ffffff')} position={[0.18, 0.03, 0.03]} scale={[0.02, 0.025, 0.015]} />
            <mesh geometry={SPHERE} material={toon('#ffffff')} position={[-0.14, 0.03, 0.03]} scale={[0.02, 0.025, 0.015]} />
          </group>
          <mesh geometry={BOX} material={toon(HAIR_COLOR[look.hairColor])} position={[0.16, 0.16, 0.42]} rotation={[0, 0, -0.12]} scale={[0.13, 0.03, 0.03]} />
          <mesh geometry={BOX} material={toon(HAIR_COLOR[look.hairColor])} position={[-0.16, 0.16, 0.42]} rotation={[0, 0, 0.12]} scale={[0.13, 0.03, 0.03]} />
          {look.beard === 'none' && (
            <>
              <mesh geometry={SPHERE} material={toon('#f29a8e')} position={[0.27, -0.1, 0.37]} scale={[0.07, 0.04, 0.03]} />
              <mesh geometry={SPHERE} material={toon('#f29a8e')} position={[-0.27, -0.1, 0.37]} scale={[0.07, 0.04, 0.03]} />
            </>
          )}
          <mesh geometry={SMILE} material={toon(look.beard === 'full' || look.beard === 'short' ? '#fffaf0' : INK_COLOR)} position={[0, -0.14, 0.45]} rotation={[0, 0, Math.PI]} scale={[0.1, 0.08, 0.08]} />
          <Glasses kind={look.glasses} />
        </group>
      </group>

      {/* Soft shadow on the ground */}
      <mesh geometry={CYLINDER} material={SHADOW} position={[0, 0.005, 0]} scale={[0.9, 0.001, 0.9]} />
    </group>
  )
}
