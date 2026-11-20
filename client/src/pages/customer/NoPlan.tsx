import { Icon } from '../../components/Icon'

export function NoPlan({ name }: { name: string }) {
  return (
    <div className="cx-empty">
      <span className="cx-empty__icon">
        <Icon name="map" size={34} />
      </span>
      <h2>Hi {name.split(' ')[0]}, your journey is almost ready</h2>
      <p>Yarin is preparing your plan. Your map appears here as soon as it is ready.</p>
    </div>
  )
}
