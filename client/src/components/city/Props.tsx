import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { simpleCar } from './carModel'
import { ROAD, seeded, type CityLayout } from './layout'
import { cityMaterials } from './materials'
import { CROSS_HALF } from './Street'

// Life on the street: palms, trees, lamps, traffic lights, benches, parked cars and traffic. All instanced.

type Placement = { position: THREE.Vector3; rotation: number; scale: number }

/** One geometry at many places. */
function Instances({ geometry, material, places, castShadow = true, receiveShadow = false }: { geometry: THREE.BufferGeometry; material: THREE.Material; places: Placement[]; castShadow?: boolean; receiveShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    places.forEach((p, i) => {
      dummy.position.copy(p.position)
      dummy.rotation.set(0, p.rotation, 0)
      dummy.scale.setScalar(p.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [places])
  return <instancedMesh ref={ref} args={[geometry, material, Math.max(1, places.length)]} castShadow={castShadow} receiveShadow={receiveShadow} frustumCulled={false} />
}

const strip = (g: THREE.BufferGeometry) => {
  const c = g.index ? g.toNonIndexed() : g
  for (const name of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(name)) c.deleteAttribute(name)
  return c
}

function palmParts() {
  const random = seeded(404)
  const HEIGHT = 8.4
  // A slightly leaning trunk, thicker at the foot.
  const path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.12, HEIGHT * 0.4, 0.05), new THREE.Vector3(0.36, HEIGHT * 0.78, 0.1), new THREE.Vector3(0.5, HEIGHT, 0.12)])
  const trunk = new THREE.TubeGeometry(path, 14, 0.15, 9)
  const pos = trunk.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / HEIGHT
    const c = path.getPointAt(Math.min(1, Math.max(0, t)))
    const k = 1.35 - t * 0.5 + (Math.sin(t * 90) > 0 ? 0.05 : 0) + (t > 0.93 ? 0.35 : 0)
    pos.setX(i, c.x + (pos.getX(i) - c.x) * k)
    pos.setZ(i, c.z + (pos.getZ(i) - c.z) * k)
  }
  trunk.computeVertexNormals()
  // Fronds: long bent cards in three rings.
  const fronds: THREE.BufferGeometry[] = []
  const COUNT = 26
  for (let i = 0; i < COUNT; i++) {
    const ringIndex = i % 3
    const length = 3.3 + random() * 0.7
    const g = new THREE.PlaneGeometry(length, 1.15, 7, 1)
    g.translate(length / 2, 0, 0)
    g.rotateX(-Math.PI / 2 + (random() - 0.5) * 0.5)
    const p = g.attributes.position as THREE.BufferAttribute
    const lift = [0.95, 0.42, -0.1][ringIndex]! + (random() - 0.5) * 0.25
    const droop = [0.17, 0.2, 0.24][ringIndex]!
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k)
      p.setY(k, p.getY(k) + x * lift - x * x * droop)
      p.setX(k, x * (0.9 - Math.abs(lift) * 0.12))
      // A fold along the spine gives each leaf two sides of light.
      p.setY(k, p.getY(k) - Math.abs(p.getZ(k)) * 0.35)
    }
    g.computeVertexNormals()
    g.rotateY((i / COUNT) * Math.PI * 2 * 2.618)
    g.translate(0.5, HEIGHT, 0.12)
    fronds.push(g)
  }
  return { trunk: strip(trunk), crown: mergeGeometries(fronds.map(strip))! }
}

