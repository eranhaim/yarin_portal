/** The site wordmark: the same mark as in the customers' top bar. */
export function Logo({ light = false, subtitle }: { light?: boolean; subtitle?: string }) {
  return (
    <span className={`logo${light ? ' logo--light' : ''}`}>
      <span className="logo__mark" aria-hidden="true">
        SO
      </span>
      <span className="logo__text">
        סקיל אורגני
        <small>{subtitle ?? 'סימולטור לצמיחה עסקית'}</small>
      </span>
    </span>
  )
}
