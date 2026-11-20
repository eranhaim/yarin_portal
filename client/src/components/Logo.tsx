/** The Yarin Portal wordmark. A placeholder until there is a real logo. */
export function Logo({ light = false, subtitle }: { light?: boolean; subtitle?: string }) {
  return (
    <span className={`logo${light ? ' logo--light' : ''}`}>
      <span className="logo__mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="22" height="22">
          <path d="M5 25 L13 12 L18 19 L21 15 L27 25 Z" fill="#fff" />
          <path d="M21 6 V15" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          <path d="M21 6 L27 8 L21 10 Z" fill="#ffd56b" />
        </svg>
      </span>
      <span className="logo__text">
        Yarin<span>Portal</span>
        {subtitle && <small>{subtitle}</small>}
      </span>
    </span>
  )
}
