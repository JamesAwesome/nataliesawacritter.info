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
    // profile (emoji '🦊 x', name 'y') must NOT match sighting (emoji '🦊', name 'x y')
    const keys = friendKeys([makeProfile({ emoji: '🦊 x', name: 'y' })])
    expect(isFriendSighting(makeSighting({ emoji: '🦊', name: 'x y' }), keys)).toBe(false)
  })
})
