import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ROAD, seeded, type CityLayout } from './layout'
import { FACADE_TILE, SHOP_BAYS, type FacadeKey } from './materials'

// The buildings along the avenue: a street wall of apartment houses and shops, and towers behind it.

export type Building = {
  /** Distance along the avenue, and side (1 = right, -1 = left). */
  at: number
  side: 1 | -1
  center: THREE.Vector3
  angle: number
  width: number
  depth: number
  height: number
  facade: FacadeKey
  tint: string
  shop: boolean
}

const PLASTER: FacadeKey[] = ['balcony', 'ribbon', 'window']
const TALL: FacadeKey[] = ['glassDark', 'glassLight', 'concrete', 'glassLight', 'stone']
const PLASTER_TINTS = ['#ffffff', '#f7efe0', '#efe4d2', '#f3e9df', '#e9e4da', '#f6e3cf', '#e6ded3', '#dfe3e2']
const STONE_TINTS = ['#ffffff', '#e8ddd0', '#d9d4cd']

export const SETBACK = ROAD.half + ROAD.sidewalk

export function planBuildings(layout: CityLayout): Building[] {
  const random = seeded(2026)
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)]!
  const list: Building[] = []
  const end = layout.length + 150
  const nearCrossing = (d: number, half: number) => layout.crossings.some((c) => Math.abs(c - d) < half + 9)

  for (const side of [1, -1] as const) {
    // The street wall.
    let d = -70
    while (d < end) {
      const width = 13 + random() * 12
      const middle = d + width / 2
      if (nearCrossing(middle, width / 2)) {
        d += 4
        continue
      }
      const tower = random() > 0.84
      const depth = tower ? 22 : 15 + random() * 5
      const floors = tower ? 13 + Math.floor(random() * 12) : 4 + Math.floor(random() * 5)
      const facade = tower ? pick(TALL) : random() > 0.82 ? pick(['brick', 'stone'] as const) : pick(PLASTER)
      const f = layout.frame(middle)
      const offset = SETBACK + 0.6 + depth / 2 + random() * 0.8
      list.push({
        at: middle,
        side,
        center: f.position.clone().addScaledVector(f.right, side * offset),
        angle: f.angle,
        width: width - 0.5,
        depth,
        height: 4.2 + floors * 3.2,
        facade,
        tint: PLASTER.includes(facade) ? pick(PLASTER_TINTS) : pick(STONE_TINTS),
        shop: true,
      })
      d += width + (random() > 0.75 ? 2.5 : 0.2)
    }
    // Towers behind it: the skyline.
    for (let back = -60; back < end; back += 34 + random() * 26) {
      const f = layout.frame(back)
      const offset = SETBACK + 46 + random() * 46
      const tall = random()
      list.push({
        at: back,
        side,
        center: f.position.clone().addScaledVector(f.right, side * offset),
        angle: f.angle + (random() - 0.5) * 0.3,
        width: 20 + random() * 12,
        depth: 20 + random() * 10,
        // The sea side stays lower, so the light and the horizon come through.
        height: side === 1 ? 34 + tall * tall * 110 : 24 + tall * 34,
        facade: pick(TALL),
        tint: pick(STONE_TINTS),
        shop: false,
      })
    }
  }
  return list
}

const color = new THREE.Color()

