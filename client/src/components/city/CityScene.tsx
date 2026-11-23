import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { MapControls } from 'three/examples/jsm/controls/MapControls.js'
import { DEFAULT_LOOK } from '../../lib/game'
import type { Host, Look } from '../../lib/types'
import { Character } from '../mascot/Character'
import { BOX, CONE, CYLINDER, glow, SPHERE, toon } from '../mascot/toon'
import type { CityDistrict, CityMission } from './types'

// The 3D city: districts (levels) along a main road, missions (tasks) as glowing markers,
// palms, moving cars, the HQ with the hosts, and the player's character walking between missions.
// Labels are HTML elements (crisp Hebrew text) that this scene moves every frame.

export type CitySceneProps = {
  districts: CityDistrict[]
  missions: CityMission[]
  playerLook: Look | null
  /** Index of the player's mission; missions.length = finished (stands at the finish). */
  playerAt: number
  /** Where the player starts walking from (the last position they saw). */
  walkFrom: number
  hosts: Host[]
  reducedMotion: boolean
  onArrive: () => void
  onSelectMission: (mission: CityMission) => void
  /** Label elements, in the order districts, missions, HQ, finish. */
  labels: MutableRefObject<(HTMLElement | null)[]>
}

// ---------- Layout ----------

const DISTRICT_W = 24
const ROAD_Z = 0

/** Seeded random numbers, so the city looks the same on every visit. */
function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** District i spans x from -i·W to -(i+1)·W: the journey runs right to left, like Hebrew. */
const districtCenterX = (i: number) => -(i + 0.5) * DISTRICT_W

function layoutCity(districts: CityDistrict[], missions: CityMission[]) {
  const points: THREE.Vector3[] = []
  districts.forEach((_, i) => {
    const own = missions.filter((m) => m.chapterIndex === i)
    own.forEach((m, k) => {
      const x = -i * DISTRICT_W - ((k + 1) * DISTRICT_W) / (own.length + 1)
      const z = ROAD_Z + Math.sin((k + 1) * 1.3 + i) * 2.2
      points[m.index] = new THREE.Vector3(x, 0, z)
    })
  })
  const start = new THREE.Vector3(DISTRICT_W * 0.45, 0, ROAD_Z)
  const finish = new THREE.Vector3(-districts.length * DISTRICT_W - 6, 0, ROAD_Z)
  /** Road points: HQ, every mission, the finish. Player position p is road point p + 1. */
  const road = [start, ...points, finish]
  return { road, start, finish, width: (districts.length + 1) * DISTRICT_W }
}

// ---------- Pieces ----------

