import * as THREE from 'three'
import type { Look } from '../../lib/types'

// What a person wears on top of their model: glasses, a gold chain, and something in the hand.
// All parts are built here from smooth shapes, in meters, with real materials (metal, acetate, glass, leather).

let materials: ReturnType<typeof makeMaterials> | null = null

function makeMaterials() {
  return {
    gold: new THREE.MeshStandardMaterial({ color: '#e0ad4c', metalness: 1, roughness: 0.22 }),
    acetate: new THREE.MeshPhysicalMaterial({ color: '#141416', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 }),
    clearLens: new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false }),
    sunLens: new THREE.MeshPhysicalMaterial({ color: '#0c0f14', roughness: 0.05, metalness: 0.55, clearcoat: 1, transparent: true, opacity: 0.94 }),
    leather: new THREE.MeshPhysicalMaterial({ color: '#3a2416', roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
    phone: new THREE.MeshPhysicalMaterial({ color: '#16171b', roughness: 0.25, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 }),
    screen: new THREE.MeshStandardMaterial({ color: '#0d1420', emissive: '#28406a', emissiveIntensity: 0.6, roughness: 0.08 }),
    paper: new THREE.MeshStandardMaterial({ color: '#f1ece3', roughness: 0.85 }),
    sleeve: new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.9 }),
    lid: new THREE.MeshStandardMaterial({ color: '#f7f6f2', roughness: 0.45 }),
  }
}

export function accessoryMaterials() {
  materials ??= makeMaterials()
  return materials
}

/** A rounded rectangle centered on the origin. */
function roundedRect(w: number, h: number, r: number, shape = new THREE.Shape()) {
  const x = -w / 2
  const y = -h / 2
  shape.moveTo(x + r, y)
  shape.lineTo(x + w - r, y)
  shape.quadraticCurveTo(x + w, y, x + w, y + r)
  shape.lineTo(x + w, y + h - r)
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  shape.lineTo(x + r, y + h)
  shape.quadraticCurveTo(x, y + h, x, y + h - r)
  shape.lineTo(x, y + r)
  shape.quadraticCurveTo(x, y, x + r, y)
  return shape
}

/** An aviator lens (the right one; mirror x for the left). */
function aviatorShape() {
  const s = new THREE.Shape()
  s.moveTo(-0.022, 0.011)
  s.bezierCurveTo(-0.006, 0.016, 0.019, 0.017, 0.026, 0.009)
  s.bezierCurveTo(0.031, -0.004, 0.021, -0.027, 0.002, -0.026)
  s.bezierCurveTo(-0.014, -0.025, -0.025, -0.011, -0.022, 0.011)
  return s
}

const tube = (points: THREE.Vector3[], radius: number, closed = false) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed, 'centripetal'), closed ? 64 : 24, radius, 8, closed)

/** The arms of the glasses, from the hinges back over the ears. */
function temples(half: number, y: number, radius: number, material: THREE.Material) {
  const group = new THREE.Group()
  for (const side of [1, -1]) {
    const g = tube([new THREE.Vector3(side * half, y, -0.002), new THREE.Vector3(side * (half + 0.012), y, -0.05), new THREE.Vector3(side * (half + 0.016), y - 0.004, -0.098), new THREE.Vector3(side * (half + 0.014), y - 0.022, -0.112)], radius)
    group.add(new THREE.Mesh(g, material))
  }
  return group
}

/**
 * Glasses in their own space: +Z is where the face looks, the origin is between the eyes on the lens plane,
 * built for eyes 63 mm apart.
 */
