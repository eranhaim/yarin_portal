import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ROAD, type CityLayout } from './layout'
import { cityMaterials } from './materials'
import type { CityDistrict, CityMission } from './types'

// Wayfinding in the street: a street sign at every mission, a light on the road at the current one, a route line
// that leads to it, and a gate at the first district that is still closed.

const FONT = '"Rubik Variable", Rubik, Arial'

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Splits a title into at most two lines. */
function lines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(' ')
  const out = ['']
  for (const word of words) {
    const next = out.at(-1) ? `${out.at(-1)} ${word}` : word
    if (ctx.measureText(next).width <= width) out[out.length - 1] = next
    else if (out.length < 2) out.push(word)
    else {
      out[1] = `${out[1]}…`
      break
    }
  }
  return out
}

function signTexture(mission: CityMission, color: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 768
  canvas.height = 320
  const ctx = canvas.getContext('2d')!
  const done = mission.state === 'done'
  const current = mission.state === 'current'
  ctx.fillStyle = current ? '#15191f' : done ? '#1c2b24' : '#2a313a'
  ctx.fillRect(0, 0, 768, 320)
  ctx.fillStyle = current ? '#f0b84a' : done ? '#3aa76d' : color
  ctx.fillRect(0, 0, 768, 16)
  // The number, on the right.
  ctx.fillStyle = current ? '#f0b84a' : done ? '#3aa76d' : 'rgba(255,255,255,0.14)'
  roundRect(ctx, 588, 74, 140, 172, 26)
  ctx.fill()
  ctx.fillStyle = current ? '#1b1405' : '#ffffff'
  ctx.font = `800 92px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(done ? '✓' : mission.badge, 658, 164)
  ctx.direction = 'rtl'
  ctx.textAlign = 'right'
  ctx.fillStyle = mission.state === 'locked' ? 'rgba(255,255,255,0.55)' : '#ffffff'
  ctx.font = `700 54px ${FONT}`
  const text = lines(ctx, mission.title, 520)
  const y = text.length === 1 ? 164 : 130
  text.forEach((line, i) => ctx.fillText(line, 556, y + i * 68))
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

const PANEL = new THREE.PlaneGeometry(3.6, 1.5)
const BACK = new THREE.BoxGeometry(3.7, 1.6, 0.12)
const POLE = new THREE.CylinderGeometry(0.07, 0.09, 4.2, 8)

function MissionSign({ mission, color, layout, onSelect }: { mission: CityMission; color: string; layout: CityLayout; onSelect: () => void }) {
  const m = cityMaterials()
  const map = useMemo(() => signTexture(mission, color), [mission, color])
  useEffect(() => () => map.dispose(), [map])
  const at = layout.missionAt[mission.index]!
  const f = layout.frame(at)
  const position = layout.point(at, ROAD.half + 1.5, 0.16)
  const [over, setOver] = useState(false)
  const open = mission.state !== 'locked'
  const enter = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setOver(open)
    document.body.style.cursor = open ? 'pointer' : ''
  }
  const leave = () => {
    setOver(false)
    document.body.style.cursor = ''
  }
  useEffect(() => () => void (document.body.style.cursor = ''), [])
  return (
    <group position={position} rotation={[0, f.angle - 0.28, 0]} scale={mission.state === 'current' ? 1.2 : 1}>
      <mesh geometry={POLE} material={m.metal} position={[1.4, 2.1, -0.22]} castShadow />
      <mesh geometry={POLE} material={m.metal} position={[-1.4, 2.1, -0.22]} castShadow />
      <group
        position={[0, 4.2, 0]}
        scale={over ? 1.05 : 1}
        onPointerOver={enter}
        onPointerOut={leave}
        onClick={(e) => {
          e.stopPropagation()
          if (open) onSelect()
        }}
      >
        <mesh geometry={BACK} material={m.metal} position={[0, 0, -0.07]} castShadow />
        <mesh geometry={PANEL}>
          <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={mission.state === 'current' ? 0.55 : 0.3} roughness={0.5} />
        </mesh>
      </group>
    </group>
  )
}

// ---------- The current mission ----------

const beamMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { color: { value: new THREE.Color('#ffc861') }, time: { value: 0 } },
    // The sides of the beam fade out, so it looks like light and not like a glass tube.
    vertexShader:
      'varying vec2 v; varying float facing; void main() { v = uv; vec4 p = modelViewMatrix * vec4(position, 1.0); facing = abs(dot(normalize(normalMatrix * normal), normalize(p.xyz))); gl_Position = projectionMatrix * p; }',
    fragmentShader:
      'varying vec2 v; varying float facing; uniform vec3 color; uniform float time; void main() { float fade = pow(1.0 - v.y, 2.2); float wave = 0.82 + 0.18 * sin(v.y * 16.0 - time * 3.0); gl_FragColor = vec4(color, fade * 0.24 * wave * facing * facing); }',
  })

function routeTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 64, 128)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 13
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(10, 92)
  ctx.lineTo(32, 40)
  ctx.lineTo(54, 92)
  ctx.stroke()
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = THREE.ClampToEdgeWrapping
  t.wrapT = THREE.RepeatWrapping
  return t
}

/** Arrows on the road, from where the car waits to the mission. */
function RouteLine({ layout, from, to }: { layout: CityLayout; from: number; to: number }) {
  const { geometry, material } = useMemo(() => {
    const positions: number[] = []
    const uvs: number[] = []
    const index: number[] = []
    const steps = Math.max(2, Math.ceil((to - from) / 2))
    for (let i = 0; i <= steps; i++) {
      const d = from + ((to - from) * i) / steps
      const a = layout.point(d, ROAD.lane - 0.8, 0.03)
      const b = layout.point(d, ROAD.lane + 0.8, 0.03)
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
      uvs.push(0, d / 3.2, 1, d / 3.2)
      if (i < steps) {
        const k = i * 2
        index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(index)
    const map = routeTexture()
    const material = new THREE.MeshBasicMaterial({ map, color: '#ffc861', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide })
    return { geometry, material }
  }, [layout, from, to])
  useEffect(
    () => () => {
      geometry.dispose()
      material.map?.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  const ref = useRef<THREE.Mesh>(null)
  useFrame((_, delta) => {
    const map = (ref.current?.material as THREE.MeshBasicMaterial | undefined)?.map
    if (map) map.offset.y -= delta * 0.9
  })
  return <mesh ref={ref} geometry={geometry} material={material} />
}

function CurrentMarker({ layout, at }: { layout: CityLayout; at: number }) {
  const position = layout.point(at, ROAD.lane, 0.03)
  const material = useMemo(beamMaterial, [])
  useEffect(() => () => material.dispose(), [material])
  const ring = useRef<THREE.Mesh>(null)
  const beam = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ring.current) ring.current.scale.setScalar(1 + Math.sin(t * 2.4) * 0.05)
    const m = beam.current?.material as THREE.ShaderMaterial | undefined
    if (m?.uniforms.time) m.uniforms.time.value = t
  })
  return (
    <group position={position}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.9, 2.25, 48]} />
        <meshBasicMaterial color="#ffc861" transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.9, 48]} />
        <meshBasicMaterial color="#ffc861" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <mesh ref={beam} position={[0, 4, 0]} material={material}>
        <cylinderGeometry args={[1.85, 1.95, 8, 40, 1, true]} />
      </mesh>
    </group>
  )
}

// ---------- The closed district ----------

function gateTexture(district: CityDistrict, previous: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#14181e'
  ctx.fillRect(0, 0, 1024, 256)
  ctx.strokeStyle = district.color
  ctx.lineWidth = 10
  ctx.strokeRect(5, 5, 1014, 246)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.direction = 'rtl'
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 74px ${FONT}`
  ctx.fillText(`שלב ${district.index + 1}: ${district.title}`, 512, 92, 960)
  ctx.fillStyle = 'rgba(255,255,255,0.72)'
  ctx.font = `600 46px ${FONT}`
  ctx.fillText(`נפתח אחרי ${previous}`, 512, 182, 960)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function Gate({ layout, at, district }: { layout: CityLayout; at: number; district: CityDistrict }) {
  const m = cityMaterials()
  const map = useMemo(() => gateTexture(district, `שלב ${district.index}`), [district])
  useEffect(() => () => map.dispose(), [map])
  const f = layout.frame(at)
  const position = layout.point(at, 0)
  const wide = ROAD.half * 2 + 4
  return (
    <group position={position} rotation={[0, f.angle, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * wide) / 2, 3.8, 0]} castShadow material={m.metal}>
          <boxGeometry args={[0.5, 7.6, 0.5]} />
        </mesh>
      ))}
      <mesh position={[0, 7.4, 0]} castShadow material={m.metal}>
        <boxGeometry args={[wide, 0.5, 0.6]} />
      </mesh>
      <mesh position={[0, 5.9, 0.32]}>
        <planeGeometry args={[11, 2.75]} />
        <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.4} />
      </mesh>
      {/* Barriers across the lanes. */}
      {[-6.4, -2.9, 2.9, 6.4].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.85, 0]} castShadow>
            <boxGeometry args={[2.6, 0.28, 0.1]} />
            <meshStandardMaterial color="#e8e4da" roughness={0.6} />
          </mesh>
          {[-0.9, -0.3, 0.3, 0.9].map((k) => (
            <mesh key={k} position={[k, 0.85, 0.056]} rotation={[0, 0, 0.5]}>
              <planeGeometry args={[0.2, 0.34]} />
              <meshStandardMaterial color="#d2492f" roughness={0.6} />
            </mesh>
          ))}
          {[-1.1, 1.1].map((k) => (
            <mesh key={k} position={[k, 0.42, 0]} castShadow material={m.metal}>
              <boxGeometry args={[0.09, 0.84, 0.4]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// ---------- Big signs ----------

function Landmark({ layout, at, text, gold }: { layout: CityLayout; at: number; text: string; gold?: boolean }) {
  const m = cityMaterials()
  const map = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 220
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = gold ? '#f0b84a' : '#12161c'
    ctx.fillRect(0, 0, 1024, 220)
    ctx.fillStyle = gold ? '#1b1405' : '#ffffff'
    ctx.font = `800 96px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.direction = 'rtl'
    ctx.fillText(text, 512, 116, 960)
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [text, gold])
  useEffect(() => () => map.dispose(), [map])
  const f = layout.frame(at)
  return (
    <group position={layout.point(at, ROAD.half + 3.6, 0.16)} rotation={[0, f.angle - 0.35, 0]}>
      <mesh position={[0, 3.1, -0.12]} castShadow material={m.metal}>
        <boxGeometry args={[7.2, 1.8, 0.2]} />
      </mesh>
      <mesh position={[0, 3.1, 0]}>
        <planeGeometry args={[7, 1.5]} />
        <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.35} />
      </mesh>
      {[-2.8, 2.8].map((x) => (
        <mesh key={x} position={[x, 1.2, -0.1]} castShadow material={m.metal}>
          <boxGeometry args={[0.25, 2.4, 0.25]} />
        </mesh>
      ))}
    </group>
  )
}

type Props = {
  layout: CityLayout
  districts: CityDistrict[]
  missions: CityMission[]
  playerAt: number
  parkedAt: number
  /** The built part of the avenue; signs outside it are never seen. */
  range: [number, number]
  onSelect: (mission: CityMission) => void
}

export function Missions({ layout, districts, missions, playerAt, parkedAt, range, onSelect }: Props) {
  const target = layout.missionAt[playerAt] ?? layout.finishAt
  const closed = districts.find((d) => d.state === 'locked' && layout.spans[d.index]!.to > layout.spans[d.index]!.from)
  return (
    <>
      {missions
        .filter((mission) => {
          const at = layout.missionAt[mission.index] ?? 0
          return at > range[0] && at < range[1]
        })
        .map((mission) => (
        <MissionSign key={mission.id} mission={mission} color={districts[mission.chapterIndex]?.color ?? '#888888'} layout={layout} onSelect={() => onSelect(mission)} />
      ))}
      <CurrentMarker layout={layout} at={target} />
      <RouteLine layout={layout} from={parkedAt + 3.4} to={target - 2.4} />
      {closed && <Gate layout={layout} at={layout.spans[closed.index]!.from + 4} district={closed} />}
      <Landmark layout={layout} at={20} text="המטה של ירין ואורן" />
      <Landmark layout={layout} at={layout.finishAt + 18} text="הבוס" gold />
    </>
  )
}
