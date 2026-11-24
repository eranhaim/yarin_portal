import * as THREE from 'three'
import { seeded } from './layout'
import asphalt from '../../assets/city/asphalt.webp'
import asphaltN from '../../assets/city/asphalt-n.webp'
import asphaltO from '../../assets/city/asphalt-orm.webp'
import brick from '../../assets/city/brick.webp'
import brickN from '../../assets/city/brick-n.webp'
import brickO from '../../assets/city/brick-orm.webp'
import concrete from '../../assets/city/concrete.webp'
import concreteN from '../../assets/city/concrete-n.webp'
import concreteO from '../../assets/city/concrete-orm.webp'
import glassDark from '../../assets/city/glass-dark.webp'
import glassDarkN from '../../assets/city/glass-dark-n.webp'
import glassDarkO from '../../assets/city/glass-dark-orm.webp'
import glassLight from '../../assets/city/glass-light.webp'
import glassLightN from '../../assets/city/glass-light-n.webp'
import glassLightO from '../../assets/city/glass-light-orm.webp'
import grass from '../../assets/city/grass.webp'
import stone from '../../assets/city/stone.webp'
import stoneN from '../../assets/city/stone-n.webp'
import stoneO from '../../assets/city/stone-orm.webp'

// Surfaces of the city. Photo textures are CC0 (ambientCG); see assets/city/LICENSE.md. The bright plaster facades,
// the paving and the palm leaves are painted here.

const loader = new THREE.TextureLoader()
const loaded = new Map<string, THREE.Texture>()

function texture(url: string, color: boolean): THREE.Texture {
  let t = loaded.get(url)
  if (!t) {
    t = loader.load(url)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    if (color) t.colorSpace = THREE.SRGBColorSpace
    loaded.set(url, t)
  }
  return t
}

function surface(map: string, normal: string, orm: string, options: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    map: texture(map, true),
    normalMap: texture(normal, false),
    roughnessMap: texture(orm, false),
    metalnessMap: texture(orm, false),
    roughness: 1,
    metalness: 1,
    ...options,
  })
}

const canvasOf = (w: number, h: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return { canvas, ctx: canvas.getContext('2d')! }
}

