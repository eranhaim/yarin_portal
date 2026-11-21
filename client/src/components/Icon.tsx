import type { ReactNode } from 'react'

const PATHS = {
  play: <path d="M7 4.6v14.8a1 1 0 0 0 1.5.86l12.2-7.4a1 1 0 0 0 0-1.72L8.5 3.74A1 1 0 0 0 7 4.6z" />,
  pause: (
    <>
      <rect x="6" y="4" width="4" height="16" rx="1.2" />
      <rect x="14" y="4" width="4" height="16" rx="1.2" />
    </>
  ),
  star: <path d="M12 2.6l2.9 6 6.6.85-4.85 4.55 1.25 6.55L12 17.3l-5.9 3.25 1.25-6.55L2.5 9.45l6.6-.85z" />,
  volume: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  volumeMute: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="m22 9-6 6M16 9l6 6" />
    </>
  ),
  fullscreen: <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />,
  fullscreenExit: <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />,
  pip: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <rect x="12" y="11" width="7" height="6" rx="1" />
    </>
  ),
  back10: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.2" />
      <path d="M3.5 3.5v4.7h4.7" />
      <text x="12.4" y="15.6" fontSize="7.5" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">
        10
      </text>
    </>
  ),
  forward10: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.8-6.3l2.8 2.5" />
      <path d="M20.5 3.5v4.7h-4.7" />
      <text x="11.6" y="15.6" fontSize="7.5" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">
        10
      </text>
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  lock: (
    <>
      <rect x="4.5" y="11" width="15" height="10" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </>
  ),
  map: (
    <>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="5" width="15" height="14" rx="2.5" />
      <path d="m17 10 5-3v10l-5-3" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9z" />
      <path d="M14 3v6h6" />
    </>
  ),
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  upload: <path d="M12 20V9M7 14l5-5 5 5M5 4h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m18 15-6-6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 18l-6-6 6-6" />,
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" />
    </>
  ),
  layers: <path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.4 3.4M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  trophy: (
    <>
      <path d="M8 21h8M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z" />
      <path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5v.5" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  refresh: <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M18 13l-6 6-6-6" />,
  gauge: <path d="M12 14l4-4M3.3 19a10 10 0 1 1 17.4 0" />,
  dice: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8.5 8.5h.01M15.5 15.5h.01M12 12h.01M15.5 8.5h.01M8.5 15.5h.01" strokeWidth={3} />
    </>
  ),
  coffee: (
    <>
      <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9zM16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 2.5c-.6 1 .6 2-.2 3M12 2.5c-.6 1 .6 2-.2 3" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />,
  bulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" />
    </>
  ),
  cards: (
    <>
      <rect x="8" y="3" width="12" height="16" rx="2" />
      <path d="M5.5 6.5 4 7a2 2 0 0 0-1.3 2.5l3.4 10a2 2 0 0 0 2.5 1.3l4.4-1.5" />
    </>
  ),
  home: <path d="M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />,
  clip: <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" />,
  bell: <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />,
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

const FILLED: ReadonlySet<IconName> = new Set<IconName>(['play', 'pause', 'star'])

/** Icons that show a direction. The site is RTL, so they are mirrored ("forward" points left). */
const DIRECTIONAL: ReadonlySet<IconName> = new Set<IconName>(['chevronLeft', 'chevronRight', 'arrowLeft', 'logout'])

type Props = {
  name: IconName
  size?: number
  className?: string
  /** Adds an accessible label. Without it the icon is decorative. */
  title?: string
  /** Position when used inside another SVG. */
  x?: number
  y?: number
}

export function Icon({ name, size = 20, className, title, x, y }: Props) {
  const filled = FILLED.has(name)
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      x={x}
      y={y}
      className={DIRECTIONAL.has(name) ? `icon--flip${className ? ` ${className}` : ''}` : className}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  )
}
