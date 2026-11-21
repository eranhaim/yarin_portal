import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { colorFromString, initials } from '../lib/format'
import { groupColor } from '../lib/groups'
import type { ChapterState } from '../lib/types'
import { Icon, type IconName } from './Icon'
import './Board.css'

// A board-game map: a square loop of squares around the board's edge.
// Each level (chapter) is a color group: a "station" square with the level name, then one square per task.
// The player's token stands on the first open task and hops forward when tasks are completed.

export type BoardTask = { id: string; title: string; started: boolean; completed: boolean }
export type BoardChapter = { id: string; title: string; state: ChapterState; tasks: BoardTask[] }

/** position = index of the player's task over all tasks in plan order; the number of tasks = finished. */
export type BoardPlayer = { id: string; name: string; avatarUrl: string | null; position: number }

type Props = {
  chapters: BoardChapter[]
  /** The main token (the customer, or one customer in the admin panel). */
  player?: BoardPlayer
  /** When lower than player.position, the token hops from that position to the current one. */
  animateFrom?: number | null
  onArrive?: () => void
  /** Many small tokens (admin view of everyone on a plan). */
  crowd?: BoardPlayer[]
  onSelectTask?: (chapterIndex: number, taskIndex: number) => void
  onSelectChapter?: (chapterIndex: number) => void
  onSelectPlayer?: (id: string) => void
  /** No locks, stamps or progress (admin view of a plan with many customers). */
  plain?: boolean
  title?: string
  /** Extra content in the middle of the board (hidden on small boards). */
  center?: ReactNode
}

// ---------- Layout ----------

/** Corner size relative to a normal square. */
const CORNER = 1.55

type Side = 'corner' | 'bottom' | 'left' | 'top' | 'right'
type CornerKind = 'start' | 'meeting' | 'coffee' | 'review'
type FillerKind = 'idea' | 'bonus'

type Square = { index: number; row: number; col: number; side: Side } & (
  | { kind: 'corner'; corner: CornerKind }
  | { kind: 'finish' }
  | { kind: 'station'; chapter: number }
  | { kind: 'task'; chapter: number; task: number; flat: number }
  | { kind: 'filler'; filler: FillerKind }
)

type Content =
  | { kind: 'station'; chapter: number }
  | { kind: 'task'; chapter: number; task: number; flat: number }
  | { kind: 'filler'; filler: FillerKind }

/** Grid cell of perimeter square i. Geometry is left-to-right; the path starts at the bottom-right corner and goes left. */
function cell(i: number, size: number): { row: number; col: number; side: Side } {
  const e = size - 1
  if (i === 0) return { row: size, col: size, side: 'corner' }
  if (i < e) return { row: size, col: size - i, side: 'bottom' }
  if (i === e) return { row: size, col: 1, side: 'corner' }
  if (i < 2 * e) return { row: size - (i - e), col: 1, side: 'left' }
  if (i === 2 * e) return { row: 1, col: 1, side: 'corner' }
  if (i < 3 * e) return { row: 1, col: 1 + (i - 2 * e), side: 'top' }
  if (i === 3 * e) return { row: 1, col: size, side: 'corner' }
  return { row: 1 + (i - 3 * e), col: size, side: 'right' }
}

function buildBoard(chapters: BoardChapter[]) {
  // Stations and tasks in path order, with filler squares between levels to fill the loop.
  const groups: Content[][] = []
  let flat = 0
  chapters.forEach((chapter, c) => {
    groups.push([{ kind: 'station', chapter: c }, ...chapter.tasks.map((_, t) => ({ kind: 'task' as const, chapter: c, task: t, flat: flat++ }))])
  })
  const contentCount = groups.reduce((sum, g) => sum + g.length, 0)
  // 4 corners and the finish square are fixed; the other squares hold the content.
  const size = Math.max(6, Math.ceil((contentCount + 9) / 4))
  const perimeter = 4 * (size - 1)
  let fillers = perimeter - 5 - contentCount
  const gaps = Math.max(1, groups.length)
  const content: Content[] = []
  let fillerKind = 0
  for (let g = 0; g < Math.max(groups.length, 1); g++) {
    content.push(...(groups[g] ?? []))
    const share = Math.ceil(fillers / (gaps - g))
    for (let k = 0; k < share; k++) content.push({ kind: 'filler', filler: fillerKind++ % 2 === 0 ? 'idea' : 'bonus' })
    fillers -= share
  }

  const corners: CornerKind[] = ['start', 'meeting', 'coffee', 'review']
  const squares: Square[] = []
  let next = 0
  for (let i = 0; i < perimeter; i++) {
    const place = { index: i, ...cell(i, size) }
    if (i % (size - 1) === 0) squares.push({ ...place, kind: 'corner', corner: corners[i / (size - 1)]! })
    else if (i === perimeter - 1) squares.push({ ...place, kind: 'finish' })
    else squares.push({ ...place, ...content[next++]! })
  }

  const taskSquare = new Map<number, number>()
  let finish = perimeter - 1
  for (const sq of squares) {
    if (sq.kind === 'task') taskSquare.set(sq.flat, sq.index)
    if (sq.kind === 'finish') finish = sq.index
  }
  /** Square index of a player position (finished players stand on the finish square). */
  const squareOf = (position: number) => (position >= flat ? finish : (taskSquare.get(position) ?? 0))

  return { size, squares, squareOf, taskCount: flat }
}

