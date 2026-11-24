import * as THREE from 'three'
import type { CityDistrict, CityMission } from './types'

// The plan of the city, in meters. The 3D street and the navigation map are both drawn from it, so a place on the
// map is always the same place in the street. The main avenue runs from the start (the HQ) toward -Z.

export const ROAD = {
  /** Half width of the asphalt, up to the curb. */
  half: 9.4,
  /** Half width of the planted median. */
  median: 1.5,
  /** Middle of the right-hand lane nearest the sidewalk (where the player drives). */
  lane: 6.4,
  innerLane: 3.2,
  sidewalk: 6,
}

/** Distance between two missions along the avenue. */
export const MISSION_GAP = 44
const START = 60
const END = 70
/** A side street after every second mission. */
const CROSS_EVERY = 2

export type Frame = { position: THREE.Vector3; tangent: THREE.Vector3; right: THREE.Vector3; angle: number }

export type CityLayout = {
  curve: THREE.CatmullRomCurve3
  length: number
  /** Distance along the avenue of every mission, and of the finish. */
  missionAt: number[]
  finishAt: number
  /** Where each district starts and ends along the avenue. */
  spans: { from: number; to: number }[]
  crossings: number[]
  frame: (distance: number) => Frame
  /** A point at a distance along the avenue, moved to the right (negative = left). */
  point: (distance: number, offset: number, height?: number) => THREE.Vector3
}

export function layoutCity(districts: CityDistrict[], missions: CityMission[]): CityLayout {
  const count = Math.max(1, missions.length)
  const length = START + count * MISSION_GAP + END
  // A gentle, irregular curve: straight enough to see far, curved enough to have places.
  const points: THREE.Vector3[] = []
  for (let d = -80; d <= length + 260; d += 40) {
    const x = Math.sin(d / 150) * 26 + Math.sin(d / 61 + 1.3) * 7
    points.push(new THREE.Vector3(x, 0, -d))
  }
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  curve.arcLengthDivisions = 1200
  const total = curve.getLength()
  // Distance 0 of the city is 80 m after the curve begins, so the street also exists behind the start.
  const lead = 80

  const frame = (distance: number): Frame => {
    const u = THREE.MathUtils.clamp((distance + lead) / total, 0, 1)
    const position = curve.getPointAt(u)
    const tangent = curve.getTangentAt(u).setY(0).normalize()
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x)
    return { position, tangent, right, angle: Math.atan2(-tangent.x, -tangent.z) }
  }
  const point = (distance: number, offset: number, height = 0) => {
    const f = frame(distance)
    return f.position.clone().addScaledVector(f.right, offset).setY(height)
  }

  const missionAt = missions.map((_, i) => START + i * MISSION_GAP)
  const finishAt = START + missions.length * MISSION_GAP + 14
  const spans = districts.map((d) => {
    const own = missions.filter((m) => m.chapterIndex === d.index)
    const from = own.length ? missionAt[own[0]!.index]! - MISSION_GAP / 2 : 0
    const to = own.length ? missionAt[own.at(-1)!.index]! + MISSION_GAP / 2 : 0
    return { from, to }
  })
  const crossings: number[] = []
  for (let i = CROSS_EVERY; i < missions.length; i += CROSS_EVERY) crossings.push(START + i * MISSION_GAP - MISSION_GAP / 2)

  return { curve, length, missionAt, finishAt, spans, crossings, frame, point }
}

/** Seeded random numbers, so the city looks the same on every visit. */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Where the car waits for a mission: a little before its marker, in the right-hand lane. */
export const parkingFor = (layout: CityLayout, position: number) =>
  (layout.missionAt[position] ?? layout.finishAt) - 17
