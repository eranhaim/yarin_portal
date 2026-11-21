import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { colorFromString, initials } from '../lib/format'
import { groupColor } from '../lib/groups'
import type { ChapterState } from '../lib/types'
import { Icon, type IconName } from './Icon'
import { Mascot } from './mascot/Mascot'
import './Board.css'

// A board-game map: a loop of squares around the edge of a rectangular board.
// Each level (chapter) is a color group: a "station" square with the level name, then one square per task.
// The player's token stands on the first open task and hops forward when tasks are completed.
// Wide screens get a landscape board; narrow screens get the same loop standing up (portrait).

export type BoardTask = { id: string; title: string; started: boolean; completed: boolean; submitted?: boolean }
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
  /** Show the main player as the 3D mascot instead of an avatar token. */
  mascot?: boolean
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

/** Perimeter indexes of the four corners, in path order (start, bottom-left, top-left, top-right). */
function cornerIndexes(cols: number, rows: number): [number, number, number, number] {
  return [0, cols - 1, cols + rows - 2, 2 * cols + rows - 3]
}

/** Grid cell of perimeter square i. Geometry is left-to-right; the path starts at the bottom-right corner and goes left. */
function cell(i: number, cols: number, rows: number): { row: number; col: number; side: Side } {
  const [, bottomLeft, topLeft, topRight] = cornerIndexes(cols, rows)
  if (i === 0) return { row: rows, col: cols, side: 'corner' }
  if (i < bottomLeft) return { row: rows, col: cols - i, side: 'bottom' }
  if (i === bottomLeft) return { row: rows, col: 1, side: 'corner' }
  if (i < topLeft) return { row: rows - (i - bottomLeft), col: 1, side: 'left' }
  if (i === topLeft) return { row: 1, col: 1, side: 'corner' }
  if (i < topRight) return { row: 1, col: 1 + (i - topLeft), side: 'top' }
  if (i === topRight) return { row: 1, col: cols, side: 'corner' }
  return { row: 1 + (i - topRight), col: cols, side: 'right' }
}

/** A rectangle about 1.75 times longer than it is deep, with room for every square on its edge. */
function boardShape(squaresNeeded: number, portrait: boolean): { cols: number; rows: number } {
  for (let short = 5; ; short++) {
    const long = Math.max(short, Math.round(short * 1.75))
    if (2 * (long - 1) + 2 * (short - 1) >= squaresNeeded) return portrait ? { cols: short, rows: long } : { cols: long, rows: short }
  }
}

