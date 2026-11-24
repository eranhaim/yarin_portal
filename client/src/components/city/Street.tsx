import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildChunk, planBuildings, signAtlas, type Building } from './buildings'
import { ROAD, type CityLayout } from './layout'
import { cityMaterials, type FacadeKey } from './materials'

// The ground and the buildings: the avenue with its median and sidewalks, side streets, the sea, and the street walls.

const STEP = 4

/** A strip along the avenue between two offsets (right is positive). */
function ribbon(layout: CityLayout, from: number, to: number, a: number, b: number, height: number, tile: [number, number]): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  const steps = Math.max(1, Math.ceil((to - from) / STEP))
  for (let i = 0; i <= steps; i++) {
    const d = from + ((to - from) * i) / steps
    const f = layout.frame(d)
    for (const offset of [a, b]) {
      positions.push(f.position.x + f.right.x * offset, height, f.position.z + f.right.z * offset)
      normals.push(0, 1, 0)
      uvs.push(offset / tile[0], d / tile[1])
    }
    if (i < steps) {
      const k = i * 2
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(index)
  return g
}

/** A vertical strip (the face of a curb). */
function wall(layout: CityLayout, from: number, to: number, offset: number, low: number, high: number, towards: number): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  const steps = Math.max(1, Math.ceil((to - from) / STEP))
  for (let i = 0; i <= steps; i++) {
    const d = from + ((to - from) * i) / steps
    const f = layout.frame(d)
    for (const y of [low, high]) {
      positions.push(f.position.x + f.right.x * offset, y, f.position.z + f.right.z * offset)
      normals.push(f.right.x * towards, 0, f.right.z * towards)
      uvs.push(d, y)
    }
    if (i < steps) {
      const k = i * 2
      if (towards < 0) index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
      else index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(index)
  return g
}

/** A flat rectangle at a place of the avenue: w across it, l along it. */
function pad(layout: CityLayout, at: number, offset: number, w: number, l: number, y: number, tile = 1): THREE.BufferGeometry {
  const f = layout.frame(at)
  const g = new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2)
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * l) / tile)
  g.rotateY(f.angle)
  g.translate(f.position.x + f.right.x * offset, y, f.position.z + f.right.z * offset)
  return g
}

const CURB = 0.16
/** Half of the opening that a side street needs in the sidewalks. */
export const CROSS_HALF = 6.5

function streetGeometry(layout: CityLayout) {
  const from = -75
  const to = layout.length + 200
  const parts = {
    road: [ribbon(layout, from, to, -ROAD.half, ROAD.half, 0, [5, 5])] as THREE.BufferGeometry[],
    sidewalk: [] as THREE.BufferGeometry[],
    curb: [] as THREE.BufferGeometry[],
    paint: [] as THREE.BufferGeometry[],
    yellow: [] as THREE.BufferGeometry[],
    grass: [] as THREE.BufferGeometry[],
  }
  // Pieces of the street between the side streets.
  const stops = [from, ...layout.crossings, to]
  for (let i = 0; i < stops.length - 1; i++) {
    const a = i === 0 ? from : stops[i]! + CROSS_HALF
    const b = i === stops.length - 2 ? to : stops[i + 1]! - CROSS_HALF
    for (const side of [-1, 1]) {
      const inner = side * ROAD.half
      const outer = side * (ROAD.half + ROAD.sidewalk + 4)
      parts.sidewalk.push(ribbon(layout, a, b, Math.min(inner, outer), Math.max(inner, outer), CURB, [3, 3]))
      parts.curb.push(wall(layout, a, b, inner, 0, CURB, -side))
    }
    // The planted median stops before the crossing.
    const ma = a + (i === 0 ? 0 : 5)
    const mb = b - (i === stops.length - 2 ? 0 : 5)
    if (mb - ma > 4) {
      parts.grass.push(ribbon(layout, ma, mb, -ROAD.median + 0.16, ROAD.median - 0.16, CURB + 0.02, [2.5, 2.5]))
      parts.curb.push(ribbon(layout, ma, mb, -ROAD.median, -ROAD.median + 0.16, CURB, [1, 1]), ribbon(layout, ma, mb, ROAD.median - 0.16, ROAD.median, CURB, [1, 1]))
      parts.curb.push(wall(layout, ma, mb, -ROAD.median, 0, CURB, -1), wall(layout, ma, mb, ROAD.median, 0, CURB, 1))
      for (const side of [-1, 1]) parts.yellow.push(ribbon(layout, ma, mb, side * (ROAD.median + 0.32) - 0.06, side * (ROAD.median + 0.32) + 0.06, 0.012, [1, 1]))
    }
    // Lane dashes.
    for (let d = a + 3; d < b - 3; d += 9) {
      for (const side of [-1, 1]) parts.paint.push(ribbon(layout, d, d + 3.2, side * 4.85 - 0.07, side * 4.85 + 0.07, 0.012, [1, 1]))
    }
    for (const side of [-1, 1]) parts.paint.push(ribbon(layout, a, b, side * 8.2 - 0.05, side * 8.2 + 0.05, 0.012, [1, 1]))
  }
  for (const c of layout.crossings) {
    // The side street, on both sides of the avenue.
    for (const side of [-1, 1]) {
      parts.road.push(pad(layout, c, side * (ROAD.half + 90), 180, CROSS_HALF * 2 - 2, 0.002, 5))
      for (let k = 0; k < 14; k++) parts.paint.push(pad(layout, c, side * (ROAD.half + 14 + k * 9), 3.2, 0.14, 0.014))
    }
    // Zebra crossings before and after it, and stop lines.
    for (const e of [-1, 1]) {
      const at = c + e * (CROSS_HALF + 2.4)
      for (let x = -ROAD.half + 0.9; x < ROAD.half - 0.4; x += 1.15) parts.paint.push(pad(layout, at, x, 0.55, 3, 0.013))
      parts.paint.push(pad(layout, c + e * (CROSS_HALF + 5), e > 0 ? 5 : -5, 6.6, 0.4, 0.013))
    }
  }
  return {
    road: mergeGeometries(parts.road)!,
    sidewalk: mergeGeometries(parts.sidewalk)!,
    curb: mergeGeometries(parts.curb)!,
    paint: mergeGeometries(parts.paint)!,
    yellow: mergeGeometries(parts.yellow)!,
    grass: mergeGeometries(parts.grass)!,
  }
}

