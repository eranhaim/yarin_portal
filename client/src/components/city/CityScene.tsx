import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, HueSaturation, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import skyUrl from '../../assets/city/sky.hdr?url'
import type { Host, Look } from '../../lib/types'

import { SoftCharacter } from './SoftCharacter'
import { layoutCity, parkingFor, ROAD, type CityLayout } from './layout'
import { Missions } from './Missions'
import { PlayerCar, type CarState } from './PlayerCar'
import { StreetLife, Traffic } from './Props'
import { Buildings, Street } from './Street'
import type { CityDistrict, CityMission, Quality } from './types'

// The street view: a sunny coastal city with real light. The camera follows the player's car, which waits in front
// of the current mission. Dragging looks around; the wheel moves closer or farther.

export type CitySceneProps = {
  districts: CityDistrict[]
  missions: CityMission[]
  playerLook: Look
  /** Index of the player's mission; missions.length = finished. */
  playerAt: number
  /** Where the player starts driving from (the last position they saw). */
  driveFrom: number
  hosts: Host[]
  reducedMotion: boolean
  quality: Quality
  onQuality: (quality: Quality) => void
  /** The customer pressed the main button: drive up to the mission, then call onLeft. */
  leaving: boolean
  onLeft: () => void
  onArrive: () => void
  onSelectMission: (mission: CityMission) => void
  onReady: () => void
  /** Part of the width and height that the cards in front cover, so the car stays in the free area. */
  shift: { x: number; y: number }
}

// The sun comes from the sea, over the left shoulder: it lights the street and draws the palms on the road.
const SUN = new THREE.Vector3(-0.62, 0.74, 0.34).normalize()

/** Turns the sky photo (by whole columns) so that its own sun stands where the light comes from. */
function alignSky(hdr: THREE.DataTexture) {
  const image = hdr.image as { data: Uint16Array | Float32Array; width: number; height: number }
  if (hdr.userData.aligned) return
  hdr.userData.aligned = true
  const { data, width, height } = image
  let best = -1
  let column = 0
  for (let i = 0; i < width * height; i++) {
    // Half floats grow with their bits, so the raw numbers compare well enough to find the sun.
    const v = data[i * 4]! + data[i * 4 + 1]! + data[i * 4 + 2]!
    if (v > best) {
      best = v
      column = i % width
    }
  }
  const wanted = (Math.atan2(SUN.z, SUN.x) / (Math.PI * 2) + 0.5) * width
  const shift = (((Math.round(wanted - column) % width) + width) % width) * 4
  const row = width * 4
  for (let y = 0; y < height; y++) {
    const line = data.slice(y * row, (y + 1) * row)
    data.set(line.subarray(row - shift), y * row)
    data.set(line.subarray(0, row - shift), y * row + shift)
  }
  hdr.needsUpdate = true
}

function Sky() {
  const hdr = useLoader(HDRLoader, skyUrl)
  const { gl, scene } = useThree()
  const env = useMemo(() => {
    alignSky(hdr)
    const pmrem = new THREE.PMREMGenerator(gl)
    const target = pmrem.fromEquirectangular(hdr)
    pmrem.dispose()
    return target.texture
  }, [gl, hdr])
  hdr.mapping = THREE.EquirectangularReflectionMapping
  return (
    <>
      <primitive object={hdr} attach="background" />
      <primitive object={env} attach="environment" />
      <SkyLevels scene={scene} />
    </>
  )
}

function SkyLevels({ scene }: { scene: THREE.Scene }) {
  useEffect(() => {
    scene.environmentIntensity = 0.95
    scene.backgroundIntensity = 1.4
  }, [scene])
  return null
}

