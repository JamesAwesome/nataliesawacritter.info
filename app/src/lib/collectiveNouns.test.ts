import { describe, expect, it } from 'vitest'
import {
  COLLECTIVE_NOUNS as SERVER_NOUNS,
  phraseFor as serverPhraseFor,
} from '../../server/collectiveNouns'
import { COLLECTIVE_NOUNS, nounFor, phraseFor } from './collectiveNouns'
import { CURATED, EXTENDED, nameFor } from './critters'
import { CUSTOM, tokenFor } from './customEmoji'

/** Shipped critters, in catalogue order. */
const CATALOGUE = [
  ...CURATED.map((c) => c.emoji),
  ...EXTENDED,
  ...CUSTOM.map((c) => tokenFor(c.slug)),
]

// Critters with no collective noun in use. Every shipped critter is either in
// the table or here, so a new one can't quietly fall back to "Many" — adding a
// critter fails the coverage test until someone decides which it is.
const NOUNLESS = new Set([
  '🐽', // pig nose — not a critter you see a group of
  'custom:phanatic',
  'custom:troll', // mascots and folklore, not animals
  'custom:aardvark',
  'custom:anteater',
  'custom:axolotl',
  'custom:red-panda', // solitary — no collective noun in use
])

// Plurals that don't contain the critter's own name, so the "plural names its
// critter" check can't vouch for them: ordinary English irregulars, plus
// monarch butterflies, which go by the shorter word.
const IRREGULAR_PLURALS = new Set([
  '🐭', '🐁', // mouse → mice
  '🐺', // wolf → wolves
  '🪿', 'custom:canada-goose', // goose → geese
  '🦋', '🪰', 'custom:monarch-butterfly', 'custom:dragonfly',
  'custom:firefly', 'custom:lantern-fly', // fly → flies
  '🦖', // T-Rex → dinosaurs
  'custom:pony', // pony → ponies
])