export function Street({ layout }: { layout: CityLayout }) {
  const m = cityMaterials()
  const g = useMemo(() => streetGeometry(layout), [layout])
  const middle = layout.length / 2
  return (
    <group>
      <mesh geometry={g.road} material={m.road} receiveShadow />
      <mesh geometry={g.sidewalk} material={m.sidewalk} receiveShadow />
      <mesh geometry={g.curb} material={m.curb} receiveShadow />
      <mesh geometry={g.paint} material={m.paint} receiveShadow />
      <mesh geometry={g.yellow} material={m.yellow} receiveShadow />
      <mesh geometry={g.grass} material={m.grass} receiveShadow />
      {/* The city floor, the beach and the sea on the left. */}
      <mesh position={[220, -0.06, -middle]} rotation={[-Math.PI / 2, 0, 0]} material={m.ground} receiveShadow>
        <planeGeometry args={[870, layout.length + 1600]} />
      </mesh>
      <mesh position={[-238, -0.05, -middle]} rotation={[-Math.PI / 2, 0, 0]} material={m.sand}>
        <planeGeometry args={[60, layout.length + 1600]} />
      </mesh>
      <mesh position={[-1260, -0.12, -middle]} rotation={[-Math.PI / 2, 0, 0]} material={m.sea}>
        <planeGeometry args={[2000, layout.length + 3000]} />
      </mesh>
    </group>
  )
}

// ---------- Buildings ----------

const CHUNK = 120

let atlasMaterial: THREE.MeshStandardMaterial | null = null
const signMaterial = () => {
  if (!atlasMaterial) {
    const map = signAtlas()
    atlasMaterial = new THREE.MeshStandardMaterial({ map, roughness: 0.6, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: 0.18 })
  }
  return atlasMaterial
}

function signsGeometry(signs: { position: THREE.Vector3; angle: number; cell: number }[]) {
  const parts = signs.map((s) => {
    const g = new THREE.PlaneGeometry(2.9, 0.62)
    const uv = g.attributes.uv as THREE.BufferAttribute
    const col = s.cell % 2
    const row = Math.floor(s.cell / 2)
    for (let i = 0; i < 4; i++) uv.setXY(i, (col + uv.getX(i)) / 2, 1 - (row + 1 - uv.getY(i)) / 8)
    g.rotateY(s.angle)
    g.translate(s.position.x, s.position.y, s.position.z)
    return g
  })
  return parts.length ? mergeGeometries(parts)! : null
}

let trimMaterial: THREE.MeshStandardMaterial | null = null

export function Buildings({ layout }: { layout: CityLayout }) {
  const m = cityMaterials()
  const chunks = useMemo(() => {
    const groups = new Map<number, Building[]>()
    for (const b of planBuildings(layout)) {
      const key = Math.floor(b.at / CHUNK)
      groups.set(key, [...(groups.get(key) ?? []), b])
    }
    return [...groups].map(([key, list]) => {
      const meshes = buildChunk(list, key * 31 + 7)
      return { key, meshes, signs: signsGeometry(meshes.signs) }
    })
  }, [layout])
  trimMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })
  return (
    <>
      {chunks.map(({ key, meshes, signs }) => (
        <group key={key}>
          {[...meshes.facades].map(([facade, geometry]) => (
            <mesh key={facade} geometry={geometry} material={m.facades[facade as FacadeKey]} castShadow receiveShadow />
          ))}
          <mesh geometry={meshes.shops} material={m.shop} receiveShadow />
          <mesh geometry={meshes.roofs} material={m.roof} castShadow />
          <mesh geometry={meshes.trim} material={trimMaterial!} castShadow receiveShadow />
          {signs && <mesh geometry={signs} material={signMaterial()} />}
        </group>
      ))}
    </>
  )
}