/** Sunlight whose shadow area follows the car. */
function Sun({ car, state, quality }: { car: RefObject<THREE.Group | null>; state: RefObject<CarState>; quality: Quality }) {
  const gl = useThree((s) => s.gl)
  const frame = useRef(0)
  const light = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  const size = quality === 'high' ? 2048 : 1024
  useFrame(() => {
    const l = light.current
    const c = car.current
    if (!l || !c) return
    // The shadows are drawn again on every frame only while the car drives; a parked street hardly changes.
    const n = frame.current++
    const moving = Math.abs(state.current.speed) > 0.2
    const every = quality === 'high' ? (moving ? 1 : 2) : quality === 'medium' ? (moving ? 1 : 4) : moving ? 2 : 24
    gl.shadowMap.autoUpdate = false
    if (n < 30 || n % every === 0) gl.shadowMap.needsUpdate = true
    // Steps of a few meters keep the shadow edges from swimming.
    const x = Math.round((c.position.x + Math.sin(-c.rotation.y) * 26) / 4) * 4
    const z = Math.round((c.position.z - Math.cos(c.rotation.y) * 26) / 4) * 4
    target.position.set(x, 0, z)
    l.position.set(x + SUN.x * 160, SUN.y * 160, z + SUN.z * 160)
    target.updateMatrixWorld()
  })
  return (
    <>
      <directionalLight
        ref={light}
        target={target}
        color="#fff1da"
        intensity={3.9}
        castShadow
        shadow-mapSize={[size, size]}
        shadow-camera-left={-75}
        shadow-camera-right={75}
        shadow-camera-top={75}
        shadow-camera-bottom={-75}
        shadow-camera-near={20}
        shadow-camera-far={340}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
      />
      <primitive object={target} />
    </>
  )
}

// ---------- The drive ----------

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

type DriveProps = {
  layout: CityLayout
  from: number
  to: number
  leaving: boolean
  reducedMotion: boolean
  car: RefObject<THREE.Group | null>
  state: RefObject<CarState>
  onArrive: () => void
  onLeft: () => void
  onPark: (parked: boolean) => void
}

/** Moves the car: first from the last mission to the current one, and then into the marker when the customer goes. */
function Drive({ layout, from, to, leaving, reducedMotion, car, state, onArrive, onLeft, onPark }: DriveProps) {
  const clock = useRef({ start: -1, left: -1, arrived: false, done: false })
  const distance = Math.abs(to - from)
  const seconds = reducedMotion || distance < 1 ? 0 : Math.min(10, 2.6 + distance / 30)

  useFrame(({ clock: c }, delta) => {
    const s = state.current
    const t = c.elapsedTime
    const k = clock.current
    if (k.start < 0) k.start = t
    const before = s.distance
    if (leaving && k.arrived) {
      if (k.left < 0) {
        k.left = t
        onPark(false)
      }
      const p = Math.min(1, (t - k.left) / (reducedMotion ? 0.05 : 1.5))
      s.distance = to + p * p * 17
      s.braking = p > 0.82
      if (p >= 1 && !k.done) {
        k.done = true
        onLeft()
      }
    } else {
      const p = seconds === 0 ? 1 : Math.min(1, (t - k.start - 0.8) / seconds)
      s.distance = from + (to - from) * ease(Math.max(0, p))
      s.braking = p > 0.72 && p < 1
      if (p >= 1 && !k.arrived) {
        k.arrived = true
        s.braking = false
        onPark(true)
        onArrive()
      }
    }
    s.speed = delta > 0 ? (s.distance - before) / delta : 0
    const here = layout.frame(s.distance)
    const ahead = layout.frame(s.distance + 6)
    let turn = ahead.angle - here.angle
    if (turn > Math.PI) turn -= Math.PI * 2
    if (turn < -Math.PI) turn += Math.PI * 2
    s.steer += (THREE.MathUtils.clamp(turn * 5, -1, 1) - s.steer) * Math.min(1, delta * 5)
    const g = car.current
    if (g) {
      g.position.copy(here.position).addScaledVector(here.right, s.offset)
      g.rotation.y = here.angle
    }
  })
  return null
}

// ---------- The camera ----------