export function buildGlasses(kind: Look['glasses']): THREE.Group | null {
  if (kind === 'none') return null
  const m = accessoryMaterials()
  const group = new THREE.Group()
  group.name = 'glasses'
  const eye = 0.0315
  if (kind === 'round') {
    for (const side of [1, -1]) {
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.0215, 0.0017, 10, 56), m.gold)
      frame.position.set(side * eye, 0, 0)
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.021, 40), m.clearLens)
      lens.position.set(side * eye, 0, -0.0005)
      group.add(frame, lens)
    }
    const bridge = new THREE.Mesh(new THREE.TorusGeometry(0.0105, 0.0015, 8, 24, Math.PI), m.gold)
    bridge.position.set(0, 0.004, 0)
    group.add(bridge, temples(eye + 0.0215, 0.003, 0.0012, m.gold))
  } else if (kind === 'square') {
    const outer = roundedRect(0.054, 0.039, 0.009)
    outer.holes.push(new THREE.Path(roundedRect(0.044, 0.029, 0.006).getPoints(24).reverse()))
    const frameGeometry = new THREE.ExtrudeGeometry(outer, { depth: 0.0035, bevelEnabled: true, bevelThickness: 0.0009, bevelSize: 0.0008, bevelSegments: 3, curveSegments: 12 })
    frameGeometry.translate(0, 0, -0.0018)
    for (const side of [1, -1]) {
      const frame = new THREE.Mesh(frameGeometry, m.acetate)
      frame.position.set(side * (eye + 0.001), 0, 0)
      const lens = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.045, 0.03, 0.006), 10), m.clearLens)
      lens.position.set(side * (eye + 0.001), 0, -0.0004)
      group.add(frame, lens)
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.005, 0.004), m.acetate)
    bridge.position.set(0, 0.006, 0)
    group.add(bridge, temples(eye + 0.028, 0.008, 0.0021, m.acetate))
  } else {
    // Aviators: dark mirrored lenses in a thin gold frame, with a double bridge.
    const shape = aviatorShape()
    const outline = shape.getPoints(40).map((p) => new THREE.Vector3(p.x, p.y, 0))
    const lensGeometry = new THREE.ShapeGeometry(shape, 24)
    const rimGeometry = tube(outline, 0.0011, true)
    for (const side of [1, -1]) {
      const lens = new THREE.Mesh(lensGeometry, m.sunLens)
      const rim = new THREE.Mesh(rimGeometry, m.gold)
      for (const part of [lens, rim]) {
        part.position.set(side * eye, 0, 0)
        part.scale.set(side, 1, 1)
      }
      group.add(lens, rim)
    }
    group.add(
      new THREE.Mesh(tube([new THREE.Vector3(-0.0095, 0.012, 0), new THREE.Vector3(0, 0.0135, 0.001), new THREE.Vector3(0.0095, 0.012, 0)], 0.001), m.gold),
      new THREE.Mesh(tube([new THREE.Vector3(-0.0095, 0.004, 0), new THREE.Vector3(0, 0.006, 0.002), new THREE.Vector3(0.0095, 0.004, 0)], 0.001), m.gold),
      temples(eye + 0.027, 0.009, 0.0011, m.gold),
    )
  }
  group.traverse((o) => {
    o.castShadow = false
    if (o instanceof THREE.Mesh && o.material === m.clearLens) o.renderOrder = 3
  })
  return group
}

/** A gold chain around the neck, in a space whose origin is the base of the neck and +Z the chest. */
export function buildChain(): THREE.Group {
  const m = accessoryMaterials()
  const curve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, 0.04, -0.066),
      new THREE.Vector3(0.064, 0.03, -0.042),
      new THREE.Vector3(0.088, 0.0, 0.01),
      new THREE.Vector3(0.074, -0.05, 0.075),
      new THREE.Vector3(0, -0.1, 0.112),
      new THREE.Vector3(-0.074, -0.05, 0.075),
      new THREE.Vector3(-0.088, 0.0, 0.01),
      new THREE.Vector3(-0.064, 0.03, -0.042),
    ],
    true,
    'centripetal',
  )
  // Real links: small gold rings, each turned a quarter from the last one.
  const count = Math.round(curve.getLength() / 0.0062)
  const links = new THREE.InstancedMesh(new THREE.TorusGeometry(0.0041, 0.0013, 6, 14), m.gold, count)
  const o = new THREE.Object3D()
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < count; i++) {
    const t = i / count
    o.position.copy(curve.getPointAt(t))
    const tangent = curve.getTangentAt(t)
    o.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent)
    o.rotateX(i % 2 ? Math.PI / 2 : 0)
    void up
    o.updateMatrix()
    links.setMatrixAt(i, o.matrix)
  }
  links.castShadow = false
  const group = new THREE.Group()
  group.name = 'chain'
  group.add(links)
  return group
}

