import { HAIR_COLOR, LOOK_OPTIONS, OUTFIT_COLOR, SKIN } from '../../lib/game'
import type { Look } from '../../lib/types'
import './LookEditor.css'

// The buttons that build a character. Used by the customers' character page and by the
// admin page for the hosts' (Yarin and Oren) characters.

type Group = keyof typeof LOOK_OPTIONS

const GROUPS: { key: Group; label: string; swatch?: Record<string, string> }[] = [
  { key: 'skin', label: 'גוון עור', swatch: SKIN },
  { key: 'hair', label: 'תסרוקת' },
  { key: 'hairColor', label: 'צבע שיער', swatch: HAIR_COLOR },
  { key: 'beard', label: 'זקן' },
  { key: 'glasses', label: 'משקפיים' },
  { key: 'outfit', label: 'לבוש' },
  { key: 'outfitColor', label: 'צבע הלבוש', swatch: OUTFIT_COLOR },
  { key: 'accessory', label: 'ביד' },
]

type Props = {
  look: Look
  onChange: <K extends keyof Look>(key: K, value: Look[K]) => void
}

export function LookEditor({ look, onChange }: Props) {
  return (
    <div className="look-editor">
      {GROUPS.map((group) => (
        <fieldset key={group.key} className="look-group">
          <legend>{group.label}</legend>
          <div className="look-group__options">
            {LOOK_OPTIONS[group.key].map((option) => {
              const selected = look[group.key] === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  className={`look-option${group.swatch ? ' look-option--swatch' : ''}`}
                  onClick={() => onChange(group.key, option.value as Look[Group])}
                  title={option.label}
                >
                  {group.swatch && <i style={{ background: group.swatch[option.value] }} />}
                  <span>{option.label}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}
      <div className="look-toggles">
        <label className="toggle">
          <input type="checkbox" checked={look.mustache} onChange={(e) => onChange('mustache', e.target.checked)} />
          שפם
        </label>
        <label className="toggle">
          <input type="checkbox" checked={look.chain} onChange={(e) => onChange('chain', e.target.checked)} />
          שרשרת זהב (לוק של בוס)
        </label>
      </div>
    </div>
  )
}
