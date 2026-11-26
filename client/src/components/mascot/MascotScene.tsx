import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { Look } from '../../lib/types'
import { Person } from '../person/Person'
import type { MascotPose } from './pose'

// A small canvas with one person (or a few side by side), lit like a photo studio. Loaded lazily, see Mascot.tsx.

export type CastMember = { look: Look; pose: MascotPose; hopKey?: number; base?: boolean }

/** full = head to toe; bust = from the thighs up, like a game character card. */
export type Framing = 'full' | 'bust'

export type MascotSceneProps = { cast: CastMember[]; reducedMotion: boolean; framing?: Framing }

/** Horizontal spacing between people in one scene, in meters. */
const GAP = 0.95
const HEIGHT = 1.84

/** Soft light from a virtual room, for the reflections in skin, cloth, glass and gold. */
function Studio() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    scene.environment = env
    scene.environmentIntensity = 0.7
    pmrem.dispose()
    room.dispose()
    return () => {
      scene.environment = null
      env.dispose()
    }
  }, [gl, scene])
  return null
}

/** Places the camera so that the people fill the canvas, whatever its shape. */
function Camera({ count, framing, lift }: { count: number; framing: Framing; lift: number }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const top = HEIGHT + lift + 0.04
    const bottom = framing === 'full' ? -0.04 : 0.8 + lift
    const width = (count - 1) * GAP + (framing === 'full' ? 0.7 : 0.62)
    const half = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    const aspect = size.width / Math.max(1, size.height)
    const distance = Math.max(((top - bottom) * 1.06) / 2 / half, (width * 1.1) / 2 / (half * aspect))
    const middle = (top + bottom) / 2
    cam.position.set(0, middle + distance * 0.05, distance)
    cam.lookAt(0, middle, 0)
    cam.near = 0.1
    cam.far = distance + 10
    cam.updateProjectionMatrix()
  }, [camera, size, count, framing, lift])
  return null
}

export default function MascotScene({ cast, reducedMotion, framing }: MascotSceneProps) {
  const wide = cast.length > 1
  const anyBase = cast.some((m) => m.base)
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 1.2, 5], fov: 26 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping
        gl.toneMappingExposure = 1.05
      }}
      aria-hidden="true"
    >
      <Studio />
      <Camera count={cast.length} framing={framing ?? 'full'} lift={anyBase ? 0.058 : 0} />
      <hemisphereLight args={['#f4efe6', '#3a3430', 0.55]} />
      {/* A warm key light from the front side, and a cool rim light that draws the outline from behind. */}
      <directionalLight position={[1.6, 3, 2.6]} intensity={2.1} color="#fff3e4" />
      <directionalLight position={[-2.2, 2.4, -2.6]} intensity={1.6} color="#cfe0ff" />
      <Suspense fallback={null}>
        {cast.map((member, i) => {
          const x = (i - (cast.length - 1) / 2) * GAP
          return (
            // People on the sides turn a little toward the middle.
            <group key={i} position={[x, 0, 0]} rotation={[0, wide ? -x * 0.22 : 0, 0]}>
              <Person look={member.look} pose={member.pose} hopKey={member.hopKey} base={member.base} groundShadow reducedMotion={reducedMotion} />
            </group>
          )
        })}
      </Suspense>
    </Canvas>
  )
}
