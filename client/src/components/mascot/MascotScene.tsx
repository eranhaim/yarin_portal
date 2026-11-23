import { Canvas } from '@react-three/fiber'
import type { Look } from '../../lib/types'
import { Character } from './Character'
import type { MascotPose } from './pose'

// A small canvas with one character (or a few side by side). Loaded lazily, see Mascot.tsx.

export type CastMember = { look: Look; pose: MascotPose; hopKey?: number; base?: boolean }

export type MascotSceneProps = { cast: CastMember[]; reducedMotion: boolean }

/** Horizontal spacing between characters in one scene. */
const GAP = 1.7

export default function MascotScene({ cast, reducedMotion }: MascotSceneProps) {
  const wide = cast.length > 1
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 1.5, wide ? 5.6 + cast.length * 1.4 : 6.4], fov: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      onCreated={({ camera }) => camera.lookAt(0, 1.25, 0)}
      aria-hidden="true"
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} />
      {cast.map((member, i) => {
        const x = (i - (cast.length - 1) / 2) * GAP
        return (
          // Characters on the sides turn a little toward the middle.
          <group key={i} position={[x, 0, 0]} rotation={[0, wide ? -x * 0.12 : 0, 0]}>
            <Character look={member.look} pose={member.pose} hopKey={member.hopKey} base={member.base} reducedMotion={reducedMotion} />
          </group>
        )
      })}
    </Canvas>
  )
}