function treeParts() {
  const random = seeded(808)
  const trunk = new THREE.CylinderGeometry(0.13, 0.22, 2.6, 8).translate(0, 1.3, 0)
  const cards: THREE.BufferGeometry[] = []
  for (let i = 0; i < 26; i++) {
    const size = 1.7 + random() * 1.1
    const a = random() * Math.PI * 2
    const r = Math.sqrt(random()) * 1.55
    const g = new THREE.PlaneGeometry(size, size)
    g.rotateY(random() * Math.PI)
    g.rotateX((random() - 0.5) * 1.5)
    g.translate(Math.cos(a) * r, 3.4 + (random() - 0.35) * 1.8, Math.sin(a) * r)
    // Normals from the middle of the crown, so it is lit like a round mass.
    const p = g.attributes.position as THREE.BufferAttribute
    const n = g.attributes.normal as THREE.BufferAttribute
    for (let k = 0; k < p.count; k++) {
      const v = new THREE.Vector3(p.getX(k), p.getY(k) - 3.2, p.getZ(k)).normalize()
      n.setXYZ(k, v.x, v.y, v.z)
    }
    cards.push(g)
  }
  return { trunk: strip(trunk), crown: mergeGeometries(cards.map(strip))! }
}

function lampParts() {
  const pole = new THREE.CylinderGeometry(0.06, 0.1, 7.6, 8).translate(0, 3.8, 0)
  const arm = new THREE.CylinderGeometry(0.045, 0.045, 2.2, 6).rotateZ(Math.PI / 2 - 0.12).translate(-1.05, 7.62, 0)
  const base = new THREE.CylinderGeometry(0.17, 0.2, 0.5, 8).translate(0, 0.25, 0)
  return {
    metal: mergeGeometries([pole, arm, base].map(strip))!,
    light: strip(new THREE.BoxGeometry(0.85, 0.07, 0.28).translate(-1.95, 7.68, 0)),
  }
}

function benchParts() {
  return mergeGeometries(
    [
      new THREE.BoxGeometry(0.5, 0.07, 1.9).translate(0, 0.46, 0),
      new THREE.BoxGeometry(0.07, 0.42, 1.9).translate(0.24, 0.72, 0),
      new THREE.BoxGeometry(0.4, 0.44, 0.08).translate(0, 0.22, 0.75),
      new THREE.BoxGeometry(0.4, 0.44, 0.08).translate(0, 0.22, -0.75),
    ].map(strip),
  )!
}

function trafficLightParts() {
  return {
    metal: mergeGeometries(
      [
        new THREE.CylinderGeometry(0.07, 0.09, 5.6, 8).translate(0, 2.8, 0),
        new THREE.CylinderGeometry(0.06, 0.06, 4.6, 6).rotateZ(Math.PI / 2).translate(-2.3, 5.5, 0),
        new THREE.BoxGeometry(0.34, 1.05, 0.3).translate(-4.1, 5.1, 0),
        new THREE.BoxGeometry(0.34, 1.05, 0.3).translate(0, 3.4, 0),
      ].map(strip),
    )!,
    green: mergeGeometries([new THREE.CylinderGeometry(0.11, 0.11, 0.05, 14).rotateX(Math.PI / 2).translate(-4.1, 4.78, 0.16), new THREE.CylinderGeometry(0.11, 0.11, 0.05, 14).rotateX(Math.PI / 2).translate(0, 3.08, 0.16)].map(strip))!,
  }
}

const GREEN = new THREE.MeshStandardMaterial({ color: '#34d27b', emissive: '#22c16a', emissiveIntensity: 1.6 })
const WOOD = new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 0.8 })

/** Places along a part of the avenue. The avenue runs to -Z, so Z is a good measure of the way along it. */
const inRange = ([from, to]: [number, number]) => (p: Placement) => -p.position.z > from && -p.position.z < to

