import { describe, expect, it } from 'vitest'
import { validateEmoji } from './emojiField.js'

describe('validateEmoji', () => {
  it('accepts a normal emoji and a known custom token', () => {
    expect(validateEmoji('🦊')).toBeNull()
    expect(validateEmoji('custom:robin')).toBeNull()
  })
  it('rejects empty, over-length, non-string, and unknown custom tokens', () => {
    expect(validateEmoji('')).not.toBeNull()
    expect(validateEmoji(42)).not.toBeNull()
    expect(validateEmoji('x'.repeat(41))).not.toBeNull()
    expect(validateEmoji('custom:unknown')).not.toBeNull()
  })
})
