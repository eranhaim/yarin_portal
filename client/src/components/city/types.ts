import type { ChapterState } from '../../lib/types'

/** A level of the plan, drawn as a district of the city. */
export type CityDistrict = { index: number; id: string; title: string; state: ChapterState; color: string }

/** A task of the plan, drawn as a mission marker on the main road. */
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
