import { useFrame, useLoader } from '@react-three/fiber'
import { useDeferredValue, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { OUTFIT_COLOR } from '../../lib/game'
import type { Look } from '../../lib/types'
import type { MascotPose } from '../mascot/pose'
import { buildBase, buildChain, buildContactShadow, buildGlasses, buildHandItem } from './accessories'
import { personFor, personUrl, type PersonId } from './people'

// A realistic person: a rigged model with motion-captured moves, blinking eyes, and the clothes and extras of the look.
// The model faces +Z and stands on y = 0; one meter is one unit.

const withMeshopt = (loader: THREE.Loader) => {
  ;(loader as GLTFLoader).setMeshoptDecoder(MeshoptDecoder)
}

/** Starts downloading a person, for example when the pointer is over their picture. */
export function preloadPerson(id: PersonId) {
  useLoader.preload(GLTFLoader, personUrl(id), withMeshopt)
}

const CLIPS: Record<MascotPose, string> = { idle: 'Idle', wave: 'Wave', cheer: 'Cheer', walk: 'Walk', boss: 'Confident' }
/** Moves that need both hands: what the person holds is put away meanwhile. */
const BOTH_HANDS = new Set(['Cheer', 'Clap'])
const HOP_CLIP = 'Clap'
const HOP_SECONDS = 2.4

/** Clothes: which parts each outfit shows. "original" is the person's own clothes. */
const OUTFIT_PARTS = {
  original: ['Outfit_original', 'Skin_original'],
  formal: ['Outfit_formal', 'Skin_formal'],
  shirt: ['Top_shirt', 'Skin_shirt', 'Trousers', 'Shoes'],
  tee: ['Top_tee', 'Skin_tee', 'Trousers', 'Shoes'],
} as const
const ALL_PARTS = new Set<string>(Object.values(OUTFIT_PARTS).flat())
const TROUSERS = '#34363c'

const settled = new WeakSet<THREE.AnimationClip>()

/** The moves were recorded walking around a room; here the person stays on their spot. */
function settleClips(clips: THREE.AnimationClip[], restHips: THREE.Vector3) {
  for (const clip of clips) {
    if (settled.has(clip)) continue
    settled.add(clip)
    const track = clip.tracks.find((t) => t.name === 'mixamorigHips.position')
    if (!track || track.times.length < 2) continue
    const { times, values } = track
    const n = times.length
    const span = times[n - 1]! - times[0]! || 1
    const x0 = values[0]!
    const z0 = values[2]!
    const dx = values[(n - 1) * 3]! - x0
    const dz = values[(n - 1) * 3 + 2]! - z0
    for (let i = 0; i < n; i++) {
      const k = (times[i]! - times[0]!) / span
      values[i * 3] = values[i * 3]! - x0 - dx * k + restHips.x
      values[i * 3 + 2] = values[i * 3 + 2]! - z0 - dz * k + restHips.z
    }
  }
}

type Rig = {
  root: THREE.Group
  model: THREE.Object3D
  mixer: THREE.AnimationMixer
  actions: Map<string, THREE.AnimationAction>
  parts: Map<string, THREE.Mesh[]>
  face: THREE.Mesh | null
  bones: Record<'head' | 'chest' | 'hand' | 'forearm', THREE.Object3D | null>
  /** Where each extra sits on its bone, measured once in the rest pose. */
  anchors: Partial<Record<'glasses' | 'chain' | 'held', { bone: THREE.Object3D; local: THREE.Matrix4 }>>
  materials: THREE.Material[]
  extras: THREE.Object3D[]
}

function prepareMaterial(mesh: THREE.Mesh, name: string): THREE.Material {
  const source = mesh.material as THREE.MeshStandardMaterial
  const m = source.clone()
  if (name === 'Hair') {
    // Hair strands: a solid core (right depth, no sorting trouble); soft tips are drawn by a second pass.
    Object.assign(m, { alphaTest: 0.5, transparent: false, depthWrite: true, alphaToCoverage: true, side: THREE.DoubleSide })
    m.roughness = Math.max(0.65, m.roughness)
  } else if (m.transparent) {
    Object.assign(m, { alphaTest: 0.3, depthWrite: false })
  }
  m.envMapIntensity = 1
  return m
}

function buildRig(gltf: GLTF): Rig {
  const model = cloneSkinned(gltf.scene)
  const root = new THREE.Group()
  root.add(model)
  const parts = new Map<string, THREE.Mesh[]>()
  const materials: THREE.Material[] = []
  const hair: THREE.SkinnedMesh[] = []
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const name = mesh.name || mesh.parent?.name || ''
    mesh.material = prepareMaterial(mesh, name)
    materials.push(mesh.material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    // Skinned parts move away from their rest bounds.
    mesh.frustumCulled = false
    parts.set(name, [...(parts.get(name) ?? []), mesh])
    if (name === 'Hair' && (mesh as THREE.SkinnedMesh).isSkinnedMesh) hair.push(mesh as THREE.SkinnedMesh)
  })
  // Parts with the same bones and the same bind pose share one skeleton: one bone upload per frame instead of one per
  // part. (Some parts, like the hair, were bound in another pose; they keep their own.)
  let shared: THREE.Skeleton | null = null
  model.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    if (!shared) shared = mesh.skeleton
    else if (
      mesh.skeleton.bones.length === shared.bones.length &&
      mesh.skeleton.bones.every((b, i) => b === shared!.bones[i] && mesh.skeleton.boneInverses[i]!.equals(shared!.boneInverses[i]!))
    ) {
      mesh.skeleton.dispose()
      mesh.skeleton = shared
    }
  })
  for (const h of hair) {
    const tips = h.clone() as THREE.SkinnedMesh
    const m = (h.material as THREE.MeshStandardMaterial).clone()
    Object.assign(m, { alphaTest: 0.04, alphaToCoverage: false, transparent: true, depthWrite: false })
    tips.material = m
    tips.renderOrder = 1
    tips.castShadow = false
    materials.push(m)
    h.parent?.add(tips)
  }

  const bone = (name: string) => model.getObjectByName(name) ?? null
  const bones = {
    head: bone('mixamorigHead'),
    chest: bone('mixamorigSpine2') ?? bone('mixamorigNeck'),
    hand: bone('mixamorigLeftHand'),
    forearm: bone('mixamorigLeftForeArm'),
  }
  // Everything below is measured in the rest pose, before any move plays.
  model.updateMatrixWorld(true)
  const hips = bone('mixamorigHips')
  settleClips(gltf.animations, hips ? hips.position.clone() : new THREE.Vector3())
  const at = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())
  const anchors: Rig['anchors'] = {}
  const anchor = (target: THREE.Object3D, world: THREE.Matrix4) => ({ bone: target, local: target.matrixWorld.clone().invert().multiply(world) })

  // Glasses: on the lens plane in front of the eyes, sized to the distance between them.
  const leftEye = bone('mixamorigLeftEye')
  const rightEye = bone('mixamorigRightEye')
  if (bones.head && leftEye && rightEye) {
    const l = at(leftEye)
    const r = at(rightEye)
    const scale = THREE.MathUtils.clamp(l.distanceTo(r) / 0.063, 0.85, 1.2)
    const place = l.add(r).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.003, 0.024 * scale))
    anchors.glasses = anchor(bones.head, new THREE.Matrix4().makeScale(scale, scale, scale).setPosition(place))
  }
  // The chain: around the base of the neck, carried by the chest.
  const neck = bone('mixamorigNeck')
  if (bones.chest && neck) anchors.chain = anchor(bones.chest, new THREE.Matrix4().setPosition(at(neck).add(new THREE.Vector3(0, -0.012, 0.012))))
  // The left hand's own frame, from where its fingers start: +Y along the fingers, +X toward the little finger,
  // +Z out of the palm (see buildHandItem).
  const middle = bone('mixamorigLeftHandMiddle1')
  const index = bone('mixamorigLeftHandIndex1')
  const pinky = bone('mixamorigLeftHandPinky1')
  if (bones.hand && middle && index && pinky) {
    const wrist = at(bones.hand)
    const y = at(middle).sub(wrist).normalize()
    const toIndex = at(index).sub(at(pinky))
    toIndex.addScaledVector(y, -toIndex.dot(y)).normalize()
    const z = new THREE.Vector3().crossVectors(y, toIndex).normalize()
    const x = toIndex.clone().negate()
    anchors.held = anchor(bones.hand, new THREE.Matrix4().makeBasis(x, y, z).setPosition(wrist))
  }

  const mixer = new THREE.AnimationMixer(model)
  const actions = new Map(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]))
  const face = (parts.get('Body')?.find((m) => m.morphTargetDictionary) as THREE.Mesh | undefined) ?? null
  return { root, model, mixer, actions, parts, face, bones, anchors, materials, extras: [] }
}

