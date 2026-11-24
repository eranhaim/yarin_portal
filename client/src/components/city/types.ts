import type { ChapterState } from '../../lib/types'

/** A level of the plan, drawn as a district of the city. */
export type CityDistrict = { index: number; id: string; title: string; state: ChapterState; color: string }

/** A task of the plan, drawn as a place on the main avenue. */
export type CityMission = {
  /** Index over all missions, in plan order. */
  index: number
  id: string
  chapterIndex: number
  taskIndex: number
  badge: string
  title: string
  state: 'done' | 'current' | 'open' | 'locked'
}

/** How much the device can draw. It starts from a guess and goes down when the picture is slow. */
export type Quality = 'high' | 'medium' | 'low'
