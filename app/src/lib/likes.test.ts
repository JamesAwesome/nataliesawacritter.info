import { beforeEach, describe, expect, it } from 'vitest'
import { deviceId, hasLiked, markLiked, markUnliked } from './likes'

beforeEach(() => localStorage.clear())

describe('deviceId', () => {
  it('mints a UUID once and returns the same one after', () => {
    const first = deviceId()
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(deviceId()).toBe(first)
  })
})

describe('liked set', () => {
  it('round-trips liked state and survives a reload (re-read from storage)', () => {
    expect(hasLiked('a')).toBe(false)
    markLiked('a')
    expect(hasLiked('a')).toBe(true)
    markUnliked('a')
    expect(hasLiked('a')).toBe(false)
  })

  it('tolerates corrupt storage', () => {
    localStorage.setItem('nac-liked', '{not json')
    expect(hasLiked('a')).toBe(false)
    markLiked('a') // must not throw; resets cleanly
    expect(hasLiked('a')).toBe(true)
  })
})