function buildBoard(chapters: BoardChapter[], portrait: boolean) {
  // Stations and tasks in path order, with filler squares between levels to fill the loop.
  const groups: Content[][] = []
  let flat = 0
  chapters.forEach((chapter, c) => {
    groups.push([{ kind: 'station', chapter: c }, ...chapter.tasks.map((_, t) => ({ kind: 'task' as const, chapter: c, task: t, flat: flat++ }))])
  })
  const contentCount = groups.reduce((sum, g) => sum + g.length, 0)
  // 4 corners and the finish square are fixed; the other squares hold the content.
  const { cols, rows } = boardShape(contentCount + 5, portrait)
  const perimeter = 2 * (cols - 1) + 2 * (rows - 1)
  const corners = cornerIndexes(cols, rows)
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

  const cornerKinds: CornerKind[] = ['start', 'meeting', 'coffee', 'review']
  const squares: Square[] = []
  let next = 0
  for (let i = 0; i < perimeter; i++) {
    const place = { index: i, ...cell(i, cols, rows) }
    const corner = corners.indexOf(i)
    if (corner !== -1) squares.push({ ...place, kind: 'corner', corner: cornerKinds[corner]! })
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

  return { cols, rows, squares, squareOf, taskCount: flat }
}

/** Board length in square units, for `count` grid lines (two of them corners). */
const spanOf = (count: number) => count - 2 + 2 * CORNER

/** Center of grid line k (1-based, of `count`) as a percentage of the board. */
function lineCenter(k: number, count: number): number {
  const total = spanOf(count)
  const x = k === 1 ? CORNER / 2 : k === count ? total - CORNER / 2 : CORNER + (k - 2) + 0.5
  return (x / total) * 100
}

/** Portrait below this board width, so squares stay big enough on phones. */
const PORTRAIT_BELOW_PX = 640

/** True when the element is narrower than PORTRAIT_BELOW_PX. Starts from the window width, so phones get it right on the first paint. */
function useNarrow(ref: RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < PORTRAIT_BELOW_PX + 32)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setNarrow(el.getBoundingClientRect().width < PORTRAIT_BELOW_PX)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return narrow
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
  mascot = false,
}: Props) {
  const frame = useRef<HTMLDivElement>(null)
  const portrait = useNarrow(frame)
  const { cols, rows, squares, squareOf, taskCount } = useMemo(() => buildBoard(chapters, portrait), [chapters, portrait])

  const target = player ? squareOf(player.position) : 0
  const fromSquare = player && animateFrom !== null && animateFrom < player.position ? squareOf(animateFrom) : null
  const [at, setAt] = useState<number>(fromSquare ?? target)
  const [dice, setDice] = useState<{ values: number[]; rolling: boolean } | null>(null)
  const [hopping, setHopping] = useState(false)
  const arrive = useRef(onArrive)
  useEffect(() => {
    arrive.current = onArrive
  })
  /** True once the welcome walk is done; after that the token just follows the player. */
  const walked = useRef(false)

  // Walk the token from the last seen square to the current one (once). Later, when the player's
  // position or the board's shape changes (admin status change, phone rotation), jump straight there:
  // square indexes depend on the shape, so an old index would point at the wrong square.
  useEffect(() => {
    if (!player) return
    if (walked.current || fromSquare === null || fromSquare >= target || prefersReducedMotion()) {
      setAt(target)
      setHopping(false)
      if (!walked.current) {
        walked.current = true
        arrive.current?.()
      }
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
      walked.current = true
      arrive.current?.()
    })
    later(t + 1600, () => setDice(null))
    return () => {
      timers.forEach((id) => window.clearTimeout(id))
      setDice(null)
    }
    // fromSquare/player come from the same render as target; cols/rows mark a new board shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, cols, rows])

  const tokenAt = (squareIndex: number, slot = 0, of = 1): CSSProperties => {
    const sq = squares[squareIndex] ?? squares[0]!
    // One square unit as a percentage of the board's width and height.
    const unitX = 100 / spanOf(cols)
    const unitY = 100 / spanOf(rows)
    const perRow = of <= 1 ? 1 : of <= 4 ? 2 : 3
    const lines = Math.ceil(of / perRow)
    const dx = of <= 1 ? 0 : ((slot % perRow) - (perRow - 1) / 2) * unitX * 0.42
    const dy = of <= 1 ? 0 : (Math.floor(slot / perRow) - (lines - 1) / 2) * unitY * 0.42
    return { left: `${lineCenter(sq.col, cols) + dx}%`, top: `${lineCenter(sq.row, rows) + dy}%` }
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
  const template = (count: number) => `minmax(0, ${CORNER}fr) repeat(${count - 2}, minmax(0, 1fr)) minmax(0, ${CORNER}fr)`
  const finished = Boolean(player && player.position >= taskCount)

  return (
    <div
      ref={frame}
      className={`board${plain ? ' board--plain' : ''}${portrait ? ' board--portrait' : ''}`}
      style={{ '--total-w': spanOf(cols), '--total-h': spanOf(rows) } as CSSProperties}
    >
      <div className="board__grid" dir="ltr" style={{ gridTemplateColumns: template(cols), gridTemplateRows: template(rows) }}>
        {squares.map((sq) => (
          <BoardSquare
            key={sq.index}
            sq={sq}
            chapters={chapters}
            plain={plain}
            isCurrent={sq.index === currentSquare}
            onSelectTask={onSelectTask}
            onSelectChapter={onSelectChapter}
          />
        ))}

        <div className="board__center" style={{ gridRow: `2 / ${rows}`, gridColumn: `2 / ${cols}` }} dir="rtl">
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

      {player && mascot && (
        <span className="board__token board__token--mascot" style={tokenAt(at)} aria-label={`המיקום של ${player.name}`} role="img">
          <Mascot
            pose={finished && !hopping ? 'cheer' : 'idle'}
            hopKey={at}
            fallback={
              <span className="board__hop">
                <TokenFace player={player} />
              </span>
            }
          />
          <span className="board__me">
            <TokenFace player={player} />
          </span>
        </span>
      )}

      {player && !mascot && (
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
  onSelectTask?: (chapterIndex: number, taskIndex: number) => void
  onSelectChapter?: (chapterIndex: number) => void
}

function BoardSquare({ sq, chapters, plain, isCurrent, onSelectTask, onSelectChapter }: SquareProps) {
  // --i staggers the squares' entrance animation around the loop.
  const place = { gridRow: sq.row, gridColumn: sq.col, '--i': sq.index } as CSSProperties
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
      {!plain && task.submitted && (
        <span className="sq__clip" title="הוגש">
          <Icon name="clip" size={12} />
        </span>
      )}
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
