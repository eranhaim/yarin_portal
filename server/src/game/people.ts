// The realistic people a customer can play (the models are in client/public/people). Keep the ids in step with
// client/src/components/person/people.ts. The descriptions let the AI pick the person closest to a photo.

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

type Skin = 'porcelain' | 'light' | 'tan' | 'olive' | 'brown' | 'dark'
type Hair = 'short' | 'quiff' | 'slick' | 'buzz' | 'curly' | 'long' | 'bun' | 'bald'
type HairColor = 'black' | 'darkBrown' | 'brown' | 'blond' | 'red' | 'gray' | 'white'
type Beard = 'none' | 'stubble' | 'short' | 'full'

export type PersonInfo = { woman: boolean; skin: Skin; hair: Hair; hairColor: HairColor; beard: Beard; about: string }

const p = (woman: boolean, skin: Skin, hair: Hair, hairColor: HairColor, beard: Beard, about: string): PersonInfo => ({ woman, skin, hair, hairColor, beard, about })

export const PEOPLE: Record<PersonId, PersonInfo> = {
  marcus: p(false, 'brown', 'buzz', 'black', 'stubble', 'man, brown skin, very short black hair, light stubble'),
  james: p(false, 'light', 'quiff', 'darkBrown', 'none', 'man, light skin, dark brown hair combed up, clean-shaven'),
  arjun: p(false, 'olive', 'short', 'black', 'none', 'man, olive / light brown skin, short black hair, clean-shaven'),
  andre: p(false, 'dark', 'buzz', 'black', 'none', 'man, dark skin, shaved-short black hair'),
  kenji: p(false, 'light', 'short', 'black', 'none', 'man, East Asian, short black hair'),
  daniel: p(false, 'light', 'short', 'darkBrown', 'none', 'man, light skin, short dark brown hair, square face'),
  carlos: p(false, 'light', 'curly', 'brown', 'none', 'man, light skin, longer messy brown hair'),
  luca: p(false, 'porcelain', 'buzz', 'red', 'none', 'man, fair skin, very short ginger hair'),
  ethan: p(false, 'light', 'short', 'brown', 'none', 'man, light skin, medium brown hair, young'),
  leo: p(false, 'light', 'short', 'brown', 'stubble', 'man, light skin, short brown hair, a little older'),
  noah: p(false, 'light', 'slick', 'darkBrown', 'none', 'man, light skin, dark hair pushed back'),
  ryan: p(false, 'light', 'short', 'brown', 'none', 'man, light skin, neat short brown hair'),
  mia: p(true, 'olive', 'long', 'darkBrown', 'none', 'woman, olive skin, dark shoulder-length hair'),
  sophia: p(true, 'light', 'bun', 'darkBrown', 'none', 'woman, light skin, dark hair tied back'),
  priya: p(true, 'tan', 'long', 'black', 'none', 'woman, tan / South Asian skin, long black hair'),
  aisha: p(true, 'brown', 'short', 'black', 'none', 'woman, brown skin, short black hair'),
  mei: p(true, 'light', 'long', 'black', 'none', 'woman, East Asian, long straight black hair'),
  olivia: p(true, 'light', 'long', 'brown', 'none', 'woman, light skin, long brown hair'),
  emma: p(true, 'porcelain', 'bun', 'blond', 'none', 'woman, fair skin, blond hair tied back'),
  hannah: p(true, 'light', 'bun', 'blond', 'none', 'woman, light skin, blond hair tied back, younger'),
}

/** The list for the AI, one person per line. */
export const PEOPLE_FOR_AI = PERSON_IDS.map((id) => `- ${id}: ${PEOPLE[id].about}`).join('\n')