/** suit = a suit (their own, or one fitted to them), blazer = a buttoned shirt, tee = a T-shirt, hoodie = their own clothes. */
function setOutfit(rig: Rig, look: Look) {
  const top: keyof typeof OUTFIT_PARTS =
    look.outfit === 'suit' ? (rig.parts.has('Outfit_formal') ? 'formal' : 'original') : look.outfit === 'blazer' ? 'shirt' : look.outfit === 'tee' ? 'tee' : 'original'
  const show = new Set<string>(OUTFIT_PARTS[top])
  const color = new THREE.Color(OUTFIT_COLOR[look.outfitColor])
  for (const [name, meshes] of rig.parts) {
    if (!ALL_PARTS.has(name)) continue
    for (const mesh of meshes) {
      mesh.visible = show.has(name)
      const m = mesh.material as THREE.MeshStandardMaterial
      // The shirt and the T-shirt are white cloth: the chosen color dyes them.
      if (name === 'Top_shirt' || name === 'Top_tee') m.color.copy(color)
      if (name === 'Trousers') m.color.set(TROUSERS)
    }
  }
}

/** Glasses, a chain and what the hand holds, fixed to their bones. */
function addExtras(rig: Rig, look: Look): THREE.Object3D[] {
  const extras: THREE.Object3D[] = []
  const put = (object: THREE.Object3D | null, where: Rig['anchors'][keyof Rig['anchors']]) => {
    if (!object || !where) return
    where.local.decompose(object.position, object.quaternion, object.scale)
    where.bone.add(object)
    extras.push(object)
  }
  put(buildGlasses(look.glasses), rig.anchors.glasses)
  put(look.chain ? buildChain() : null, rig.anchors.chain)
  const held = buildHandItem(look.accessory)
  if (held?.userData.hang) {
    // It hangs from the hand but stays upright: placed on every frame (see Person).
    rig.model.add(held)
    extras.push(held)
  } else put(held, rig.anchors.held)
  return extras
}

