import { useState } from 'react'
import { colorFromString, initials } from '../lib/format'

type Props = { name: string; url: string | null | undefined; size?: number; className?: string }

/** Round avatar image, or colored initials when there is no image. */
export function Avatar({ name, url, size = 40, className = '' }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const style = { width: size, height: size }

  if (url && url !== failedUrl) {
    return (
      <img src={url} alt="" className={`avatar ${className}`} style={style} onError={() => setFailedUrl(url)} />
    )
  }
  return (
    <span
      className={`avatar avatar--initials ${className}`}
      style={{ ...style, fontSize: Math.round(size * 0.38), background: colorFromString(name) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}
