import { describe, expect, it } from 'vitest'
import { CURATED, EXTENDED } from './critters'

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

  it('has 16 extended emoji with no duplicates', () => {
    expect(EXTENDED).toHaveLength(16)
    expect(new Set(EXTENDED).size).toBe(16)
  })
})