const WINDOWS = (() => {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 64, 128)
  const random = seeded(7)
  for (let y = 6; y < 128; y += 14) {
    for (let x = 6; x < 64; x += 14) {
      if (random() > 0.35) {
        ctx.fillStyle = random() > 0.5 ? '#ffd27a' : '#9fe7ff'
        ctx.fillRect(x, y, 8, 8)
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()

const buildingMaterials = new Map<string, THREE.MeshToonMaterial>()
function buildingMaterial(color: string) {
  let material = buildingMaterials.get(color)
  if (!material) {
    material = toon(color).clone()
    material.emissive = new THREE.Color('#ffffff')
    material.emissiveMap = WINDOWS
    material.emissiveIntensity = 0.85
    buildingMaterials.set(color, material)
  }
  return material
}

function Buildings({ district, index }: { district: CityDistrict; index: number }) {
  const items = useMemo(() => {
    const random = seeded(index * 97 + 13)
    const list: { x: number; z: number; w: number; d: number; h: number; color: string }[] = []
    const base = new THREE.Color(district.color)
    for (const side of [-1, 1]) {
      let x = -index * DISTRICT_W - 1.5
      while (x > -(index + 1) * DISTRICT_W + 1.5) {
        const w = 2.2 + random() * 2.4
        // Buildings between the camera and the road stay low, so they never hide the road.
        const h = side < 0 ? 4 + random() * 10 : 1.2 + random() * 2.2
        const shade = base.clone().lerp(new THREE.Color('#1b1530'), 0.45 + random() * 0.35)
        list.push({ x: x - w / 2, z: side * (7.5 + random() * 3), w, d: 2.5 + random() * 2, h, color: `#${shade.getHexString()}` })
        x -= w + 0.6 + random() * 1.2
      }
    }
    return list
  }, [district.color, index])
  const locked = district.state === 'locked'
  return (
    <group>
      {items.map((b, i) => (
        <group key={i} position={[b.x, b.h / 2, b.z]}>
          <mesh geometry={BOX} material={locked ? toon('#3a3448') : buildingMaterial(b.color)} scale={[b.w, b.h, b.d]} />
          {/* Neon strip on the roof edge */}
          {!locked && i % 2 === 0 && <mesh geometry={BOX} material={glow(district.color)} position={[0, b.h / 2 + 0.05, b.d / 2]} scale={[b.w * 0.9, 0.12, 0.12]} />}
        </group>
      ))}
    </group>
  )
}

function Palm({ x, z, lean }: { x: number; z: number; lean: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, 0, lean]}>
      <mesh geometry={CYLINDER} material={toon('#8a5a36')} position={[0, 1.6, 0]} scale={[0.14, 3.2, 0.14]} />
      {[0, 1, 2, 3, 4].map((k) => (
        <mesh
          key={k}
          geometry={SPHERE}
          material={toon('#2fae6a')}
          position={[Math.cos((k / 5) * Math.PI * 2) * 0.7, 3.2, Math.sin((k / 5) * Math.PI * 2) * 0.7]}
          rotation={[0, -(k / 5) * Math.PI * 2, 0.5]}
          scale={[0.9, 0.12, 0.3]}
        />
      ))}
    </group>
  )
}

const CAR_COLORS = ['#ff4f6d', '#2fe0b0', '#ffc93c', '#4fb3ff', '#b18cff', '#ffffff']

/** Cars that drive along the road and loop. */
function Cars({ road }: { road: THREE.Vector3[] }) {
  const refs = useRef<(THREE.Group | null)[]>([])
  const curve = useMemo(() => new THREE.CatmullRomCurve3(road.map((p) => new THREE.Vector3(p.x, 0, p.z))), [road])
  const length = curve.getLength()
  useFrame((state) => {
    refs.current.forEach((car, i) => {
      if (!car) return
      const lane = i % 2 === 0 ? 1.1 : -1.1
      const speed = (i % 2 === 0 ? 1 : -1) * (3.5 + i * 0.4)
      const u = (((state.clock.elapsedTime * speed) / length + i / CAR_COLORS.length) % 1 + 1) % 1
      const point = curve.getPointAt(u)
      const tangent = curve.getTangentAt(u)
      car.position.set(point.x, 0.32, point.z + lane)
      car.rotation.y = Math.atan2(tangent.x, tangent.z) + (speed < 0 ? Math.PI : 0)
    })
  })
  return (
    <>
      {CAR_COLORS.map((color, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el)}>
          <mesh geometry={BOX} material={toon(color)} scale={[0.9, 0.35, 1.8]} />
          <mesh geometry={BOX} material={toon('#1d1a28')} position={[0, 0.3, -0.1]} scale={[0.8, 0.3, 0.9]} />
          <mesh geometry={BOX} material={glow('#fff3b0')} position={[0, 0, 0.91]} scale={[0.7, 0.1, 0.02]} />
          <mesh geometry={BOX} material={glow('#ff3b5c')} position={[0, 0, -0.91]} scale={[0.7, 0.1, 0.02]} />
        </group>
      ))}
    </>
  )
}

function Road({ road }: { road: THREE.Vector3[] }) {
  const segments = useMemo(
    () =>
      road.slice(1).map((b, i) => {
        const a = road[i]!
        const mid = a.clone().add(b).multiplyScalar(0.5)
        const length = a.distanceTo(b)
        const angle = Math.atan2(b.x - a.x, b.z - a.z)
        return { mid, length, angle }
      }),
    [road],
  )
  return (
    <group>
      {segments.map((s, i) => (
        <group key={i} position={[s.mid.x, 0.01, s.mid.z]} rotation={[0, s.angle, 0]}>
          <mesh geometry={BOX} material={toon('#2b2638')} scale={[4.2, 0.02, s.length + 4.2]} />
          {Array.from({ length: Math.max(1, Math.floor(s.length / 2)) }, (_, k) => (
            <mesh key={k} geometry={BOX} material={glow('#ffd84d')} position={[0, 0.02, -s.length / 2 + 1 + k * 2]} scale={[0.12, 0.01, 0.9]} />
          ))}
        </group>
      ))}
    </group>
  )
}