describe('collectiveNouns catalogue', () => {
  it('resolves the noun for a unicode emoji and for a custom token', () => {
    expect(nounFor('🦉')).toBe('parliament')
    expect(nounFor('custom:crow')).toBe('murder')
    expect(nounFor('custom:cardinal')).toBe('college')
  })

  it('gives Gritty a chaos', () => {
    expect(nounFor('custom:gritty')).toBe('chaos')
    expect(phraseFor('custom:gritty')).toBe('a chaos of Grittys')
  })

  // The catalogue calls 🐦‍⬛ a Blackbird and ships a drawn Crow of its own, so
  // the murder belongs to the crow and the blackbird keeps its own word.
  it('keeps the blackbird’s noun distinct from the crow’s', () => {
    expect(phraseFor('🐦‍⬛')).toBe('a cloud of blackbirds')
    expect(phraseFor('custom:crow')).toBe('a murder of crows')
  })

  it('builds "a <noun> of <plural>" for the phrase', () => {
    expect(phraseFor('custom:crow')).toBe('a murder of crows')
    expect(phraseFor('🐇')).toBe('a fluffle of rabbits')
    expect(phraseFor('custom:meerkat')).toBe('a mob of meerkats')
  })

  it('uses "an" before a vowel-initial noun', () => {
    expect(phraseFor('🐸')).toBe('an army of frogs')
    expect(phraseFor('🐼')).toBe('an embarrassment of pandas')
  })

  // Four keys carry a trailing variation selector ('🐿️', '🕊️', '🕷️', '🐻‍❄️').
  // The emoji column takes arbitrary text, so a row written by anything but the
  // in-app picker can hold the bare form; it must not silently read "Many".
  it('resolves an emoji written without its variation selector', () => {
    expect(nounFor('🕊')).toBe('dule')
    expect(phraseFor('🐿')).toBe('a scurry of squirrels')
    expect(phraseFor('🕷')).toBe('a cluster of spiders')
  })

  it('returns null for critters with no collective noun', () => {
    expect(nounFor('🐽')).toBeNull() // pig nose — not a critter you see a group of
    expect(phraseFor('custom:phanatic')).toBeNull()
    expect(nounFor('custom:unknown')).toBeNull()
    expect(nounFor('🍕')).toBeNull()
  })

  // A plain object literal answers COLLECTIVE_NOUNS['toString'] with a function,
  // not undefined — so a lookup that only checks for undefined would destructure
  // it and throw. An emoji column holds arbitrary text (validateEmoji lets any
  // 1–40 chars through), and a throw here 500s the public feed.
  it('returns null for inherited Object keys instead of throwing', () => {
    expect(nounFor('toString')).toBeNull()
    expect(phraseFor('toString')).toBeNull()
    expect(phraseFor('constructor')).toBeNull()
    expect(phraseFor('__proto__')).toBeNull()
  })

  it('keys only emoji that exist in the shipped catalogues (no orphans)', () => {
    const known = new Set<string>(CATALOGUE)
    for (const key of Object.keys(COLLECTIVE_NOUNS)) expect(known.has(key)).toBe(true)
  })

  // The nounless list gets the same treatment as the table: a token that stops
  // being shipped, or that gains a noun without leaving the list, is a stale
  // entry nothing else would flag.
  it('names only shipped critters as nounless, and none that have a noun', () => {
    const known = new Set<string>(CATALOGUE)
    for (const token of NOUNLESS) {
      expect(known.has(token)).toBe(true)
      expect(COLLECTIVE_NOUNS[token]).toBeUndefined()
    }
  })

  it('stores every noun and plural lowercase and non-empty', () => {
    for (const [noun, plural] of Object.values(COLLECTIVE_NOUNS)) {
      expect(noun).not.toBe('')
      expect(plural).not.toBe('')
      expect(noun).toBe(noun.toLowerCase())
    }
  })

  // Every entry is hand-written, and a copy-pasted plural ("a mob of meerkats"
  // on the emu) would otherwise ship green: the drift guard compares two copies
  // of the same data, and nothing else ties a pair to the critter it keys.
  it('gives every critter a plural that names it', () => {
    const wrong: string[] = []
    for (const [emoji, [, plural]] of Object.entries(COLLECTIVE_NOUNS)) {
      const name = nameFor(emoji)
      if (name === null || IRREGULAR_PLURALS.has(emoji)) continue
      const noun = name.split(' ').at(-1)?.toLowerCase() ?? ''
      if (!plural.toLowerCase().includes(noun)) wrong.push(`${emoji} ${name} → ${plural}`)
    }
    expect(wrong).toEqual([])
  })

  // The server keeps its own copy for RSS/push (no shared modules); adding a
  // noun to one side without the other fails here (client↔server drift guard).
  it('matches the server table entry for entry', () => {
    expect(SERVER_NOUNS).toEqual(COLLECTIVE_NOUNS)
  })

  // phraseFor is hand-duplicated too, so the badge tooltip and the RSS/push
  // text could disagree for the same sighting while both files' own tests pass.
  it('phrases every critter the same way the server does', () => {
    for (const emoji of Object.keys(COLLECTIVE_NOUNS)) {
      expect(serverPhraseFor(emoji)).toBe(phraseFor(emoji))
    }
    expect(serverPhraseFor('custom:phanatic')).toBe(phraseFor('custom:phanatic'))
  })

  // The table was first written by hand against a catalogue read outside the
  // worktree, and a percentage-coverage test was happy at 139 of 156 — seven
  // real critters, crow among them, silently showed "Many". Exhaustive now.
  it('covers every shipped critter, or names it as nounless', () => {
    const uncovered = CATALOGUE.filter(
      (emoji) => COLLECTIVE_NOUNS[emoji] === undefined && !NOUNLESS.has(emoji),
    )
    expect(uncovered).toEqual([])
  })
})