export type PersonProps = {
  look: Look
  pose: MascotPose
  /** Change it to clap once. */
  hopKey?: number
  reducedMotion?: boolean
  /** The gold stand under the feet, like a game piece. */
  base?: boolean
  /** A soft round shadow under the feet (for scenes without shadow maps). */
  groundShadow?: boolean
  /** Pose updates per second. Small people far away look the same at 30 (the moves were recorded at 15). */
  rate?: number
}

export function Person({ look, pose, hopKey = 0, reducedMotion = false, base = false, groundShadow = false, rate = 60 }: PersonProps) {
  const info = personFor(look)
  // While a newly chosen person loads, the one before stays on screen.
  const id = useDeferredValue(info.id)
  const gltf = useLoader(GLTFLoader, personUrl(id), withMeshopt)
  const rig = useMemo(() => buildRig(gltf), [gltf])
  const state = useRef({ clip: '', hopUntil: -1, hop: hopKey, blinkAt: 2 + Math.random() * 2, bend: 0, time: 0, owed: 0 })

  useEffect(
    () => () => {
      rig.mixer.stopAllAction()
      // If the same person comes back (React may unmount and mount again), the move starts again.
      state.current.clip = ''
      for (const m of rig.materials) m.dispose()
    },
    [rig],
  )

  const extrasKey = `${look.glasses}|${look.chain}|${look.accessory}`
  useEffect(() => {
    const extras = addExtras(rig, look)
    rig.extras = extras
    return () => {
      for (const e of extras) e.removeFromParent()
      rig.extras = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig, extrasKey])

  useEffect(() => setOutfit(rig, look), [rig, look])

  useEffect(() => {
    const s = state.current
    if (s.hop !== hopKey) {
      s.hop = hopKey
      if (!reducedMotion && rig.actions.has(HOP_CLIP)) s.hopUntil = s.time + HOP_SECONDS
    }
  }, [hopKey, rig, reducedMotion])

  const base3d = useMemo(() => (base ? buildBase() : null), [base])
  const shadow = useMemo(() => (groundShadow ? buildContactShadow() : null), [groundShadow])
  const lift = base ? 0.058 : 0

  const scratch = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), dir: new THREE.Vector3(), q: new THREE.Quaternion(), wq: new THREE.Quaternion(), pq: new THREE.Quaternion(), f: new THREE.Vector3(), l: new THREE.Vector3() }), [])

  useFrame((_, delta) => {
    const s = state.current
    s.owed += Math.min(delta, 0.1)
    // Below the frame rate, the pose waits for its turn (the bones then keep last frame's pose).
    if (rate < 60 && s.owed < 1 / rate - 0.002 && s.clip) return
    const dt = s.owed
    s.owed = 0
    s.time += dt
    const wanted = s.hopUntil > s.time ? HOP_CLIP : CLIPS[pose]
    if (wanted !== s.clip) {
      const next = rig.actions.get(wanted) ?? rig.actions.get('Idle')
      const prev = rig.actions.get(s.clip)
      if (next) {
        next.reset().setEffectiveWeight(1).play()
        // Not everybody in step: each person starts the loop at another moment.
        if (!prev) next.time = Math.random() * next.getClip().duration
        if (prev && prev !== next) next.crossFadeFrom(prev, s.clip ? 0.45 : 0, false)
      }
      s.clip = wanted
    }
    rig.mixer.update(reducedMotion ? 0 : dt)

    const busy = BOTH_HANDS.has(s.clip)
    for (const e of rig.extras) {
      if (e.name !== 'held') continue
      e.visible = !busy
      if (e.userData.hang && rig.bones.hand) {
        // Below the grip and a little out from the leg, in the person's own frame.
        rig.bones.hand.updateWorldMatrix(true, false)
        rig.model.worldToLocal(rig.bones.hand.getWorldPosition(e.position))
        e.position.x += 0.035
        e.position.y -= 0.035
      }
    }

    // A phone or a coffee is held up in front: the forearm turns forward (after the move, on top of it).
    const holding = !busy && (look.accessory === 'phone' || look.accessory === 'coffee')
    s.bend += ((holding ? 1 : 0) - s.bend) * Math.min(1, dt * 6)
    const { forearm, hand } = rig.bones
    if (s.bend > 0.01 && forearm && hand && forearm.parent) {
      const { a, b, dir, q, wq, pq, f, l } = scratch
      forearm.updateWorldMatrix(true, false)
      hand.updateWorldMatrix(false, false)
      forearm.getWorldPosition(a)
      hand.getWorldPosition(b)
      const current = b.sub(a).normalize()
      rig.model.getWorldQuaternion(wq)
      f.set(0, 0, 1).applyQuaternion(wq)
      l.set(1, 0, 0).applyQuaternion(wq)
      dir.set(0, 1, 0).applyQuaternion(wq).multiplyScalar(0.32).addScaledVector(f, 0.85).addScaledVector(l, -0.3).normalize()
      q.setFromUnitVectors(current, dir)
      q.slerp(new THREE.Quaternion(), 1 - s.bend)
      forearm.getWorldQuaternion(wq)
      forearm.parent.getWorldQuaternion(pq)
      forearm.quaternion.copy(pq.invert().multiply(q).multiply(wq))
      forearm.updateMatrixWorld(true)
    }

    // Blinks, now and then, and a hint of a smile.
    const face = rig.face
    if (face?.morphTargetDictionary && face.morphTargetInfluences) {
      const dict = face.morphTargetDictionary
      let blink = 0
      if (!reducedMotion) {
        const since = s.time - s.blinkAt
        if (since > 0.16) s.blinkAt = s.time + 2.2 + Math.random() * 3.5
        else if (since > 0) blink = Math.sin((since / 0.16) * Math.PI)
      }
      for (const key of ['eyeBlinkLeft', 'eyeBlinkRight']) if (dict[key] !== undefined) face.morphTargetInfluences[dict[key]] = blink
      for (const key of ['mouthSmileLeft', 'mouthSmileRight']) if (dict[key] !== undefined) face.morphTargetInfluences[dict[key]] = 0.16
    }
  })

  return (
    <group>
      {base3d && <primitive object={base3d} />}
      {shadow && <primitive object={shadow} position={[0, lift + 0.002, 0]} />}
      <primitive object={rig.root} position={[0, lift, 0]} />
    </group>
  )
}