export function StreetLife({ layout, range }: { layout: CityLayout; range: [number, number] }) {
  const m = cityMaterials()
  const parts = useMemo(() => ({ palm: palmParts(), tree: treeParts(), lamp: lampParts(), bench: benchParts(), traffic: trafficLightParts() }), [])
  const places = useMemo(() => {
    const random = seeded(515)
    const free = (d: number, margin: number) => !layout.crossings.some((c) => Math.abs(c - d) < CROSS_HALF + margin)
    const at = (d: number, offset: number, scale = 1, rotation = random() * Math.PI * 2, y = 0.16): Placement => ({ position: layout.point(d, offset, y), rotation, scale })
    const from = -60
    const to = layout.length + 120
    const palms: Placement[] = []
    const trees: Placement[] = []
    const lamps: Placement[] = []
    const benches: Placement[] = []
    const lights: Placement[] = []
    // The gate of a closed district stands on the median; palms keep away from it.
    const gates = layout.spans.map((s) => s.from + 4)
    for (let d = from; d < to; d += 15) if (free(d, 7) && !gates.some((g) => d > g - 24 && d < g + 3)) palms.push(at(d, 0, 0.92 + random() * 0.32))
    for (const side of [-1, 1]) {
      for (let d = from + (side > 0 ? 5 : 12); d < to; d += 17) {
        if (!free(d, 4)) continue
        // Keep the view to the mission signs open.
        if (side > 0 && layout.missionAt.some((a) => d > a - 26 && d < a + 5)) continue
        if (Math.round(d / 17) % 2 === 0) palms.push(at(d, side * (ROAD.half + 1.5), 0.78 + random() * 0.28))
        else trees.push(at(d, side * (ROAD.half + 1.7), 0.9 + random() * 0.35))
      }
      for (let d = from + 9; d < to; d += 34) {
        if (!free(d, 3)) continue
        const f = layout.frame(d)
        lamps.push({ position: layout.point(d, side * (ROAD.half + 0.7), 0.16), rotation: f.angle + (side > 0 ? 0 : Math.PI), scale: 1 })
        benches.push({ position: layout.point(d + 8, side * (ROAD.half + 3.4), 0.16), rotation: f.angle + (side > 0 ? 0 : Math.PI), scale: 1 })
      }
    }
    for (const c of layout.crossings) {
      const before = layout.frame(c - CROSS_HALF - 1)
      lights.push({ position: layout.point(c - CROSS_HALF - 1, ROAD.half + 0.6, 0.16), rotation: before.angle, scale: 1 })
      const after = layout.frame(c + CROSS_HALF + 1)
      lights.push({ position: layout.point(c + CROSS_HALF + 1, -ROAD.half - 0.6, 0.16), rotation: after.angle + Math.PI, scale: 1 })
    }
    const near = inRange(range)
    return { palms: palms.filter(near), trees: trees.filter(near), lamps: lamps.filter(near), benches: benches.filter(near), lights: lights.filter(near) }
  }, [layout, range])
  return (
    <>
      <Instances geometry={parts.palm.trunk} material={m.trunk} places={places.palms} />
      <Instances geometry={parts.palm.crown} material={m.palm} places={places.palms} />
      <Instances geometry={parts.tree.trunk} material={m.bark} places={places.trees} />
      <Instances geometry={parts.tree.crown} material={m.leaves} places={places.trees} />
      <Instances geometry={parts.lamp.metal} material={m.metal} places={places.lamps} />
      <Instances geometry={parts.lamp.light} material={m.lamp} places={places.lamps} castShadow={false} />
      <Instances geometry={parts.bench} material={WOOD} places={places.benches} />
      <Instances geometry={parts.traffic.metal} material={m.metal} places={places.lights} />
      <Instances geometry={parts.traffic.green} material={GREEN} places={places.lights} castShadow={false} />
    </>
  )
}

// ---------- Other cars ----------

const PAINTS = ['#d8dadd', '#2b2f35', '#8c9298', '#7b2028', '#24405e', '#e9e6df', '#3d4a3f', '#b08a4a']

type Moving = { lane: number; direction: 1 | -1; speed: number; start: number; paint: number }

