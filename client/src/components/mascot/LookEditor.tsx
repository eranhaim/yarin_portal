import { LOOK_OPTIONS, OUTFIT_COLOR } from '../../lib/game'
import type { Look } from '../../lib/types'
import { PEOPLE, PERSON_IDS, personFor, personThumb, personUrl, type PersonId } from '../person/people'
import './LookEditor.css'

// The buttons that build a character: first the person, then what they wear and hold. Used by the customers'
// character page and by the admin page for the hosts' (Yarin and Oren) characters.

type Props = {
  look: Look
  onChange: (patch: Partial<Look>) => void
}

const MEN = PERSON_IDS.filter((id) => !PEOPLE[id].woman)
const WOMEN = PERSON_IDS.filter((id) => PEOPLE[id].woman)

/** Starts the download of a person's model, so choosing them is quick. */
const warm = (id: PersonId) => {
  void fetch(personUrl(id), { priority: 'low' } as RequestInit).catch(() => undefined)
}

function Options<K extends 'outfit' | 'glasses' | 'accessory'>({ look, field, label, onChange, hide = [] }: { look: Look; field: K; label: string; onChange: Props['onChange']; hide?: string[] }) {
  return (
    <fieldset className="look-group">
      <legend>{label}</legend>
      <div className="look-group__options">
        {LOOK_OPTIONS[field]
          .filter((option) => !hide.includes(option.value))
          .map((option) => (
            <button key={option.value} type="button" aria-pressed={look[field] === option.value} className="look-option" onClick={() => onChange({ [field]: option.value } as Partial<Look>)}>
              <span>{option.label}</span>
            </button>
          ))}
      </div>
    </fieldset>
  )
}

export function LookEditor({ look, onChange }: Props) {
  const person = personFor(look)
  // A new person brings their own face, skin and hair; the older fields follow, for everything that still reads them.
  const choose = (id: PersonId) => {
    const p = PEOPLE[id]
    onChange({ person: id, skin: p.skin, hair: p.hair, hairColor: p.hairColor, beard: p.beard, mustache: false })
  }
  const dyed = look.outfit === 'blazer' || look.outfit === 'tee'
  return (
    <div className="look-editor">
      {[
        { label: 'גברים', ids: MEN },
        { label: 'נשים', ids: WOMEN },
      ].map((group) => (
        <fieldset key={group.label} className="look-group">
          <legend>{group.label}</legend>
          <div className="look-people">
            {group.ids.map((id) => (
              <button
                key={id}
                type="button"
                className="look-person"
                aria-pressed={person.id === id}
                aria-label={PEOPLE[id].label}
                title={PEOPLE[id].label}
                onPointerEnter={() => warm(id)}
                onFocus={() => warm(id)}
                onClick={() => choose(id)}
              >
                <img src={personThumb(id)} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      <Options look={look} field="outfit" label="לבוש" onChange={onChange} hide={person.suited ? ['hoodie'] : []} />
      {dyed && (
        <fieldset className="look-group">
          <legend>צבע החולצה</legend>
          <div className="look-group__options">
            {LOOK_OPTIONS.outfitColor.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={look.outfitColor === option.value}
                className="look-option look-option--swatch"
                onClick={() => onChange({ outfitColor: option.value })}
                title={option.label}
              >
                <i style={{ background: OUTFIT_COLOR[option.value] }} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <Options look={look} field="glasses" label="משקפיים" onChange={onChange} />
      <Options look={look} field="accessory" label="ביד" onChange={onChange} />
      <div className="look-toggles">
        <label className="toggle">
          <input type="checkbox" checked={look.chain} onChange={(e) => onChange({ chain: e.target.checked })} />
          שרשרת זהב
        </label>
      </div>
    </div>
  )
}
