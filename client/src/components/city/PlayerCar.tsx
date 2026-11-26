import { useFrame, useLoader } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MODELS_VERSION } from '../person/people'

// The player's car: a detailed concept car (public/car/car.glb, see public/car/LICENSE.md). The scene moves it along
// the avenue; the wheels turn and steer, the body leans, and the brake lights glow when it stops.

export type CarState = { distance: number; offset: number; speed: number; steer: number; braking: boolean }

export const CAR_URL = `/car/car.glb?v=${MODELS_VERSION}`
export const TRAFFIC_CAR_URL = `/car/car-lod.glb?v=${MODELS_VERSION}`

export const withMeshopt = (loader: THREE.Loader) => {
  ;(loader as GLTFLoader).setMeshoptDecoder(MeshoptDecoder)
}

function plateTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#f2c230'
  ctx.fillRect(0, 0, 512, 128)
  ctx.fillStyle = '#2a4fa0'
  ctx.fillRect(0, 0, 54, 128)
  ctx.strokeStyle = '#16130a'
  ctx.lineWidth = 6
  ctx.strokeRect(3, 3, 506, 122)
  ctx.fillStyle = '#16130a'
  ctx.font = '700 84px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('10·000·10', 284, 70)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.flipY = false
  t.anisotropy = 4
  return t
}

type Wheel = { steer: THREE.Object3D; spin: THREE.Object3D; front: boolean }
type CarRig = { car: THREE.Group; body: THREE.Group; wheels: Wheel[]; radius: number; brake: THREE.MeshStandardMaterial[]; dispose: () => void }

/**
 * Turns the model so that it drives toward -Z with its wheels on y = 0, the origin halfway between the axles,
 * and puts every wheel on its own pivots (steering, then spinning).
 */
function buildCar(gltf: GLTF): CarRig {
  // A copy: the wheels move to their own pivots, and the cached model must stay whole.
  const model = gltf.scene.clone(true)
  const at = (name: string) => {
    const node = model.getObjectByName(name)
    return node ? new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()) : null
  }
  model.updateMatrixWorld(true)
  const names = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR']
  const [fl, fr, rl, rr] = names.map(at)
  const front = fl && fr ? fl.clone().add(fr).multiplyScalar(0.5) : new THREE.Vector3(0, 0, -1)
  const rear = rl && rr ? rl.clone().add(rr).multiplyScalar(0.5) : new THREE.Vector3(0, 0, 1)
  const forward = front.clone().sub(rear).setY(0).normalize()

  const car = new THREE.Group()
  const body = new THREE.Group()
  const oriented = new THREE.Group()
  car.add(body)
  body.add(oriented)
  oriented.add(model)
  oriented.rotation.y = Math.atan2(forward.x, forward.z) + Math.PI
  oriented.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const middle = front.clone().add(rear).multiplyScalar(0.5).applyMatrix4(oriented.matrixWorld)
  oriented.position.set(-middle.x, -box.min.y, -middle.z)
  car.updateMatrixWorld(true)

  // Wheels: steering pivot (around Y), then the spin (around the axle, X).
  const wheels: Wheel[] = []
  let radius = 0.36
  for (const name of names) {
    const node = model.getObjectByName(name)
    if (!node) continue
    const wheelBox = new THREE.Box3().setFromObject(node)
    const center = wheelBox.getCenter(new THREE.Vector3())
    radius = (wheelBox.max.y - wheelBox.min.y) / 2
    const steer = new THREE.Group()
    steer.position.copy(center)
    const spin = new THREE.Group()
    steer.add(spin)
    car.add(steer)
    car.updateMatrixWorld(true)
    spin.attach(node)
    wheels.push({ steer, spin, front: name.startsWith('WheelFront') })
  }

  const brake: THREE.MeshStandardMaterial[] = []
  const owned: THREE.Material[] = []
  const plate = plateTexture()
  car.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const material = mesh.material as THREE.MeshStandardMaterial
    // Only the outside casts a shadow; the glass, the inside and the small parts do not.
    const solid = !material.transparent
    mesh.castShadow = solid && !/^(Interior|Hardware|Dashboard|Mirror|License|Signallight|Brakelight|Headlight|Rim2|Disc)/.test(material.name)
    mesh.receiveShadow = solid
    if (material.name === 'Brakelight') {
      material.emissive.set('#ff1a14')
      material.emissiveIntensity = 1.6
      brake.push(material)
    } else if (material.name === 'Headlight') {
      material.emissive.set('#eef5ff')
      material.emissiveIntensity = 1.8
    } else if (material.name === 'License') {
      const old = material.map
      if (old) {
        plate.offset.copy(old.offset)
        plate.repeat.copy(old.repeat)
        plate.rotation = old.rotation
        plate.center.copy(old.center)
      }
      material.map = plate
      material.color.set('#ffffff')
      material.needsUpdate = true
      owned.push(material)
    } else if (/^Paint/.test(material.name)) {
      material.envMapIntensity = 1.2
    }
  })
  return {
    car,
    body,
    wheels,
    radius,
    brake,
    dispose: () => {
      plate.dispose()
      for (const m of owned) m.dispose()
    },
  }
}

type Props = { state: RefObject<CarState>; root: RefObject<THREE.Group | null> }

export function PlayerCar({ state, root }: Props) {
  const gltf = useLoader(GLTFLoader, CAR_URL, withMeshopt)
  const rig = useMemo(() => buildCar(gltf), [gltf])
  const spin = useRef(0)
  useEffect(() => rig.dispose, [rig])

  useFrame((_, delta) => {
    const s = state.current
    if (!s) return
    spin.current -= (s.speed * delta) / rig.radius
    for (const w of rig.wheels) {
      w.spin.rotation.x = spin.current
      // The front wheels steer.
      if (w.front) w.steer.rotation.y = s.steer * 0.42
    }
    // The body leans a little into curves and dips when braking.
    const body = rig.body
    const pitch = s.braking ? 0.012 : -Math.min(0.01, Math.max(0, s.speed) * 0.0005)
    body.rotation.x += (pitch - body.rotation.x) * Math.min(1, delta * 4)
    body.rotation.z += (s.steer * 0.035 - body.rotation.z) * Math.min(1, delta * 4)
    for (const m of rig.brake) m.emissiveIntensity += ((s.braking ? 5 : 1.6) - m.emissiveIntensity) * Math.min(1, delta * 8)
  })

  return (
    <group ref={root}>
      <primitive object={rig.car} />
    </group>
  )
}
