import { describe, expect, it } from 'vitest'
import { makeProfile, makeSighting } from '../test/helpers'
import { friendKeys, isFriendSighting } from './friends'

describe('friendKeys / isFriendSighting', () => {
  it('matches by emoji + case/whitespace-insensitive name', () => {
    const keys = friendKeys([makeProfile({ emoji: '🦊', name: 'Mr Fox' })])
    expect(isFriendSighting(makeSighting({ emoji: '🦊', name: 'mr fox' }), keys)).toBe(true)
    expect(isFriendSighting(makeSighting({ emoji: '🦊', name: '  MR FOX  ' }), keys)).toBe(true)
  })

  it('requires the emoji to match too', () => {
    const keys = friendKeys([makeProfile({ emoji: '🦊', name: 'Mr Fox' })])
    expect(isFriendSighting(makeSighting({ emoji: '🐺', name: 'Mr Fox' }), keys)).toBe(false)
  })

  it('never matches nameless sightings', () => {
    const keys = friendKeys([makeProfile({ emoji: '🦊', name: 'Mr Fox' })])
    expect(isFriendSighting(makeSighting({ emoji: '🦊', name: null }), keys)).toBe(false)
  })

  it('empty profiles produce an empty set', () => {
    expect(friendKeys([]).size).toBe(0)
  })

  it('the NUL separator prevents cross-field collisions', () => {
    // Without the separator, profile ('🦊a','b') and sighting ('🦊','ab')
    // both concatenate to '🦊ab' — the NUL keeps the fields apart.
    const keys = friendKeys([makeProfile({ emoji: '🦊a', name: 'b' })])
    expect(isFriendSighting(makeSighting({ emoji: '🦊', name: 'ab' }), keys)).toBe(false)
  })
})
