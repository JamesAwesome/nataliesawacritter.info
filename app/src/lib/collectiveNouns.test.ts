import { describe, expect, it } from 'vitest'
import { COLLECTIVE_NOUNS as SERVER_NOUNS } from '../../server/collectiveNouns'
import { COLLECTIVE_NOUNS, nounFor, phraseFor } from './collectiveNouns'
import { CURATED, EXTENDED } from './critters'
import { CUSTOM, tokenFor } from './customEmoji'

describe('collectiveNouns catalogue', () => {
  it('resolves the noun for a unicode emoji and for a custom token', () => {
    expect(nounFor('🐦‍⬛')).toBe('murder')
    expect(nounFor('custom:cardinal')).toBe('college')
  })

  it('builds "a <noun> of <plural>" for the phrase', () => {
    expect(phraseFor('🐦‍⬛')).toBe('a murder of crows')
    expect(phraseFor('🐇')).toBe('a fluffle of rabbits')
    expect(phraseFor('custom:meerkat')).toBe('a mob of meerkats')
  })

  it('uses "an" before a vowel-initial noun', () => {
    expect(phraseFor('🐸')).toBe('an army of frogs')
    expect(phraseFor('🐼')).toBe('an embarrassment of pandas')
  })

  it('returns null for critters with no collective noun', () => {
    expect(nounFor('🐽')).toBeNull() // pig nose — not a critter you see a group of
    expect(phraseFor('custom:gritty')).toBeNull()
    expect(nounFor('custom:unknown')).toBeNull()
    expect(nounFor('🍕')).toBeNull()
  })

  it('keys only emoji that exist in the shipped catalogues (no orphans)', () => {
    const known = new Set<string>([
      ...CURATED.map((c) => c.emoji),
      ...EXTENDED,
      ...CUSTOM.map((c) => tokenFor(c.slug)),
    ])
    for (const key of Object.keys(COLLECTIVE_NOUNS)) expect(known.has(key)).toBe(true)
  })

  it('stores every noun and plural lowercase and non-empty', () => {
    for (const [noun, plural] of Object.values(COLLECTIVE_NOUNS)) {
      expect(noun).not.toBe('')
      expect(plural).not.toBe('')
      expect(noun).toBe(noun.toLowerCase())
    }
  })

  // The server keeps its own copy for RSS/push (no shared modules); adding a
  // noun to one side without the other fails here (client↔server drift guard).
  it('matches the server table entry for entry', () => {
    expect(SERVER_NOUNS).toEqual(COLLECTIVE_NOUNS)
  })

  it('covers most of the shipped critters', () => {
    const total = CURATED.length + EXTENDED.length + CUSTOM.length
    expect(Object.keys(COLLECTIVE_NOUNS).length).toBeGreaterThan(total * 0.8)
  })
})
