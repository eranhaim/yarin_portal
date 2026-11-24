import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { carModel } from './carModel'

// The player's car. The scene moves it along the avenue; the wheels and the body react to the speed.

export type CarState = { distance: number; offset: number; speed: number; steer: number; braking: boolean }

function plateTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 56
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f2c230'
  ctx.fillRect(0, 0, 256, 56)
  ctx.fillStyle = '#2a4fa0'
  ctx.fillRect(0, 0, 26, 56)
  ctx.fillStyle = '#16130a'
  ctx.font = '700 40px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('10 · 000 · 10', 142, 31)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

type Props = { state: RefObject<CarState>; root: RefObject<THREE.Group | null>; color?: string }

export function PlayerCar({ state, root, color = '#122231' }: Props) {
  const model = carModel()
  const body = useRef<THREE.Group>(null)
  const wheels = useRef<(THREE.Group | null)[]>([])
  const spin = useRef(0)
  const materials = useMemo(
    () => ({
      paint: new THREE.MeshPhysicalMaterial({ color, metalness: 0.35, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.15 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#07090c', metalness: 0.2, roughness: 0.06, envMapIntensity: 1 }),
      dark: new THREE.MeshStandardMaterial({ color: '#0b0c0e', roughness: 0.62 }),
      arch: new THREE.MeshStandardMaterial({ color: '#050506', roughness: 1 }),
      tire: new THREE.MeshStandardMaterial({ color: '#131416', roughness: 0.9 }),
      disc: new THREE.MeshStandardMaterial({ color: '#2a2d31', roughness: 0.5, metalness: 0.6 }),
      rim: new THREE.MeshStandardMaterial({ color: '#b9bec5', roughness: 0.25, metalness: 0.95 }),
      tail: new THREE.MeshStandardMaterial({ color: '#50060a', emissive: '#ff1d1d', emissiveIntensity: 2.2 }),
      head: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#eaf3ff', emissiveIntensity: 2 }),
      plate: new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.5 }),
    }),
    [color],
  )

  useFrame((_, delta) => {
    const s = state.current
    if (!s || !body.current) return
    spin.current -= (s.speed * delta) / 0.35
    wheels.current.forEach((w, i) => {
      if (!w) return
      w.rotation.x = spin.current
      // The front wheels steer.
      if (i < 2 && w.parent) w.parent.rotation.y = s.steer * 0.45
    })
    // The body leans a little into curves and dips when braking.
    const pitch = s.braking ? 0.016 : -Math.min(0.014, Math.max(0, s.speed) * 0.0006)
    body.current.rotation.x += (pitch - body.current.rotation.x) * Math.min(1, delta * 4)
    body.current.rotation.z += (s.steer * 0.05 - body.current.rotation.z) * Math.min(1, delta * 4)
    const tail = materials.tail
    tail.emissiveIntensity += ((s.braking ? 4.2 : 1.9) - tail.emissiveIntensity) * Math.min(1, delta * 8)
  })

  return (
    <group ref={root}>
      <group ref={body}>
        <mesh geometry={model.body} material={materials.paint} castShadow receiveShadow />
        <mesh geometry={model.cabin} material={materials.glass} castShadow />
        <mesh geometry={model.roof} material={materials.paint} />
        <mesh geometry={model.dark} material={materials.dark} />
        <mesh geometry={model.tail} material={materials.tail} />
        <mesh geometry={model.head} material={materials.head} />
        <mesh geometry={model.plate} material={materials.plate} />
        <mesh geometry={model.arches} material={materials.arch} />
      </group>
      {model.wheels.map(([x, z], i) => (
        <group key={i} position={[x * 1.06, 0.35, z]}>
          <group
            ref={(g) => {
              wheels.current[i] = g
            }}
          >
            <mesh geometry={model.tire} material={materials.tire} castShadow />
            <mesh geometry={model.disc} material={materials.disc} />
            <mesh geometry={model.rim} material={materials.rim} />
          </group>
        </group>
      ))}
    </group>
  )
}