/**
 * Something to hold, in the frame of the hand: +Y along the fingers, +Z out of the palm, +X toward the little finger.
 * The origin is the wrist. The briefcase is the exception: it hangs straight down from the grip (userData.hang),
 * in the person's own frame (+Y up, +Z forward), whatever the hand does.
 */
export function buildHandItem(kind: Look['accessory']): THREE.Group | null {
  if (kind === 'none') return null
  const m = accessoryMaterials()
  const group = new THREE.Group()
  group.name = 'held'
  if (kind === 'briefcase') {
    // The handle is in the grip (the origin); the case hangs below it, its flat sides along the leg.
    const w = 0.4
    const h = 0.29
    const d = 0.085
    const top = -0.055
    const body = new THREE.ExtrudeGeometry(roundedRect(w, h, 0.022), { depth: d - 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 4, curveSegments: 8 })
    body.translate(0, top - h / 2, -(d - 0.012) / 2)
    const caseMesh = new THREE.Mesh(body, m.leather)
    caseMesh.rotation.y = Math.PI / 2
    // The handle: an arch over the top of the case, under the fingers.
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.008, 10, 28, Math.PI), m.leather)
    handle.rotation.y = Math.PI / 2
    handle.position.y = top - 0.002
    // Gold clasps near the top, on both flat sides.
    for (const side of [-1, 1]) {
      for (const along of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.03), m.gold)
        c.position.set(side * (d / 2 + 0.002), top - 0.024, along * 0.1)
        group.add(c)
      }
    }
    group.add(caseMesh, handle)
    group.userData.hang = true
  } else if (kind === 'phone') {
    const body = new THREE.ExtrudeGeometry(roundedRect(0.072, 0.152, 0.011), { depth: 0.005, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 3, curveSegments: 8 })
    body.translate(0, 0, -0.0025)
    const phone = new THREE.Mesh(body, m.phone)
    const screen = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(0.066, 0.145, 0.009), 8), m.screen)
    screen.position.z = 0.0041
    const held = new THREE.Group()
    held.add(phone, screen)
    // Upright in the hand, the screen toward the thumb side.
    held.rotation.set(0, -Math.PI / 2, Math.PI / 2)
    held.position.set(0.01, 0.075, 0.022)
    group.add(held)
  } else {
    // A takeaway coffee: a paper cup with a sleeve and a lid.
    const profile = [new THREE.Vector2(0, 0), new THREE.Vector2(0.026, 0), new THREE.Vector2(0.029, 0.004), new THREE.Vector2(0.038, 0.11), new THREE.Vector2(0, 0.11)]
    const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, 36), m.paper)
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.0355, 0.0315, 0.042, 36, 1, true), m.sleeve)
    sleeve.position.y = 0.052
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.04, 0.012, 36), m.lid)
    lid.position.y = 0.115
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.037, 0.008, 36), m.lid)
    top.position.y = 0.124
    const held = new THREE.Group()
    held.add(cup, sleeve, lid, top)
    // Standing in the grip: the cup's axis runs across the knuckles.
    held.rotation.set(0, 0, Math.PI / 2)
    held.position.set(0.055, 0.075, 0.042)
    group.add(held)
  }
  group.traverse((o) => {
    o.castShadow = true
  })
  return group
}

/** A round gold stand, like a game piece (the board and the hero cards). */
export function buildBase(): THREE.Group {
  const m = accessoryMaterials()
  const profile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.43, 0),
    new THREE.Vector2(0.445, 0.008),
    new THREE.Vector2(0.45, 0.03),
    new THREE.Vector2(0.44, 0.05),
    new THREE.Vector2(0.4, 0.058),
    new THREE.Vector2(0, 0.058),
  ]
  const group = new THREE.Group()
  group.name = 'base'
  group.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 72), m.gold))
  return group
}

let shadowTexture: THREE.CanvasTexture | null = null

/** A soft round shadow under the feet (cheaper than a shadow map in the small scenes). */
export function buildContactShadow(size = 0.95): THREE.Mesh {
  if (!shadowTexture) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')!
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(0,0,0,0.55)')
    g.addColorStop(0.45, 'rgba(0,0,0,0.25)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 128, 128)
    shadowTexture = new THREE.CanvasTexture(canvas)
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.8), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }))
  mesh.rotation.x = -Math.PI / 2
  mesh.renderOrder = -1
  return mesh
}