function canvasTexture(canvas: HTMLCanvasElement, color: boolean) {
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  if (color) t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------- Plaster facades (bright Mediterranean apartment houses) ----------

/** One tile is 12 m wide and 12.8 m high: four floors of 3.2 m. */
function plasterFacade(seed: number, style: 'balcony' | 'ribbon' | 'window') {
  const W = 512
  const H = 512
  const random = seeded(seed)
  const color = canvasOf(W, H)
  const rough = canvasOf(W, H)
  const height = canvasOf(W, H)
  const paint = (c: string, r: number, z: number, x: number, y: number, w: number, h: number) => {
    color.ctx.fillStyle = c
    color.ctx.fillRect(x, y, w, h)
    rough.ctx.fillStyle = `rgb(0,${Math.round(r * 255)},0)`
    rough.ctx.fillRect(x, y, w, h)
    height.ctx.fillStyle = `rgb(${z},${z},${z})`
    height.ctx.fillRect(x, y, w, h)
  }
  paint('#f1ece2', 0.92, 150, 0, 0, W, H)
  // Weathering: soft vertical stains and grain.
  for (let i = 0; i < 900; i++) {
    const a = random() * 0.05
    color.ctx.fillStyle = random() > 0.5 ? `rgba(120,108,92,${a})` : `rgba(255,255,255,${a})`
    color.ctx.fillRect(random() * W, random() * H, 1 + random() * 3, 6 + random() * 46)
  }
  const floor = H / 4
  const glass = () => {
    const k = random()
    return k > 0.72 ? '#6d7f8c' : k > 0.4 ? '#2c3944' : '#1c2731'
  }
  const window = (x: number, y: number, w: number, h: number, blind = random() > 0.62) => {
    paint('#d9d3c6', 0.8, 165, x - 4, y - 4, w + 8, h + 8)
    paint('#3a3f44', 0.5, 90, x - 1, y - 1, w + 2, h + 2)
    paint(glass(), 0.08, 60, x, y, w, h)
    if (blind) {
      const drop = h * (0.25 + random() * 0.6)
      paint('#e4dfd4', 0.85, 95, x, y, w, drop)
      color.ctx.fillStyle = 'rgba(0,0,0,0.10)'
      for (let k = 3; k < drop; k += 5) color.ctx.fillRect(x, y + k, w, 1.5)
    } else {
      // A hint of the sky in the glass, and the frame in the middle.
      const g = color.ctx.createLinearGradient(x, y, x + w, y + h)
      g.addColorStop(0, 'rgba(190,214,232,0.42)')
      g.addColorStop(0.5, 'rgba(190,214,232,0.06)')
      color.ctx.fillStyle = g
      color.ctx.fillRect(x, y, w, h)
    }
    paint('#4b5157', 0.5, 95, x + w / 2 - 1.5, y, 3, h)
    color.ctx.fillStyle = 'rgba(40,34,28,0.22)'
    color.ctx.fillRect(x - 4, y + h + 4, w + 8, 5)
  }
  for (let f = 0; f < 4; f++) {
    const y = f * floor
    if (style === 'ribbon') {
      paint('#e7e1d5', 0.9, 175, 0, y + floor - 20, W, 12)
      for (let i = 0; i < 4; i++) window(14 + i * (W / 4), y + 26, W / 4 - 30, 60)
      color.ctx.fillStyle = 'rgba(60,52,44,0.25)'
      color.ctx.fillRect(0, y + floor - 8, W, 6)
    } else if (style === 'window') {
      for (let i = 0; i < 5; i++) window(24 + i * (W / 5), y + 30, 50, 66)
      paint('#e2dccf', 0.9, 168, 0, y + floor - 5, W, 4)
    } else {
      // Deep balconies with a rail, and windows beside them.
      for (let i = 0; i < 2; i++) {
        const x = 16 + i * (W / 2)
        paint('#8f887c', 0.9, 40, x, y + 12, 140, floor - 20)
        const shade = color.ctx.createLinearGradient(0, y + 12, 0, y + floor - 8)
        shade.addColorStop(0, 'rgba(20,16,12,0.62)')
        shade.addColorStop(1, 'rgba(20,16,12,0.12)')
        color.ctx.fillStyle = shade
        color.ctx.fillRect(x, y + 12, 140, floor - 20)
        window(x + 20, y + 34, 96, 72, random() > 0.7)
        paint('#cfc8ba', 0.85, 200, x - 4, y + floor - 14, 148, 10)
        paint('#f4f0e8', 0.8, 190, x - 4, y + floor - 46, 148, 5)
        color.ctx.fillStyle = 'rgba(245,241,232,0.72)'
        color.ctx.fillRect(x - 4, y + floor - 42, 148, 28)
        window(x + 172, y + 34, 50, 62)
      }
    }
  }
  return { color: color.canvas, rough: rough.canvas, height: height.canvas }
}

function plaster(seed: number, style: 'balcony' | 'ribbon' | 'window') {
  const f = plasterFacade(seed, style)
  const orm = canvasTexture(f.rough, false)
  return new THREE.MeshStandardMaterial({
    map: canvasTexture(f.color, true),
    roughnessMap: orm,
    roughness: 1,
    metalness: 0,
    bumpMap: canvasTexture(f.height, false),
    bumpScale: 2.2,
    vertexColors: true,
    envMapIntensity: 0.9,
  })
}

// ---------- Ground ----------

function paving() {
  const { canvas, ctx } = canvasOf(256, 256)
  const random = seeded(31)
  ctx.fillStyle = '#b9b2a6'
  ctx.fillRect(0, 0, 256, 256)
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const shift = y % 2 ? 32 : 0
      const l = 168 + random() * 26
      ctx.fillStyle = `rgb(${l},${l - 5},${l - 13})`
      ctx.fillRect(((x * 64 + shift) % 256) + 1, y * 32 + 1, 62, 30)
    }
  }
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(60,52,44,${random() * 0.12})`
    ctx.fillRect(random() * 256, random() * 256, 1.4, 1.4)
  }
  return canvasTexture(canvas, true)
}

/** Number of shop bays in one tile of the shop texture. */
export const SHOP_BAYS = 4

/** Shop windows: four bays of 5.5 m (a cafe, books, clothes, flowers), each with glass, a frame and a room behind it. */
function shopFront() {
  const H = 512
  const W = 512 * SHOP_BAYS
  const { canvas, ctx } = canvasOf(W, H)
  const glow = canvasOf(W / 2, H / 2)
  const rough = canvasOf(W / 2, H / 2)
  glow.ctx.scale(0.5, 0.5)
  rough.ctx.scale(0.5, 0.5)
  const random = seeded(63)
  const pick = (list: string[]) => list[Math.floor(random() * list.length)]!
  ctx.fillStyle = '#cfc8bc'
  ctx.fillRect(0, 0, W, H)
  glow.ctx.fillStyle = '#000'
  glow.ctx.fillRect(0, 0, W, H)
  rough.ctx.fillStyle = 'rgb(0,220,0)'
  rough.ctx.fillRect(0, 0, W, H)

  const rooms = [
    { wall: ['#7a5a3c', '#4a3524'], floor: '#3a2a1e' },
    { wall: ['#5b5348', '#36312b'], floor: '#2c2722' },
    { wall: ['#b9b2a6', '#857e73'], floor: '#6d665c' },
    { wall: ['#55634f', '#343d31'], floor: '#2b2f28' },
  ]

  /** What stands in the room. x, y, w, h: the glass of one pane. */
  const furnish = (kind: number, x: number, y: number, w: number, h: number) => {
    if (kind === 0) {
      // A cafe: a menu board, a counter, round tables and chairs.
      ctx.fillStyle = '#20272a'
      ctx.fillRect(x + w * 0.2, y + 64, w * 0.6, 58)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      for (let k = 0; k < 4; k++) ctx.fillRect(x + w * 0.26, y + 74 + k * 12, w * (0.2 + random() * 0.26), 3)
      ctx.fillStyle = '#8a6139'
      ctx.fillRect(x, y + h * 0.5, w, h * 0.2)
      ctx.fillStyle = '#c79a63'
      ctx.fillRect(x, y + h * 0.5, w, 9)
      for (const tx of [0.28, 0.74]) {
        ctx.fillStyle = '#17120e'
        ctx.fillRect(x + w * tx - 3, y + h * 0.72, 6, h * 0.22)
        ctx.beginPath()
        ctx.ellipse(x + w * tx, y + h * 0.72, w * 0.17, 8, 0, 0, Math.PI * 2)
        ctx.fillStyle = '#e8ddc8'
        ctx.fill()
        ctx.fillStyle = '#17120e'
        ctx.fillRect(x + w * (tx - 0.2), y + h * 0.66, 8, h * 0.28)
      }
    } else if (kind === 1) {
      for (let k = 0; k < 4; k++) {
        const base = y + 84 + k * 70
        ctx.fillStyle = 'rgba(0,0,0,0.4)'
        ctx.fillRect(x + 12, base, w - 24, 7)
        let tx = x + 16
        while (tx < x + w - 24) {
          const bw = 6 + random() * 11
          const bh = 26 + random() * 26
          if (random() > 0.12) {
            ctx.fillStyle = pick(['#b98a5a', '#8c9fa6', '#c9b48a', '#6f8a6b', '#a55f4a', '#5a6b8a', '#d8cdb8'])
            ctx.fillRect(tx, base - bh, bw, bh)
          }
          tx += bw + 1
        }
      }
    } else if (kind === 2) {
      // Clothes on a rail, and a figure in the window.
      ctx.fillStyle = '#4b463f'
      ctx.fillRect(x + 14, y + 112, w - 28, 5)
      for (let tx = x + 22; tx < x + w * 0.62; tx += 25) {
        ctx.fillStyle = pick(['#2f3a44', '#8b5a4a', '#e6dccb', '#64705f', '#b3a488', '#42465a'])
        ctx.beginPath()
        ctx.moveTo(tx + 5, y + 120)
        ctx.lineTo(tx + 18, y + 120)
        ctx.lineTo(tx + 24, y + 220 + random() * 44)
        ctx.lineTo(tx - 1, y + 220 + random() * 44)
        ctx.fill()
      }
      const cx = x + w * 0.8
      ctx.fillStyle = '#efe7db'
      ctx.beginPath()
      ctx.ellipse(cx, y + 138, 11, 15, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = pick(['#26323c', '#7b3f36', '#d7c7a8'])
      ctx.beginPath()
      ctx.moveTo(cx - 24, y + 166)
      ctx.lineTo(cx + 24, y + 166)
      ctx.lineTo(cx + 32, y + h * 0.86)
      ctx.lineTo(cx - 32, y + h * 0.86)
      ctx.fill()
      ctx.fillStyle = '#2d2a26'
      ctx.fillRect(x + w * 0.1, y + h * 0.74, w * 0.45, h * 0.2)
      ctx.fillStyle = '#d9cfbd'
      ctx.fillRect(x + w * 0.14, y + h * 0.69, w * 0.14, h * 0.05)
      ctx.fillRect(x + w * 0.34, y + h * 0.7, w * 0.16, h * 0.04)
    } else {
      // Flowers in buckets on three steps.
      for (let k = 0; k < 3; k++) {
        const base = y + h * (0.5 + k * 0.22)
        for (let tx = x + 24; tx < x + w - 16; tx += 46) {
          ctx.fillStyle = '#2f3b2b'
          for (let n = 0; n < 24; n++) {
            ctx.fillStyle = pick(['#42613a', '#587a48', '#2f4a2c'])
            ctx.beginPath()
            ctx.ellipse(tx + (random() - 0.5) * 44, base - 18 - random() * 46, 9, 4, random() * 3, 0, Math.PI * 2)
            ctx.fill()
          }
          const color = pick(['#d8606c', '#e8b84f', '#e9e2d6', '#b07cc0', '#dd8a53'])
          for (let n = 0; n < 8; n++) {
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(tx + (random() - 0.5) * 40, base - 26 - random() * 40, 4 + random() * 3, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.fillStyle = '#8d9298'
          ctx.beginPath()
          ctx.moveTo(tx - 17, base - 20)
          ctx.lineTo(tx + 17, base - 20)
          ctx.lineTo(tx + 12, base + 14)
          ctx.lineTo(tx - 12, base + 14)
          ctx.fill()
        }
      }
    }
  }

  for (let i = 0; i < SHOP_BAYS * 2; i++) {
    const kind = Math.floor(i / 2)
    const room = rooms[kind]!
    const x = 18 + i * 256
    const w = 220
    const y = 96
    const h = H - y - 46
    const back = ctx.createLinearGradient(0, y, 0, y + h * 0.8)
    back.addColorStop(0, room.wall[0]!)
    back.addColorStop(1, room.wall[1]!)
    ctx.fillStyle = back
    ctx.fillRect(x, y, w, h)
    // The ceiling and the floor run to the back of the room.
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + w, y)
    ctx.lineTo(x + w - 22, y + 46)
    ctx.lineTo(x + 22, y + 46)
    ctx.fill()
    ctx.fillStyle = room.floor
    ctx.beginPath()
    ctx.moveTo(x, y + h)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x + w - 22, y + h * 0.82)
    ctx.lineTo(x + 22, y + h * 0.82)
    ctx.fill()
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
    furnish(kind, x, y, w, h)
    // Hanging lamps.
    for (let k = 0; k < 3; k++) {
      const lx = x + w * (0.2 + k * 0.3)
      ctx.fillStyle = '#111'
      ctx.fillRect(lx - 1, y, 2, 34)
      ctx.fillStyle = '#ffe9c2'
      ctx.beginPath()
      ctx.arc(lx, y + 40, 8, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    for (let k = 0; k < 3; k++) {
      const lx = x + w * (0.2 + k * 0.3)
      const g = glow.ctx.createRadialGradient(lx, y + 40, 2, lx, y + 56, 96)
      g.addColorStop(0, 'rgba(255,218,160,0.95)')
      g.addColorStop(0.2, 'rgba(255,200,130,0.34)')
      g.addColorStop(1, 'rgba(255,190,110,0)')
      glow.ctx.fillStyle = g
      glow.ctx.fillRect(x, y, w, h * 0.7)
    }
    // The sky in the glass.
    const sky = ctx.createLinearGradient(x, y, x + w, y + h)
    sky.addColorStop(0, 'rgba(206,226,242,0.36)')
    sky.addColorStop(0.42, 'rgba(206,226,242,0.08)')
    sky.addColorStop(0.43, 'rgba(206,226,242,0.22)')
    sky.addColorStop(1, 'rgba(206,226,242,0.1)')
    ctx.fillStyle = sky
    ctx.fillRect(x, y, w, h)
    rough.ctx.fillStyle = 'rgb(0,34,0)'
    rough.ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = '#2b2f33'
    ctx.lineWidth = 7
    ctx.strokeRect(x, y, w, h)
    if (kind !== 2) {
      ctx.fillStyle = '#2b2f33'
      ctx.fillRect(x + w / 2 - 3, y, 6, h)
    }
    ctx.fillStyle = '#8d867a'
    ctx.fillRect(x - 8, H - 46, w + 16, 46)
  }
  return new THREE.MeshStandardMaterial({
    map: canvasTexture(canvas, true),
    roughnessMap: canvasTexture(rough.canvas, false),
    emissiveMap: canvasTexture(glow.canvas, true),
    emissive: '#ffffff',
    emissiveIntensity: 0.9,
    roughness: 1,
    envMapIntensity: 1,
  })
}

function palmLeaf() {
  const { canvas, ctx } = canvasOf(512, 128)
  const random = seeded(77)
  ctx.clearRect(0, 0, 512, 128)
  // A long leaf: the spine runs along the middle, the leaflets to both sides.
  for (let i = 0; i < 190; i++) {
    const t = i / 190
    const x = 8 + t * 496
    const reach = Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.9)) ** 0.7 * 56
    for (const side of [-1, 1]) {
      const l = 62 + random() * 46
      ctx.strokeStyle = `rgb(${l * 0.72},${l + 28},${l * 0.42})`
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.moveTo(x, 64)
      ctx.quadraticCurveTo(x + 16, 64 + side * reach * 0.5, x + 24 + random() * 10, 64 + side * reach * (0.85 + random() * 0.2))
      ctx.stroke()
    }
  }
  ctx.strokeStyle = '#8f9a55'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(0, 64)
  ctx.lineTo(500, 64)
  ctx.stroke()
  const t = canvasTexture(canvas, true)
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  return t
}

function leafCluster() {
  const { canvas, ctx } = canvasOf(256, 256)
  const random = seeded(5)
  for (let i = 0; i < 900; i++) {
    const a = random() * Math.PI * 2
    const r = Math.sqrt(random()) * 118
    const l = 52 + random() * 64
    ctx.fillStyle = `rgba(${l * 0.62},${l + 20},${l * 0.4},0.95)`
    ctx.beginPath()
    ctx.ellipse(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 7, 3.4, random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = canvasTexture(canvas, true)
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  return t
}

// ---------- The set ----------

export type FacadeKey = 'balcony' | 'ribbon' | 'window' | 'brick' | 'concrete' | 'stone' | 'glassDark' | 'glassLight'

/** Size in meters that one texture tile covers. */
export const FACADE_TILE: Record<FacadeKey, [number, number]> = {
  balcony: [12, 12.8],
  ribbon: [12, 12.8],
  window: [12, 12.8],
  brick: [19, 19.2],
  concrete: [19, 19.2],
  stone: [19, 19.2],
  glassDark: [24, 34],
  glassLight: [19, 27],
}

function makeMaterials() {
  const road = surface(asphalt, asphaltN, asphaltO, { metalness: 0, color: '#9aa0a8', normalScale: new THREE.Vector2(0.45, 0.45), envMapIntensity: 0.6 })
  road.roughness = 1
  const facades: Record<FacadeKey, THREE.MeshStandardMaterial> = {
    balcony: plaster(11, 'balcony'),
    ribbon: plaster(23, 'ribbon'),
    window: plaster(37, 'window'),
    brick: surface(brick, brickN, brickO, { vertexColors: true }),
    concrete: surface(concrete, concreteN, concreteO, { vertexColors: true }),
    stone: surface(stone, stoneN, stoneO, { vertexColors: true }),
    glassDark: surface(glassDark, glassDarkN, glassDarkO, { vertexColors: true, envMapIntensity: 1.5, roughness: 0.55 }),
    glassLight: surface(glassLight, glassLightN, glassLightO, { vertexColors: true, envMapIntensity: 1.35, roughness: 0.6 }),
  }
  const leaf = palmLeaf()
  const cluster = leafCluster()
  return {
    road,
    facades,
    sidewalk: new THREE.MeshStandardMaterial({ map: paving(), roughness: 0.9, color: '#e6e0d5' }),
    curb: new THREE.MeshStandardMaterial({ color: '#c9c4ba', roughness: 0.9 }),
    paint: new THREE.MeshStandardMaterial({ color: '#ece9e1', roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#e0b13c', roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    grass: new THREE.MeshStandardMaterial({ map: texture(grass, true), roughness: 1, color: '#b9c29a' }),
    ground: new THREE.MeshStandardMaterial({ color: '#a8a294', roughness: 1 }),
    sea: new THREE.MeshStandardMaterial({ color: '#1d4f63', roughness: 0.16, metalness: 0.1, envMapIntensity: 1.3 }),
    sand: new THREE.MeshStandardMaterial({ color: '#e2cfa4', roughness: 1 }),
    roof: new THREE.MeshStandardMaterial({ color: '#b5b0a6', roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: '#3c4248', roughness: 0.45, metalness: 0.75 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#fff6df', emissive: '#ffe3a6', emissiveIntensity: 0.7 }),
    shop: shopFront(),
    trunk: new THREE.MeshStandardMaterial({ color: '#8d7660', roughness: 1 }),
    bark: new THREE.MeshStandardMaterial({ color: '#6b5a4a', roughness: 1 }),
    palm: new THREE.MeshStandardMaterial({ map: leaf, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.75, color: '#cfe0b0' }),
    leaves: new THREE.MeshStandardMaterial({ map: cluster, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.85 }),
  }
}

let set: ReturnType<typeof makeMaterials> | null = null

/** Created on first use (the textures need a document), and shared by the whole scene. */
export function cityMaterials() {
  set ??= makeMaterials()
  return set
}
