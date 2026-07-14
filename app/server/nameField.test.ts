import { describe, expect, it } from 'vitest'
import { hasEmoji } from './nameField.js'

describe('hasEmoji', () => {
  it('detects emoji pictographs and flags', () => {
    expect(hasEmoji('🐝')).toBe(true)
    expect(hasEmoji('Bee 🐝')).toBe(true)
    expect(hasEmoji('🇺🇸')).toBe(true)
  })

  it('passes ordinary names, including accents', () => {
    expect(hasEmoji('Mr Fox')).toBe(false)
    expect(hasEmoji('Café Owl')).toBe(false)
    expect(hasEmoji('123')).toBe(false)
    expect(hasEmoji('')).toBe(false)
  })
})
