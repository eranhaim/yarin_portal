import { Die } from '../../components/Board'

export function NoPlan({ name }: { name: string }) {
  return (
    <div className="cx-empty">
      <span className="cx-empty__dice" aria-hidden="true">
        <Die value={5} />
        <Die value={2} />
      </span>
      <h2>היי {name.split(' ')[0]}, המסע שלך כמעט מוכן</h2>
      <p>ירין מכין עבורך את התוכנית. לוח המשחק יופיע כאן ברגע שהיא תהיה מוכנה.</p>
    </div>
  )
}