/** A box with facade texture coordinates in real size, and a tint. */
function block(w: number, h: number, d: number, facade: FacadeKey, tint: string, seedX: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(d, h, w)
  const uv = g.attributes.uv as THREE.BufferAttribute
  const [tw, th] = FACADE_TILE[facade]
  const shift = Math.floor(seedX * 8) / 8
  for (let face = 0; face < 6; face++) {
    const wide = face < 2 ? w : d
    for (let i = face * 4; i < face * 4 + 4; i++) {
      // Whole tiles across, so no window is cut at a corner.
      const across = Math.max(0.25, Math.round((wide / tw) * 4) / 4)
      uv.setXY(i, uv.getX(i) * across + shift, (uv.getY(i) * h) / th)
    }
  }
  color.set(tint).convertSRGBToLinear()
  const colors = new Float32Array(24 * 3)
  const position = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < 24; i++) {
    // Darker at the foot: cheap contact shade that also works without ambient occlusion.
    const shade = position.getY(i) < 0 ? 0.74 : 1
    colors.set([color.r * shade, color.g * shade, color.b * shade], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

const placed = (g: THREE.BufferGeometry, b: Building, y: number) => {
  g.rotateY(b.angle)
  g.translate(b.center.x, y, b.center.z)
  return g
}

function coloredBox(w: number, h: number, d: number, c: string) {
  const g = new THREE.BoxGeometry(d, h, w)
  color.set(c).convertSRGBToLinear()
  const colors = new Float32Array(24 * 3)
  for (let i = 0; i < 24; i++) colors.set([color.r, color.g, color.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

const AWNINGS = ['#b8483c', '#2f6f6a', '#d9a441', '#31506e', '#8a3f52', '#e7e0d2', '#4d6b46']

export type BuildingMeshes = {
  facades: Map<FacadeKey, THREE.BufferGeometry>
  shops: THREE.BufferGeometry
  roofs: THREE.BufferGeometry
  /** Awnings, balconies, tanks: small painted parts. */
  trim: THREE.BufferGeometry
  signs: { position: THREE.Vector3; angle: number; cell: number }[]
}

/** One set of merged meshes for the buildings between two distances (a chunk that can be culled). */
export function buildChunk(list: Building[], seed: number): BuildingMeshes {
  const random = seeded(seed)
  const facades = new Map<FacadeKey, THREE.BufferGeometry[]>()
  const shops: THREE.BufferGeometry[] = []
  const roofs: THREE.BufferGeometry[] = []
  const trim: THREE.BufferGeometry[] = []
  const signs: BuildingMeshes['signs'] = []
  const add = (key: FacadeKey, g: THREE.BufferGeometry) => facades.set(key, [...(facades.get(key) ?? []), g])

  for (const b of list) {
    const base = b.shop ? 4.2 : 0
    const bodyHeight = b.height - base
    const tall = b.height > 45
    const seedX = random()
    // Tall buildings step back once.
    const lower = tall ? bodyHeight * (0.55 + random() * 0.2) : bodyHeight
    add(b.facade, placed(block(b.width, lower, b.depth, b.facade, b.tint, seedX), b, base + lower / 2))
    if (tall) {
      const upper = bodyHeight - lower
      add(b.facade, placed(block(b.width * 0.78, upper, b.depth * 0.78, b.facade, b.tint, seedX), b, base + lower + upper / 2))
      roofs.push(placed(new THREE.BoxGeometry(b.depth + 0.3, 0.5, b.width + 0.3), b, base + lower + 0.25))
      roofs.push(placed(new THREE.BoxGeometry(b.depth * 0.78 + 0.3, 0.6, b.width * 0.78 + 0.3), b, b.height + 0.3))
      if (random() > 0.5) roofs.push(placed(new THREE.BoxGeometry(b.depth * 0.3, 4, b.width * 0.3), b, b.height + 2.5))
    } else {
      roofs.push(placed(new THREE.BoxGeometry(b.depth + 0.5, 0.7, b.width + 0.5), b, b.height + 0.2))
    }

    const f = new THREE.Vector3(-Math.sin(b.angle), 0, -Math.cos(b.angle))
    const right = new THREE.Vector3(Math.cos(b.angle), 0, -Math.sin(b.angle))
    const toStreet = right.clone().multiplyScalar(-b.side)

    if (!tall && b.shop) {
      // Roof life of a Mediterranean city: water tanks and a stair room.
      for (let i = 0; i < 2 + Math.floor(random() * 3); i++) {
        const g = new THREE.CylinderGeometry(0.55, 0.55, 1.5, 10)
        g.rotateZ(Math.PI / 2)
        g.deleteAttribute('color')
        const p = b.center.clone().addScaledVector(f, (random() - 0.5) * b.width * 0.7).addScaledVector(right, (random() - 0.5) * b.depth * 0.6)
        const colors = new Float32Array((g.attributes.position as THREE.BufferAttribute).count * 3).fill(0.86)
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        trim.push(g.toNonIndexed().translate(p.x, b.height + 1.4, p.z))
      }
      roofs.push(new THREE.BoxGeometry(3, 2.6, 3.4).translate(b.center.x, b.height + 1.6, b.center.z))
    }

    if (b.shop) {
      const front0 = new THREE.BoxGeometry(b.depth - 0.7, base, b.width - 0.5)
      const uv = front0.attributes.uv as THREE.BufferAttribute
      for (let face = 0; face < 6; face++) {
        const bayCount = Math.max(1, Math.round((face < 2 ? b.width : b.depth) / 5.5))
        // Every building starts at another shop, so the row does not repeat.
        const first = Math.floor(random() * SHOP_BAYS)
        for (let i = face * 4; i < face * 4 + 4; i++) uv.setX(i, (uv.getX(i) * bayCount + first) / SHOP_BAYS)
      }
      shops.push(placed(front0, b, base / 2))
      // Piers between the shops, a sign band, and awnings over some of them.
      const bays = Math.max(2, Math.round(b.width / 5.5))
      const bay = b.width / bays
      const front = b.center.clone().addScaledVector(toStreet, b.depth / 2)
      for (let i = 0; i <= bays; i++) {
        const p = front.clone().addScaledVector(f, -b.width / 2 + i * bay)
        const g = coloredBox(0.55, base, 0.6, b.tint)
        g.rotateY(b.angle)
        g.translate(p.x - toStreet.x * 0.2, base / 2, p.z - toStreet.z * 0.2)
        trim.push(g.toNonIndexed())
      }
      const band = coloredBox(b.width, 0.85, 0.35, '#d8d2c6')
      band.rotateY(b.angle)
      band.translate(front.x, base - 0.42, front.z)
      trim.push(band.toNonIndexed())
      for (let i = 0; i < bays; i++) {
        const middle = front.clone().addScaledVector(f, -b.width / 2 + (i + 0.5) * bay)
        if (random() > 0.45) {
          const awning = coloredBox(bay - 0.9, 0.08, 1.7, AWNINGS[Math.floor(random() * AWNINGS.length)]!)
          awning.rotateZ(b.side * 0.3)
          awning.rotateY(b.angle)
          const p = middle.clone().addScaledVector(toStreet, 0.85)
          awning.translate(p.x, base - 1.15, p.z)
          trim.push(awning.toNonIndexed())
        }
        if (random() > 0.35) {
          const p = middle.clone().addScaledVector(toStreet, 0.2)
          signs.push({ position: p.setY(base - 0.42), angle: b.angle + (b.side === 1 ? -Math.PI / 2 : Math.PI / 2), cell: Math.floor(random() * 16) })
        }
      }
    }
  }
  const merge = (parts: THREE.BufferGeometry[]) => (parts.length ? mergeGeometries(parts, false)! : new THREE.BufferGeometry())
  return {
    facades: new Map([...facades].map(([key, parts]) => [key, merge(parts)])),
    shops: merge(shops),
    roofs: merge(roofs),
    trim: merge(trim),
    signs,
  }
}

/** Names of the shops (invented). */
export const SHOP_NAMES = ['קפה השדרה', 'מאפייה', 'ספרים', 'פרחים', 'אופטיקה', 'גלידה', 'סטודיו', 'יין וגבינות', 'מספרה', 'אופניים', 'גלריה', 'בית קפה', 'עיצוב', 'צילום', 'משרדים', 'שוק איכרים']

export function signAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext('2d')!
  const random = seeded(91)
  const styles = [
    ['#1f2a30', '#f3ead8'],
    ['#f3ead8', '#1f2a30'],
    ['#7d2f2a', '#fff3df'],
    ['#22514d', '#f4efe2'],
    ['#2d3f5c', '#f4efe2'],
    ['#d9a441', '#231a0a'],
  ]
  SHOP_NAMES.forEach((name, i) => {
    const x = (i % 2) * 512
    const y = Math.floor(i / 2) * 128
    const [back, ink] = styles[Math.floor(random() * styles.length)]!
    ctx.fillStyle = back!
    ctx.fillRect(x, y, 512, 128)
    ctx.fillStyle = ink!
    ctx.font = '700 74px "Rubik Variable", Rubik, Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.direction = 'rtl'
    ctx.fillText(name, x + 256, y + 68, 470)
  })
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