/** Traffic that flows past, and parked cars along the curb. */
export function Traffic({ layout, avoid, range }: { layout: CityLayout; avoid: number; range: [number, number] }) {
  const geometry = useMemo(() => simpleCar(), [])
  const materials = useMemo(
    () => ({
      paint: new THREE.MeshPhysicalMaterial({ roughness: 0.32, metalness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
      glass: new THREE.MeshStandardMaterial({ color: '#0b0f14', roughness: 0.06, metalness: 0.5, envMapIntensity: 1.6 }),
      dark: new THREE.MeshStandardMaterial({ color: '#0e1013', roughness: 0.8 }),
      tail: new THREE.MeshStandardMaterial({ color: '#4a0808', emissive: '#ff2a1f', emissiveIntensity: 1.1 }),
      head: new THREE.MeshStandardMaterial({ color: '#f4f6fa', emissive: '#ffffff', emissiveIntensity: 0.8 }),
    }),
    [],
  )
  const { parked, moving } = useMemo(() => {
    const random = seeded(99)
    const parked: (Placement & { paint: number })[] = []
    for (const side of [1, -1] as const) {
      for (let d = -40; d < layout.length + 100; d += 8.5) {
        const nearCross = layout.crossings.some((c) => Math.abs(c - d) < CROSS_HALF + 9)
        const nearMission = layout.missionAt.some((a) => d > a - 34 && d < a + 9) && side === 1
        if (nearCross || nearMission || random() > 0.4) continue
        const f = layout.frame(d)
        // The parking strip along the curb; on the left the cars face the other way.
        parked.push({ position: layout.point(d, side * (ROAD.half - 1.15), 0), rotation: f.angle + (side > 0 ? 0 : Math.PI), scale: 0.98 + random() * 0.06, paint: Math.floor(random() * PAINTS.length) })
      }
    }
    const moving: Moving[] = Array.from({ length: 16 }, (_, i) => ({
      lane: i % 2 === 0 ? -ROAD.innerLane : i % 4 === 1 ? ROAD.innerLane : -ROAD.lane + 0.6,
      direction: i % 2 === 0 || i % 4 !== 1 ? -1 : 1,
      speed: 9 + random() * 4,
      start: random() * layout.length,
      paint: Math.floor(random() * PAINTS.length),
    }))
    return { parked: parked.filter(inRange(range)), moving }
  }, [layout, range])

  const total = parked.length + moving.length
  const refs = useRef<(THREE.InstancedMesh | null)[]>([])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    const c = new THREE.Color()
    for (const mesh of refs.current) {
      if (!mesh) continue
      parked.forEach((p, i) => {
        dummy.position.copy(p.position)
        dummy.rotation.set(0, p.rotation, 0)
        dummy.scale.setScalar(p.scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
    }
    const paint = refs.current[0]
    if (paint) {
      ;[...parked, ...moving].forEach((p, i) => paint.setColorAt(i, c.set(PAINTS[p.paint]!)))
      if (paint.instanceColor) paint.instanceColor.needsUpdate = true
    }
  }, [parked, moving, dummy])

  useFrame(({ clock }) => {
    const span = layout.length + 120
    moving.forEach((car, i) => {
      const d = ((((car.start + car.direction * car.speed * clock.elapsedTime) % span) + span) % span) - 40
      const f = layout.frame(d)
      // Cars of the player's direction keep away from where the player stands.
      const hide = car.direction === 1 && Math.abs(d - avoid) < 7
      dummy.position.copy(f.position).addScaledVector(f.right, car.lane).setY(hide ? -20 : 0)
      dummy.rotation.set(0, f.angle + (car.direction === 1 ? 0 : Math.PI), 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      for (const mesh of refs.current) mesh?.setMatrixAt(parked.length + i, dummy.matrix)
    })
    for (const mesh of refs.current) if (mesh) mesh.instanceMatrix.needsUpdate = true
  })

  const layers = [
    [geometry.paint, materials.paint],
    [geometry.glass, materials.glass],
    [geometry.dark, materials.dark],
    [geometry.tail, materials.tail],
    [geometry.head, materials.head],
  ] as const
  return (
    <>
      {layers.map(([g, material], i) => (
        <instancedMesh
          key={i}
          ref={(mesh) => {
            refs.current[i] = mesh
          }}
          args={[g, material, total]}
          castShadow={i === 0}
          frustumCulled={false}
        />
      ))}
    </>
  )
}
