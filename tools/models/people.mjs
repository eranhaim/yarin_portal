// Makes the Rocketbox people (as converted by avatar-studio) small enough for phones:
// keeps 6 moves and 4 face shapes, 1024 px textures, meshopt compression.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, resample, textureCompress } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Usage: node people.mjs <folder with avatar-studio models/*.glb> <output folder> [ids...]
const [SOURCE, OUTPUT, ...only] = process.argv.slice(2)
const KEEP_CLIPS = ['Idle', 'Walk', 'Wave', 'Cheer', 'Clap', 'Confident']
const KEEP_MORPHS = ['eyeBlinkLeft', 'eyeBlinkRight', 'mouthSmileLeft', 'mouthSmileRight']
/** Long clips are cut (seconds); the loop then starts again. */
const MAX_SECONDS = { Confident: 18, Cheer: 12 }

await MeshoptDecoder.ready
await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

function trim(doc, clip, seconds) {
  for (const sampler of clip.listSamplers()) {
    const input = sampler.getInput()
    const output = sampler.getOutput()
    const times = input.getArray()
    let n = times.findIndex((t) => t > seconds)
    if (n < 0) continue
    const size = output.getElementSize()
    const newInput = doc.createAccessor().setType('SCALAR').setArray(n >= 2 ? times.slice(0, n) : Float32Array.of(times[0], seconds)).setBuffer(input.getBuffer())
    const values = output.getArray()
    const newOutput = doc.createAccessor().setType(output.getType()).setArray(values.slice(0, Math.max(2, n) * size)).setBuffer(output.getBuffer())
    if (output.getNormalized()) newOutput.setNormalized(true)
    sampler.setInput(newInput).setOutput(newOutput)
  }
}

async function optimize(file, out) {
  const doc = await io.read(file)
  const root = doc.getRoot()
  for (const clip of root.listAnimations()) {
    if (!KEEP_CLIPS.includes(clip.getName())) {
      clip.dispose()
      continue
    }
    if (MAX_SECONDS[clip.getName()]) trim(doc, clip, MAX_SECONDS[clip.getName()])
    // Morph weights are not animated by the moves. Only the hips move; the other bones only turn, and nothing scales.
    for (const ch of clip.listChannels()) {
      const path = ch.getTargetPath()
      const bone = ch.getTargetNode()?.getName() ?? ''
      if (path === 'weights' || path === 'scale' || (path === 'translation' && bone !== 'mixamorig:Hips')) {
        const sampler = ch.getSampler()
        ch.dispose()
        sampler?.dispose()
      }
    }
  }
  for (const node of root.listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const names = mesh.getExtras()?.targetNames ?? []
    if (!names.length) continue
    const keep = node.getName() === 'Body' ? names.map((n, i) => (KEEP_MORPHS.includes(n) ? i : -1)).filter((i) => i >= 0) : []
    const weights = mesh.getWeights()
    for (const prim of mesh.listPrimitives()) {
      prim.listTargets().forEach((t, i) => {
        if (!keep.includes(i)) {
          prim.removeTarget(t)
          t.dispose()
        }
      })
    }
    mesh.setWeights(keep.map((i) => weights[i] ?? 0))
    mesh.setExtras({ ...mesh.getExtras(), targetNames: keep.map((i) => names[i]) })
  }
  await doc.transform(
    dedup(),
    prune(),
    resample({ tolerance: 4e-4 }),
    // Surface detail (bumps, shine) needs fewer pixels than color.
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(normalTexture|metallicRoughnessTexture)$/, resize: [512, 512], quality: 85 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColorTexture$/, resize: [1024, 1024], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  )
  await io.write(out, doc)
}

mkdirSync(OUTPUT, { recursive: true })
for (const f of readdirSync(SOURCE).filter((f) => f.endsWith('.glb'))) {
  const id = f.split('_')[0]
  if (only.length && !only.includes(id)) continue
  const out = join(OUTPUT, `${id}.glb`)
  await optimize(join(SOURCE, f), out)
  console.log(id, (statSync(join(SOURCE, f)).size / 1e6).toFixed(1), '->', (statSync(out).size / 1e6).toFixed(2), 'MB')
}
