import { Icon } from '../../components/Icon'
import type { LevelInfo } from '../../lib/types'

/** Where a customer is on their map, for example "Level 2/5". */
export function LevelBadge({ level }: { level: LevelInfo }) {
  if (level.total === 0) return <span className="chip">No levels</span>
  if (level.finished) {
    return (
      <span className="chip chip--success">
        <Icon name="trophy" size={13} /> Finished
      </span>
    )
  }
  return (
    <span className="chip chip--brand" title={level.title ?? undefined}>
      <Icon name="flag" size={13} /> Level {level.index + 1}/{level.total}
    </span>
  )
}
