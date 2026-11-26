// The player's car: the Khronos "Car Concept" sample (CC BY 4.0), made light for phones.
// Removes the Khronos logos, the paint variants, the transmission glass, hidden parts and extra detail, and merges
// the parts by material: one body (about 20 draws) and four wheels.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, joinPrimitives, meshopt, prune, simplifyPrimitive, textureCompress, transformPrimitive, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
import { statSync } from 'node:fs'

const [input, output] = process.argv.slice(2)
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready])
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(input)
const root = doc.getRoot()
const scene = root.getDefaultScene()

// Paint variants (pearl, graphite): the default carmine stays.
for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'KHR_materials_variants') ext.dispose()

// Parts never seen from the street: most of the inside, the engine bay, the pedals, the wipers, the brake pads.
const DROP =
  /^(BodyWindshieldWipers|InteriorPedal|Engine$|InteriorSteeringEmblem$|InteriorCage$|InteriorFloor|InteriorPillar$|InteriorMid$|InteriorRear|InteriorDoor|BodyHoodInterior|BodyHoodUnder$|Axles$|InteriorSteeringDashColumn$|.*BrakePad$)/
for (const node of root.listNodes()) if (DROP.test(node.getName())) node.dispose()

// The Khronos logos live in one texture: it becomes black (no glow, no logo). The plate gets its own texture in the app.
const black = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000000' } }).webp().toBuffer()
for (const texture of root.listTextures()) if (/Khronos_C/.test(texture.getURI())) texture.setImage(new Uint8Array(black)).setMimeType('image/webp')

for (const material of root.listMaterials()) {
  // Real transmission renders the scene twice. Tinted, see-through glass looks the same from the chase camera.
  if (material.getExtension('KHR_materials_transmission')) {
    material.setExtension('KHR_materials_transmission', null)
    material.setAlphaMode('BLEND').setBaseColorFactor([0.04, 0.05, 0.06, 0.42]).setRoughnessFactor(0.04).setMetallicFactor(0)
  }
  material.setExtension('KHR_materials_iridescence', null)
}

await doc.transform(weld())

// Fewer triangles: the rims a lot, the rest a little (the silhouette stays).
for (const node of root.listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const rim = /Rim$/.test(node.getName())
  for (const prim of mesh.listPrimitives()) {
    const count = (prim.getIndices()?.getCount() ?? 0) / 3
    if (count < 600) continue
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: rim ? 0.09 : 0.28, error: rim ? 0.003 : 0.001 })
  }
}

// Merge by material (and by the set of attributes, which must match): the body in car space, each wheel in its own.
const WHEEL = /^Wheel(Front|Rear)(L|R)$/
const signature = (prim) => `${prim.getMaterial()?.getName() ?? '#'}|${prim.listSemantics().sort().join(',')}|${prim.getMode()}`
function merge(owner, nodes, base) {
  const groups = new Map()
  const inverse = base ? invert(base.getWorldMatrix()) : null
  for (const node of nodes) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const world = node.getWorldMatrix()
    const matrix = inverse ? multiply(inverse, world) : world
    for (const prim of mesh.listPrimitives()) {
      const copy = prim.clone()
      transformPrimitive(copy, matrix)
      const key = signature(copy)
      groups.set(key, [...(groups.get(key) ?? []), copy])
    }
  }
  for (const prims of groups.values()) {
    const joined = joinPrimitives(prims)
    const node = doc.createNode(prims[0].getMaterial()?.getName() ?? 'part').setMesh(doc.createMesh().addPrimitive(joined))
    owner.addChild(node)
  }
}
const mat4 = (m) => Array.from(m)
function multiply(a, b) {
  const o = new Array(16).fill(0)
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
function invert(m) {
  // Rigid transforms only (rotation + translation): the inverse is the transposed rotation.
  const o = mat4(m)
  const r = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]
  o[0] = r[0]; o[1] = r[3]; o[2] = r[6]
  o[4] = r[1]; o[5] = r[4]; o[6] = r[7]
  o[8] = r[2]; o[9] = r[5]; o[10] = r[8]
  const t = [m[12], m[13], m[14]]
  o[12] = -(o[0] * t[0] + o[4] * t[1] + o[8] * t[2])
  o[13] = -(o[1] * t[0] + o[5] * t[1] + o[9] * t[2])
  o[14] = -(o[2] * t[0] + o[6] * t[1] + o[10] * t[2])
  return o
}

const all = root.listNodes()
const wheels = all.filter((n) => WHEEL.test(n.getName()))
const insideWheel = (n) => {
  for (let p = n; p; p = p.getParentNode()) if (WHEEL.test(p.getName())) return true
  return false
}
const body = doc.createNode('Body')
merge(body, all.filter((n) => n.getMesh() && !insideWheel(n)), null)
const newWheels = wheels.map((w) => {
  const node = doc.createNode(w.getName()).setTranslation(w.getWorldMatrix().slice(12, 15))
  const rotationOnly = w.getWorldMatrix().slice()
  rotationOnly[12] = rotationOnly[13] = rotationOnly[14] = 0
  merge(node, w.listChildren().flatMap(function walk(c) { return [c, ...c.listChildren().flatMap(walk)] }), { getWorldMatrix: () => [...w.getWorldMatrix()] })
  return node
})
for (const n of all) n.dispose()
const car = doc.createNode('Car')
car.addChild(body)
for (const w of newWheels) car.addChild(w)
scene.addChild(car)

await doc.transform(
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
)
await io.write(output, doc)
let tris = 0
let draws = 0
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  tris += (p.getIndices()?.getCount() ?? 0) / 3
  draws++
}
console.log('car', (statSync(output).size / 1e6).toFixed(2), 'MB,', Math.round(tris), 'triangles,', draws, 'draws')
