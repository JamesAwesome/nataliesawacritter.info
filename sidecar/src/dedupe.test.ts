import { describe, expect, it } from 'vitest'
import { isDuplicate } from './dedupe'

describe('isDuplicate', () => {
  const existing = ['Pigeon', 'Red Panda', 'Canada Goose']

  it('matches case- and whitespace-insensitively', () => {
    expect(isDuplicate('pigeon', existing)).toBe(true)
    expect(isDuplicate('  Red Panda  ', existing)).toBe(true)
  })

  it('is false for a new critter', () => {
    expect(isDuplicate('Hedgehog', existing)).toBe(false)
  })
})
