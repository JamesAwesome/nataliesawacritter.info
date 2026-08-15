import { describe, expect, it } from 'vitest'
import { phraseFor } from './collectiveNouns.js'

describe('collectiveNouns (server copy)', () => {
  it('builds the phrase for a unicode emoji and a custom token', () => {
    expect(phraseFor('🐇')).toBe('a fluffle of rabbits')
    expect(phraseFor('custom:crow')).toBe('a murder of crows')
    expect(phraseFor('custom:cardinal')).toBe('a college of cardinals')
  })

  // Matches the client: a stored emoji missing its variation selector still
  // resolves, so RSS and push don't fall back to "Many" where the badge doesn't.
  it('resolves an emoji written without its variation selector', () => {
    expect(phraseFor('🕊')).toBe('a dule of doves')
    expect(phraseFor('🐿')).toBe('a scurry of squirrels')
  })

  it('uses "an" before a vowel-initial noun', () => {
    expect(phraseFor('🐸')).toBe('an army of frogs')
  })

  // An object literal answers ['toString'] with a function, not undefined; a
  // throw here would 500 the public /feed.xml for every reader.
  it('returns null for inherited Object keys instead of throwing', () => {
    expect(phraseFor('toString')).toBeNull()
    expect(phraseFor('__proto__')).toBeNull()
  })

  it('returns null for a critter with no collective noun', () => {
    expect(phraseFor('custom:gritty')).toBeNull()
    expect(phraseFor('🐽')).toBeNull()
  })
})
