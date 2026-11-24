import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// An original coupe, built from smooth cross sections. Forward is -Z; the wheels stand on y = 0.

type Section = { z: number; points: [number, number][] }

/** Smooth points along a polyline (Catmull-Rom), n per part. */
function smooth(points: [number, number][], n: number): [number, number][] {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)))
  return curve.getPoints((points.length - 1) * n).map((p) => [p.x, p.y])
}

/** A surface through mirrored cross sections. The points of a section go from the middle below to the middle above. */
function loft(sections: Section[], perPart: number, zSteps: number): THREE.BufferGeometry {
  const rows = sections.map((s) => smooth(s.points, perPart))
  const cols = rows[0]!.length
  // Smooth along the car as well.
  const dense: { z: number; row: [number, number][] }[] = []
  const zCurve = new THREE.CatmullRomCurve3(sections.map((s) => new THREE.Vector3(0, 0, s.z)), false, 'centripetal')
  const columns = Array.from({ length: cols }, (_, c) => new THREE.CatmullRomCurve3(rows.map((r, i) => new THREE.Vector3(r[c]![0], r[c]![1], sections[i]!.z)), false, 'centripetal'))
  const steps = (sections.length - 1) * zSteps
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    dense.push({ z: zCurve.getPoint(t).z, row: columns.map((c) => [c.getPoint(t).x, c.getPoint(t).y]) })
  }
  const positions: number[] = []
  const index: number[] = []
  // Right half, then left half mirrored.
  const ring = [...Array(cols).keys()]
  const full = cols * 2 - 2
  for (const { z, row } of dense) {
    for (const c of ring) positions.push(Math.max(0, row[c]![0]), row[c]![1], z)
    for (let c = cols - 2; c > 0; c--) positions.push(-Math.max(0, row[c]![0]), row[c]![1], z)
  }
  for (let i = 0; i < dense.length - 1; i++) {
    for (let c = 0; c < full; c++) {
      const a = i * full + c
      const b = i * full + ((c + 1) % full)
      const d = a + full
      const e = b + full
      index.push(a, b, d, b, e, d)
    }
  }
  // Close both ends.
  for (const [row, flip] of [
    [0, false],
    [dense.length - 1, true],
  ] as const) {
    const start = row * full
    for (let c = 1; c < full - 1; c++) {
      if (flip) index.push(start, start + c, start + c + 1)
      else index.push(start, start + c + 1, start + c)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

const bodySection = (z: number, w: number, bottom: number, belt: number, top: number): Section => ({
  z,
  points: [
    [0, bottom],
    [w * 0.84, bottom],
    [w * 0.985, bottom + 0.1],
    [w, bottom + (belt - bottom) * 0.5],
    [w * 0.975, belt - 0.03],
    [w * 0.88, belt + 0.02],
    [w * 0.5, top - 0.006],
    [0, top],
  ],
})

const cabinSection = (z: number, w: number, roofW: number, base: number, top: number): Section => ({
  z,
  points: [
    [0, base - 0.12],
    [w, base - 0.12],
    [w * 0.985, base + (top - base) * 0.3],
    [roofW + (w - roofW) * 0.28, base + (top - base) * 0.74],
    [roofW * 0.86, top - 0.03],
    [roofW * 0.45, top - 0.004],
    [0, top],
  ],
})

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z)

/** The painted body and the glass cabin; smooth = points per part of a section, along the section and the car. */
function shell(smoothness: number, along: number) {
  const body = loft(
    [
      bodySection(-2.27, 0.66, 0.36, 0.53, 0.6),
      bodySection(-2.14, 0.83, 0.25, 0.62, 0.68),
      bodySection(-1.75, 0.925, 0.19, 0.7, 0.77),
      bodySection(-1.15, 0.95, 0.17, 0.765, 0.86),
      bodySection(-0.3, 0.935, 0.17, 0.8, 0.9),
      bodySection(0.6, 0.935, 0.17, 0.825, 0.93),
      bodySection(1.35, 0.965, 0.18, 0.86, 0.96),
      bodySection(1.85, 0.945, 0.23, 0.88, 0.985),
      bodySection(2.12, 0.89, 0.3, 0.87, 0.985),
      bodySection(2.24, 0.83, 0.4, 0.8, 0.9),
    ],
    smoothness,
    along,
  )
  const cabin = loft(
    [
      cabinSection(-1.0, 0.74, 0.6, 0.83, 0.86),
      cabinSection(-0.62, 0.79, 0.62, 0.86, 1.08),
      cabinSection(-0.1, 0.81, 0.62, 0.88, 1.255),
      cabinSection(0.4, 0.81, 0.61, 0.89, 1.285),
      cabinSection(0.95, 0.79, 0.57, 0.91, 1.21),
      cabinSection(1.45, 0.74, 0.52, 0.93, 1.08),
      cabinSection(1.82, 0.68, 0.46, 0.94, 0.985),
    ],
    smoothness,
    along,
  )
  // The painted roof: the top of the cabin, a hair larger.
  const roof = loft(
    [
      [-0.28, 0.62, 1.205],
      [0.1, 0.615, 1.277],
      [0.5, 0.605, 1.284],
      [0.95, 0.565, 1.212],
      [1.2, 0.54, 1.152],
    ].map(([z, w, top]) => ({
      z: z!,
      points: [
        [0, top! - 0.06],
        [w! * 0.9, top! - 0.06],
        [w! * 0.9, top! - 0.036],
        [w! * 0.45, top! + 0.004],
        [0, top! + 0.008],
      ] as [number, number][],
    })),
    Math.max(1, smoothness - 1),
    Math.max(1, along - 1),
  )
  return { body, cabin, roof }
}

function make() {
  const { body, cabin, roof } = shell(4, 5)
  const wheels = [
    [0.835, -1.4],
    [-0.835, -1.4],
    [0.84, 1.36],
    [-0.84, 1.36],
  ] as const
  const tireParts: THREE.BufferGeometry[] = []
  const rimParts: THREE.BufferGeometry[] = []
  const tire = new THREE.TorusGeometry(0.265, 0.085, 10, 28).rotateY(Math.PI / 2).scale(1.35, 1, 1)
  const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.2, 24).rotateZ(Math.PI / 2)
  tireParts.push(tire)
  rimParts.push(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 14).rotateZ(Math.PI / 2))
  rimParts.push(new THREE.TorusGeometry(0.225, 0.022, 8, 28).rotateY(Math.PI / 2).translate(0.09, 0, 0))
  rimParts.push(new THREE.TorusGeometry(0.225, 0.022, 8, 28).rotateY(Math.PI / 2).translate(-0.09, 0, 0))
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.BoxGeometry(0.19, 0.2, 0.045).translate(0, 0.125, 0).rotateX((i / 5) * Math.PI * 2)
    rimParts.push(spoke)
  }
  const arches = mergeGeometries(
    wheels.map(([x, z]) => new THREE.CylinderGeometry(0.405, 0.405, 0.1, 28).rotateZ(Math.PI / 2).translate(Math.sign(x) * 0.915, 0.36, z)),
  )!
  return {
    body,
    cabin,
    roof,
    arches,
    tire: mergeGeometries(tireParts)!,
    disc: hub,
    rim: mergeGeometries(rimParts)!,
    wheels,
    dark: mergeGeometries([
      box(1.36, 0.13, 0.16, 0, 0.36, 2.2), // diffuser
      box(1.5, 0.12, 0.14, 0, 0.27, -2.16), // front splitter
      box(0.12, 0.2, 2.1, 0.9, 0.2, 0), // sills
      box(0.12, 0.2, 2.1, -0.9, 0.2, 0),
      new THREE.SphereGeometry(1, 14, 10).scale(0.11, 0.07, 0.08).translate(0.98, 0.95, -0.5), // mirrors
      new THREE.SphereGeometry(1, 14, 10).scale(0.11, 0.07, 0.08).translate(-0.98, 0.95, -0.5),
      box(0.14, 0.02, 0.05, 0.88, 0.9, -0.5),
      box(0.14, 0.02, 0.05, -0.88, 0.9, -0.5),
    ])!,
    tail: mergeGeometries([box(1.5, 0.045, 0.03, 0, 0.8, 2.235), box(0.26, 0.085, 0.04, 0.68, 0.79, 2.215), box(0.26, 0.085, 0.04, -0.68, 0.79, 2.215)])!,
    head: mergeGeometries([box(0.4, 0.06, 0.05, 0.5, 0.6, -2.2), box(0.4, 0.06, 0.05, -0.5, 0.6, -2.2)])!,
    plate: box(0.5, 0.115, 0.02, 0, 0.56, 2.265),
  }
}

let model: ReturnType<typeof make> | null = null
export function carModel() {
  model ??= make()
  return model
}

/** A much simpler version of the same car, for traffic and parked cars (one geometry per material). */
export function simpleCar() {
  const m = carModel()
  const light = shell(2, 2)
  const wheels = mergeGeometries(m.wheels.map(([x, z]) => new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12).rotateZ(Math.PI / 2).translate(x * 1.06, 0.34, z)))!
  const strip = (g: THREE.BufferGeometry) => {
    const c = g.clone()
    for (const name of Object.keys(c.attributes)) if (name !== 'position' && name !== 'normal') c.deleteAttribute(name)
    return c
  }
  const trim = [box(1.36, 0.13, 0.16, 0, 0.36, 2.2), box(1.5, 0.12, 0.14, 0, 0.27, -2.16), box(0.2, 0.12, 0.14, 0.98, 0.95, -0.5), box(0.2, 0.12, 0.14, -0.98, 0.95, -0.5)]
  return { paint: mergeGeometries([strip(light.body), strip(light.roof)])!, glass: strip(light.cabin), dark: mergeGeometries([strip(wheels), ...trim.map(strip)])!, tail: m.tail, head: m.head }
}
