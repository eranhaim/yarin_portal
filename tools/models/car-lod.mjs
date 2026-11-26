// A light copy of the concept car for traffic and parked cars: no interior, five merged parts
// (paint, glass, dark, tail lights, head lights), about 5k triangles in all.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { joinPrimitives, meshopt, prune, simplifyPrimitive, transformPrimitive, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import { statSync } from 'node:fs'

const [input, output] = process.argv.slice(2)
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready])
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })
const doc = await io.read(input)
const root = doc.getRoot()
for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'KHR_materials_variants') ext.dispose()

const DROP = /^(Interior|BodyWindshieldWipers|BodyHoodInterior|BodyHoodUnder|Engine|License|Axles|.*BrakePad|.*BrakeDisc|.*Gasket|.*Handle0)/
const layerOf = (material) => {
  const name = material?.getName() ?? ''
  if (/^Paint/.test(name)) return 'paint'
  if (name === 'Glass') return 'glass'
  if (name === 'Brakelight') return 'tail'
  if (name === 'Headlight') return 'head'
  return 'dark'
}
const RATIO = { paint: 0.022, glass: 0.06, dark: 0.012, tail: 0.4, head: 0.4 }

const parts = { paint: [], glass: [], dark: [], tail: [], head: [] }
for (const node of root.listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  let hidden = false
  for (let n = node; n; n = n.getParentNode()) if (DROP.test(n.getName())) hidden = true
  if (hidden) continue
  const matrix = node.getWorldMatrix()
  for (const prim of mesh.listPrimitives()) {
    // A bare copy (position and normal only) in world space.
    const copy = doc.createPrimitive().setIndices(prim.getIndices()?.clone() ?? null)
    for (const semantic of ['POSITION', 'NORMAL']) {
      const a = prim.getAttribute(semantic)
      if (a) copy.setAttribute(semantic, a.clone())
    }
    transformPrimitive(copy, matrix)
    parts[layerOf(prim.getMaterial())].push(copy)
  }
}
let tris = 0
for (const [layer, prims] of Object.entries(parts)) {
  if (!prims.length) continue
  const joined = joinPrimitives(prims)
  const m = doc.createMesh(layer).addPrimitive(joined)
  doc.getRoot().getDefaultScene().addChild(doc.createNode(layer).setMesh(m))
}
// Keep only the five merged meshes.
for (const node of root.listNodes()) if (!(node.getName() in parts)) node.dispose()
await doc.transform(weld())
for (const node of root.listNodes()) {
  const prim = node.getMesh()?.listPrimitives()[0]
  if (!prim) continue
  prim.setMaterial(doc.createMaterial(node.getName()))
  simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: RATIO[node.getName()], error: 0.01, lockBorder: false })
  tris += prim.getIndices().getCount() / 3
}
await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'high' }))
await io.write(output, doc)
console.log('car-lod', (statSync(output).size / 1e3).toFixed(0), 'KB,', Math.round(tris), 'triangles')
