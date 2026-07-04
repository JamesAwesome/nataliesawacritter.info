import { describe, expect, it } from 'vitest'
import { CURATED, EXTENDED, nameFor } from './critters'

describe('critter sets', () => {
  it('has the 12 curated critters in design order', () => {
    expect(CURATED.map((c) => c.name)).toEqual([
      'Deer', 'Squirrel', 'Bird', 'Rabbit', 'Butterfly', 'Turtle',
      'Owl', 'Fox', 'Raccoon', 'Hedgehog', 'Frog', 'Duck',
    ])
    for (const c of CURATED) {
      expect(c.emoji.length).toBeGreaterThan(0)
      expect(c.tint).toMatch(/^var\(--tint-/)
    }
  })

  it('has a full extended animal set with no duplicates or overlap with curated', () => {
    expect(new Set(EXTENDED).size).toBe(EXTENDED.length)
    const curatedEmoji = new Set(CURATED.map((c) => c.emoji))
    for (const emoji of EXTENDED) {
      expect(curatedEmoji.has(emoji)).toBe(false)
    }
    expect(EXTENDED).toContain('🐱')
    expect(EXTENDED).toContain('🐶')
    expect(EXTENDED).toContain('🦁')
    expect(EXTENDED.length).toBeGreaterThanOrEqual(100)
    for (const emoji of EXTENDED) {
      expect(emoji.length).toBeLessThanOrEqual(16)
    }
  })
})

describe('nameFor', () => {
  it('returns the curated name for a curated emoji, null otherwise', () => {
    expect(nameFor('🦊')).toBe('Fox')
    expect(nameFor('🐙')).toBeNull()
  })
})
