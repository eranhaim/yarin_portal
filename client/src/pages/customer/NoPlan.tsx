import { Mascot } from '../../components/mascot/Mascot'

export function NoPlan({ name }: { name: string }) {
  return (
    <div className="cx-empty">
      <Mascot className="cx-empty__mascot" pose="wave" />
      <h2>היי {name.split(' ')[0]}, המסע שלך כמעט מוכן</h2>
      <p>ירין מכין עבורך את התוכנית. לוח המשחק יופיע כאן ברגע שהיא תהיה מוכנה.</p>
    </div>
  )
}
