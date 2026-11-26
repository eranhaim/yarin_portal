import type { Look } from '../../lib/types'

// The realistic people a customer can play. Each one is a rigged model in public/people/<id>.glb, made from the
// Microsoft Rocketbox avatar library (MIT) as converted by avatar-studio (MIT); see public/people/LICENSE.md.
// The face, skin and hair come with the person; clothes, glasses, a chain and what they hold are chosen on top.

export const PERSON_IDS = [
  'marcus',
  'james',
  'arjun',
  'andre',
  'kenji',
  'daniel',
  'carlos',
  'luca',
  'ethan',
  'leo',
  'noah',
  'ryan',
  'mia',
  'sophia',
  'priya',
  'aisha',
  'mei',
  'olivia',
  'emma',
  'hannah',
] as const

export type PersonId = (typeof PERSON_IDS)[number]

export type PersonInfo = {
  id: PersonId
  woman: boolean
  skin: Look['skin']
  hair: Look['hair']
  hairColor: Look['hairColor']
  beard: Look['beard']
  /** Their own clothes are a suit, so "my own clothes" is the suit. */
  suited: boolean
  /** A short description for screen readers and tooltips. */
  label: string
}

const p = (id: PersonId, woman: boolean, skin: Look['skin'], hair: Look['hair'], hairColor: Look['hairColor'], beard: Look['beard'], suited: boolean, label: string): PersonInfo => ({
  id,
  woman,
  skin,
  hair,
  hairColor,
  beard,
  suited,
  label,
})

export const PEOPLE: Record<PersonId, PersonInfo> = {
  marcus: p('marcus', false, 'brown', 'buzz', 'black', 'stubble', true, 'גבר, עור חום, שיער קצוץ וזיפים'),
  james: p('james', false, 'light', 'quiff', 'darkBrown', 'none', true, 'גבר, עור בהיר, שיער כהה מסורק'),
  arjun: p('arjun', false, 'olive', 'short', 'black', 'none', false, 'גבר, עור זית, שיער שחור קצר'),
  andre: p('andre', false, 'dark', 'buzz', 'black', 'none', false, 'גבר, עור כהה, שיער קצוץ'),
  kenji: p('kenji', false, 'light', 'short', 'black', 'none', true, 'גבר, עור בהיר, שיער שחור'),
  daniel: p('daniel', false, 'light', 'short', 'darkBrown', 'none', true, 'גבר, עור בהיר, שיער חום כהה'),
  carlos: p('carlos', false, 'light', 'curly', 'brown', 'none', false, 'גבר, עור בהיר, שיער חום ארוך'),
  luca: p('luca', false, 'porcelain', 'buzz', 'red', 'none', false, 'גבר, עור בהיר, שיער ג׳ינג׳י קצוץ'),
  ethan: p('ethan', false, 'light', 'short', 'brown', 'none', false, 'גבר, עור בהיר, שיער חום'),
  leo: p('leo', false, 'light', 'short', 'brown', 'stubble', false, 'גבר, עור בהיר, שיער חום קצר'),
  noah: p('noah', false, 'light', 'slick', 'darkBrown', 'none', false, 'גבר, עור בהיר, שיער כהה משוך לאחור'),
  ryan: p('ryan', false, 'light', 'short', 'brown', 'none', false, 'גבר, עור בהיר, שיער חום מסודר'),
  mia: p('mia', true, 'olive', 'long', 'darkBrown', 'none', false, 'אישה, עור זית, שיער כהה עד הכתפיים'),
  sophia: p('sophia', true, 'light', 'bun', 'darkBrown', 'none', true, 'אישה, עור בהיר, שיער כהה אסוף'),
  priya: p('priya', true, 'tan', 'long', 'black', 'none', false, 'אישה, עור שזוף, שיער שחור ארוך'),
  aisha: p('aisha', true, 'brown', 'short', 'black', 'none', true, 'אישה, עור חום, שיער שחור קצר'),
  mei: p('mei', true, 'light', 'long', 'black', 'none', false, 'אישה, עור בהיר, שיער שחור ארוך'),
  olivia: p('olivia', true, 'light', 'long', 'brown', 'none', false, 'אישה, עור בהיר, שיער חום ארוך'),
  emma: p('emma', true, 'porcelain', 'bun', 'blond', 'none', false, 'אישה, עור בהיר, שיער בלונדיני אסוף'),
  hannah: p('hannah', true, 'light', 'bun', 'blond', 'none', false, 'אישה, עור בהיר, שיער בלונדיני'),
}

const SKIN_ORDER: Look['skin'][] = ['porcelain', 'light', 'tan', 'olive', 'brown', 'dark']

/** The person a look shows: the chosen one, or (for looks saved before people existed) the closest match. */
export function personFor(look: Look): PersonInfo {
  if (look.person && look.person in PEOPLE) return PEOPLE[look.person]
  const woman = (look.hair === 'long' || look.hair === 'bun') && look.beard === 'none' && !look.mustache
  let best = PEOPLE.james
  let bestScore = -Infinity
  for (const person of Object.values(PEOPLE)) {
    let score = person.woman === woman ? 10 : 0
    score -= Math.abs(SKIN_ORDER.indexOf(person.skin) - SKIN_ORDER.indexOf(look.skin)) * 2
    if (person.hairColor === look.hairColor) score += 1.5
    if (person.hair === look.hair) score += 1
    if (person.beard === look.beard) score += 0.5
    if (score > bestScore) {
      best = person
      bestScore = score
    }
  }
  return best
}

/** Bump this when the model files change, so browsers fetch the new ones. */
export const MODELS_VERSION = '2026-11-26'

export const personUrl = (id: PersonId) => `/people/${id}.glb?v=${MODELS_VERSION}`
export const personThumb = (id: PersonId) => `/people/thumbs/${id}.jpg?v=${MODELS_VERSION}`