function ChaseCamera({ car, state, shift, leaving, reducedMotion }: { car: RefObject<THREE.Group | null>; state: RefObject<CarState>; shift: { x: number; y: number }; leaving: boolean; reducedMotion: boolean }) {
  const { camera, gl, size } = useThree()
  const look = useRef({ yaw: 0, pitch: 0, zoom: 1, yawTo: 0, pitchTo: 0, zoomTo: 1, first: true })
  const focus = useMemo(() => new THREE.Vector3(), [])
  const place = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    // The cards cover a part of the screen; the picture moves so that the car stands in the free part.
    cam.setViewOffset(size.width, size.height, size.width * shift.x, size.height * shift.y, size.width, size.height)
    return () => cam.clearViewOffset()
  }, [camera, size, shift.x, shift.y])

  // The drive to the mission is seen from behind the car.
  useEffect(() => {
    if (leaving) Object.assign(look.current, { yawTo: 0, pitchTo: 0, zoomTo: 1 })
  }, [leaving])

  useEffect(() => {
    const el = gl.domElement
    let drag: { id: number; x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
    }
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return
      const l = look.current
      l.yawTo -= (e.clientX - drag.x) * 0.0052
      l.pitchTo = THREE.MathUtils.clamp(l.pitchTo + (e.clientY - drag.y) * 0.0035, -0.18, 0.85)
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
    }
    const up = () => {
      drag = null
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      look.current.zoomTo = THREE.MathUtils.clamp(look.current.zoomTo * Math.exp(e.deltaY * 0.0011), 0.65, 5)
    }
    const reset = () => Object.assign(look.current, { yawTo: 0, pitchTo: 0, zoomTo: 1 })
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('dblclick', reset)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('dblclick', reset)
    }
  }, [gl])

  useFrame(({ clock }, delta) => {
    const g = car.current
    if (!g) return
    const l = look.current
    const k = l.first ? 1 : Math.min(1, delta * 6)
    l.yaw += (l.yawTo - l.yaw) * k
    l.pitch += (l.pitchTo - l.pitch) * k
    l.zoom += (l.zoomTo - l.zoom) * k
    const speed = Math.max(0, state.current.speed)
    // A hint of life while the car waits.
    const sway = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.35) * 0.02
    const far = (9.3 + Math.min(2.4, speed * 0.08)) * l.zoom
    // Far away the camera also rises, over the roofs, so the picture becomes a view of the city.
    const rise = THREE.MathUtils.smoothstep(l.zoom, 1.1, 3.2)
    const pitch = Math.min(1.25, l.pitch + rise * 1.05)
    const high = 2.5 + l.zoom * 0.4 + Math.sin(pitch) * far
    const flat = far * Math.cos(pitch)
    // Below the roofs the camera stays in the street, between the walls.
    const side = Math.sin(l.yaw + sway) * flat
    const free = ROAD.half + 4 + Math.max(0, high - 34) * 2.5
    const squeezed = THREE.MathUtils.clamp(side, -free - state.current.offset, free - state.current.offset)
    const back = Math.cos(l.yaw + sway) * flat
    const turn = g.rotation.y
    place.set(g.position.x + Math.sin(turn) * back + Math.cos(turn) * squeezed, high, g.position.z + Math.cos(turn) * back - Math.sin(turn) * squeezed)
    const ahead = 9 * Math.max(0, Math.cos(l.yaw)) * (l.zoom > 1.6 ? 1.6 / l.zoom : 1)
    focus.set(g.position.x - Math.sin(g.rotation.y) * ahead, 1.9, g.position.z - Math.cos(g.rotation.y) * ahead)
    if (l.first) camera.position.copy(place)
    else camera.position.lerp(place, Math.min(1, delta * 7))
    camera.lookAt(focus)
    l.first = false
  })
  return null
}

/** Lowers the quality when the pictures come too slowly. */
function Governor({ quality, onQuality }: { quality: Quality; onQuality: (q: Quality) => void }) {
  const frames = useRef<number[]>([])
  useFrame((_, delta) => {
    const list = frames.current
    list.push(delta)
    if (list.length < 90) return
    const slow = list.sort((a, b) => a - b)[Math.floor(list.length * 0.6)]!
    frames.current = []
    // Background tabs report long frames; those say nothing about the device.
    if (document.hidden || slow > 0.4) return
    if (slow > 1 / 30 && quality === 'high') onQuality('medium')
    else if (slow > 1 / 24 && quality === 'medium') onQuality('low')
  })
  return null
}

function Ready({ onReady }: { onReady: () => void }) {
  const count = useRef(0)
  useFrame(() => {
    count.current += 1
    if (count.current === 3) onReady()
  })
  return null
}

