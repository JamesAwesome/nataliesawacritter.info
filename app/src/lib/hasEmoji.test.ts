import { describe, expect, it } from 'vitest'
import { hasEmoji } from './hasEmoji'

describe('hasEmoji', () => {
  it('detects emoji pictographs and flags', () => {
    expect(hasEmoji('🐝')).toBe(true)
    expect(hasEmoji('Bee 🐝')).toBe(true)
    expect(hasEmoji('🦊 Fox')).toBe(true)
    expect(hasEmoji('❤️ Owl')).toBe(true)
    expect(hasEmoji('🇺🇸')).toBe(true) // flag = regional indicators
  })

  it('passes ordinary names, including accents and punctuation', () => {
    expect(hasEmoji('Mr Fox')).toBe(false)
    expect(hasEmoji('Café Owl')).toBe(false)
    expect(hasEmoji('Björk the Beaver')).toBe(false)
    expect(hasEmoji("O'Malley")).toBe(false)
    expect(hasEmoji('123')).toBe(false)
    expect(hasEmoji('')).toBe(false)
  })
})
