import { describe, expect, it } from 'vitest'
import { phraseFor } from './collectiveNouns.js'

describe('collectiveNouns (server copy)', () => {
  it('builds the phrase for a unicode emoji and a custom token', () => {
    expect(phraseFor('🐦‍⬛')).toBe('a murder of crows')
    expect(phraseFor('custom:cardinal')).toBe('a college of cardinals')
  })

  it('uses "an" before a vowel-initial noun', () => {
    expect(phraseFor('🐸')).toBe('an army of frogs')
  })

  it('returns null for a critter with no collective noun', () => {
    expect(phraseFor('custom:gritty')).toBeNull()
    expect(phraseFor('🐽')).toBeNull()
  })
})
