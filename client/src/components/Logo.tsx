import { Die } from './Board'

/** The site wordmark: a die and the program name. A placeholder until there is a real logo. */
export function Logo({ light = false, subtitle }: { light?: boolean; subtitle?: string }) {
  return (
    <span className={`logo${light ? ' logo--light' : ''}`}>
      <span className="logo__mark" aria-hidden="true">
        <Die value={3} />
      </span>
      <span className="logo__text">
        סקיל אורגני
        <small>{subtitle ?? 'הליווי של ירין ואורן'}</small>
      </span>
    </span>
  )
}