/** Center of grid line k (1-based) as a percentage of the board. */
function lineCenter(k: number, size: number): number {
  const total = size - 2 + 2 * CORNER
  const x = k === 1 ? CORNER / 2 : k === size ? total - CORNER / 2 : CORNER + (k - 2) + 0.5
  return (x / total) * 100
}

const CORNER_INFO: Record<CornerKind, { icon: IconName; title: string; note: string }> = {
  start: { icon: 'arrowLeft', title: 'זינוק', note: 'כאן מתחילים' },
  meeting: { icon: 'users', title: 'מפגש ליווי', note: 'עוצרים, מתייעצים, ממשיכים' },
  coffee: { icon: 'coffee', title: 'הפסקת קפה', note: 'נושמים רגע' },
  review: { icon: 'chart', title: 'בדיקת מספרים', note: 'מה עובד? מה משפרים?' },
}

const FILLER_INFO: Record<FillerKind, { icon: IconName; title: string }> = {
  idea: { icon: 'bulb', title: 'רגע של השראה' },
  bonus: { icon: 'star', title: 'כוכב בונוס' },
}

const DICE_FACES: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

export function Die({ value, rolling = false }: { value: number; rolling?: boolean }) {
  const pips = DICE_FACES[value] ?? DICE_FACES[1]!
  return (
    <span className={`die${rolling ? ' is-rolling' : ''}`} aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} className={pips.includes(i) ? 'is-on' : undefined} />
      ))}
    </span>
  )
}

/**
 * Short text for a task square. A title like "שיעור 07 · תוכן כחלק קבוע מהעסק" shows "07" in the
 * number badge and the rest as the label, so the badge matches the lesson number.
 */