const MARKER_COLOR = { done: '#43e97b', current: '#ffd84d', open: '#4fb3ff', locked: '#5c5670' } as const

function Marker({ mission, position, onSelect }: { mission: CityMission; position: THREE.Vector3; onSelect: () => void }) {
  const beam = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const color = MARKER_COLOR[mission.state]
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (ring.current) ring.current.rotation.y = t * (mission.state === 'current' ? 1.6 : 0.6)
    if (beam.current) beam.current.scale.y = 5 + Math.sin(t * 3 + mission.index) * 0.4
  })
  const clickable = mission.state !== 'locked'
  return (
    <group
      position={[position.x, 0, position.z]}
      onClick={(e) => {
        e.stopPropagation()
        if (clickable) onSelect()
      }}
      onPointerOver={() => clickable && (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <mesh ref={ring} geometry={CYLINDER} material={glow(color, 0.85)} position={[0, 0.04, 0]} scale={[1.1, 0.04, 1.1]} />
      <mesh geometry={CYLINDER} material={toon('#1b1726')} position={[0, 0.06, 0]} scale={[0.85, 0.04, 0.85]} />
      {mission.state !== 'done' && mission.state !== 'locked' && (
        <mesh ref={beam} geometry={CYLINDER} material={glow(color, 0.22)} position={[0, 2.5, 0]} scale={[0.75, 5, 0.75]} />
      )}
      {mission.state === 'done' && <mesh geometry={CONE} material={glow(color)} position={[0, 0.5, 0]} rotation={[Math.PI, 0, 0]} scale={[0.3, 0.5, 0.3]} />}
    </group>
  )
}

function Headquarters({ position, hosts, reducedMotion }: { position: THREE.Vector3; hosts: Host[]; reducedMotion: boolean }) {
  return (
    <group position={[position.x + 3, 0, position.z]}>
      <mesh geometry={BOX} material={buildingMaterial('#3a2a62')} position={[2.5, 7, -6]} scale={[6, 14, 5]} />
      <mesh geometry={BOX} material={glow('#ffd84d')} position={[2.5, 14.2, -3.4]} scale={[5.5, 0.6, 0.15]} />
      <mesh geometry={CYLINDER} material={toon('#2b2638')} position={[0, 0.05, 0]} scale={[3.2, 0.1, 3.2]} />
      {hosts.map((host, i) => (
        <group key={host.key} position={[i === 0 ? -0.9 : 0.9, 0.1, 0.4]} rotation={[0, i === 0 ? 0.5 : -0.2, 0]}>
          <Character look={host.look} pose="boss" base={false} reducedMotion={reducedMotion} />
        </group>
      ))}
    </group>
  )
}

function Finish({ position }: { position: THREE.Vector3 }) {
  return (
    <group position={[position.x, 0, position.z]}>
      <mesh geometry={CYLINDER} material={glow('#ffd84d', 0.9)} position={[0, 0.04, 0]} scale={[2.2, 0.05, 2.2]} />
      <mesh geometry={CYLINDER} material={toon('#f2b632')} position={[0, 0.9, 0]} scale={[0.35, 1.6, 0.35]} />
      <mesh geometry={SPHERE} material={toon('#f2b632')} position={[0, 2.1, 0]} scale={[0.75, 0.55, 0.75]} />
      <mesh geometry={CYLINDER} material={glow('#ffd84d', 0.18)} position={[0, 4, 0]} scale={[1.6, 8, 1.6]} />
    </group>
  )
}

// ---------- Player, camera and labels ----------

/** Walks the player along the road from walkFrom to playerAt, then waits. Moves the camera's focus with them. */
function Player({
  look,
  road,
  from,
  to,
  reducedMotion,
  onArrive,
  focus,
}: {
  look: Look | null
  road: THREE.Vector3[]
  from: number
  to: number
  reducedMotion: boolean
  onArrive: () => void
  focus: MutableRefObject<THREE.Vector3>
}) {
  const group = useRef<THREE.Group>(null)
  const walk = useRef({ distance: 0, total: 0, done: false, points: [] as THREE.Vector3[] })
  const poseRef = useRef<'walk' | 'wave' | 'idle'>('idle')
  const arrived = useRef(onArrive)
  useEffect(() => {
    arrived.current = onArrive
  })

  // The path from the start point to the target point (road index = position + 1).
  useEffect(() => {
    const a = Math.min(from, to) + 1
    const b = to + 1
    const points = road.slice(a, b + 1)
    const total = points.slice(1).reduce((sum, p, i) => sum + p.distanceTo(points[i]!), 0)
    const instant = reducedMotion || from >= to || points.length < 2
    walk.current = { distance: instant ? total : 0, total, done: false, points: points.length ? points : [road[b] ?? road[0]!] }
    poseRef.current = instant ? 'idle' : 'walk'
  }, [road, from, to, reducedMotion])

  useFrame((_, delta) => {
    const w = walk.current
    if (!group.current || w.points.length === 0) return
    if (!w.done && w.distance < w.total) w.distance = Math.min(w.total, w.distance + delta * 5)
    // Position on the polyline at the walked distance.
    let left = w.distance
    let point = w.points[0]!.clone()
    let heading = 0
    for (let i = 1; i < w.points.length; i++) {
      const a = w.points[i - 1]!
      const b = w.points[i]!
      const length = a.distanceTo(b)
      heading = Math.atan2(b.x - a.x, b.z - a.z)
      if (left <= length) {
        point = a.clone().lerp(b, length ? left / length : 1)
        break
      }
      left -= length
      point = b.clone()
    }
    group.current.position.set(point.x, 0, point.z + 1.6)
    const walking = w.distance < w.total
    group.current.rotation.y = walking ? heading : THREE.MathUtils.lerp(group.current.rotation.y, 0, 0.1)
    focus.current.lerp(point, 0.08)
    if (!walking && !w.done) {
      w.done = true
      poseRef.current = 'wave'
      arrived.current()
      window.setTimeout(() => (poseRef.current = 'idle'), 2500)
    }
  })

  return (
    <group ref={group} scale={1.45}>
      {/* A gold ring marks "you are here". */}
      <mesh geometry={CYLINDER} material={glow('#ffd84d', 0.55)} position={[0, 0.02, 0]} scale={[0.9, 0.02, 0.9]} />
      <PlayerBody look={look} poseRef={poseRef} reducedMotion={reducedMotion} />
    </group>
  )
}

/** Re-renders the character only when the pose changes (walk, wave, idle); the frame loop just watches the ref. */
function PlayerBody({ look, poseRef, reducedMotion }: { look: Look | null; poseRef: MutableRefObject<'walk' | 'wave' | 'idle'>; reducedMotion: boolean }) {
  const [pose, setPose] = useState<'walk' | 'wave' | 'idle'>('idle')
  useFrame(() => {
    if (pose !== poseRef.current) setPose(poseRef.current)
  })
  return <Character look={look ?? DEFAULT_LOOK} pose={pose} base={false} reducedMotion={reducedMotion} />
}

/** Map controls: drag to move along the city, wheel or pinch to zoom. The view follows the player. */
function Controls({ focus, width }: { focus: MutableRefObject<THREE.Vector3>; width: number }) {
  const { camera, gl } = useThree()
  const controls = useRef<MapControls | null>(null)
  const userMoved = useRef(false)

  useEffect(() => {
    const c = new MapControls(camera, gl.domElement)
    c.enableDamping = true
    c.dampingFactor = 0.1
    c.enableRotate = false
    c.screenSpacePanning = false
    c.minDistance = 12
    c.maxDistance = 46
    c.target.copy(focus.current)
    const onStart = () => (userMoved.current = true)
    c.addEventListener('start', onStart)
    controls.current = c
    return () => {
      c.removeEventListener('start', onStart)
      c.dispose()
    }
  }, [camera, gl, focus])

  useFrame(() => {
    const c = controls.current
    if (!c) return
    if (!userMoved.current) {
      // Follow the player until the user drags the map.
      const offset = camera.position.clone().sub(c.target)
      c.target.lerp(focus.current, 0.08)
      camera.position.copy(c.target).add(offset)
    }
    // Keep the view over the city.
    c.target.x = THREE.MathUtils.clamp(c.target.x, -width + 6, DISTRICT_W)
    c.target.z = THREE.MathUtils.clamp(c.target.z, -10, 10)
    c.update()
  })
  return null
}

/**
 * Moves the HTML labels to their 3D anchors every frame. Far labels shrink and fade out,
 * so the distance does not fill up with overlapping text; labels behind the camera hide.
 */
function LabelProjector({ anchors, labels, keepVisible }: { anchors: THREE.Vector3[]; labels: MutableRefObject<(HTMLElement | null)[]>; keepVisible: (index: number) => boolean }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    anchors.forEach((anchor, i) => {
      const el = labels.current[i]
      if (!el) return
      const distance = camera.position.distanceTo(anchor)
      v.copy(anchor).project(camera)
      const onScreen = v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15
      const near = keepVisible(i) || distance < 48
      el.style.opacity = onScreen && near ? '1' : '0'
      el.style.pointerEvents = onScreen && near ? '' : 'none'
      const scale = THREE.MathUtils.clamp(30 / distance, 0.6, 1.15)
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -100%) scale(${scale})`
    })
  })
  return null
}

function World(props: CitySceneProps) {
  const { districts, missions, hosts, reducedMotion } = props
  const { road, start, finish, width } = useMemo(() => layoutCity(districts, missions), [districts, missions])
  const target = Math.min(props.playerAt, missions.length)
  const focus = useRef(road[Math.min(props.walkFrom, target) + 1]?.clone() ?? new THREE.Vector3())

  const palms = useMemo(() => {
    const random = seeded(31)
    return road.slice(0, -1).flatMap((p, i) =>
      i % 2 === 0
        ? [
            { x: p.x + 2, z: p.z + 3.6 + random(), lean: (random() - 0.5) * 0.3 },
            { x: p.x - 1.5, z: p.z - 3.8 - random(), lean: (random() - 0.5) * 0.3 },
          ]
        : [],
    )
  }, [road])

  // Label anchors: district names high above, missions above their markers, the HQ and the finish.
  const anchors = useMemo(
    () => [
      ...districts.map((_, i) => new THREE.Vector3(districtCenterX(i), 9, -9)),
      ...missions.map((_, i) => road[i + 1]!.clone().setY(2.4)),
      start.clone().add(new THREE.Vector3(5.5, 15.5, -3.4)),
      finish.clone().setY(3.6),
    ],
    [districts, missions, road, start, finish],
  )

  return (
    <>
      <fog attach="fog" args={['#4a2466', 40, 95]} />
      <hemisphereLight args={['#ffb3e1', '#2b1d4a', 1.1]} />
      <directionalLight position={[30, 25, 10]} intensity={1.3} color="#ffc38a" />
      <ambientLight intensity={0.35} />

      {/* Ground, beach and the sea */}
      <mesh geometry={BOX} material={toon('#2a2240')} position={[-width / 2 + DISTRICT_W / 2, -0.06, 0]} scale={[width + 60, 0.1, 50]} />
      <mesh geometry={BOX} material={toon('#e8c38d')} position={[-width / 2 + DISTRICT_W / 2, -0.05, -20]} scale={[width + 60, 0.1, 6]} />
      <mesh geometry={BOX} material={glow('#2d9cdb', 0.9)} position={[-width / 2 + DISTRICT_W / 2, -0.1, -48]} scale={[width + 160, 0.1, 50]} />

      {districts.map((d, i) => (
        <group key={d.index}>
          <mesh geometry={BOX} material={glow(d.state === 'locked' ? '#3a3448' : d.color, 0.16)} position={[districtCenterX(i), -0.0, 0]} scale={[DISTRICT_W - 1, 0.02, 22]} />
          <Buildings district={d} index={i} />
        </group>
      ))}

      <Road road={road} />
      {palms.map((p, i) => (
        <Palm key={i} x={p.x} z={p.z} lean={p.lean} />
      ))}
      <Cars road={road} />

      {missions.map((m, i) => (
        <Marker key={m.id} mission={m} position={road[i + 1]!} onSelect={() => props.onSelectMission(m)} />
      ))}
      <Headquarters position={start} hosts={hosts} reducedMotion={reducedMotion} />
      <Finish position={finish} />

      <Player look={props.playerLook} road={road} from={props.walkFrom} to={target} reducedMotion={reducedMotion} onArrive={props.onArrive} focus={focus} />
      <Controls focus={focus} width={width} />
      <LabelProjector
        anchors={anchors}
        labels={props.labels}
        // District names, the current mission, the HQ and the finish stay readable from afar.
        keepVisible={(i) => i < districts.length || i >= districts.length + missions.length || missions[i - districts.length]?.state === 'current'}
      />
    </>
  )
}

export default function CityScene(props: CitySceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 24, 17], fov: 40, near: 0.5, far: 220 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
    >
      <World {...props} />
    </Canvas>
  )
}