function Effects({ quality }: { quality: Quality }) {
  if (quality === 'low') return null
  return quality === 'high' ? (
    <EffectComposer multisampling={0}>
      <N8AO halfRes aoRadius={2} intensity={1.7} distanceFalloff={1} quality="performance" />
      <Bloom luminanceThreshold={2.2} luminanceSmoothing={0.4} intensity={0.22} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <HueSaturation saturation={-0.06} />
      <Vignette offset={0.3} darkness={0.35} />
      <SMAA />
    </EffectComposer>
  ) : (
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={2.2} luminanceSmoothing={0.4} intensity={0.2} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <HueSaturation saturation={-0.06} />
      <SMAA />
    </EffectComposer>
  )
}

const DPR: Record<Quality, [number, number]> = { high: [1, 1.5], medium: [1, 1.15], low: [0.75, 1] }

function World(props: CitySceneProps) {
  const { districts, missions, playerAt, driveFrom, playerLook, hosts, reducedMotion, quality } = props
  const layout = useMemo(() => layoutCity(districts, missions), [districts, missions])
  const car = useRef<THREE.Group>(null)
  const parkedAt = parkingFor(layout, playerAt)
  const from = Math.min(parkedAt, parkingFor(layout, driveFrom))
  const state = useRef<CarState>({ distance: from, offset: ROAD.lane, speed: 0, steer: 0, braking: false })
  const [parked, setParked] = useState(false)
  const target = layout.missionAt[playerAt] ?? layout.finishAt
  // The street furniture behind the drive and far ahead is never seen.
  const range = useMemo<[number, number]>(() => [from - 120, parkedAt + 520], [from, parkedAt])
  const host = hosts[playerAt % Math.max(1, hosts.length)]
  const here = layout.frame(target)
  const beside = layout.frame(parkedAt)

  return (
    <>
      <Sky />
      <fog attach="fog" args={['#bcd3e6', 190, 900]} />
      <hemisphereLight args={['#dfeeff', '#c9baa0', 0.75]} />
      <Sun car={car} state={state} quality={quality} />
      <Street layout={layout} />
      <Buildings layout={layout} />
      <StreetLife layout={layout} range={range} />
      <Traffic layout={layout} avoid={parkedAt} range={range} />
      <Missions layout={layout} districts={districts} missions={missions} playerAt={playerAt} parkedAt={parkedAt} onSelect={props.onSelectMission} />
      <PlayerCar state={state} root={car} />
      <>
        {/* One of the hosts waits at the mission; the player stands by the car until they drive. */}
        {host && (
          <group position={layout.point(target + 2.6, ROAD.half + 0.9, 0.1)} rotation={[0, here.angle + 0.35, 0]} scale={0.7}>
            <SoftCharacter look={host.look} pose="wave" reducedMotion={reducedMotion} />
          </group>
        )}
        {parked && (
          <group position={layout.point(parkedAt + 1.6, ROAD.half + 1.1, 0.1)} rotation={[0, beside.angle + 0.35, 0]} scale={0.66}>
            <SoftCharacter look={playerLook} pose="idle" reducedMotion={reducedMotion} />
          </group>
        )}
      </>
      <Drive layout={layout} from={from} to={parkedAt} leaving={props.leaving} reducedMotion={reducedMotion} car={car} state={state} onArrive={props.onArrive} onLeft={props.onLeft} onPark={setParked} />
      <ChaseCamera car={car} state={state} shift={props.shift} leaving={props.leaving} reducedMotion={reducedMotion} />
      <Governor key={quality} quality={quality} onQuality={props.onQuality} />
      <Ready onReady={props.onReady} />
      <Effects quality={quality} />
    </>
  )
}

export default function CityScene(props: CitySceneProps) {
  const low = props.quality === 'low'
  return (
    <Canvas
      dpr={DPR[props.quality]}
      shadows={low ? 'basic' : 'soft'}
      camera={{ fov: 46, near: 0.3, far: 1600, position: [0, 6, 20] }}
      gl={{ antialias: low, powerPreference: 'high-performance', toneMapping: low ? THREE.NeutralToneMapping : THREE.NoToneMapping, toneMappingExposure: 1 }}
    >
      <Suspense fallback={null}>
        <World {...props} />
      </Suspense>
    </Canvas>
  )
}