function squareLabel(title: string, fallbackNumber: number): { badge: string; label: string } {
  const [head, ...rest] = title.split(' · ')
  const digits = head?.match(/\d+/)?.[0]
  if (rest.length > 0 && digits) return { badge: digits, label: rest.join(' · ') }
  return { badge: String(fallbackNumber), label: title }
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// ---------- Component ----------

export function Board({
  chapters,
  player,
  animateFrom = null,
  onArrive,
  crowd,
  onSelectTask,
  onSelectChapter,
  onSelectPlayer,
  plain = false,
  title,
  center,
}: Props) {
  const { size, squares, squareOf, taskCount } = useMemo(() => buildBoard(chapters), [chapters])

  const target = player ? squareOf(player.position) : 0
  const fromSquare = player && animateFrom !== null && animateFrom < player.position ? squareOf(animateFrom) : null
  const [at, setAt] = useState<number>(fromSquare ?? target)
  const [dice, setDice] = useState<{ values: number[]; rolling: boolean } | null>(null)
  const [hopping, setHopping] = useState(false)
  const arrive = useRef(onArrive)
  useEffect(() => {
    arrive.current = onArrive
  })

  // Walk the token from the last seen square to the current one.
  useEffect(() => {
    if (!player) return
    if (fromSquare === null || fromSquare >= target || prefersReducedMotion()) {
      setAt(target)
      arrive.current?.()
      return
    }
    const steps = target - fromSquare
    const timers: number[] = []
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
    setAt(fromSquare)
    let t = 500
    if (steps <= 12) {
      const values = steps <= 6 ? [steps] : [6, steps - 6]
      later(t, () => setDice({ values: values.map(() => 1 + Math.floor(Math.random() * 6)), rolling: true }))
      t += 900
      later(t, () => setDice({ values, rolling: false }))
      t += 500
    }
    const hop = steps > 12 ? 160 : 320
    for (let k = 1; k <= steps; k++) {
      later(t, () => {
        setHopping(true)
        setAt(fromSquare + k)
      })
      t += hop
    }
    later(t, () => {
      setHopping(false)
      arrive.current?.()
    })
    later(t + 1600, () => setDice(null))
    return () => timers.forEach((id) => window.clearTimeout(id))
    // Run once per board (the parent remounts the board for a new plan).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tokenAt = (squareIndex: number, slot = 0, of = 1): CSSProperties => {
    const sq = squares[squareIndex] ?? squares[0]!
    const unit = 100 / (size - 2 + 2 * CORNER)
    const cols = of <= 1 ? 1 : of <= 4 ? 2 : 3
    const rows = Math.ceil(of / cols)
    const dx = of <= 1 ? 0 : ((slot % cols) - (cols - 1) / 2) * unit * 0.42
    const dy = of <= 1 ? 0 : (Math.floor(slot / cols) - (rows - 1) / 2) * unit * 0.42
    return { left: `${lineCenter(sq.col, size) + dx}%`, top: `${lineCenter(sq.row, size) + dy}%` }
  }

  // Crowd tokens grouped per square, so they do not cover each other.
  const crowdPlaced = useMemo(() => {
    if (!crowd) return []
    const bySquare = new Map<number, BoardPlayer[]>()
    for (const p of crowd) {
      const s = squareOf(p.position)
      bySquare.set(s, [...(bySquare.get(s) ?? []), p])
    }
    return [...bySquare.entries()].flatMap(([s, players]) => players.map((p, i) => ({ p, s, slot: i, of: players.length })))
  }, [crowd, squareOf])

  const currentSquare = player ? target : -1
  // minmax(0, …) keeps every square at its share, even when its text is long.
  const template = `minmax(0, ${CORNER}fr) repeat(${size - 2}, minmax(0, 1fr)) minmax(0, ${CORNER}fr)`

  return (
    <div className={`board${plain ? ' board--plain' : ''}`} style={{ '--total': size - 2 + 2 * CORNER } as CSSProperties}>
      <div className="board__grid" dir="ltr" style={{ gridTemplateColumns: template, gridTemplateRows: template }}>
        {squares.map((sq) => (
          <BoardSquare
            key={sq.index}
            sq={sq}
            chapters={chapters}
            plain={plain}
            isCurrent={sq.index === currentSquare}
            taskCount={taskCount}
            onSelectTask={onSelectTask}
            onSelectChapter={onSelectChapter}
          />
        ))}

        <div className="board__center" style={{ gridRow: `2 / ${size}`, gridColumn: `2 / ${size}` }} dir="rtl">
          {title && (
            <div className="board__banner">
              <span className="board__banner-eyebrow">המסע העסקי</span>
              <span className="board__banner-title">{title}</span>
            </div>
          )}
          {dice ? (
            <div className={`board__dice${dice.rolling ? ' is-rolling' : ''}`} role="status" aria-live="polite">
              {dice.values.map((v, i) => (
                <Die key={i} value={v} rolling={dice.rolling} />
              ))}
              {!dice.rolling && (
                <span className="board__dice-text">
                  {dice.values.reduce((a, b) => a + b, 0)} צעדים קדימה!
                </span>
              )}
            </div>
          ) : (
            center && <div className="board__extra">{center}</div>
          )}
        </div>
      </div>

      {player && (
        <span className="board__token board__token--main" style={tokenAt(at)} aria-label={`המיקום של ${player.name}`} role="img">
          {/* A new key per square replays the hop animation. */}
          <span key={at} className={`board__hop${hopping ? ' is-hopping' : ''}`}>
            <TokenFace player={player} />
          </span>
        </span>
      )}

      {crowdPlaced.map(({ p, s, slot, of }) => (
        <button
          key={p.id}
          type="button"
          className="board__token board__token--crowd"
          style={tokenAt(s, slot, of)}
          onClick={() => onSelectPlayer?.(p.id)}
          title={p.name}
          aria-label={p.name}
        >
          <TokenFace player={p} />
        </button>
      ))}
    </div>
  )
}

function TokenFace({ player }: { player: BoardPlayer }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="token" style={{ background: colorFromString(player.name) }}>
      {player.avatarUrl && !failed ? (
        <img src={player.avatarUrl} alt="" onError={() => setFailed(true)} />
      ) : (
        <span className="token__initials">{initials(player.name)}</span>
      )}
    </span>
  )
}

type SquareProps = {
  sq: Square
  chapters: BoardChapter[]
  plain: boolean
  isCurrent: boolean
  taskCount: number
  onSelectTask?: (chapterIndex: number, taskIndex: number) => void
  onSelectChapter?: (chapterIndex: number) => void
}

function BoardSquare({ sq, chapters, plain, isCurrent, onSelectTask, onSelectChapter }: SquareProps) {
  const place: CSSProperties = { gridRow: sq.row, gridColumn: sq.col }
  const sideClass = `sq sq--${sq.side}`

  if (sq.kind === 'corner') {
    const info = CORNER_INFO[sq.corner]
    return (
      <div className={`${sideClass} sq--corner-${sq.corner}`} style={place} dir="rtl">
        <span className="sq__corner-icon">
          <Icon name={info.icon} size={30} />
        </span>
        <span className="sq__corner-title">{info.title}</span>
        <span className="sq__corner-note">{info.note}</span>
      </div>
    )
  }

  if (sq.kind === 'finish') {
    return (
      <div className={`${sideClass} sq--finish${isCurrent ? ' is-current' : ''}`} style={place} dir="rtl">
        <Icon name="trophy" size={22} />
        <span className="sq__title">קו הסיום</span>
      </div>
    )
  }

  if (sq.kind === 'filler') {
    const info = FILLER_INFO[sq.filler]
    return (
      <div className={`${sideClass} sq--filler`} style={place} dir="rtl">
        <Icon name={info.icon} size={20} />
        <span className="sq__title">{info.title}</span>
      </div>
    )
  }

  const chapter = chapters[sq.chapter]!
  const color = groupColor(sq.chapter)
  const locked = !plain && chapter.state === 'locked'

  if (sq.kind === 'station') {
    const done = !plain && chapter.state === 'completed'
    const label = `שלב ${sq.chapter + 1}: ${chapter.title}`
    const content = (
      <>
        <span className="sq__station-num">שלב {sq.chapter + 1}</span>
        <span className="sq__title">{chapter.title}</span>
        <span className="sq__station-icon">{locked ? <Icon name="lock" size={14} /> : done ? <Icon name="star" size={14} /> : <Icon name="flag" size={14} />}</span>
      </>
    )
    const className = `${sideClass} sq--station${locked ? ' is-locked' : ''}${done ? ' is-done' : ''}`
    const style = { ...place, '--group': color } as CSSProperties
    return onSelectChapter && !locked ? (
      <button type="button" className={className} style={style} dir="rtl" onClick={() => onSelectChapter(sq.chapter)} aria-label={label} title={label}>
        {content}
      </button>
    ) : (
      <div className={className} style={style} dir="rtl" title={label}>
        {content}
      </div>
    )
  }

  const task = chapter.tasks[sq.task]!
  const status = plain ? 'plain' : task.completed ? 'done' : task.started ? 'started' : 'todo'
  const label = `${chapter.title} · ${task.title}${locked ? ' (נעול)' : task.completed ? ' (בוצע)' : ''}`
  const className = `${sideClass} sq--task sq--${status}${locked ? ' is-locked' : ''}${isCurrent ? ' is-current' : ''}`
  const style = { ...place, '--group': color } as CSSProperties
  const { badge, label: shortTitle } = squareLabel(task.title, sq.flat + 1)
  const content = (
    <>
      <span className="sq__band" />
      <span className="sq__num">{badge}</span>
      <span className="sq__title">{shortTitle}</span>
      {locked && (
        <span className="sq__lock">
          <Icon name="lock" size={13} />
        </span>
      )}
      {status === 'done' && <span className="sq__stamp">בוצע</span>}
      {status === 'started' && <span className="sq__dot" title="בתהליך" />}
    </>
  )
  return onSelectTask && !locked ? (
    <button type="button" className={className} style={style} dir="rtl" onClick={() => onSelectTask(sq.chapter, sq.task)} aria-label={label} title={label}>
      {content}
    </button>
  ) : (
    <div className={className} style={style} dir="rtl" title={label}>
      {content}
    </div>
  )
}
